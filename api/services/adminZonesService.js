const createError = require("http-errors");

const pool = require("../db");

const DEFAULT_PERIOD = "24h";
const DEFAULT_METRIC = "composite";
const ALLOWED_PERIODS = new Set(["24h", "7d", "30d"]);
const ALLOWED_METRICS = new Set(["composite", "model", "reports", "alerts"]);
const SUMMARY_GEOMETRY_TOLERANCE = Number(
  process.env.ADMIN_ZONE_MAP_SIMPLIFY_TOLERANCE || 0.01,
);
const SUMMARY_STALE_MS = Number(
  process.env.ADMIN_ZONE_SUMMARY_STALE_MS || 30 * 60 * 1000,
);
const INCIDENT_HISTORY_LOOKBACK_DAYS = Number(
  process.env.ADMIN_ZONE_HISTORY_LOOKBACK_DAYS || 365,
);

const PERIOD_CONFIG = Object.freeze({
  "24h": {
    label: "Last 24 hours",
    milliseconds: 24 * 60 * 60 * 1000,
  },
  "7d": {
    label: "Last 7 days",
    milliseconds: 7 * 24 * 60 * 60 * 1000,
  },
  "30d": {
    label: "Last 30 days",
    milliseconds: 30 * 24 * 60 * 60 * 1000,
  },
});

function normalizeZonePeriod(period) {
  const normalized = String(period || "").trim().toLowerCase();
  return ALLOWED_PERIODS.has(normalized) ? normalized : DEFAULT_PERIOD;
}

function normalizeZoneMetric(metric) {
  const normalized = String(metric || "").trim().toLowerCase();
  return ALLOWED_METRICS.has(normalized) ? normalized : DEFAULT_METRIC;
}

function getPeriodConfig(period) {
  return PERIOD_CONFIG[normalizeZonePeriod(period)];
}

function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function safeNullableNumber(value, digits = 2) {
  if (value == null || value === "") {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Number(numeric.toFixed(digits));
}

function clampScore(value) {
  return Math.max(0, Math.min(100, safeNumber(value, 0)));
}

function roundScore(value, digits = 2) {
  return Number(clampScore(value).toFixed(digits));
}

function deriveZoneRiskLevel(score) {
  const normalized = clampScore(score);

  if (normalized >= 75) {
    return "critical";
  }

  if (normalized >= 50) {
    return "high";
  }

  if (normalized >= 25) {
    return "medium";
  }

  return "low";
}

function getRoadClassWeight(roadClass) {
  const normalized = String(roadClass || "").trim().toLowerCase();

  if (normalized === "motorway" || normalized === "trunk" || normalized === "primary") {
    return 1.5;
  }

  if (normalized === "secondary" || normalized === "tertiary") {
    return 1.2;
  }

  return 1.0;
}

function computeCompositeRiskScore({
  modelWeightedScore,
  reportScore,
  alertScore,
  incidentHistoryScore,
}) {
  return roundScore(
    (0.50 * safeNumber(modelWeightedScore, 0))
      + (0.25 * safeNumber(reportScore, 0))
      + (0.20 * safeNumber(alertScore, 0))
      + (0.05 * safeNumber(incidentHistoryScore, 0)),
  );
}

function getMetricScore(summary, metric) {
  switch (normalizeZoneMetric(metric)) {
    case "model":
      return safeNumber(summary.modelWeightedScore, 0);
    case "reports":
      return safeNumber(summary.reportScore, 0);
    case "alerts":
      return safeNumber(summary.alertScore, 0);
    case "composite":
    default:
      return safeNumber(summary.riskScore, 0);
  }
}

function toIsoString(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function fetchWilayaAreas(db = pool) {
  const result = await db.query(
    `
      SELECT
        aa.id,
        aa.name,
        aa.level,
        aa.parent_id
      FROM gis.admin_areas aa
      WHERE aa.level = 'wilaya'
      ORDER BY aa.name ASC
    `,
  );

  return result.rows.map((row) => ({
    adminAreaId: Number(row.id),
    name: row.name,
    level: row.level,
    parentAreaId: row.parent_id != null ? Number(row.parent_id) : null,
  }));
}

async function fetchModelSnapshotMetrics(windowStart, windowEnd, db = pool) {
  const result = await db.query(
    `
      WITH target_zones AS (
        SELECT id, geom
        FROM gis.admin_areas
        WHERE level = 'wilaya'
      ),
      ranked_predictions AS (
        SELECT
          rp.id,
          rp.road_segment_id,
          rp.risk_score,
          rp.confidence_score,
          row_number() OVER (
            PARTITION BY rp.road_segment_id
            ORDER BY coalesce(rp.predicted_at, rp.time_bucket) DESC, rp.id DESC
          ) AS row_rank
        FROM ml.risk_predictions rp
        WHERE coalesce(rp.predicted_at, rp.time_bucket) >= $1::timestamptz
          AND coalesce(rp.predicted_at, rp.time_bucket) < $2::timestamptz
      ),
      latest_predictions AS (
        SELECT
          ranked_predictions.id,
          ranked_predictions.road_segment_id,
          ranked_predictions.risk_score,
          ranked_predictions.confidence_score
        FROM ranked_predictions
        WHERE ranked_predictions.row_rank = 1
      ),
      road_zone AS (
        SELECT
          tz.id AS admin_area_id,
          rs.id AS road_segment_id,
          lower(coalesce(rs.road_class, '')) AS road_class,
          COALESCE(
            NULLIF(trim(rs.name), ''),
            NULLIF(trim(rs.ref), ''),
            INITCAP(COALESCE(rs.road_class, 'road')) || ' #' || rs.id::text
          ) AS road_label,
          CASE
            WHEN lp.risk_score <= 1.2 THEN lp.risk_score * 100
            ELSE lp.risk_score
          END AS scaled_risk_score,
          CASE
            WHEN lp.confidence_score IS NULL THEN NULL
            WHEN lp.confidence_score <= 1.2 THEN lp.confidence_score * 100
            ELSE lp.confidence_score
          END AS scaled_confidence,
          CASE
            WHEN lower(coalesce(rs.road_class, '')) IN ('motorway', 'trunk', 'primary') THEN 1.5
            WHEN lower(coalesce(rs.road_class, '')) IN ('secondary', 'tertiary') THEN 1.2
            ELSE 1.0
          END AS road_weight,
          row_number() OVER (
            PARTITION BY tz.id
            ORDER BY
              CASE
                WHEN lp.risk_score <= 1.2 THEN lp.risk_score * 100
                ELSE lp.risk_score
              END DESC,
              rs.id ASC
          ) AS risk_rank,
          count(*) OVER (PARTITION BY tz.id) AS zone_road_count
        FROM latest_predictions lp
        JOIN gis.road_segments rs
          ON rs.id = lp.road_segment_id
        JOIN target_zones tz
          ON ST_Intersects(tz.geom, ST_PointOnSurface(rs.geom))
      ),
      aggregated AS (
        SELECT
          road_zone.admin_area_id,
          count(*)::int AS predicted_road_count,
          count(*)::int AS road_segment_count,
          avg(road_zone.scaled_risk_score) AS model_avg_score,
          sum(road_zone.scaled_risk_score * road_zone.road_weight)
            / nullif(sum(road_zone.road_weight), 0) AS weighted_avg_score,
          avg(road_zone.scaled_risk_score) FILTER (
            WHERE road_zone.risk_rank <= greatest(1, CEIL(road_zone.zone_road_count * 0.1))
          ) AS top_decile_avg_score,
          avg(road_zone.scaled_confidence) AS confidence_avg
        FROM road_zone
        GROUP BY road_zone.admin_area_id
      ),
      top_roads AS (
        SELECT DISTINCT ON (road_zone.admin_area_id)
          road_zone.admin_area_id,
          road_zone.road_segment_id AS top_road_segment_id,
          road_zone.road_label AS top_road_name,
          road_zone.scaled_risk_score AS top_road_risk_score
        FROM road_zone
        ORDER BY road_zone.admin_area_id, road_zone.scaled_risk_score DESC, road_zone.road_segment_id ASC
      )
      SELECT
        aggregated.admin_area_id,
        aggregated.road_segment_count,
        aggregated.predicted_road_count,
        round(aggregated.model_avg_score::numeric, 2) AS model_avg_score,
        round(
          (
            0.80 * aggregated.weighted_avg_score
            + 0.20 * coalesce(aggregated.top_decile_avg_score, aggregated.weighted_avg_score)
          )::numeric,
          2
        ) AS model_weighted_score,
        round(coalesce(top_roads.top_road_risk_score, 0)::numeric, 2) AS top_road_risk_score,
        round(aggregated.confidence_avg::numeric, 2) AS confidence_avg,
        top_roads.top_road_segment_id,
        top_roads.top_road_name
      FROM aggregated
      LEFT JOIN top_roads
        ON top_roads.admin_area_id = aggregated.admin_area_id
    `,
    [windowStart.toISOString(), windowEnd.toISOString()],
  );

  return new Map(
    result.rows.map((row) => [
      Number(row.admin_area_id),
      {
        roadSegmentCount: safeNumber(row.road_segment_count, 0),
        predictedRoadCount: safeNumber(row.predicted_road_count, 0),
        modelAvgScore: safeNullableNumber(row.model_avg_score),
        modelWeightedScore: safeNullableNumber(row.model_weighted_score),
        topRoadRiskScore: safeNullableNumber(row.top_road_risk_score),
        confidenceAvg: safeNullableNumber(row.confidence_avg),
        topRoadSegmentId: row.top_road_segment_id != null ? Number(row.top_road_segment_id) : null,
        topRoadName: row.top_road_name || null,
      },
    ]),
  );
}

async function fetchReportSnapshotMetrics(windowStart, windowEnd, db = pool) {
  const result = await db.query(
    `
      WITH target_zones AS (
        SELECT id, geom
        FROM gis.admin_areas
        WHERE level = 'wilaya'
      ),
      reports_in_zones AS (
        SELECT
          tz.id AS admin_area_id,
          ar.id,
          ar.status,
          ar.severity_hint
        FROM app.accident_reports ar
        JOIN target_zones tz
          ON ar.incident_location IS NOT NULL
         AND ST_Intersects(tz.geom, ar.incident_location::geometry)
        WHERE coalesce(ar.occurred_at, ar.created_at) >= $1::timestamptz
          AND coalesce(ar.occurred_at, ar.created_at) < $2::timestamptz
      )
      SELECT
        reports_in_zones.admin_area_id,
        count(*)::int AS recent_report_count,
        count(*) FILTER (WHERE reports_in_zones.status = 'verified')::int AS verified_report_count,
        count(*) FILTER (WHERE reports_in_zones.status = 'pending')::int AS pending_report_count,
        count(*) FILTER (WHERE reports_in_zones.status = 'flagged')::int AS flagged_report_count,
        round(
          least(
            100,
            sum(
              CASE reports_in_zones.status
                WHEN 'verified' THEN 1.0
                WHEN 'pending' THEN 0.6
                WHEN 'flagged' THEN 0.4
                WHEN 'rejected' THEN 0.0
                ELSE 0.0
              END
              * CASE
                WHEN coalesce(reports_in_zones.severity_hint, 1) >= 3 THEN 3
                WHEN coalesce(reports_in_zones.severity_hint, 1) = 2 THEN 2
                ELSE 1
              END
            ) * 10
          )::numeric,
          2
        ) AS report_score
      FROM reports_in_zones
      GROUP BY reports_in_zones.admin_area_id
    `,
    [windowStart.toISOString(), windowEnd.toISOString()],
  );

  return new Map(
    result.rows.map((row) => [
      Number(row.admin_area_id),
      {
        recentReportCount: safeNumber(row.recent_report_count, 0),
        verifiedReportCount: safeNumber(row.verified_report_count, 0),
        pendingReportCount: safeNumber(row.pending_report_count, 0),
        flaggedReportCount: safeNumber(row.flagged_report_count, 0),
        reportScore: safeNullableNumber(row.report_score),
      },
    ]),
  );
}

async function fetchAlertSnapshotMetrics(
  windowStart,
  futureHorizonEnd,
  asOfTime,
  db = pool,
) {
  const result = await db.query(
    `
      WITH alert_zone_scope AS (
        SELECT
          CASE
            WHEN area.level = 'wilaya' THEN area.id
            WHEN area.level = 'commune' THEN area.parent_id
            ELSE NULL
          END AS admin_area_id,
          oa.severity,
          CASE
            WHEN oa.status = 'cancelled' THEN 'cancelled'
            WHEN $3::timestamptz < oa.starts_at THEN 'scheduled'
            WHEN $3::timestamptz >= oa.starts_at AND $3::timestamptz < oa.ends_at THEN 'active'
            ELSE 'expired'
          END AS effective_status
        FROM app.operational_alerts oa
        LEFT JOIN gis.admin_areas area
          ON area.id = oa.admin_area_id
        WHERE oa.admin_area_id IS NOT NULL
          AND oa.ends_at >= $1::timestamptz
          AND oa.starts_at < $2::timestamptz
      )
      SELECT
        alert_zone_scope.admin_area_id,
        count(*) FILTER (WHERE alert_zone_scope.effective_status = 'active')::int AS active_alert_count,
        count(*) FILTER (WHERE alert_zone_scope.effective_status = 'scheduled')::int AS scheduled_alert_count,
        count(*) FILTER (
          WHERE alert_zone_scope.effective_status = 'active'
            AND alert_zone_scope.severity = 'critical'
        )::int AS critical_alert_count,
        round(
          least(
            100,
            sum(
              CASE
                WHEN alert_zone_scope.effective_status = 'active' THEN
                  CASE alert_zone_scope.severity
                    WHEN 'critical' THEN 50
                    WHEN 'high' THEN 35
                    WHEN 'medium' THEN 20
                    ELSE 10
                  END
                ELSE 0
              END
            )
          )::numeric,
          2
        ) AS alert_score
      FROM alert_zone_scope
      WHERE alert_zone_scope.admin_area_id IS NOT NULL
      GROUP BY alert_zone_scope.admin_area_id
    `,
    [
      windowStart.toISOString(),
      futureHorizonEnd.toISOString(),
      asOfTime.toISOString(),
    ],
  );

  return new Map(
    result.rows.map((row) => [
      Number(row.admin_area_id),
      {
        activeAlertCount: safeNumber(row.active_alert_count, 0),
        scheduledAlertCount: safeNumber(row.scheduled_alert_count, 0),
        criticalAlertCount: safeNumber(row.critical_alert_count, 0),
        alertScore: safeNullableNumber(row.alert_score),
      },
    ]),
  );
}

async function fetchIncidentHistoryMetrics(db = pool) {
  const result = await db.query(
    `
      WITH target_zones AS (
        SELECT id, geom
        FROM gis.admin_areas
        WHERE level = 'wilaya'
      )
      SELECT
        tz.id AS admin_area_id,
        count(ae.id)::int AS incident_event_count
      FROM target_zones tz
      LEFT JOIN gis.accident_events ae
        ON ae.location IS NOT NULL
       AND ae.event_time >= now() - ($1::int * interval '1 day')
       AND ST_Intersects(tz.geom, ae.location::geometry)
      GROUP BY tz.id
    `,
    [INCIDENT_HISTORY_LOOKBACK_DAYS],
  );

  const maxCount = result.rows.reduce(
    (highest, row) => Math.max(highest, safeNumber(row.incident_event_count, 0)),
    0,
  );

  return new Map(
    result.rows.map((row) => {
      const incidentEventCount = safeNumber(row.incident_event_count, 0);
      const incidentHistoryScore = maxCount > 0
        ? roundScore((incidentEventCount / maxCount) * 100)
        : 0;

      return [
        Number(row.admin_area_id),
        {
          incidentEventCount,
          incidentHistoryScore,
        },
      ];
    }),
  );
}

async function buildZoneSummarySnapshot(period, windowStart, windowEnd, db = pool) {
  const periodConfig = getPeriodConfig(period);
  const asOfTime = new Date(windowEnd);
  const futureHorizonEnd = new Date(asOfTime.getTime() + periodConfig.milliseconds);
  const [
    zones,
    modelMetrics,
    reportMetrics,
    alertMetrics,
    incidentHistoryMetrics,
  ] = await Promise.all([
    fetchWilayaAreas(db),
    fetchModelSnapshotMetrics(windowStart, windowEnd, db),
    fetchReportSnapshotMetrics(windowStart, windowEnd, db),
    fetchAlertSnapshotMetrics(windowStart, futureHorizonEnd, asOfTime, db),
    fetchIncidentHistoryMetrics(db),
  ]);

  return zones.map((zone) => {
    const model = modelMetrics.get(zone.adminAreaId) || {};
    const reports = reportMetrics.get(zone.adminAreaId) || {};
    const alerts = alertMetrics.get(zone.adminAreaId) || {};
    const history = incidentHistoryMetrics.get(zone.adminAreaId) || {};

    const modelWeightedScore = safeNullableNumber(model.modelWeightedScore) || 0;
    const reportScore = roundScore(reports.reportScore || 0);
    const alertScore = roundScore(alerts.alertScore || 0);
    const incidentHistoryScore = roundScore(history.incidentHistoryScore || 0);
    const finalRiskScore = computeCompositeRiskScore({
      modelWeightedScore,
      reportScore,
      alertScore,
      incidentHistoryScore,
    });

    return {
      adminAreaId: zone.adminAreaId,
      zoneName: zone.name,
      zoneLevel: zone.level,
      parentAreaId: zone.parentAreaId,
      roadSegmentCount: safeNumber(model.roadSegmentCount, 0),
      predictedRoadCount: safeNumber(model.predictedRoadCount, 0),
      modelAvgScore: safeNullableNumber(model.modelAvgScore),
      modelWeightedScore: safeNullableNumber(model.modelWeightedScore),
      topRoadRiskScore: safeNullableNumber(model.topRoadRiskScore),
      recentReportCount: safeNumber(reports.recentReportCount, 0),
      verifiedReportCount: safeNumber(reports.verifiedReportCount, 0),
      pendingReportCount: safeNumber(reports.pendingReportCount, 0),
      flaggedReportCount: safeNumber(reports.flaggedReportCount, 0),
      reportScore,
      activeAlertCount: safeNumber(alerts.activeAlertCount, 0),
      scheduledAlertCount: safeNumber(alerts.scheduledAlertCount, 0),
      criticalAlertCount: safeNumber(alerts.criticalAlertCount, 0),
      alertScore,
      incidentEventCount: safeNumber(history.incidentEventCount, 0),
      incidentHistoryScore,
      riskScore: finalRiskScore,
      riskLevel: deriveZoneRiskLevel(finalRiskScore),
      confidenceAvg: safeNullableNumber(model.confidenceAvg),
      topRoadSegmentId: model.topRoadSegmentId || null,
      topRoadName: model.topRoadName || null,
      trendVsPrevious: null,
      metadata: {
        formulaVersion: "zone-risk-v1",
        periodLabel: periodConfig.label,
        reportWindowStart: windowStart.toISOString(),
        reportWindowEnd: windowEnd.toISOString(),
        weights: {
          model: 0.5,
          reports: 0.25,
          alerts: 0.2,
          incidentHistory: 0.05,
        },
      },
    };
  });
}

async function persistZoneSummarySnapshot(period, snapshotAt, summaries, db = pool) {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    for (const summary of summaries) {
      const params = [
        summary.adminAreaId,
        period,
        snapshotAt.toISOString(),
        summary.zoneName,
        summary.zoneLevel,
        summary.parentAreaId,
        summary.roadSegmentCount,
        summary.predictedRoadCount,
        summary.modelAvgScore,
        summary.modelWeightedScore,
        summary.topRoadRiskScore,
        summary.recentReportCount,
        summary.verifiedReportCount,
        summary.pendingReportCount,
        summary.flaggedReportCount,
        summary.reportScore,
        summary.activeAlertCount,
        summary.scheduledAlertCount,
        summary.criticalAlertCount,
        summary.alertScore,
        summary.incidentEventCount,
        summary.incidentHistoryScore,
        summary.riskScore,
        summary.riskLevel,
        summary.confidenceAvg,
        summary.trendVsPrevious,
        summary.topRoadSegmentId,
        summary.topRoadName,
        JSON.stringify(summary.metadata || {}),
      ];

      await client.query(
        `
          INSERT INTO ml.zone_risk_summary (
            admin_area_id, period_type, snapshot_at, zone_name, zone_level, parent_area_id,
            centroid, geom, road_segment_count, predicted_road_count, model_avg_score,
            model_weighted_score, top_road_risk_score, recent_report_count,
            verified_report_count, pending_report_count, flagged_report_count, report_score,
            active_alert_count, scheduled_alert_count, critical_alert_count, alert_score,
            incident_event_count, incident_history_score, final_risk_score, risk_level,
            confidence_avg, trend_vs_previous, top_road_segment_id, top_road_name, metadata
          )
          SELECT
            $1::bigint, $2::varchar, $3::timestamptz, $4::varchar, $5::varchar, $6::bigint,
            aa.centroid, aa.geom, $7::int, $8::int, $9::numeric, $10::numeric, $11::numeric,
            $12::int, $13::int, $14::int, $15::int, $16::numeric, $17::int, $18::int,
            $19::int, $20::numeric, $21::int, $22::numeric, $23::numeric, $24::varchar,
            $25::numeric, $26::numeric, $27::bigint, $28::text, $29::jsonb
          FROM gis.admin_areas aa
          WHERE aa.id = $1::bigint
        `,
        params,
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function rebuildZoneRiskSummary(period = DEFAULT_PERIOD, db = pool) {
  const normalizedPeriod = normalizeZonePeriod(period);
  const periodConfig = getPeriodConfig(normalizedPeriod);
  const snapshotAt = new Date();
  const currentWindowEnd = snapshotAt;
  const currentWindowStart = new Date(snapshotAt.getTime() - periodConfig.milliseconds);
  const previousWindowEnd = new Date(currentWindowStart);
  const previousWindowStart = new Date(previousWindowEnd.getTime() - periodConfig.milliseconds);

  const [currentSummaries, previousSummaries] = await Promise.all([
    buildZoneSummarySnapshot(normalizedPeriod, currentWindowStart, currentWindowEnd, db),
    buildZoneSummarySnapshot(normalizedPeriod, previousWindowStart, previousWindowEnd, db),
  ]);

  const previousByZoneId = new Map(
    previousSummaries.map((summary) => [summary.adminAreaId, safeNumber(summary.riskScore, 0)]),
  );
  const finalizedSummaries = currentSummaries.map((summary) => ({
    ...summary,
    trendVsPrevious: Number(
      (
        safeNumber(summary.riskScore, 0)
        - safeNumber(previousByZoneId.get(summary.adminAreaId), 0)
      ).toFixed(2)
    ),
  }));

  await persistZoneSummarySnapshot(normalizedPeriod, snapshotAt, finalizedSummaries, db);

  return {
    period: normalizedPeriod,
    snapshotAt: snapshotAt.toISOString(),
    zoneCount: finalizedSummaries.length,
  };
}

async function ensureZoneRiskSummary(period = DEFAULT_PERIOD, db = pool) {
  const normalizedPeriod = normalizeZonePeriod(period);
  const currentSummary = await db.query(
    `
      SELECT
        count(*)::int AS zone_count,
        max(snapshot_at) AS latest_snapshot_at
      FROM ml.zone_risk_summary_current
      WHERE period_type = $1
        AND zone_level = 'wilaya'
    `,
    [normalizedPeriod],
  );

  const zoneCount = safeNumber(currentSummary.rows[0]?.zone_count, 0);
  const latestSnapshotAt = currentSummary.rows[0]?.latest_snapshot_at
    ? new Date(currentSummary.rows[0].latest_snapshot_at)
    : null;

  if (
    zoneCount >= 48
    && latestSnapshotAt
    && !Number.isNaN(latestSnapshotAt.getTime())
    && (Date.now() - latestSnapshotAt.getTime()) <= SUMMARY_STALE_MS
  ) {
    return {
      rebuilt: false,
      period: normalizedPeriod,
      snapshotAt: latestSnapshotAt.toISOString(),
      zoneCount,
    };
  }

  const rebuilt = await rebuildZoneRiskSummary(normalizedPeriod, db);
  return {
    rebuilt: true,
    period: rebuilt.period,
    snapshotAt: rebuilt.snapshotAt,
    zoneCount: rebuilt.zoneCount,
  };
}

function mapZoneSummaryRow(row, metric) {
  const summary = {
    adminAreaId: Number(row.admin_area_id),
    name: row.zone_name,
    level: row.zone_level,
    riskScore: safeNumber(row.final_risk_score, 0),
    riskLevel: row.risk_level || deriveZoneRiskLevel(row.final_risk_score),
    modelWeightedScore: safeNullableNumber(row.model_weighted_score),
    modelAvgScore: safeNullableNumber(row.model_avg_score),
    topRoadRiskScore: safeNullableNumber(row.top_road_risk_score),
    recentReportCount: safeNumber(row.recent_report_count, 0),
    verifiedReportCount: safeNumber(row.verified_report_count, 0),
    pendingReportCount: safeNumber(row.pending_report_count, 0),
    flaggedReportCount: safeNumber(row.flagged_report_count, 0),
    reportScore: safeNullableNumber(row.report_score),
    activeAlertCount: safeNumber(row.active_alert_count, 0),
    scheduledAlertCount: safeNumber(row.scheduled_alert_count, 0),
    criticalAlertCount: safeNumber(row.critical_alert_count, 0),
    alertScore: safeNullableNumber(row.alert_score),
    confidenceAvg: safeNullableNumber(row.confidence_avg),
    trendVsPrevious: safeNullableNumber(row.trend_vs_previous),
    topRoadName: row.top_road_name || null,
    topRoadSegmentId: row.top_road_segment_id != null ? Number(row.top_road_segment_id) : null,
    centroid: row.centroid_geojson?.coordinates
      ? {
          lng: safeNumber(row.centroid_geojson.coordinates[0], 0),
          lat: safeNumber(row.centroid_geojson.coordinates[1], 0),
        }
      : null,
    geometry: row.geometry_geojson || null,
    snapshotAt: toIsoString(row.snapshot_at),
    metricScore: 0,
  };

  summary.metricScore = getMetricScore(summary, metric);
  return summary;
}

function buildZoneMapFeature(summary) {
  return {
    type: "Feature",
    geometry: summary.geometry,
    properties: {
      adminAreaId: summary.adminAreaId,
      name: summary.name,
      level: summary.level,
      riskScore: summary.riskScore,
      riskLevel: summary.riskLevel,
      modelWeightedScore: summary.modelWeightedScore,
      modelAvgScore: summary.modelAvgScore,
      topRoadRiskScore: summary.topRoadRiskScore,
      recentReportCount: summary.recentReportCount,
      verifiedReportCount: summary.verifiedReportCount,
      pendingReportCount: summary.pendingReportCount,
      flaggedReportCount: summary.flaggedReportCount,
      reportScore: summary.reportScore,
      activeAlertCount: summary.activeAlertCount,
      scheduledAlertCount: summary.scheduledAlertCount,
      criticalAlertCount: summary.criticalAlertCount,
      alertScore: summary.alertScore,
      confidenceAvg: summary.confidenceAvg,
      trendVsPrevious: summary.trendVsPrevious,
      topRoadName: summary.topRoadName,
      topRoadRiskScoreValue: summary.topRoadRiskScore,
      metricScore: summary.metricScore,
      centroid: summary.centroid,
      snapshotAt: summary.snapshotAt,
    },
  };
}

async function getZoneMap(period = DEFAULT_PERIOD, metric = DEFAULT_METRIC, db = pool) {
  const normalizedPeriod = normalizeZonePeriod(period);
  const normalizedMetric = normalizeZoneMetric(metric);
  const summaryState = await ensureZoneRiskSummary(normalizedPeriod, db);

  const result = await db.query(
    `
      SELECT
        zsc.admin_area_id,
        zsc.zone_name,
        zsc.zone_level,
        zsc.snapshot_at,
        zsc.model_avg_score,
        zsc.model_weighted_score,
        zsc.top_road_risk_score,
        zsc.recent_report_count,
        zsc.verified_report_count,
        zsc.pending_report_count,
        zsc.flagged_report_count,
        zsc.report_score,
        zsc.active_alert_count,
        zsc.scheduled_alert_count,
        zsc.critical_alert_count,
        zsc.alert_score,
        zsc.confidence_avg,
        zsc.trend_vs_previous,
        zsc.top_road_name,
        zsc.top_road_segment_id,
        zsc.final_risk_score,
        zsc.risk_level,
        ST_AsGeoJSON(
          COALESCE(zsc.centroid, ST_PointOnSurface(zsc.geom))
        )::jsonb AS centroid_geojson,
        ST_AsGeoJSON(
          ST_SimplifyPreserveTopology(zsc.geom, $2::double precision)
        )::jsonb AS geometry_geojson
      FROM ml.zone_risk_summary_current zsc
      WHERE zsc.period_type = $1
        AND zsc.zone_level = 'wilaya'
      ORDER BY zsc.zone_name ASC
    `,
    [normalizedPeriod, SUMMARY_GEOMETRY_TOLERANCE],
  );

  const items = result.rows.map((row) => mapZoneSummaryRow(row, normalizedMetric));
  const featureCollection = {
    type: "FeatureCollection",
    features: items
      .filter((item) => item.geometry)
      .map(buildZoneMapFeature),
  };

  return {
    period: normalizedPeriod,
    metric: normalizedMetric,
    generatedAt: summaryState.snapshotAt,
    summarySource: "ml.zone_risk_summary_current",
    summaryRebuilt: summaryState.rebuilt,
    featureCollection,
    items,
    stats: {
      zoneCount: items.length,
      critical: items.filter((item) => item.riskLevel === "critical").length,
      high: items.filter((item) => item.riskLevel === "high").length,
      medium: items.filter((item) => item.riskLevel === "medium").length,
      low: items.filter((item) => item.riskLevel === "low").length,
    },
  };
}

async function fetchZoneTopRoads(adminAreaId, windowStart, windowEnd, db = pool) {
  const result = await db.query(
    `
      WITH target_zone AS (
        SELECT geom
        FROM gis.admin_areas
        WHERE id = $1::bigint
          AND level = 'wilaya'
        LIMIT 1
      ),
      ranked_predictions AS (
        SELECT
          rp.id,
          rp.road_segment_id,
          rp.risk_score,
          rp.confidence_score,
          row_number() OVER (
            PARTITION BY rp.road_segment_id
            ORDER BY coalesce(rp.predicted_at, rp.time_bucket) DESC, rp.id DESC
          ) AS row_rank
        FROM ml.risk_predictions rp
        WHERE coalesce(rp.predicted_at, rp.time_bucket) >= $2::timestamptz
          AND coalesce(rp.predicted_at, rp.time_bucket) < $3::timestamptz
      )
      SELECT
        rs.id AS road_segment_id,
        COALESCE(
          NULLIF(trim(rs.name), ''),
          NULLIF(trim(rs.ref), ''),
          INITCAP(COALESCE(rs.road_class, 'road')) || ' #' || rs.id::text
        ) AS road_name,
        rs.road_class,
        round(
          CASE
            WHEN rp.risk_score <= 1.2 THEN (rp.risk_score * 100)::numeric
            ELSE rp.risk_score::numeric
          END,
          2
        ) AS risk_score,
        round(
          CASE
            WHEN rp.confidence_score IS NULL THEN NULL
            WHEN rp.confidence_score <= 1.2 THEN (rp.confidence_score * 100)::numeric
            ELSE rp.confidence_score::numeric
          END,
          2
        ) AS confidence_avg
      FROM ranked_predictions rp
      JOIN gis.road_segments rs
        ON rs.id = rp.road_segment_id
      JOIN target_zone tz
        ON ST_Intersects(tz.geom, ST_PointOnSurface(rs.geom))
      WHERE rp.row_rank = 1
      ORDER BY
        CASE
          WHEN rp.risk_score <= 1.2 THEN rp.risk_score * 100
          ELSE rp.risk_score
        END DESC,
        rs.id ASC
      LIMIT 5
    `,
    [adminAreaId, windowStart.toISOString(), windowEnd.toISOString()],
  );

  return result.rows.map((row) => ({
    roadSegmentId: Number(row.road_segment_id),
    roadName: row.road_name,
    roadClass: row.road_class || null,
    roadWeight: getRoadClassWeight(row.road_class),
    riskScore: safeNullableNumber(row.risk_score),
    confidenceAvg: safeNullableNumber(row.confidence_avg),
  }));
}

async function fetchZoneRecentReports(adminAreaId, windowStart, windowEnd, db = pool) {
  const result = await db.query(
    `
      WITH target_zone AS (
        SELECT geom
        FROM gis.admin_areas
        WHERE id = $1::bigint
          AND level = 'wilaya'
        LIMIT 1
      )
      SELECT
        ar.id,
        ar.incident_type,
        ar.status,
        ar.severity_hint,
        ar.location_label,
        coalesce(ar.occurred_at, ar.created_at) AS occurred_at,
        ar.created_at
      FROM app.accident_reports ar
      JOIN target_zone tz
        ON ar.incident_location IS NOT NULL
       AND ST_Intersects(tz.geom, ar.incident_location::geometry)
      WHERE coalesce(ar.occurred_at, ar.created_at) >= $2::timestamptz
        AND coalesce(ar.occurred_at, ar.created_at) < $3::timestamptz
      ORDER BY coalesce(ar.occurred_at, ar.created_at) DESC, ar.id DESC
      LIMIT 5
    `,
    [adminAreaId, windowStart.toISOString(), windowEnd.toISOString()],
  );

  return result.rows.map((row) => ({
    reportId: row.id,
    displayId: `INC-${String(row.id || "").replace(/-/g, "").slice(0, 6).toUpperCase() || "UNKNOWN"}`,
    incidentType: row.incident_type || "incident",
    status: row.status || "pending",
    severity: row.severity_hint >= 3 ? "high" : row.severity_hint === 2 ? "medium" : "low",
    location: row.location_label || "Unknown location",
    occurredAt: toIsoString(row.occurred_at),
    createdAt: toIsoString(row.created_at),
  }));
}

async function fetchZoneOperationalAlerts(adminAreaId, period, now, db = pool) {
  const periodConfig = getPeriodConfig(period);
  const windowStart = new Date(now.getTime() - periodConfig.milliseconds);
  const futureHorizonEnd = new Date(now.getTime() + periodConfig.milliseconds);

  const result = await db.query(
    `
      WITH scoped_alerts AS (
        SELECT
          oa.id,
          oa.title,
          oa.severity,
          oa.starts_at,
          oa.ends_at,
          CASE
            WHEN oa.status = 'cancelled' THEN 'cancelled'
            WHEN $2::timestamptz < oa.starts_at THEN 'scheduled'
            WHEN $2::timestamptz >= oa.starts_at AND $2::timestamptz < oa.ends_at THEN 'active'
            ELSE 'expired'
          END AS effective_status
        FROM app.operational_alerts oa
        LEFT JOIN gis.admin_areas area
          ON area.id = oa.admin_area_id
        WHERE (
          CASE
            WHEN area.level = 'wilaya' THEN area.id
            WHEN area.level = 'commune' THEN area.parent_id
            ELSE NULL
          END
        ) = $1::bigint
          AND oa.ends_at >= $3::timestamptz
          AND oa.starts_at < $4::timestamptz
      )
      SELECT *
      FROM scoped_alerts
      ORDER BY starts_at DESC, id DESC
      LIMIT 5
    `,
    [
      adminAreaId,
      now.toISOString(),
      windowStart.toISOString(),
      futureHorizonEnd.toISOString(),
    ],
  );

  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    severity: row.severity,
    status: row.effective_status,
    startsAt: toIsoString(row.starts_at),
    endsAt: toIsoString(row.ends_at),
  }));
}

async function getZoneDetails(adminAreaId, period = DEFAULT_PERIOD, db = pool) {
  const normalizedAdminAreaId = Number.parseInt(adminAreaId, 10);
  if (!Number.isInteger(normalizedAdminAreaId) || normalizedAdminAreaId <= 0) {
    throw createError(400, "Zone id must be a positive integer");
  }

  const normalizedPeriod = normalizeZonePeriod(period);
  const periodConfig = getPeriodConfig(normalizedPeriod);
  await ensureZoneRiskSummary(normalizedPeriod, db);

  const summaryResult = await db.query(
    `
      SELECT
        zsc.admin_area_id,
        zsc.zone_name,
        zsc.zone_level,
        zsc.snapshot_at,
        zsc.model_avg_score,
        zsc.model_weighted_score,
        zsc.top_road_risk_score,
        zsc.recent_report_count,
        zsc.verified_report_count,
        zsc.pending_report_count,
        zsc.flagged_report_count,
        zsc.report_score,
        zsc.active_alert_count,
        zsc.scheduled_alert_count,
        zsc.critical_alert_count,
        zsc.alert_score,
        zsc.confidence_avg,
        zsc.trend_vs_previous,
        zsc.top_road_name,
        zsc.top_road_segment_id,
        zsc.final_risk_score,
        zsc.risk_level,
        ST_AsGeoJSON(COALESCE(zsc.centroid, ST_PointOnSurface(zsc.geom)))::jsonb AS centroid_geojson,
        ST_AsGeoJSON(
          ST_SimplifyPreserveTopology(zsc.geom, $3::double precision)
        )::jsonb AS geometry_geojson
      FROM ml.zone_risk_summary_current zsc
      WHERE zsc.period_type = $1
        AND zsc.zone_level = 'wilaya'
        AND zsc.admin_area_id = $2::bigint
      LIMIT 1
    `,
    [normalizedPeriod, normalizedAdminAreaId, SUMMARY_GEOMETRY_TOLERANCE],
  );

  const summaryRow = summaryResult.rows[0] || null;
  if (!summaryRow) {
    throw createError(404, "Zone was not found");
  }

  const summary = mapZoneSummaryRow(summaryRow, DEFAULT_METRIC);
  const now = new Date();
  const windowStart = new Date(now.getTime() - periodConfig.milliseconds);
  const [topRoads, recentReports, operationalAlerts] = await Promise.all([
    fetchZoneTopRoads(normalizedAdminAreaId, windowStart, now, db),
    fetchZoneRecentReports(normalizedAdminAreaId, windowStart, now, db),
    fetchZoneOperationalAlerts(normalizedAdminAreaId, normalizedPeriod, now, db),
  ]);

  return {
    period: normalizedPeriod,
    generatedAt: summary.snapshotAt,
    summary,
    topRoads,
    recentReportsSummary: {
      total: summary.recentReportCount,
      verified: summary.verifiedReportCount,
      pending: summary.pendingReportCount,
      flagged: summary.flaggedReportCount,
      items: recentReports,
    },
    operationalAlertsSummary: {
      active: summary.activeAlertCount,
      scheduled: summary.scheduledAlertCount,
      critical: summary.criticalAlertCount,
      items: operationalAlerts,
    },
  };
}

module.exports = {
  deriveZoneRiskLevel,
  getZoneDetails,
  getZoneMap,
  getRoadClassWeight,
  normalizeZoneMetric,
  normalizeZonePeriod,
  rebuildZoneRiskSummary,
};
