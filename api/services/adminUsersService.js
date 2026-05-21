const pool = require("../db");
const { recalculateUserTrustScore } = require("./reportSpamDetectionService");

const STATUS_OPTIONS = new Set(["active", "warned", "banned"]);
const FILTER_OPTIONS = new Set([
  "all",
  "active",
  "trusted",
  "at-risk",
  "banned",
  "police",
  "supervisor",
  "admin",
]);
const SORT_OPTIONS = new Set([
  "trust_asc",
  "trust_desc",
  "reports_desc",
  "created_desc",
  "last_active_desc",
]);
const POLICE_ROLES = ["police", "police_officer", "police officer"];
const SUPERVISOR_ROLES = ["police_supervisor", "police supervisor"];
const TRUSTED_ROLES = ["trusted", "trusted_reporter"];
const ADMIN_ROLES = ["admin"];

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const DEV_LOGS_ENABLED = (process.env.NODE_ENV || "development") !== "production";

function logAdmin(event, details = {}) {
  if (DEV_LOGS_ENABLED) {
    console.info("[admin-users]", event, details);
  }
}

const USERS_BASE_SQL = `
  with role_map as (
    select
      ur.user_id,
      array_agg(distinct r.name) filter (where r.name is not null) as roles
    from auth.user_roles ur
    join auth.roles r on r.id = ur.role_id
    group by ur.user_id
  ),
  report_stats as (
    select
      ar.reported_by as user_id,
      count(*)::int as total_reports,
      count(*) filter (
        where ar.verified_by_officer_id is not null
          or ar.review_verdict = 'confirmed_legit'
          or ar.status = 'verified'
      )::int as verified_reports,
      count(*) filter (
        where ar.latest_predicted_label = 'spam'
          or ar.review_verdict = 'confirmed_spam'
      )::int as spam_reports,
      count(*) filter (where ar.latest_predicted_label = 'out_of_context')::int
        as out_of_context_reports,
      count(*) filter (where ar.latest_predicted_label = 'invalid_location')::int
        as invalid_location_reports,
      count(*) filter (where ar.latest_predicted_label = 'suspicious')::int
        as suspicious_reports,
      count(*) filter (
        where ar.status = 'rejected'
          or ar.review_verdict in ('rejected', 'confirmed_spam')
      )::int as rejected_reports,
      count(*) filter (where ar.status = 'resolved' or ar.resolved_at is not null)::int
        as resolved_reports,
      max(ar.created_at) as last_report_at
    from app.accident_reports ar
    where ar.reported_by is not null
    group by ar.reported_by
  ),
  driver_quiz as (
    select
      dq.user_id,
      dq.latest_risk_score,
      dq.latest_result_label,
      dq.latest_result_title,
      dq.completed_attempts_count,
      dq.last_completed_at
    from app.user_driver_quiz_profile dq
  ),
  occurrence_latest as (
    select distinct on (uorp.user_id)
      uorp.user_id,
      uorp.global_occurrence_score,
      uorp.personalized_occurrence_score,
      uorp.global_risk_level,
      uorp.personalized_risk_level,
      uorp.created_at as latest_at
    from app.user_occurrence_risk_predictions uorp
    order by uorp.user_id, uorp.created_at desc
  )
  select
    u.id,
    u.first_name,
    u.last_name,
    u.email,
    u.phone,
    u.avatar_url,
    u.is_active,
    coalesce(u.moderation_status, 'active') as moderation_status,
    u.banned_until,
    u.ban_reason,
    u.warning_reason,
    u.warned_at,
    u.warning_expires_at,
    u.warning_acknowledged_at,
    u.auth_provider,
    u.email_verified_at,
    u.created_at,
    u.updated_at,
    uss.last_login_at,
    u.trust_score,
    u.trust_last_updated_at,
    coalesce(rm.roles, '{}'::text[]) as roles,
    rs.total_reports,
    rs.verified_reports,
    rs.spam_reports,
    rs.out_of_context_reports,
    rs.invalid_location_reports,
    rs.suspicious_reports,
    rs.rejected_reports,
    rs.resolved_reports,
    rs.last_report_at,
    dq.latest_risk_score as driver_latest_risk_score,
    dq.latest_result_label as driver_latest_result_label,
    dq.latest_result_title as driver_latest_result_title,
    dq.completed_attempts_count as driver_completed_attempts,
    dq.last_completed_at as driver_last_completed_at,
    occ.global_occurrence_score as latest_global_occurrence_score,
    occ.personalized_occurrence_score as latest_personalized_occurrence_score,
    occ.global_risk_level as latest_global_risk_level,
    occ.personalized_risk_level as latest_personalized_risk_level,
    occ.latest_at as latest_occurrence_at
  from auth.users u
  left join role_map rm on rm.user_id = u.id
  left join report_stats rs on rs.user_id = u.id
  left join driver_quiz dq on dq.user_id = u.id
  left join occurrence_latest occ on occ.user_id = u.id
  LEFT JOIN app.user_security_state uss ON uss.user_id = u.id
`;

function safeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function deriveStatus(row) {
  const moderation = String(row.moderation_status || "").toLowerCase();
  if (moderation === "banned") return "banned";
  if (moderation === "warned") return "warned";
  if (row.is_active === false) return "inactive";
  return "active";
}

function pickPrimaryRole(roles) {
  const list = Array.isArray(roles) ? roles.map((role) => String(role).toLowerCase()) : [];
  if (list.some((role) => ADMIN_ROLES.includes(role))) return "admin";
  if (list.some((role) => SUPERVISOR_ROLES.includes(role))) return "supervisor";
  if (list.some((role) => POLICE_ROLES.includes(role))) return "police";
  if (list.some((role) => TRUSTED_ROLES.includes(role))) return "trusted";
  if (list.some((role) => role === "citizen")) return "citizen";
  return list[0] || "user";
}

function buildRiskTier(falseRatio, driverRiskScore, trustScore) {
  const ratio = safeNumber(falseRatio) ?? 0;
  const driver = safeNumber(driverRiskScore) ?? 0;
  const trust = safeNumber(trustScore) ?? 50;

  if (ratio >= 40 || driver >= 60 || trust < 40) {
    return { code: "high", label: "High" };
  }
  if (ratio >= 15 || driver >= 40 || trust < 60) {
    return { code: "medium", label: "Medium" };
  }
  return { code: "low", label: "Low" };
}

function buildTrustTier(score) {
  const numeric = safeNumber(score);
  if (numeric == null) return { code: "unknown", label: "Reporter trust unknown" };
  if (numeric >= 80) return { code: "high", label: "High confidence reporter" };
  if (numeric >= 60) return { code: "trusted", label: "Trusted reporter" };
  if (numeric >= 40) return { code: "normal", label: "New/normal reporter" };
  if (numeric >= 20) return { code: "low", label: "Low confidence reporter" };
  return { code: "very_low", label: "Very low confidence reporter" };
}

function mapUserRow(row) {
  if (!row) return null;
  const totalReports = Number(row.total_reports || 0);
  const spamReports = Number(row.spam_reports || 0);
  const outOfContextReports = Number(row.out_of_context_reports || 0);
  const invalidLocationReports = Number(row.invalid_location_reports || 0);
  const rejectedReports = Number(row.rejected_reports || 0);
  const falseRatio =
    totalReports > 0
      ? Number(
          (((spamReports + outOfContextReports + invalidLocationReports + rejectedReports) /
            totalReports) *
            100).toFixed(2),
        )
      : 0;

  const trustScoreRaw = Number(row.trust_score);
  const trustScore = Number.isFinite(trustScoreRaw) ? trustScoreRaw : null;
  const driverRiskScore = safeNumber(row.driver_latest_risk_score);
  const status = deriveStatus(row);
  const roles = Array.isArray(row.roles) ? row.roles : [];
  const lastActiveAt = row.last_login_at || row.last_report_at || row.updated_at || null;

  return {
    id: row.id,
    name: [row.first_name, row.last_name].filter(Boolean).join(" ") || row.email || row.phone || "User",
    firstName: row.first_name || null,
    lastName: row.last_name || null,
    email: row.email || null,
    phone: row.phone || null,
    avatarUrl: row.avatar_url || null,
    isActive: row.is_active !== false,
    status,
    moderationStatus: String(row.moderation_status || "active").toLowerCase(),
    bannedUntil: row.banned_until ? new Date(row.banned_until).toISOString() : null,
    banReason: row.ban_reason || null,
    isPermanentlyBanned:
      String(row.moderation_status || "").toLowerCase() === "banned" && !row.banned_until,
    warningReason: row.warning_reason || null,
    warnedAt: row.warned_at ? new Date(row.warned_at).toISOString() : null,
    warningExpiresAt: row.warning_expires_at ? new Date(row.warning_expires_at).toISOString() : null,
    warningAcknowledgedAt: row.warning_acknowledged_at ? new Date(row.warning_acknowledged_at).toISOString() : null,
    hasActiveWarning:
      String(row.moderation_status || "").toLowerCase() === "warned" && !row.warning_acknowledged_at,
    roles,
    primaryRole: pickPrimaryRole(roles),
    trustScore,
    trustLastUpdatedAt: row.trust_last_updated_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    emailVerifiedAt: row.email_verified_at || null,
    authProvider: row.auth_provider || null,
    lastActiveAt,
    reportStats: {
      totalReports,
      verifiedReports: Number(row.verified_reports || 0),
      spamReports,
      outOfContextReports,
      invalidLocationReports,
      suspiciousReports: Number(row.suspicious_reports || 0),
      rejectedReports,
      resolvedReports: Number(row.resolved_reports || 0),
      falseRatio,
    },
    driverQuiz: {
      latestRiskScore: driverRiskScore,
      latestResultLabel: row.driver_latest_result_label || null,
      latestResultTitle: row.driver_latest_result_title || null,
      completedAttemptsCount: Number(row.driver_completed_attempts || 0),
      lastCompletedAt: row.driver_last_completed_at || null,
    },
    occurrenceRisk: {
      latestPersonalizedScore: safeNumber(row.latest_personalized_occurrence_score),
      latestPersonalizedLevel: row.latest_personalized_risk_level || null,
      latestGlobalScore: safeNumber(row.latest_global_occurrence_score),
      latestGlobalLevel: row.latest_global_risk_level || null,
      latestAt: row.latest_occurrence_at || null,
    },
    riskTier: buildRiskTier(falseRatio, driverRiskScore, trustScore),
    trustTier: buildTrustTier(trustScore),
  };
}

function buildOrderClause(sort) {
  switch (sort) {
    case "trust_desc":
      return "u.trust_score desc nulls last, u.created_at desc";
    case "reports_desc":
      return "coalesce(rs.total_reports, 0) desc, u.created_at desc";
    case "created_desc":
      return "u.created_at desc";
    case "last_active_desc":
      return "coalesce(uss.last_login_at, rs.last_report_at, u.updated_at) desc nulls last";
    case "trust_asc":
    default:
      return "u.trust_score asc nulls last, u.created_at desc";
  }
}

function buildFilterClause(filter, paramOffset) {
  const clauses = [];
  const values = [];

  switch (filter) {
    case "active":
      clauses.push("u.is_active = true and coalesce(u.moderation_status, 'active') = 'active'");
      break;
    case "trusted":
      clauses.push(
        "(coalesce(u.trust_score, 50) >= 60 or exists (select 1 from unnest(coalesce(rm.roles, '{}'::text[])) role where lower(role) in ('trusted', 'trusted_reporter')))",
      );
      break;
    case "at-risk":
      clauses.push(
        "(coalesce(u.trust_score, 50) < 40 or coalesce(rs.total_reports, 0) > 0 and (coalesce(rs.spam_reports, 0) + coalesce(rs.out_of_context_reports, 0) + coalesce(rs.invalid_location_reports, 0) + coalesce(rs.rejected_reports, 0))::numeric / nullif(rs.total_reports, 0) >= 0.4 or coalesce(dq.latest_risk_score, 0) >= 60)",
      );
      break;
    case "banned":
      clauses.push("coalesce(u.moderation_status, 'active') = 'banned'");
      break;
    case "police":
      clauses.push(
        "exists (select 1 from unnest(coalesce(rm.roles, '{}'::text[])) role where lower(role) in ('police', 'police_officer', 'police officer'))",
      );
      break;
    case "supervisor":
      clauses.push(
        "exists (select 1 from unnest(coalesce(rm.roles, '{}'::text[])) role where lower(role) in ('police_supervisor', 'police supervisor'))",
      );
      break;
    case "admin":
      clauses.push(
        "exists (select 1 from unnest(coalesce(rm.roles, '{}'::text[])) role where lower(role) = 'admin')",
      );
      break;
    case "all":
    default:
      break;
  }

  return { clauses, values, paramOffset };
}

async function getCounts(db = pool) {
  const result = await db.query(
    `
      with role_map as (
        select ur.user_id, array_agg(distinct r.name) filter (where r.name is not null) as roles
        from auth.user_roles ur
        join auth.roles r on r.id = ur.role_id
        group by ur.user_id
      ),
      report_stats as (
        select
          ar.reported_by as user_id,
          count(*)::int as total_reports,
          count(*) filter (
            where ar.latest_predicted_label = 'spam'
              or ar.review_verdict = 'confirmed_spam'
          )::int as spam_reports,
          count(*) filter (where ar.latest_predicted_label = 'out_of_context')::int as out_of_context_reports,
          count(*) filter (where ar.latest_predicted_label = 'invalid_location')::int as invalid_location_reports,
          count(*) filter (
            where ar.status = 'rejected'
              or ar.review_verdict in ('rejected', 'confirmed_spam')
          )::int as rejected_reports
        from app.accident_reports ar
        where ar.reported_by is not null
        group by ar.reported_by
      ),
      driver_quiz as (
        select user_id, latest_risk_score
        from app.user_driver_quiz_profile
      )
      select
        count(*)::int as all_count,
        count(*) filter (
          where u.is_active = true and coalesce(u.moderation_status, 'active') = 'active'
        )::int as active_count,
        count(*) filter (
          where coalesce(u.trust_score, 50) >= 60
            or exists (select 1 from unnest(coalesce(rm.roles, '{}'::text[])) role where lower(role) in ('trusted', 'trusted_reporter'))
        )::int as trusted_count,
        count(*) filter (
          where coalesce(u.trust_score, 50) < 40
            or (coalesce(rs.total_reports, 0) > 0
              and ((coalesce(rs.spam_reports, 0) + coalesce(rs.out_of_context_reports, 0) + coalesce(rs.invalid_location_reports, 0) + coalesce(rs.rejected_reports, 0))::numeric / nullif(rs.total_reports, 0)) >= 0.4)
            or coalesce(dq.latest_risk_score, 0) >= 60
        )::int as at_risk_count,
        count(*) filter (where coalesce(u.moderation_status, 'active') = 'banned')::int as banned_count,
        count(*) filter (
          where exists (select 1 from unnest(coalesce(rm.roles, '{}'::text[])) role where lower(role) in ('police', 'police_officer', 'police officer'))
        )::int as police_count,
        count(*) filter (
          where exists (select 1 from unnest(coalesce(rm.roles, '{}'::text[])) role where lower(role) in ('police_supervisor', 'police supervisor'))
        )::int as supervisor_count,
        count(*) filter (
          where exists (select 1 from unnest(coalesce(rm.roles, '{}'::text[])) role where lower(role) = 'admin')
        )::int as admin_count
      from auth.users u
      left join role_map rm on rm.user_id = u.id
      left join report_stats rs on rs.user_id = u.id
      left join driver_quiz dq on dq.user_id = u.id
    `,
  );
  const row = result.rows[0] || {};
  return {
    all: Number(row.all_count || 0),
    active: Number(row.active_count || 0),
    trusted: Number(row.trusted_count || 0),
    atRisk: Number(row.at_risk_count || 0),
    banned: Number(row.banned_count || 0),
    police: Number(row.police_count || 0),
    supervisor: Number(row.supervisor_count || 0),
    admin: Number(row.admin_count || 0),
  };
}

/**
 * Sweep `auth.users` for moderation states whose timer has already passed and
 * lift them back to 'active'. Runs as a single transaction-free maintenance
 * pass — safe to call from any read endpoint to make sure the list the admin
 * sees reflects the current effective state, not a stale snapshot.
 *
 *   - Bans with banned_until <= now()  → moderation_status='active',
 *                                        is_active=true,
 *                                        banned_until / ban_reason cleared.
 *   - Warnings with warning_expires_at <= now() → moderation_status='active',
 *                                                 warning_* columns cleared.
 *
 * Each lift writes an audit row with action='restore' so the history is kept.
 * The audit insert is best-effort (table may not exist yet on fresh deploys).
 */
async function autoLiftExpiredModeration(db = pool) {
  try {
    const expiredBans = await db.query(
      `
        with lifted as (
          update auth.users
             set moderation_status = 'active',
                 is_active         = true,
                 banned_until      = null,
                 ban_reason        = null,
                 updated_at        = now()
           where coalesce(moderation_status, 'active') = 'banned'
             and banned_until is not null
             and banned_until <= now()
           returning id, coalesce(moderation_status, 'active') as new_status
        )
        select id from lifted
      `,
    );
    if (expiredBans.rowCount > 0) {
      try {
        await db.query(
          `
            insert into app.user_moderation_actions
              (user_id, actor_id, action, status_before, status_after, reason)
            select id, null, 'restore', 'banned', 'active', 'auto-lifted (ban expired)'
              from unnest($1::uuid[]) as t(id)
          `,
          [expiredBans.rows.map((r) => r.id)],
        );
      } catch (auditError) {
        console.warn("[admin/users] expired-ban audit insert failed:", auditError?.message);
      }
    }

    const expiredWarnings = await db.query(
      `
        with lifted as (
          update auth.users
             set moderation_status        = 'active',
                 warning_reason           = null,
                 warned_at                = null,
                 warning_expires_at       = null,
                 warning_acknowledged_at  = now(),
                 updated_at               = now()
           where coalesce(moderation_status, 'active') = 'warned'
             and warning_expires_at is not null
             and warning_expires_at <= now()
             and warning_acknowledged_at is null
           returning id
        )
        select id from lifted
      `,
    );
    if (expiredWarnings.rowCount > 0) {
      try {
        await db.query(
          `
            insert into app.user_moderation_actions
              (user_id, actor_id, action, status_before, status_after, reason)
            select id, null, 'restore', 'warned', 'active', 'auto-lifted (warning expired)'
              from unnest($1::uuid[]) as t(id)
          `,
          [expiredWarnings.rows.map((r) => r.id)],
        );
      } catch (auditError) {
        console.warn("[admin/users] expired-warning audit insert failed:", auditError?.message);
      }
    }

    return {
      bansLifted: expiredBans.rowCount,
      warningsLifted: expiredWarnings.rowCount,
    };
  } catch (error) {
    console.warn("[admin/users] autoLiftExpiredModeration failed:", error?.message);
    return { bansLifted: 0, warningsLifted: 0 };
  }
}

async function listAdminUsers(query = {}, db = pool) {
  // Auto-clear any bans/warnings whose timer has already passed so the table
  // the admin sees matches the effective state. Runs unconditionally — it's a
  // single fast scan keyed on the partial indexes we created in db+.
  await autoLiftExpiredModeration(db);

  const search = String(query.search || "").trim();
  const filterRaw = String(query.filter || "all").trim().toLowerCase();
  const filter = FILTER_OPTIONS.has(filterRaw) ? filterRaw : "all";
  const sortRaw = String(query.sort || "trust_asc").trim().toLowerCase();
  const sort = SORT_OPTIONS.has(sortRaw) ? sortRaw : "trust_asc";
  const limit = Math.max(
    1,
    Math.min(MAX_LIMIT, Number.parseInt(query.limit, 10) || DEFAULT_LIMIT),
  );
  const offset = Math.max(0, Number.parseInt(query.offset, 10) || 0);

  const values = [];
  const whereClauses = [];

  if (search) {
    values.push(`%${search.toLowerCase()}%`);
    const idx = values.length;
    whereClauses.push(
      `(lower(coalesce(u.first_name, '')) like $${idx} or lower(coalesce(u.last_name, '')) like $${idx} or lower(coalesce(u.email, '')) like $${idx} or lower(coalesce(u.phone, '')) like $${idx} or lower(u.id::text) like $${idx})`,
    );
  }

  const filterParts = buildFilterClause(filter, values.length);
  whereClauses.push(...filterParts.clauses);

  const whereSql = whereClauses.length ? `where ${whereClauses.join(" and ")}` : "";
  const orderSql = `order by ${buildOrderClause(sort)}`;

  values.push(limit + 1);
  const limitParamIndex = values.length;
  values.push(offset);
  const offsetParamIndex = values.length;

  const result = await db.query(
    `${USERS_BASE_SQL} ${whereSql} ${orderSql} limit $${limitParamIndex} offset $${offsetParamIndex}`,
    values,
  );

  const hasMore = result.rows.length > limit;
  const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
  const counts = await getCounts(db);
  const totalForFilter = (() => {
    if (filter === "all") return counts.all;
    if (filter === "active") return counts.active;
    if (filter === "trusted") return counts.trusted;
    if (filter === "at-risk") return counts.atRisk;
    if (filter === "banned") return counts.banned;
    if (filter === "police") return counts.police;
    if (filter === "supervisor") return counts.supervisor;
    if (filter === "admin") return counts.admin;
    return counts.all;
  })();

  return {
    users: rows.map(mapUserRow),
    counts,
    pagination: {
      limit,
      offset,
      hasMore,
      total: totalForFilter,
    },
  };
}

async function getAdminUserDetails(userId, db = pool) {
  // Same maintenance pass as the list endpoint so a stale "Banned" pill on a
  // user whose timer has just expired flips to "Active" the moment an admin
  // opens their details modal.
  await autoLiftExpiredModeration(db);

  const result = await db.query(`${USERS_BASE_SQL} where u.id = $1 limit 1`, [userId]);
  if (result.rowCount === 0) return null;
  const user = mapUserRow(result.rows[0]);

  const recentReports = await db.query(
    `
      select id, title, status, latest_predicted_label, latest_spam_score,
             review_verdict, verified_by_officer_id, created_at
      from app.accident_reports
      where reported_by = $1
      order by created_at desc
      limit 10
    `,
    [userId],
  );

  return {
    ...user,
    recentReports: recentReports.rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      latestPredictedLabel: row.latest_predicted_label,
      latestSpamScore: safeNumber(row.latest_spam_score),
      reviewVerdict: row.review_verdict,
      verifiedByOfficerId: row.verified_by_officer_id,
      createdAt: row.created_at,
    })),
  };
}

/**
 * Update a user's moderation state.
 *
 * Accepted payload:
 *   status:       one of STATUS_OPTIONS — required
 *   bannedUntil:  ISO timestamp string or null. Required interpretation:
 *                   - 'banned' + null bannedUntil  → PERMANENT ban
 *                       (sets is_active=false so the user cannot log in ever)
 *                   - 'banned' + future bannedUntil → TEMPORARY ban
 *                       (keeps is_active=true so the user can still log in
 *                        and see the ban banner; writes are blocked elsewhere)
 *                   - 'warned' / 'active' → bannedUntil and reason are cleared
 *   reason:       admin-supplied explanation shown back to the user
 *   note:         private admin-only note (audit log only)
 */
async function updateAdminUserStatus(userId, payload = {}, actor = null) {
  const normalized = String(payload?.status || "").trim().toLowerCase();
  if (!STATUS_OPTIONS.has(normalized)) {
    const error = new Error(`status must be one of: ${[...STATUS_OPTIONS].join(", ")}`);
    error.status = 400;
    throw error;
  }

  const isBanLike = normalized === "banned";
  const rawBannedUntil = payload?.bannedUntil ?? payload?.banned_until ?? null;
  let parsedBannedUntil = null;
  if (isBanLike && rawBannedUntil != null && rawBannedUntil !== "") {
    const dateValue = new Date(rawBannedUntil);
    if (Number.isNaN(dateValue.getTime())) {
      const error = new Error("bannedUntil must be a valid ISO timestamp");
      error.status = 400;
      throw error;
    }
    if (dateValue.getTime() <= Date.now()) {
      const error = new Error("bannedUntil must be in the future");
      error.status = 400;
      throw error;
    }
    parsedBannedUntil = dateValue.toISOString();
  }

  // Warning-specific input parsing (only meaningful when status='warned').
  const isWarning = normalized === "warned";
  const rawWarningExpiresAt =
    payload?.warningExpiresAt ?? payload?.warning_expires_at ?? null;
  let parsedWarningExpiresAt = null;
  if (isWarning && rawWarningExpiresAt != null && rawWarningExpiresAt !== "") {
    const dateValue = new Date(rawWarningExpiresAt);
    if (Number.isNaN(dateValue.getTime())) {
      const error = new Error("warningExpiresAt must be a valid ISO timestamp");
      error.status = 400;
      throw error;
    }
    if (dateValue.getTime() <= Date.now()) {
      const error = new Error("warningExpiresAt must be in the future");
      error.status = 400;
      throw error;
    }
    parsedWarningExpiresAt = dateValue.toISOString();
  }
  const warningReason = isWarning
    ? (payload?.warningReason ?? payload?.warning_reason ?? payload?.reason ?? null)
    : null;
  const finalWarningReason = warningReason
    ? String(warningReason).slice(0, 500)
    : null;

  // Permanent ban only when status='banned' AND no expiry was supplied.
  const isPermanentBan = normalized === "banned" && parsedBannedUntil == null;

  // Keep is_active=true for warned/temp-ban so the user can log in and see
  // the ban message. Only fully deactivate on permanent ban.
  const isActiveValue = !isPermanentBan;

  const finalReason = isBanLike && payload?.reason
    ? String(payload.reason).slice(0, 500)
    : null;

  const client = await pool.connect();
  try {
    await client.query("begin");

    const beforeResult = await client.query(
      `select coalesce(moderation_status, 'active') as moderation_status
         from auth.users where id = $1 limit 1`,
      [userId],
    );
    if (beforeResult.rowCount === 0) {
      const error = new Error("User not found");
      error.status = 404;
      throw error;
    }
    const statusBefore = beforeResult.rows[0].moderation_status;

    // When the new status is "warned" we write the warning fields and clear
    // any leftover ban fields. When the new status is anything else (active /
    // warned-clear / banned) we clear the warning fields entirely
    // so a returning-to-active user doesn't keep seeing a stale banner.
    const updateResult = await client.query(
      `
        update auth.users
           set moderation_status        = $2,
               is_active                = $3,
               banned_until             = $4::timestamptz,
               ban_reason               = $5::text,
               warning_reason           = case when $7 = 'warned' then $6::text        else null::text        end,
               warned_at                = case when $7 = 'warned' then now()           else null::timestamptz end,
               warning_expires_at       = case when $7 = 'warned' then $8::timestamptz else null::timestamptz end,
               warning_acknowledged_at  = null,
               updated_at               = now()
         where id = $1
         returning id
      `,
      [
        userId,
        normalized,
        isActiveValue,
        parsedBannedUntil,
        finalReason,
        finalWarningReason,
        normalized,
        parsedWarningExpiresAt,
      ],
    );
    if (updateResult.rowCount === 0) {
      const error = new Error("User not found");
      error.status = 404;
      throw error;
    }

    // On permanent ban: bump session_version so any outstanding access token
    // is rejected immediately, forcing the user out.
    if (isPermanentBan) {
      await client.query(
        `
          insert into app.user_security_state (user_id, session_version, updated_at)
          values ($1, 1, now())
          on conflict (user_id)
          do update set session_version = coalesce(app.user_security_state.session_version, 0) + 1,
                        updated_at      = now()
        `,
        [userId],
      );
    }

    // Audit log (best-effort — table is optional; ignore if missing).
    try {
      const auditReason = isWarning
        ? finalWarningReason
        : (finalReason || (payload?.note ? String(payload.note).slice(0, 500) : null));
      await client.query(
        `
          insert into app.user_moderation_actions
            (user_id, actor_id, action, status_before, status_after, banned_until, reason)
          values ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          userId,
          actor?.userId || actor?.id || null,
          deriveAuditAction(statusBefore, normalized),
          statusBefore,
          normalized,
          parsedBannedUntil,
          auditReason,
        ],
      );
    } catch (auditError) {
      // Table may not exist yet (db+ migration not applied). Log and continue.
      console.warn("[admin/users] user_moderation_actions insert failed:", auditError?.message);
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  logAdmin("status_updated", {
    userId,
    status: normalized,
    bannedUntil: parsedBannedUntil,
    isPermanentBan,
    warningExpiresAt: parsedWarningExpiresAt,
    warningReason: finalWarningReason,
    actorId: actor?.userId || actor?.id || null,
    note: payload?.note ? String(payload.note).slice(0, 500) : null,
  });

  return getAdminUserDetails(userId);
}

/**
 * Called by the user themselves to dismiss the warning banner. Moves the user
 * back to 'active' and clears the warning columns, while recording the dismissal
 * in the audit log so admins can still see the warning history.
 */
async function acknowledgeOwnWarning(userId) {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const before = await client.query(
      `
        select coalesce(moderation_status, 'active') as moderation_status,
               warning_reason,
               warning_acknowledged_at
          from auth.users
         where id = $1
         limit 1
      `,
      [userId],
    );
    if (before.rowCount === 0) {
      const error = new Error("User not found");
      error.status = 404;
      throw error;
    }

    const row = before.rows[0];
    const status = String(row.moderation_status || "active").toLowerCase();
    if (status !== "warned") {
      // Nothing to acknowledge; succeed silently.
      await client.query("commit");
      return getAdminUserDetails(userId);
    }
    if (row.warning_acknowledged_at) {
      await client.query("commit");
      return getAdminUserDetails(userId);
    }

    await client.query(
      `
        update auth.users
           set moderation_status        = 'active',
               warning_acknowledged_at  = now(),
               warning_reason           = null,
               warning_expires_at       = null,
               warned_at                = null,
               updated_at               = now()
         where id = $1
      `,
      [userId],
    );

    try {
      await client.query(
        `
          insert into app.user_moderation_actions
            (user_id, actor_id, action, status_before, status_after, banned_until, reason)
          values ($1, $1, 'acknowledge', 'warned', 'active', null, $2)
        `,
        [userId, row.warning_reason || null],
      );
    } catch (auditError) {
      console.warn("[admin/users] warning acknowledge audit insert failed:", auditError?.message);
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  return getAdminUserDetails(userId);
}

function deriveAuditAction(statusBefore, statusAfter) {
  if (statusAfter === "banned") return "ban";
  if (statusAfter === "warned") return "warn";
  if (statusAfter === "active") {
    if (statusBefore === "banned") return "unban";
    return "restore";
  }
  return "restore";
}

async function updateAdminUserRoles(userId, { roles } = {}, actor = null) {
  if (!Array.isArray(roles)) {
    const error = new Error("roles must be an array");
    error.status = 400;
    throw error;
  }

  const normalizedRoles = [
    ...new Set(
      roles
        .map((role) => String(role || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  ];

  const client = await pool.connect();
  try {
    await client.query("begin");

    const userExists = await client.query(
      `select id from auth.users where id = $1 limit 1`,
      [userId],
    );
    if (userExists.rowCount === 0) {
      const error = new Error("User not found");
      error.status = 404;
      throw error;
    }

    const roleRows = normalizedRoles.length
      ? await client.query(`select id, name from auth.roles where lower(name) = any($1::text[])`, [
          normalizedRoles,
        ])
      : { rows: [] };

    const knownNames = new Set(roleRows.rows.map((row) => String(row.name).toLowerCase()));
    const unknownRoles = normalizedRoles.filter((role) => !knownNames.has(role));
    if (unknownRoles.length > 0) {
      const error = new Error(`Unknown role(s): ${unknownRoles.join(", ")}`);
      error.status = 400;
      throw error;
    }

    const adminRoleIds = roleRows.rows
      .filter((row) => String(row.name).toLowerCase() === "admin")
      .map((row) => row.id);
    const willHaveAdmin = adminRoleIds.length > 0;

    if (!willHaveAdmin) {
      const adminCheck = await client.query(
        `
          select count(*)::int as admin_count
          from auth.user_roles ur
          join auth.roles r on r.id = ur.role_id
          where lower(r.name) = 'admin' and ur.user_id <> $1
        `,
        [userId],
      );
      if (Number(adminCheck.rows[0]?.admin_count || 0) === 0) {
        const error = new Error("Cannot remove the last remaining admin");
        error.status = 409;
        throw error;
      }
    }

    await client.query(`delete from auth.user_roles where user_id = $1`, [userId]);
    for (const roleRow of roleRows.rows) {
      await client.query(
        `insert into auth.user_roles (user_id, role_id) values ($1, $2) on conflict do nothing`,
        [userId, roleRow.id],
      );
    }

    await client.query(`update auth.users set updated_at = now() where id = $1`, [userId]);
    await client.query("commit");

    logAdmin("roles_updated", {
      userId,
      roles: normalizedRoles,
      actorId: actor?.userId || actor?.id || null,
    });
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  return getAdminUserDetails(userId);
}

async function listAdminRoles() {
  const result = await pool.query(
    `select id, name, coalesce(description, '') as description from auth.roles order by name asc`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
  }));
}

async function recalculateUserTrustScoreForAdmin(userId, actor = null) {
  const updated = await recalculateUserTrustScore(userId, pool, {
    reason: "admin_manual_recalculation",
  });
  logAdmin("trust_recalculated", {
    userId,
    actorId: actor?.userId || actor?.id || null,
    newTrustScore: updated?.trust_score ?? null,
  });
  return getAdminUserDetails(userId);
}

module.exports = {
  STATUS_OPTIONS: [...STATUS_OPTIONS],
  FILTER_OPTIONS: [...FILTER_OPTIONS],
  SORT_OPTIONS: [...SORT_OPTIONS],
  listAdminUsers,
  listAdminRoles,
  getAdminUserDetails,
  updateAdminUserStatus,
  updateAdminUserRoles,
  acknowledgeOwnWarning,
  recalculateUserTrustScoreForAdmin,
  buildRiskTier,
  buildTrustTier,
};
