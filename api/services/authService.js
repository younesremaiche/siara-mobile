const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const createError = require("http-errors");
const { OAuth2Client } = require("google-auth-library");

const pool = require("../db");
const { sendTemplatedEmail } = require("./emailService");
const {
  OTP_EXPIRY_MINUTES,
  OTP_RESEND_COOLDOWN_SECONDS,
  createPasswordResetSession,
  consumePasswordResetSession,
  issueOtpCode,
  verifyOtpCode,
  verifyPasswordResetSession,
} = require("./otpService");

const JWT_COOKIE_NAME = "accessToken";
const REMEMBER_ME_TTL = "30d";
const SESSION_TTL = "12h";
const REMEMBER_ME_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const PASSWORD_SALT_ROUNDS = 12;
const SUPPORTED_OTP_PURPOSES = new Set(["verify_email", "reset_password"]);
const GOOGLE_PROVIDER = "google";
const EMAIL_VERIFICATION_REQUIRED_CODE = "EMAIL_VERIFICATION_REQUIRED";
const IS_DEVELOPMENT = process.env.NODE_ENV !== "production";

let googleClient = null;

const USER_SELECT_SQL = `
  select
    u.id,
    u.first_name,
    u.last_name,
    u.email,
    u.phone,
    u.password_hash,
    u.avatar_url,
    u.auth_provider,
    u.google_sub,
    u.is_active,
    u.created_at,
    u.updated_at,
    coalesce(uss.email_verified_at, u.email_verified_at) as email_verified_at,
    uss.last_login_at,
    uss.last_password_reset_at,
    coalesce(uss.session_version, 0) as session_version,
    (uss.user_id is not null) as has_security_state,
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
`;

function logAuth(message, details = {}) {
  if (!IS_DEVELOPMENT) {
    return;
  }

  console.info("[auth]", message, details);
}

function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeEmail(value) {
  const normalized = normalizeOptionalString(value);
  return normalized ? normalized.toLowerCase() : null;
}

function splitFullName(fullName) {
  const normalized = normalizeOptionalString(fullName);
  if (!normalized) {
    return {
      firstName: "",
      lastName: "",
    };
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return {
      firstName: parts[0],
      lastName: parts[0],
    };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function normalizeRememberMe(value) {
  return value === true;
}

function getCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
  };
}

function applySessionCookie(res, token, rememberMe) {
  const cookieOptions = getCookieOptions();
  if (rememberMe) {
    res.cookie(JWT_COOKIE_NAME, token, {
      ...cookieOptions,
      maxAge: REMEMBER_ME_MAX_AGE_MS,
    });
    return;
  }

  res.cookie(JWT_COOKIE_NAME, token, cookieOptions);
}

function clearSessionCookie(res) {
  res.clearCookie(JWT_COOKIE_NAME, getCookieOptions());
}

function getJwtSecret() {
  if (!process.env.JWT_ACCESSTOKEN) {
    throw createError(500, "JWT_ACCESSTOKEN is not configured");
  }

  return process.env.JWT_ACCESSTOKEN;
}

function isEmailVerified(user) {
  if (!user?.email) {
    return true;
  }

  if (user?.has_security_state === false) {
    return true;
  }

  return Boolean(user.email_verified_at);
}

function mapUser(row) {
  const roles = Array.isArray(row?.roles) ? row.roles : [];
  const name = [row?.first_name, row?.last_name].filter(Boolean).join(" ").trim();

  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    phone: row.phone,
    avatar_url: row.avatar_url,
    auth_provider: row.auth_provider || "email",
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    roles,
    name: name || row.email || row.phone || "SIARA User",
    email_verified_at: row.email_verified_at || null,
    email_verified: isEmailVerified(row),
    last_login_at: row.last_login_at || null,
    last_password_reset_at: row.last_password_reset_at || null,
  };
}

function getSessionTtl(rememberMe) {
  return rememberMe ? REMEMBER_ME_TTL : SESSION_TTL;
}

function buildSessionPayload(user) {
  return {
    userId: user.id,
    roles: Array.isArray(user.roles) ? user.roles : [],
    sessionVersion: Number(user.session_version || 0),
    emailVerified: isEmailVerified(user),
  };
}

function issueSession(res, user, rememberMe) {
  const token = jwt.sign(
    buildSessionPayload(user),
    getJwtSecret(),
    { expiresIn: getSessionTtl(rememberMe) },
  );

  applySessionCookie(res, token, rememberMe);

  return {
    accessToken: token,
    ttl: getSessionTtl(rememberMe),
  };
}

function ensurePassword(password) {
  if (typeof password !== "string" || password.length < 8) {
    throw createError(400, "Password must be at least 8 characters long");
  }

  return password;
}

function ensureEmail(value) {
  const email = normalizeEmail(value);
  if (!email) {
    throw createError(400, "Email is required");
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw createError(400, "Email is invalid");
  }

  return email;
}

async function fetchRoleId(client, roleName) {
  const result = await client.query(
    `
      select id
      from auth.roles
      where name = $1
      limit 1
    `,
    [roleName],
  );

  return result.rows[0]?.id || null;
}

async function fetchUserByCondition(conditionSql, values, db = pool) {
  const result = await db.query(
    `
      ${USER_SELECT_SQL}
      where ${conditionSql}
      group by
        u.id,
        uss.user_id,
        uss.email_verified_at,
        uss.last_login_at,
        uss.last_password_reset_at,
        uss.session_version
      limit 1
    `,
    values,
  );

  return result.rows[0] || null;
}

async function fetchUserById(userId, db = pool) {
  return fetchUserByCondition("u.id = $1", [userId], db);
}

async function fetchUserByEmail(email, db = pool) {
  return fetchUserByCondition("lower(u.email) = lower($1)", [email], db);
}

async function fetchUserByGoogleSub(googleSub, db = pool) {
  return fetchUserByCondition("u.google_sub = $1", [googleSub], db);
}

async function fetchUserByIdentifier(identifier, db = pool) {
  return fetchUserByCondition(
    "(lower(u.email) = lower($1) or u.phone = $1)",
    [identifier],
    db,
  );
}

async function ensureSupportRows(client, userId, options = {}) {
  const emailVerifiedAt = options.emailVerifiedAt || null;

  await client.query(
    `
      insert into app.user_security_state (
        user_id,
        email_verified_at,
        created_at,
        updated_at
      )
      values ($1, $2, now(), now())
      on conflict (user_id) do update
      set
        email_verified_at = coalesce(app.user_security_state.email_verified_at, excluded.email_verified_at),
        updated_at = now()
    `,
    [userId, emailVerifiedAt],
  );

  await client.query(
    `
      insert into app.user_email_preferences (
        user_id,
        transactional_enabled,
        weekly_summary_enabled,
        product_updates_enabled,
        marketing_enabled,
        created_at,
        updated_at
      )
      values ($1, true, true, false, false, now(), now())
      on conflict (user_id) do update
      set updated_at = app.user_email_preferences.updated_at
    `,
    [userId],
  );
}

async function bootstrapLegacySecurityState(client, user) {
  if (user?.has_security_state) {
    return;
  }

  const emailVerifiedAt = user?.email ? new Date().toISOString() : null;
  await ensureSupportRows(client, user.id, { emailVerifiedAt });
}

async function sendVerifyEmailMessage({ userId, email, code }) {
  return sendTemplatedEmail({
    userId,
    email,
    category: "transactional",
    templateKey: "verify_email_code",
    subject: "Verify your SIARA account",
    templateData: {
      code,
      expiresInMinutes: OTP_EXPIRY_MINUTES,
    },
    payload: {
      purpose: "verify_email",
      expiresInMinutes: OTP_EXPIRY_MINUTES,
    },
  });
}

async function sendResetPasswordMessage({ userId, email, code }) {
  return sendTemplatedEmail({
    userId,
    email,
    category: "transactional",
    templateKey: "reset_password_code",
    subject: "Reset your SIARA password",
    templateData: {
      code,
      expiresInMinutes: OTP_EXPIRY_MINUTES,
    },
    payload: {
      purpose: "reset_password",
      expiresInMinutes: OTP_EXPIRY_MINUTES,
    },
  });
}

function buildRateLimitError(message, resendAvailableAt) {
  const error = createError(429, message);
  error.code = "OTP_RATE_LIMITED";
  error.resendAvailableAt = resendAvailableAt;
  return error;
}

async function issueAndSendOtp({ userId, email, purpose }) {
  if (!SUPPORTED_OTP_PURPOSES.has(purpose)) {
    throw createError(500, "Unsupported OTP purpose");
  }

  const otp = await issueOtpCode({
    userId,
    email,
    purpose,
  });

  if (!otp.ok && otp.rateLimited) {
    throw buildRateLimitError(
      `Please wait ${OTP_RESEND_COOLDOWN_SECONDS} seconds before requesting another code`,
      otp.resendAvailableAt,
    );
  }

  if (purpose === "verify_email") {
    await sendVerifyEmailMessage({
      userId,
      email,
      code: otp.code,
    });
  } else {
    await sendResetPasswordMessage({
      userId,
      email,
      code: otp.code,
    });
  }

  return otp;
}

async function registerUser({ email, password, fullName }) {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const normalizedEmail = ensureEmail(email);
    const normalizedPassword = ensurePassword(password);
    const { firstName, lastName } = splitFullName(fullName);

    if (!firstName || !lastName) {
      throw createError(400, "Full name is required");
    }

    await client.query("begin");
    transactionStarted = true;

    const existingUser = await fetchUserByEmail(normalizedEmail, client);
    if (existingUser) {
      throw createError(409, "Email already exists");
    }

    const citizenRoleId = await fetchRoleId(client, "citizen");
    if (!citizenRoleId) {
      throw createError(500, 'Default role "citizen" was not found');
    }

    const passwordHash = await bcrypt.hash(normalizedPassword, PASSWORD_SALT_ROUNDS);
    const insertedUser = await client.query(
      `
        insert into auth.users (
          first_name,
          last_name,
          email,
          phone,
          password_hash,
          avatar_url
        )
        values ($1, $2, $3, null, $4, null)
        returning id
      `,
      [firstName, lastName, normalizedEmail, passwordHash],
    );

    const userId = insertedUser.rows[0]?.id;
    await client.query(
      `
        insert into auth.user_roles (user_id, role_id)
        values ($1, $2)
      `,
      [userId, citizenRoleId],
    );

    await ensureSupportRows(client, userId);
    const otp = await issueOtpCode({
      userId,
      email: normalizedEmail,
      purpose: "verify_email",
    }, client);

    await client.query("commit");
    transactionStarted = false;

    let emailSent = true;
    try {
      await sendVerifyEmailMessage({
        userId,
        email: normalizedEmail,
        code: otp.code,
      });
    } catch (error) {
      emailSent = false;
      logAuth("verification_email_send_failed", {
        userId,
        email: normalizedEmail,
        message: error.message,
      });
    }

    const user = await fetchUserById(userId);
    return {
      ok: true,
      requiresEmailVerification: true,
      email: normalizedEmail,
      resendAvailableAt: otp.resendAvailableAt,
      emailSent,
      user: mapUser(user),
    };
  } catch (error) {
    if (transactionStarted) {
      await client.query("rollback").catch(() => {});
    }

    throw error;
  } finally {
    client.release();
  }
}

async function sendVerificationCode({ email }) {
  const normalizedEmail = ensureEmail(email);
  const user = await fetchUserByEmail(normalizedEmail);

  if (!user) {
    throw createError(404, "Account not found");
  }

  if (isEmailVerified(user)) {
    throw createError(400, "Email is already verified");
  }

  await issueAndSendOtp({
    userId: user.id,
    email: normalizedEmail,
    purpose: "verify_email",
  });

  return {
    ok: true,
    email: normalizedEmail,
    resendCooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
  };
}

async function confirmEmailVerification({ email, code, rememberMe, res }) {
  const normalizedEmail = ensureEmail(email);
  const normalizedCode = normalizeOptionalString(code);
  if (!normalizedCode) {
    throw createError(400, "Verification code is required");
  }

  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query("begin");
    transactionStarted = true;

    const user = await fetchUserByEmail(normalizedEmail, client);
    if (!user) {
      throw createError(404, "Account not found");
    }

    await verifyOtpCode({
      email: normalizedEmail,
      purpose: "verify_email",
      code: normalizedCode,
    }, client);

    await ensureSupportRows(client, user.id);
    await client.query(
      `
        update app.user_security_state
        set
          email_verified_at = coalesce(email_verified_at, now()),
          last_login_at = now(),
          updated_at = now()
        where user_id = $1
      `,
      [user.id],
    );

    await client.query("commit");
    transactionStarted = false;

    const verifiedUser = await fetchUserById(user.id);
    const session = issueSession(res, verifiedUser, normalizeRememberMe(rememberMe));

    return {
      ok: true,
      user: mapUser(verifiedUser),
      accessToken: session.accessToken,
      requiresEmailVerification: false,
    };
  } catch (error) {
    if (transactionStarted) {
      await client.query("rollback").catch(() => {});
    }

    throw error;
  } finally {
    client.release();
  }
}

async function loginUser({ identifier, password, rememberMe, res }) {
  const normalizedIdentifier = normalizeOptionalString(identifier);
  const normalizedPassword = ensurePassword(password);

  if (!normalizedIdentifier) {
    throw createError(400, "Email is required");
  }

  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query("begin");
    transactionStarted = true;

    let user = await fetchUserByIdentifier(normalizedIdentifier, client);
    if (!user) {
      throw createError(401, "Invalid email or password");
    }

    if (!user.is_active) {
      throw createError(403, "User account is inactive");
    }

    const passwordMatches = await bcrypt.compare(normalizedPassword, user.password_hash);
    if (!passwordMatches) {
      throw createError(401, "Invalid email or password");
    }

    await bootstrapLegacySecurityState(client, user);
    if (!user.has_security_state) {
      user = await fetchUserById(user.id, client);
    }

    if (!isEmailVerified(user)) {
      const error = createError(403, "Please verify your email before continuing");
      error.code = EMAIL_VERIFICATION_REQUIRED_CODE;
      error.requiresEmailVerification = true;
      error.email = user.email;
      throw error;
    }

    await client.query(
      `
        update app.user_security_state
        set
          last_login_at = now(),
          updated_at = now()
        where user_id = $1
      `,
      [user.id],
    );

    await client.query("commit");
    transactionStarted = false;

    const authenticatedUser = await fetchUserById(user.id);
    const session = issueSession(res, authenticatedUser, normalizeRememberMe(rememberMe));

    return {
      ok: true,
      user: mapUser(authenticatedUser),
      accessToken: session.accessToken,
      requiresEmailVerification: false,
    };
  } catch (error) {
    if (transactionStarted) {
      await client.query("rollback").catch(() => {});
    }

    throw error;
  } finally {
    client.release();
  }
}

async function requestPasswordReset({ email }) {
  const normalizedEmail = ensureEmail(email);
  const user = await fetchUserByEmail(normalizedEmail);

  if (!user) {
    return {
      ok: true,
      message: "If an account exists for that email, a reset code will be sent shortly.",
    };
  }

  try {
    await issueAndSendOtp({
      userId: user.id,
      email: normalizedEmail,
      purpose: "reset_password",
    });
  } catch (error) {
    if (error.code !== "OTP_RATE_LIMITED") {
      logAuth("password_reset_send_failed", {
        userId: user.id,
        email: normalizedEmail,
        message: error.message,
      });
    }
  }

  return {
    ok: true,
    message: "If an account exists for that email, a reset code will be sent shortly.",
  };
}

async function verifyResetCode({ email, code }) {
  const normalizedEmail = ensureEmail(email);
  const normalizedCode = normalizeOptionalString(code);
  if (!normalizedCode) {
    throw createError(400, "Reset code is required");
  }

  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query("begin");
    transactionStarted = true;

    const user = await fetchUserByEmail(normalizedEmail, client);
    if (!user) {
      throw createError(400, "Invalid or expired code");
    }

    await verifyOtpCode({
      email: normalizedEmail,
      purpose: "reset_password",
      code: normalizedCode,
    }, client);

    const resetSession = await createPasswordResetSession({
      userId: user.id,
      email: normalizedEmail,
    }, client);

    await client.query("commit");
    transactionStarted = false;

    return {
      ok: true,
      resetToken: resetSession.resetToken,
      expiresAt: resetSession.expiresAt,
    };
  } catch (error) {
    if (transactionStarted) {
      await client.query("rollback").catch(() => {});
    }

    throw error;
  } finally {
    client.release();
  }
}

async function resetPassword({ email, resetToken, newPassword, res }) {
  const normalizedEmail = ensureEmail(email);
  const normalizedPassword = ensurePassword(newPassword);
  const normalizedResetToken = normalizeOptionalString(resetToken);
  if (!normalizedResetToken) {
    throw createError(400, "Reset token is required");
  }

  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query("begin");
    transactionStarted = true;

    const session = await verifyPasswordResetSession({
      email: normalizedEmail,
      resetToken: normalizedResetToken,
    }, client);

    const passwordHash = await bcrypt.hash(normalizedPassword, PASSWORD_SALT_ROUNDS);
    await client.query(
      `
        update auth.users
        set
          password_hash = $2,
          updated_at = now()
        where id = $1
      `,
      [session.user_id, passwordHash],
    );

    await ensureSupportRows(client, session.user_id);
    await client.query(
      `
        update app.user_security_state
        set
          last_password_reset_at = now(),
          session_version = coalesce(session_version, 0) + 1,
          updated_at = now()
        where user_id = $1
      `,
      [session.user_id],
    );

    await consumePasswordResetSession(session.id, client);
    await client.query("commit");
    transactionStarted = false;

    clearSessionCookie(res);

    return {
      ok: true,
    };
  } catch (error) {
    if (transactionStarted) {
      await client.query("rollback").catch(() => {});
    }

    throw error;
  } finally {
    client.release();
  }
}

function getGoogleClient() {
  const clientId = String(
    process.env.GOOGLE_CLIENT_ID
    || process.env.GOOGLE_AUTH_CLIENT_ID
    || process.env.VITE_GOOGLE_CLIENT_ID
    || process.env.VITE_GOOGLE_AUTH_CLIENT_ID
    || "",
  ).trim();
  if (!clientId) {
    throw createError(500, "GOOGLE_CLIENT_ID is not configured");
  }

  if (!googleClient) {
    googleClient = new OAuth2Client(clientId);
  }

  return {
    clientId,
    client: googleClient,
  };
}

async function verifyGoogleCredential(credential) {
  const normalizedCredential = normalizeOptionalString(credential);
  if (!normalizedCredential) {
    throw createError(400, "Google ID token is required");
  }

  const { client, clientId } = getGoogleClient();
  let ticket = null;

  try {
    ticket = await client.verifyIdToken({
      idToken: normalizedCredential,
      audience: clientId,
    });
  } catch (_error) {
    throw createError(401, "Google token is invalid or has the wrong audience");
  }

  const payload = ticket.getPayload();
  if (!payload?.sub || !payload?.email) {
    throw createError(401, "Google account could not be verified");
  }

  return payload;
}

async function createUserFromGoogleIdentity(client, payload) {
  const citizenRoleId = await fetchRoleId(client, "citizen");
  if (!citizenRoleId) {
    throw createError(500, 'Default role "citizen" was not found');
  }

  const firstName = normalizeOptionalString(payload.given_name) || splitFullName(payload.name).firstName || "Google";
  const lastName = normalizeOptionalString(payload.family_name) || splitFullName(payload.name).lastName || "User";
  const randomPasswordHash = await bcrypt.hash(
    crypto.randomBytes(24).toString("hex"),
    PASSWORD_SALT_ROUNDS,
  );

  const insertedUser = await client.query(
    `
      insert into auth.users (
        first_name,
        last_name,
        email,
        phone,
        password_hash,
        avatar_url,
        auth_provider,
        google_sub,
        email_verified_at
      )
      values ($1, $2, $3, null, $4, $5, $6, $7, $8)
      returning id
    `,
    [
      firstName,
      lastName,
      payload.email.toLowerCase(),
      randomPasswordHash,
      payload.picture || null,
      GOOGLE_PROVIDER,
      payload.sub,
      payload.email_verified === true ? new Date().toISOString() : null,
    ],
  );

  const userId = insertedUser.rows[0]?.id;
  await client.query(
    `
      insert into auth.user_roles (user_id, role_id)
      values ($1, $2)
    `,
    [userId, citizenRoleId],
  );

  return userId;
}

async function upsertGoogleIdentityLink(client, userId, payload) {
  const existingProviderLink = await client.query(
    `
      select provider_subject
      from app.user_oauth_identities
      where user_id = $1
        and provider = $2
      limit 1
    `,
    [userId, GOOGLE_PROVIDER],
  );

  if (
    existingProviderLink.rows[0]?.provider_subject
    && existingProviderLink.rows[0].provider_subject !== payload.sub
  ) {
    throw createError(409, "This SIARA account is already linked to a different Google account");
  }

  await client.query(
    `
      insert into app.user_oauth_identities (
        user_id,
        provider,
        provider_subject,
        email,
        created_at,
        updated_at
      )
      values ($1, $2, $3, $4, now(), now())
      on conflict (provider, provider_subject) do update
      set
        user_id = excluded.user_id,
        email = excluded.email,
        updated_at = now()
    `,
    [userId, GOOGLE_PROVIDER, payload.sub, payload.email.toLowerCase()],
  );
}

async function syncGoogleUserRecord(client, userId, payload) {
  await client.query(
    `
      update auth.users
      set
        avatar_url = coalesce($2, avatar_url),
        auth_provider = case
          when auth_provider is null or auth_provider = '' then $3
          else auth_provider
        end,
        google_sub = coalesce(google_sub, $4),
        email_verified_at = case
          when $5::boolean = true then coalesce(email_verified_at, now())
          else email_verified_at
        end,
        updated_at = now()
      where id = $1
    `,
    [
      userId,
      payload.picture || null,
      GOOGLE_PROVIDER,
      payload.sub,
      payload.email_verified === true,
    ],
  );
}

async function loginWithGoogle({ idToken, credential, rememberMe, res }) {
  const payload = await verifyGoogleCredential(idToken || credential);
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query("begin");
    transactionStarted = true;

    const existingIdentityBySubject = await client.query(
      `
        select user_id
        from app.user_oauth_identities
        where provider = $1
          and provider_subject = $2
        limit 1
      `,
      [GOOGLE_PROVIDER, payload.sub],
    );

    let userId = existingIdentityBySubject.rows[0]?.user_id || null;

    if (!userId) {
      const existingGoogleUser = await fetchUserByGoogleSub(payload.sub, client);
      userId = existingGoogleUser?.id || null;
    }

    if (!userId && payload.email_verified !== true) {
      throw createError(403, "Google account email must be verified before it can be linked to SIARA");
    }

    if (!userId) {
      const existingUser = await fetchUserByEmail(payload.email, client);
      if (existingUser) {
        if (
          existingUser.google_sub
          && existingUser.google_sub !== payload.sub
        ) {
          throw createError(409, "This email is already linked to a different Google account");
        }
        userId = existingUser.id;
      } else {
        userId = await createUserFromGoogleIdentity(client, payload);
      }
    }

    await upsertGoogleIdentityLink(client, userId, payload);
    await syncGoogleUserRecord(client, userId, payload);
    await ensureSupportRows(client, userId, {
      emailVerifiedAt: payload.email_verified === true ? new Date().toISOString() : null,
    });

    await client.query(
      `
        update app.user_security_state
        set
          email_verified_at = case
            when $2::boolean = true then coalesce(email_verified_at, now())
            else email_verified_at
          end,
          last_login_at = now(),
          updated_at = now()
        where user_id = $1
      `,
      [userId, payload.email_verified === true],
    );

    await client.query("commit");
    transactionStarted = false;

    const user = await fetchUserById(userId);
    const session = issueSession(res, user, normalizeRememberMe(rememberMe));

    return {
      ok: true,
      success: true,
      user: mapUser(user),
      accessToken: session.accessToken,
      requiresEmailVerification: false,
    };
  } catch (error) {
    if (transactionStarted) {
      await client.query("rollback").catch(() => {});
    }

    throw error;
  } finally {
    client.release();
  }
}

async function fetchEmailPreferences(userId, db = pool) {
  await db.query(
    `
      insert into app.user_email_preferences (
        user_id,
        transactional_enabled,
        weekly_summary_enabled,
        product_updates_enabled,
        marketing_enabled,
        created_at,
        updated_at
      )
      values ($1, true, true, false, false, now(), now())
      on conflict (user_id) do nothing
    `,
    [userId],
  );

  const result = await db.query(
    `
      select
        user_id,
        weekly_summary_enabled,
        product_updates_enabled,
        marketing_enabled,
        transactional_enabled,
        created_at,
        updated_at
      from app.user_email_preferences
      where user_id = $1
      limit 1
    `,
    [userId],
  );

  return result.rows[0] || null;
}

async function updateEmailPreferences(userId, input = {}, db = pool) {
  const weeklySummaryEnabled = typeof input.weeklySummaryEnabled === "boolean"
    ? input.weeklySummaryEnabled
    : null;
  const productUpdatesEnabled = typeof input.productUpdatesEnabled === "boolean"
    ? input.productUpdatesEnabled
    : null;
  const marketingEnabled = typeof input.marketingEnabled === "boolean"
    ? input.marketingEnabled
    : null;

  const result = await db.query(
    `
      insert into app.user_email_preferences (
        user_id,
        transactional_enabled,
        weekly_summary_enabled,
        product_updates_enabled,
        marketing_enabled,
        created_at,
        updated_at
      )
      values (
        $1,
        true,
        coalesce($2, true),
        coalesce($3, false),
        coalesce($4, false),
        now(),
        now()
      )
      on conflict (user_id) do update
      set
        weekly_summary_enabled = coalesce($2, app.user_email_preferences.weekly_summary_enabled),
        product_updates_enabled = coalesce($3, app.user_email_preferences.product_updates_enabled),
        marketing_enabled = coalesce($4, app.user_email_preferences.marketing_enabled),
        updated_at = now()
      returning
        user_id,
        weekly_summary_enabled,
        product_updates_enabled,
        marketing_enabled,
        transactional_enabled,
        created_at,
        updated_at
    `,
    [userId, weeklySummaryEnabled, productUpdatesEnabled, marketingEnabled],
  );

  return result.rows[0] || null;
}

module.exports = {
  EMAIL_VERIFICATION_REQUIRED_CODE,
  JWT_COOKIE_NAME,
  clearSessionCookie,
  confirmEmailVerification,
  fetchEmailPreferences,
  fetchUserByEmail,
  fetchUserById,
  getCookieOptions,
  issueSession,
  loginUser,
  loginWithGoogle,
  mapUser,
  registerUser,
  requestPasswordReset,
  resetPassword,
  sendVerificationCode,
  splitFullName,
  updateEmailPreferences,
  verifyResetCode,
};
