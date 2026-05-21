const jwt = require("jsonwebtoken");
const createError = require("http-errors");

const pool = require("../db");

function hasRole(user, roleName) {
  return Array.isArray(user?.roles) && user.roles.includes(roleName);
}

function normalizeRoleName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function hasAnyRole(user, roleNames = []) {
  if (!Array.isArray(user?.roles) || !Array.isArray(roleNames) || roleNames.length === 0) {
    return false;
  }

  const normalizedUserRoles = user.roles.map(normalizeRoleName).filter(Boolean);
  return roleNames.some((roleName) => normalizedUserRoles.includes(normalizeRoleName(roleName)));
}

function parseCookieHeader(cookieHeader) {
  if (typeof cookieHeader !== "string" || !cookieHeader.trim()) {
    return {};
  }

  return cookieHeader.split(";").reduce((cookies, entry) => {
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex <= 0) {
      return cookies;
    }

    const key = entry.slice(0, separatorIndex).trim();
    const value = entry.slice(separatorIndex + 1).trim();
    if (key) {
      cookies[key] = decodeURIComponent(value);
    }
    return cookies;
  }, {});
}

function extractBearerToken(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = normalized.slice(7).trim();
  return token || null;
}

function extractAccessToken(source = {}) {
  const directCookieToken = source.cookies?.accessToken;
  if (typeof directCookieToken === "string" && directCookieToken.trim()) {
    return directCookieToken.trim();
  }

  const headerToken = extractBearerToken(
    source.headers?.authorization || source.handshake?.headers?.authorization,
  );
  if (headerToken) {
    return headerToken;
  }

  const authToken =
    source.auth?.token
    || source.handshake?.auth?.token
    || source.handshake?.query?.token
    || null;
  if (typeof authToken === "string" && authToken.trim()) {
    return authToken.trim();
  }

  const parsedCookies = parseCookieHeader(
    source.headers?.cookie || source.handshake?.headers?.cookie,
  );
  if (typeof parsedCookies.accessToken === "string" && parsedCookies.accessToken.trim()) {
    return parsedCookies.accessToken.trim();
  }

  return null;
}

function decodeAccessToken(token) {
  if (!token) {
    throw createError(401, "You are not authenticated");
  }

  if (!process.env.JWT_ACCESSTOKEN) {
    throw createError(500, "JWT_ACCESSTOKEN is not configured");
  }

  return jwt.verify(token, process.env.JWT_ACCESSTOKEN);
}

async function fetchAuthenticatedUser(userId) {
  const result = await pool.query(
    `
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
        u.created_at,
        u.updated_at,
        uss.email_verified_at,
        uss.last_login_at,
        uss.last_password_reset_at,
        (uss.user_id is not null) as has_security_state,
        coalesce(uss.session_version, 0) as session_version,
        coalesce(
          array_agg(distinct r.name) filter (where r.name is not null),
          '{}'::varchar[]
        ) as roles
      from auth.users u
      left join app.user_security_state uss
        on uss.user_id = u.id
      left join auth.user_roles ur
        on ur.user_id = u.id
      left join auth.roles r
        on r.id = ur.role_id
      where u.id = $1
      group by
        u.id,
        uss.user_id,
        uss.email_verified_at,
        uss.last_login_at,
        uss.last_password_reset_at,
        uss.session_version
      limit 1
    `,
    [userId],
  );

  return result.rows[0] || null;
}

/**
 * Auto-clear a warning whose expiry has passed. The user reverts to 'active'
 * silently without admin action. Mutates `user` in place.
 */
async function liftExpiredWarningIfNeeded(user) {
  if (!user) return;
  const status = String(user.moderation_status || "active").toLowerCase();
  if (status !== "warned") return;
  if (user.warning_acknowledged_at) return;
  if (!user.warning_expires_at) return;
  const ts = new Date(user.warning_expires_at).getTime();
  if (Number.isNaN(ts) || ts > Date.now()) return;

  await pool.query(
    `
      update auth.users
         set moderation_status        = 'active',
             warning_reason           = null,
             warned_at                = null,
             warning_expires_at       = null,
             warning_acknowledged_at  = now(),
             updated_at               = now()
       where id = $1
    `,
    [user.id],
  );
  user.moderation_status = "active";
  user.warning_reason = null;
  user.warned_at = null;
  user.warning_expires_at = null;
  user.warning_acknowledged_at = new Date().toISOString();
}

/**
 * If the user has a ban whose `banned_until` is in the past, lift it inline so
 * the rest of the request sees an active user. Mutates `user` in place and
 * returns the current effective ban state.
 */
async function liftExpiredBanIfNeeded(user) {
  if (!user) return { banned: false };

  // Auto-clear an expired warning if the admin set warning_expires_at and the
  // user never dismissed it themselves. Independent of the ban path.
  await liftExpiredWarningIfNeeded(user);

  const status = String(user.moderation_status || "active").toLowerCase();
  if (status !== "banned") {
    return { banned: false };
  }

  const bannedUntilTs = user.banned_until ? new Date(user.banned_until).getTime() : null;
  const hasExpiry = bannedUntilTs != null && !Number.isNaN(bannedUntilTs);

  if (hasExpiry && bannedUntilTs <= Date.now()) {
    await pool.query(
      `
        update auth.users
           set moderation_status = 'active',
               is_active         = true,
               banned_until      = null,
               ban_reason        = null,
               updated_at        = now()
         where id = $1
      `,
      [user.id],
    );
    user.moderation_status = "active";
    user.banned_until = null;
    user.ban_reason = null;
    user.is_active = true;
    return { banned: false, autoLifted: true };
  }

  if (status === "banned" && !hasExpiry) {
    return { banned: true, permanent: true, until: null, reason: user.ban_reason || null };
  }

  if (hasExpiry) {
    return {
      banned: true,
      permanent: false,
      until: new Date(bannedUntilTs).toISOString(),
      reason: user.ban_reason || null,
      status,
    };
  }

  return { banned: false };
}

async function resolveAuthenticatedUser(source = {}) {
  const token = extractAccessToken(source);
  const payload = decodeAccessToken(token);
  const user = await fetchAuthenticatedUser(payload.userId);

  if (!user) {
    throw createError(403, "Token is not valid");
  }

  // Auto-lift expired bans before doing the is_active check, so a stale
  // is_active=false from a previous permanent ban that has since been
  // overwritten won't lock a user out incorrectly.
  const ban = await liftExpiredBanIfNeeded(user);

  if (!user.is_active) {
    const error = createError(403, ban.permanent
      ? (ban.reason ? `Your account is permanently banned: ${ban.reason}` : "Your account is permanently banned.")
      : "Your account is inactive.");
    error.code = ban.permanent ? "ACCOUNT_BANNED" : "ACCOUNT_INACTIVE";
    if (ban.permanent) error.ban = { permanent: true, until: null, reason: ban.reason || null };
    throw error;
  }

  const tokenSessionVersion = Number.isInteger(payload.sessionVersion)
    ? payload.sessionVersion
    : Number(payload.sessionVersion || 0);
  const activeSessionVersion = Number(user.session_version || 0);

  if (tokenSessionVersion !== activeSessionVersion) {
    throw createError(403, "Token is not valid");
  }

  return {
    userId: user.id,
    roles: Array.isArray(user.roles) ? user.roles : [],
    sessionVersion: activeSessionVersion,
    emailVerified: !user.email || Boolean(user.email_verified_at) || user.has_security_state === false,
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    phone: user.phone,
    avatar_url: user.avatar_url,
    is_active: user.is_active,
    moderation_status: user.moderation_status || "active",
    moderationStatus: user.moderation_status || "active",
    banned_until: user.banned_until ? new Date(user.banned_until).toISOString() : null,
    bannedUntil: user.banned_until ? new Date(user.banned_until).toISOString() : null,
    ban_reason: user.ban_reason || null,
    banReason: user.ban_reason || null,
    isBanned: ban.banned === true,
    isPermanentlyBanned: ban.permanent === true,
    warning_reason: user.warning_reason || null,
    warningReason: user.warning_reason || null,
    warned_at: user.warned_at ? new Date(user.warned_at).toISOString() : null,
    warnedAt: user.warned_at ? new Date(user.warned_at).toISOString() : null,
    warning_expires_at: user.warning_expires_at ? new Date(user.warning_expires_at).toISOString() : null,
    warningExpiresAt: user.warning_expires_at ? new Date(user.warning_expires_at).toISOString() : null,
    warning_acknowledged_at: user.warning_acknowledged_at ? new Date(user.warning_acknowledged_at).toISOString() : null,
    warningAcknowledgedAt: user.warning_acknowledged_at ? new Date(user.warning_acknowledged_at).toISOString() : null,
    hasActiveWarning:
      String(user.moderation_status || "").toLowerCase() === "warned" && !user.warning_acknowledged_at,
    created_at: user.created_at,
    updated_at: user.updated_at,
    email_verified_at: user.email_verified_at || null,
    has_security_state: user.has_security_state,
    last_login_at: user.last_login_at || null,
    last_password_reset_at: user.last_password_reset_at || null,
  };
}

async function resolveOptionalAuthenticatedUser(source = {}) {
  try {
    return await resolveAuthenticatedUser(source);
  } catch (error) {
    if (
      error.status === 401
      || error.status === 403
      || error.name === "JsonWebTokenError"
      || error.name === "TokenExpiredError"
    ) {
      return null;
    }

    throw error;
  }
}

async function verifyToken(req, res, next) {
  try {
    req.user = await resolveAuthenticatedUser(req);
    return next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(403).json({ error: "Token is not valid" });
    }

    if (error.status === 401 || error.status === 403) {
      return res.status(error.status).json({ error: error.message || "Token is not valid" });
    }

    return next(error);
  }
}

function verifyTokenAndAdmin(req, res, next) {
  return verifyToken(req, res, () => {
    if (hasRole(req.user, "admin")) {
      return next();
    }

    return res.status(403).json({ error: "You are not allowed to do that" });
  });
}

function verifyTokenAndRoles(roleNames = []) {
  return (req, res, next) => verifyToken(req, res, () => {
    if (hasAnyRole(req.user, roleNames)) {
      return next();
    }

    return res.status(403).json({ error: "You are not allowed to do that" });
  });
}

const POLICE_ROLE_NAMES = ["police", "police_officer", "police officer" , "POLICE_SUPERVISOR"];
const POLICE_SUPERVISOR_ROLE_NAMES = ["police_supervisor", "police supervisor" , "POLICE_SUPERVISOR"];
const ALL_POLICE_ROLE_NAMES = [...POLICE_ROLE_NAMES, ...POLICE_SUPERVISOR_ROLE_NAMES];

function verifyTokenAndPolice(req, res, next) {
  return verifyTokenAndRoles(ALL_POLICE_ROLE_NAMES)(req, res, next);
}

function verifyTokenAndPoliceSupervisor(req, res, next) {
  return verifyToken(req, res, () => {
    const isSupervisor =
      hasAnyRole(req.user, POLICE_SUPERVISOR_ROLE_NAMES) || hasRole(req.user, "admin");

    if (!isSupervisor) {
      return res.status(403).json({ error: "Police supervisor access is required" });
    }

    return next();
  });
}

function verifyTokenAndClient(req, res, next) {
  return verifyToken(req, res, () => {
    if (hasRole(req.user, "citizen")) {
      return next();
    }

    return res.status(403).json({ error: "You are not allowed to do that" });
  });
}

/**
 * Blocks any write action when the authenticated user is currently banned.
 * Admins are exempt so they can keep moderating from their own account.
 * Must be chained after `verifyToken` (or any verifyTokenAnd...).
 */
function requireUnbanned(req, res, next) {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (hasRole(user, "admin")) {
    return next();
  }
  if (user.isBanned || user.isPermanentlyBanned) {
    const until = user.bannedUntil || null;
    const message = user.isPermanentlyBanned
      ? (user.banReason
          ? `Your account is permanently banned: ${user.banReason}`
          : "Your account is permanently banned.")
      : (user.banReason
          ? `You are banned until ${until}: ${user.banReason}`
          : `You are banned until ${until}.`);
    return res.status(403).json({
      error: message,
      code: "ACCOUNT_BANNED",
      ban: {
        permanent: Boolean(user.isPermanentlyBanned),
        until,
        reason: user.banReason || null,
      },
    });
  }
  return next();
}

/** Combined: authenticate, then block banned users. Use on write endpoints. */
function verifyTokenAndNotBanned(req, res, next) {
  return verifyToken(req, res, (err) => {
    if (err) return next(err);
    return requireUnbanned(req, res, next);
  });
}

module.exports = {
  decodeAccessToken,
  extractAccessToken,
  hasAnyRole,
  hasRole,
  normalizeRoleName,
  ALL_POLICE_ROLE_NAMES,
  POLICE_ROLE_NAMES,
  POLICE_SUPERVISOR_ROLE_NAMES,
  resolveAuthenticatedUser,
  resolveOptionalAuthenticatedUser,
  verifyToken,
  verifyTokenAndAdmin,
  verifyTokenAndClient,
  verifyTokenAndPolice,
  verifyTokenAndPoliceSupervisor,
  verifyTokenAndRoles,
  verifyTokenAndNotBanned,
  requireUnbanned,
};
