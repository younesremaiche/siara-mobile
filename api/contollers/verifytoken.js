const jwt = require("jsonwebtoken");
const createError = require("http-errors");

const pool = require("../db");

function hasRole(user, roleName) {
  return Array.isArray(user?.roles) && user.roles.includes(roleName);
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

async function resolveAuthenticatedUser(source = {}) {
  const token = extractAccessToken(source);
  const payload = decodeAccessToken(token);
  const user = await fetchAuthenticatedUser(payload.userId);

  if (!user || !user.is_active) {
    throw createError(403, "Token is not valid");
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

function verifyTokenAndClient(req, res, next) {
  return verifyToken(req, res, () => {
    if (hasRole(req.user, "citizen")) {
      return next();
    }

    return res.status(403).json({ error: "You are not allowed to do that" });
  });
}

module.exports = {
  decodeAccessToken,
  extractAccessToken,
  hasRole,
  resolveAuthenticatedUser,
  resolveOptionalAuthenticatedUser,
  verifyToken,
  verifyTokenAndAdmin,
  verifyTokenAndClient,
};
