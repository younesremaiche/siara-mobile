const pool = require("../db");
const { sendTemplatedEmail } = require("./emailService");

const DEFAULT_TOP_ZONE_LIMIT = 3;

function getClientOrigin() {
  return String(process.env.CLIENT_ORIGIN || "http://localhost:5173").replace(/\/+$/, "");
}

function getFullName(user) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() || "there";
}

async function fetchWeeklySummaryRecipients(targetUserId = null, db = pool) {
  const values = [];
  let userFilterSql = "";

  if (targetUserId) {
    values.push(targetUserId);
    userFilterSql = `and u.id = $${values.length}`;
  }

  const result = await db.query(
    `
      select
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        uss.email_verified_at
      from auth.users u
      left join app.user_email_preferences uep
        on uep.user_id = u.id
      left join app.user_security_state uss
        on uss.user_id = u.id
      where u.is_active = true
        and u.email is not null
        and trim(u.email) <> ''
        and coalesce(uep.weekly_summary_enabled, true) = true
        and (uss.email_verified_at is not null or uss.user_id is null)
        ${userFilterSql}
      order by u.created_at asc
    `,
    values,
  );

  return result.rows;
}

async function fetchWeeklySummaryStats(userId, db = pool) {
  const result = await db.query(
    `
      with recent_triggers as (
        select
          atl.id,
          atl.report_id,
          atl.matched_at,
          coalesce(az.display_name, ar.name, 'Watched zone') as zone_name
        from app.alert_trigger_log atl
        join app.alert_rules ar
          on ar.id = atl.alert_id
        left join app.alert_zones az
          on az.alert_id = ar.id
        where ar.user_id = $1
          and atl.matched_at >= now() - interval '7 days'
      ),
      recent_reports as (
        select distinct
          rt.report_id
        from recent_triggers rt
        where rt.report_id is not null
      ),
      top_zone_rows as (
        select
          rt.zone_name,
          count(*)::int as trigger_count
        from recent_triggers rt
        group by rt.zone_name
        order by trigger_count desc, rt.zone_name asc
        limit ${DEFAULT_TOP_ZONE_LIMIT}
      ),
      incident_type_rows as (
        select
          ar.incident_type,
          count(*)::int as incident_count
        from recent_reports rr
        join app.accident_reports ar
          on ar.id = rr.report_id
        group by ar.incident_type
        order by incident_count desc, ar.incident_type asc
        limit 1
      )
      select
        (select count(*)::int from recent_reports) as incident_count,
        (select count(*)::int from recent_triggers) as trigger_count,
        (select incident_type from incident_type_rows) as top_incident_type,
        coalesce(
          (
            select json_agg(
              json_build_object(
                'zoneName', tz.zone_name,
                'triggerCount', tz.trigger_count
              )
              order by tz.trigger_count desc, tz.zone_name asc
            )
            from top_zone_rows tz
          ),
          '[]'::json
        ) as top_zones
    `,
    [userId],
  );

  return result.rows[0] || {
    incident_count: 0,
    trigger_count: 0,
    top_incident_type: null,
    top_zones: [],
  };
}

function buildSummaryLinks() {
  const origin = getClientOrigin();
  return {
    dashboardUrl: `${origin}/dashboard`,
    mapUrl: `${origin}/map`,
  };
}

async function sendWeeklySummaryToUser(user, db = pool) {
  const stats = await fetchWeeklySummaryStats(user.id, db);
  const links = buildSummaryLinks();

  const email = await sendTemplatedEmail({
    userId: user.id,
    email: user.email,
    category: "summary",
    templateKey: "weekly_summary",
    subject: "Your SIARA weekly safety summary",
    templateData: {
      fullName: getFullName(user),
      incidentCount: Number(stats.incident_count || 0),
      triggerCount: Number(stats.trigger_count || 0),
      topIncidentType: stats.top_incident_type || "No dominant incident type",
      topZones: Array.isArray(stats.top_zones) ? stats.top_zones : [],
      dashboardUrl: links.dashboardUrl,
      mapUrl: links.mapUrl,
    },
    payload: {
      periodDays: 7,
      incidentCount: Number(stats.incident_count || 0),
      triggerCount: Number(stats.trigger_count || 0),
      topIncidentType: stats.top_incident_type || null,
      topZones: Array.isArray(stats.top_zones) ? stats.top_zones : [],
      ...links,
    },
  }, db);

  return {
    emailId: email.id,
    email: user.email,
    incidentCount: Number(stats.incident_count || 0),
    triggerCount: Number(stats.trigger_count || 0),
  };
}

async function runWeeklySummaryJob({ targetUserId = null } = {}) {
  const recipients = await fetchWeeklySummaryRecipients(targetUserId);
  const results = [];
  let sentCount = 0;
  let failedCount = 0;

  for (const recipient of recipients) {
    try {
      const summary = await sendWeeklySummaryToUser(recipient);
      results.push({
        userId: recipient.id,
        email: recipient.email,
        ok: true,
        ...summary,
      });
      sentCount += 1;
    } catch (error) {
      results.push({
        userId: recipient.id,
        email: recipient.email,
        ok: false,
        error: error.message,
      });
      failedCount += 1;
    }
  }

  return {
    ok: failedCount === 0,
    attemptedCount: recipients.length,
    sentCount,
    failedCount,
    results,
  };
}

module.exports = {
  fetchWeeklySummaryRecipients,
  fetchWeeklySummaryStats,
  runWeeklySummaryJob,
  sendWeeklySummaryToUser,
};
