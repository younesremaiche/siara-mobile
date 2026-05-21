// =============================================================================
// adminAnalyticsService — powers the admin Advanced Analytics dashboard.
//
// One entry point: getAnalyticsOverview(period) returns every section the UI
// renders in a single payload, computed from real rows in app.accident_reports.
//
// Period codes accepted: '30d' | '90d' | '180d' | '365d'. Defaults to 30d.
//
// What the queries do:
//   - summary: count, daily average, peak hour band, most dangerous "road"
//   - heatmap: 7 × 24 grid (day-of-week × hour) of incident counts
//   - severity: count per severity_hint (1=low, 2=medium, 3=high) + % share
//   - timeOfDay: 4 fixed bands (night / morning / afternoon / evening)
//   - dangerousRoads: top road segments by spatial proximity (≤ 75 m) to
//                     accident_reports.incident_location
//   - roadTypes: same spatial join aggregated by road_segments.road_class
//   - weeklyTrend: counts per day over the last 7 days
//   - prediction: naive lag-7 forecast for the next 7 days
//
// Anywhere data is missing (e.g. report has no nearby road segment) we fall
// back to a sensible default so the UI never sees nulls in unexpected places.
// =============================================================================

const pool = require("../db");

const PERIODS = Object.freeze({
  "30d": { days: 30, label: "Last 30 days" },
  "90d": { days: 90, label: "Last 90 days" },
  "180d": { days: 180, label: "Last 6 months" },
  "365d": { days: 365, label: "Last year" },
});

const DEFAULT_PERIOD = "30d";

function normalizePeriod(period) {
  const key = String(period || "").toLowerCase().trim();
  return Object.prototype.hasOwnProperty.call(PERIODS, key) ? key : DEFAULT_PERIOD;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SEVERITY_HINT_TO_LABEL = Object.freeze({
  1: { code: "low", label: "Low", color: "#22C55E" },
  2: { code: "medium", label: "Medium", color: "#F59E0B" },
  3: { code: "high", label: "High", color: "#DC2626" },
});

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function roundPercent(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

async function fetchSummary(period, db = pool) {
  const days = PERIODS[period].days;
  const result = await db.query(
    `
      with current as (
        select count(*)::int as total,
               max(created_at) as latest_at
          from app.accident_reports
         where created_at >= now() - ($1::int * interval '1 day')
      ),
      previous as (
        select count(*)::int as total
          from app.accident_reports
         where created_at >= now() - ($1::int * 2 * interval '1 day')
           and created_at <  now() - ($1::int * interval '1 day')
      ),
      peak_hour as (
        select extract(hour from created_at)::int as hour,
               count(*)::int as cnt
          from app.accident_reports
         where created_at >= now() - ($1::int * interval '1 day')
         group by 1
         order by cnt desc, hour asc
         limit 1
      )
      select c.total,
             c.latest_at,
             p.total as previous_total,
             coalesce(ph.hour, 0) as peak_hour,
             coalesce(ph.cnt, 0)  as peak_hour_count
        from current c
        cross join previous p
        left join peak_hour ph on true
    `,
    [days],
  );
  const row = result.rows[0] || {};
  const total = safeNumber(row.total, 0);
  const prev = safeNumber(row.previous_total, 0);
  const trendPct = prev > 0
    ? Math.round(((total - prev) / prev) * 100)
    : (total > 0 ? 100 : 0);
  return {
    totalIncidents: total,
    previousTotal: prev,
    trendPct,
    avgPerDay: days > 0 ? Math.round((total / days) * 10) / 10 : 0,
    peakHour: safeNumber(row.peak_hour, 0),
    peakHourCount: safeNumber(row.peak_hour_count, 0),
    latestAt: row.latest_at ? new Date(row.latest_at).toISOString() : null,
  };
}

async function fetchHourlyHeatmap(period, db = pool) {
  const days = PERIODS[period].days;
  const result = await db.query(
    `
      select extract(dow  from created_at)::int as dow,
             extract(hour from created_at)::int as hour,
             count(*)::int as cnt
        from app.accident_reports
       where created_at >= now() - ($1::int * interval '1 day')
       group by 1, 2
    `,
    [days],
  );
  // 7 × 24 zero matrix, indexed [day(0=Sun..6=Sat)][hour(0..23)]
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  let max = 0;
  for (const row of result.rows) {
    const d = safeNumber(row.dow, 0);
    const h = safeNumber(row.hour, 0);
    const n = safeNumber(row.cnt, 0);
    if (d >= 0 && d < 7 && h >= 0 && h < 24) {
      grid[d][h] = n;
      if (n > max) max = n;
    }
  }
  // Re-order rows to Mon-first (matches the UI labels)
  const monFirstOrder = [1, 2, 3, 4, 5, 6, 0];
  return {
    days: monFirstOrder.map((d) => DAY_LABELS[d]),
    rows: monFirstOrder.map((d) => grid[d]),
    max,
  };
}

async function fetchSeverityDistribution(period, db = pool) {
  const days = PERIODS[period].days;
  const result = await db.query(
    `
      select severity_hint,
             count(*)::int as cnt
        from app.accident_reports
       where created_at >= now() - ($1::int * interval '1 day')
       group by 1
    `,
    [days],
  );
  const counts = { 1: 0, 2: 0, 3: 0 };
  for (const row of result.rows) {
    const hint = safeNumber(row.severity_hint, 0);
    if (hint >= 1 && hint <= 3) counts[hint] = safeNumber(row.cnt, 0);
  }
  const total = counts[1] + counts[2] + counts[3];
  return [3, 2, 1].map((hint) => ({
    hint,
    ...SEVERITY_HINT_TO_LABEL[hint],
    count: counts[hint],
    pct: roundPercent(counts[hint], total),
  }));
}

async function fetchTimeOfDay(period, db = pool) {
  const days = PERIODS[period].days;
  const result = await db.query(
    `
      select extract(hour from created_at)::int as hour,
             count(*)::int as cnt
        from app.accident_reports
       where created_at >= now() - ($1::int * interval '1 day')
       group by 1
    `,
    [days],
  );
  const bands = [
    { key: "night",     period: "Night (00-06)",     hours: [0, 1, 2, 3, 4, 5], incidents: 0 },
    { key: "morning",   period: "Morning (06-12)",   hours: [6, 7, 8, 9, 10, 11], incidents: 0 },
    { key: "afternoon", period: "Afternoon (12-18)", hours: [12, 13, 14, 15, 16, 17], incidents: 0 },
    { key: "evening",   period: "Evening (18-24)",   hours: [18, 19, 20, 21, 22, 23], incidents: 0 },
  ];
  const byHour = new Map(result.rows.map((row) => [safeNumber(row.hour, 0), safeNumber(row.cnt, 0)]));
  for (const band of bands) {
    band.incidents = band.hours.reduce((sum, h) => sum + (byHour.get(h) || 0), 0);
  }
  const total = bands.reduce((sum, b) => sum + b.incidents, 0);
  return bands.map(({ hours: _hours, ...rest }) => ({
    ...rest,
    pct: roundPercent(rest.incidents, total),
  }));
}

async function fetchDangerousRoads(period, db = pool) {
  const days = PERIODS[period].days;
  // For each report, find the nearest road segment within 75 metres. The
  // ST_DWithin call relies on the GiST index on gis.road_segments(geom) for
  // performance; statement_timeout caps the runtime so a missing index can't
  // freeze the whole request.
  const client = await db.connect();
  let result;
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '8s'");
    result = await client.query(
      `
        with windowed as (
          -- Cap at the most recent 2000 reports for the period so the per-row
          -- LATERAL subquery below stays bounded even on large datasets.
          select id, incident_location, severity_hint
            from app.accident_reports
           where created_at >= now() - ($1::int * interval '1 day')
           order by created_at desc
           limit 2000
        ),
        nearest as (
          select w.id,
                 w.severity_hint,
                 (
                   -- Geometry-mode ST_DWithin: uses the GiST index on
                   -- gis.road_segments(geom) directly (the ::geography cast on
                   -- geom would bypass it). 0.0008° ≈ 88 m at the equator.
                   select rs.id
                     from gis.road_segments rs
                    where ST_DWithin(rs.geom, w.incident_location::geometry, 0.0008)
                    order by rs.geom <-> w.incident_location::geometry
                    limit 1
                 ) as road_segment_id
            from windowed w
        ),
        counted as (
          select n.road_segment_id,
                 count(*)::int as incidents,
                 (mode() within group (order by n.severity_hint))::int as top_severity_hint
            from nearest n
           where n.road_segment_id is not null
           group by n.road_segment_id
           order by incidents desc, n.road_segment_id asc
           limit 8
        )
        select c.road_segment_id,
               c.incidents,
               c.top_severity_hint,
               rs.name      as road_name,
               rs.ref       as road_ref,
               rs.road_class
          from counted c
          join gis.road_segments rs on rs.id = c.road_segment_id
         order by c.incidents desc
      `,
      [days],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  return result.rows.map((row) => {
    const hint = safeNumber(row.top_severity_hint, 1);
    const sev = SEVERITY_HINT_TO_LABEL[hint] || SEVERITY_HINT_TO_LABEL[1];
    const label = (row.road_name && row.road_name.trim())
      || (row.road_ref && row.road_ref.trim())
      || `${(row.road_class || "Road").toString()} segment #${row.road_segment_id}`;
    return {
      roadSegmentId: row.road_segment_id,
      road: label,
      ref: row.road_ref || null,
      roadClass: row.road_class || null,
      incidents: safeNumber(row.incidents, 0),
      severity: sev.code,
    };
  });
}

async function fetchRoadTypeCorrelation(period, db = pool) {
  const days = PERIODS[period].days;
  const client = await db.connect();
  let result;
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '8s'");
    result = await client.query(
      `
        with windowed as (
          -- Bounded scan, same rationale as fetchDangerousRoads above.
          select incident_location
            from app.accident_reports
           where created_at >= now() - ($1::int * interval '1 day')
           order by created_at desc
           limit 2000
        ),
        nearest as (
          select (
                   select rs.road_class
                     from gis.road_segments rs
                    where ST_DWithin(rs.geom, w.incident_location::geometry, 0.0008)
                    order by rs.geom <-> w.incident_location::geometry
                    limit 1
                 ) as road_class
            from windowed w
        )
        select coalesce(road_class, 'unknown') as road_class,
               count(*)::int as cnt
          from nearest
         group by 1
         order by cnt desc
      `,
      [days],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  const total = result.rows.reduce((sum, r) => sum + safeNumber(r.cnt, 0), 0);
  return result.rows.map((row) => ({
    type: humanizeRoadClass(row.road_class),
    incidents: safeNumber(row.cnt, 0),
    pct: roundPercent(safeNumber(row.cnt, 0), total),
  }));
}

function humanizeRoadClass(value) {
  const raw = String(value || "unknown").toLowerCase().trim();
  switch (raw) {
    case "motorway":
    case "highway":
    case "autoroute":
      return "Highway / Autoroute";
    case "trunk":
    case "primary":
      return "National Road (RN)";
    case "secondary":
    case "tertiary":
      return "Regional Road";
    case "residential":
    case "unclassified":
    case "service":
    case "living_street":
      return "Urban / City";
    case "track":
    case "path":
      return "Rural / Mountain";
    case "unknown":
      return "Off-network / Unknown";
    default:
      return raw.charAt(0).toUpperCase() + raw.slice(1).replace(/_/g, " ");
  }
}

async function fetchWeeklyTrend(db = pool) {
  // 7 days actual + 7 days predicted, where predicted = naive lag-7 forecast:
  // the count for day D in the next week is the count seen exactly 7 days ago
  // (i.e. same day of week last week). Falls back to 0 when there's no data.
  const result = await db.query(
    `
      select to_char(date_trunc('day', created_at at time zone 'UTC'), 'YYYY-MM-DD') as day,
             extract(dow from date_trunc('day', created_at at time zone 'UTC'))::int as dow,
             count(*)::int as cnt
        from app.accident_reports
       where created_at >= (now() - interval '7 days')::date
       group by 1, 2
       order by 1 asc
    `,
  );
  const byDay = new Map(result.rows.map((row) => [row.day, safeNumber(row.cnt, 0)]));

  const series = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Actual last 7 days (today included, going back 6 days)
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    series.push({
      label: DAY_LABELS[dow],
      date: key,
      actual: byDay.get(key) ?? 0,
      predicted: null,
    });
  }

  // Predicted next 7 days (lag-7: copy from same weekday in the actual window)
  for (let i = 1; i <= 7; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + i);
    const dow = d.getUTCDay();
    const referenceIdx = series.findIndex((entry) => DAY_LABELS.indexOf(entry.label) === dow);
    const referenceVal = referenceIdx >= 0 ? series[referenceIdx].actual : 0;
    series.push({
      label: `${DAY_LABELS[dow]}+`,
      date: d.toISOString().slice(0, 10),
      actual: null,
      predicted: referenceVal,
    });
  }

  const max = Math.max(
    1,
    ...series.map((entry) => (entry.actual ?? entry.predicted ?? 0)),
  );
  return { series, max };
}

async function fetchMostDangerousRoad(period, db = pool) {
  const top = await fetchDangerousRoads(period, db);
  return top[0] || null;
}

function unwrapSettled(result, fallback, label) {
  if (result?.status === "fulfilled") return result.value;
  if (result?.status === "rejected") {
    console.warn(`[admin/analytics] ${label} failed:`, result.reason?.message || result.reason);
  }
  return fallback;
}

async function getAnalyticsOverview(rawPeriod = DEFAULT_PERIOD, db = pool) {
  const period = normalizePeriod(rawPeriod);

  // Promise.allSettled so the dashboard still renders the cheap sections
  // (summary / heatmap / severity / time-of-day / weekly trend) even when
  // the spatial dangerous-roads / road-type joins time out on a DB that
  // hasn't yet got the GiST indexes from db+.
  const settled = await Promise.allSettled([
    fetchSummary(period, db),
    fetchHourlyHeatmap(period, db),
    fetchSeverityDistribution(period, db),
    fetchTimeOfDay(period, db),
    fetchDangerousRoads(period, db),
    fetchRoadTypeCorrelation(period, db),
    fetchWeeklyTrend(db),
  ]);

  const summary       = unwrapSettled(settled[0], {}, "summary");
  const heatmap       = unwrapSettled(settled[1], { days: [], rows: [], max: 0 }, "heatmap");
  const severity      = unwrapSettled(settled[2], [], "severity");
  const timeOfDay     = unwrapSettled(settled[3], [], "timeOfDay");
  const dangerousRoads = unwrapSettled(settled[4], [], "dangerousRoads");
  const roadTypes     = unwrapSettled(settled[5], [], "roadTypes");
  const weeklyTrend   = unwrapSettled(settled[6], { series: [], max: 1 }, "weeklyTrend");

  const mostDangerous = dangerousRoads[0] || null;
  const warnings = settled
    .map((r, i) => (r.status === "rejected" ? ["summary", "heatmap", "severity", "timeOfDay", "dangerousRoads", "roadTypes", "weeklyTrend"][i] : null))
    .filter(Boolean);

  return {
    period,
    periodLabel: PERIODS[period].label,
    generatedAt: new Date().toISOString(),
    warnings,
    summary: {
      ...summary,
      mostDangerousRoad: mostDangerous ? mostDangerous.road : null,
      mostDangerousRoadIncidents: mostDangerous ? mostDangerous.incidents : 0,
    },
    heatmap,
    severity,
    timeOfDay,
    dangerousRoads,
    roadTypes,
    weeklyTrend,
  };
}

module.exports = {
  PERIODS,
  DEFAULT_PERIOD,
  normalizePeriod,
  getAnalyticsOverview,
  fetchMostDangerousRoad,
};
