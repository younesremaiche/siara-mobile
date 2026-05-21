const pool = require("../db");

const MAX_RELATED = 50;

function ensureUuid(value, label = "id") {
  const text = String(value || "").trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
  ) {
    const error = new Error(`Invalid ${label}`);
    error.status = 400;
    throw error;
  }
  return text;
}

async function getThreadByReportId(reportId) {
  const safeId = ensureUuid(reportId, "report id");
  const sql = `
    WITH thread_link AS (
      SELECT thread_id
      FROM app.incident_thread_reports
      WHERE report_id = $1
      LIMIT 1
    ),
    thread_row AS (
      SELECT it.*
      FROM app.incident_threads it
      JOIN thread_link tl ON tl.thread_id = it.id
      LIMIT 1
    ),
    members AS (
      SELECT
        itr.thread_id,
        itr.report_id,
        itr.role,
        itr.added_at,
        ar.title,
        ar.incident_type,
        ar.severity_hint,
        ar.created_at,
        ST_Y(ar.incident_location::geometry) AS lat,
        ST_X(ar.incident_location::geometry) AS lng,
        ar.verified_by_officer_id,
        ar.location_label
      FROM app.incident_thread_reports itr
      JOIN app.accident_reports ar ON ar.id = itr.report_id
      WHERE itr.thread_id = (SELECT id FROM thread_row)
      ORDER BY (itr.role = 'primary') DESC, ar.created_at ASC
    )
    SELECT
      (SELECT row_to_json(t) FROM thread_row t) AS thread,
      COALESCE(json_agg(row_to_json(m)) FILTER (WHERE m.thread_id IS NOT NULL), '[]') AS members
    FROM members m
  `;
  const result = await pool.query(sql, [safeId]);
  const row = result.rows[0] || {};
  if (!row.thread) return null;
  const members = Array.isArray(row.members) ? row.members : [];
  return {
    threadId: row.thread.id,
    primaryReportId: row.thread.primary_report_id,
    memberCount: Number(row.thread.member_count) || members.length,
    createdAt: row.thread.created_at
      ? new Date(row.thread.created_at).toISOString()
      : null,
    members: members.map((m) => ({
      reportId: m.report_id,
      role: m.role,
      title: m.title,
      incidentType: m.incident_type,
      severityHint: Number(m.severity_hint) || 0,
      createdAt: m.created_at ? new Date(m.created_at).toISOString() : null,
      lat: m.lat != null ? Number(m.lat) : null,
      lng: m.lng != null ? Number(m.lng) : null,
      verifiedByPolice: Boolean(m.verified_by_officer_id),
      locationLabel: m.location_label || null,
    })),
  };
}

async function linkReportsAsThread({ primaryReportId, relatedReportIds, createdBy }) {
  const primaryId = ensureUuid(primaryReportId, "primaryReportId");
  if (!Array.isArray(relatedReportIds) || relatedReportIds.length === 0) {
    const error = new Error("relatedReportIds[] is required");
    error.status = 400;
    throw error;
  }
  const relatedIds = [...new Set(relatedReportIds.map((id) => ensureUuid(id, "relatedReportId")))]
    .filter((id) => id !== primaryId)
    .slice(0, MAX_RELATED);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existingThread = await client.query(
      `SELECT thread_id FROM app.incident_thread_reports WHERE report_id = $1 LIMIT 1`,
      [primaryId],
    );

    let threadId;
    if (existingThread.rowCount > 0) {
      threadId = existingThread.rows[0].thread_id;
    } else {
      const created = await client.query(
        `INSERT INTO app.incident_threads (primary_report_id, created_by, member_count)
         VALUES ($1, $2, 1)
         RETURNING id`,
        [primaryId, createdBy || null],
      );
      threadId = created.rows[0].id;
      await client.query(
        `INSERT INTO app.incident_thread_reports (thread_id, report_id, role, added_by)
         VALUES ($1, $2, 'primary', $3)
         ON CONFLICT (thread_id, report_id) DO NOTHING`,
        [threadId, primaryId, createdBy || null],
      );
    }

    for (const id of relatedIds) {
      await client.query(
        `INSERT INTO app.incident_thread_reports (thread_id, report_id, role, added_by)
         VALUES ($1, $2, 'related', $3)
         ON CONFLICT (thread_id, report_id) DO NOTHING`,
        [threadId, id, createdBy || null],
      );
    }

    const countRow = await client.query(
      `SELECT COUNT(*)::int AS member_count
       FROM app.incident_thread_reports WHERE thread_id = $1`,
      [threadId],
    );

    await client.query(
      `UPDATE app.incident_threads
       SET member_count = $1, updated_at = NOW()
       WHERE id = $2`,
      [Number(countRow.rows[0]?.member_count) || 1, threadId],
    );

    await client.query("COMMIT");

    return getThreadByReportId(primaryId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getThreadByReportId,
  linkReportsAsThread,
};
