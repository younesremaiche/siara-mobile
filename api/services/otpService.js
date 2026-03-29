const crypto = require("crypto");
const createError = require("http-errors");

const pool = require("../db");

const OTP_EXPIRY_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const RESET_SESSION_EXPIRY_MINUTES = 15;

function getHashSecret() {
  return String(
    process.env.AUTH_CODE_SECRET
    || process.env.JWT_ACCESSTOKEN
    || "siara-dev-auth-secret",
  );
}

function hashSecret(value) {
  return crypto
    .createHmac("sha256", getHashSecret())
    .update(String(value || ""))
    .digest("hex");
}

function secureCompareHash(rawValue, storedHash) {
  const computed = Buffer.from(hashSecret(rawValue), "hex");
  const existing = Buffer.from(String(storedHash || ""), "hex");

  if (computed.length !== existing.length) {
    return false;
  }

  return crypto.timingSafeEqual(computed, existing);
}

function generateOtpCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function generateOpaqueToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function fetchLatestActiveOtp(email, purpose, db = pool) {
  const result = await db.query(
    `
      select *
      from app.auth_otp_codes
      where lower(email) = lower($1)
        and purpose = $2
        and consumed_at is null
        and expires_at > now()
      order by created_at desc, id desc
      limit 1
    `,
    [email, purpose],
  );

  return result.rows[0] || null;
}

async function invalidateActiveOtps(email, purpose, db = pool) {
  await db.query(
    `
      update app.auth_otp_codes
      set consumed_at = now()
      where lower(email) = lower($1)
        and purpose = $2
        and consumed_at is null
        and expires_at > now()
    `,
    [email, purpose],
  );
}

async function issueOtpCode({ userId = null, email, purpose }, db = pool) {
  const activeOtp = await fetchLatestActiveOtp(email, purpose, db);
  if (activeOtp) {
    const resendAvailableAt = activeOtp.resend_available_at
      ? new Date(activeOtp.resend_available_at)
      : null;

    if (resendAvailableAt && resendAvailableAt.getTime() > Date.now()) {
      return {
        ok: false,
        rateLimited: true,
        resendAvailableAt: activeOtp.resend_available_at,
        expiresAt: activeOtp.expires_at,
      };
    }
  }

  await invalidateActiveOtps(email, purpose, db);

  const rawCode = generateOtpCode();
  const expiresAt = new Date(Date.now() + (OTP_EXPIRY_MINUTES * 60 * 1000));
  const resendAvailableAt = new Date(Date.now() + (OTP_RESEND_COOLDOWN_SECONDS * 1000));

  const result = await db.query(
    `
      insert into app.auth_otp_codes (
        user_id,
        email,
        purpose,
        code_hash,
        expires_at,
        attempts_count,
        max_attempts,
        resend_available_at
      )
      values ($1, $2, $3, $4, $5, 0, $6, $7)
      returning id, email, purpose, expires_at, resend_available_at
    `,
    [
      userId,
      email,
      purpose,
      hashSecret(rawCode),
      expiresAt.toISOString(),
      OTP_MAX_ATTEMPTS,
      resendAvailableAt.toISOString(),
    ],
  );

  return {
    ok: true,
    code: rawCode,
    expiresAt: result.rows[0]?.expires_at || expiresAt.toISOString(),
    resendAvailableAt: result.rows[0]?.resend_available_at || resendAvailableAt.toISOString(),
  };
}

async function verifyOtpCode({ email, purpose, code }, db = pool) {
  const otp = await fetchLatestActiveOtp(email, purpose, db);

  if (!otp) {
    throw createError(400, "Invalid or expired code");
  }

  const isValid = secureCompareHash(code, otp.code_hash);
  if (!isValid) {
    await db.query(
      `
        update app.auth_otp_codes
        set
          attempts_count = attempts_count + 1,
          consumed_at = case
            when attempts_count + 1 >= max_attempts then now()
            else consumed_at
          end
        where id = $1
      `,
      [otp.id],
    );

    throw createError(400, "Invalid or expired code");
  }

  const result = await db.query(
    `
      update app.auth_otp_codes
      set consumed_at = now()
      where id = $1
      returning *
    `,
    [otp.id],
  );

  return result.rows[0] || otp;
}

async function invalidateActiveResetSessions(userId, email, db = pool) {
  await db.query(
    `
      update app.password_reset_sessions
      set consumed_at = now()
      where user_id = $1
        and lower(email) = lower($2)
        and consumed_at is null
        and expires_at > now()
    `,
    [userId, email],
  );
}

async function createPasswordResetSession({ userId, email }, db = pool) {
  await invalidateActiveResetSessions(userId, email, db);

  const rawToken = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + (RESET_SESSION_EXPIRY_MINUTES * 60 * 1000));
  const result = await db.query(
    `
      insert into app.password_reset_sessions (
        user_id,
        email,
        token_hash,
        expires_at
      )
      values ($1, $2, $3, $4)
      returning id, expires_at
    `,
    [userId, email, hashSecret(rawToken), expiresAt.toISOString()],
  );

  return {
    id: result.rows[0]?.id || null,
    resetToken: rawToken,
    expiresAt: result.rows[0]?.expires_at || expiresAt.toISOString(),
  };
}

async function verifyPasswordResetSession({ email, resetToken }, db = pool) {
  const result = await db.query(
    `
      select *
      from app.password_reset_sessions
      where lower(email) = lower($1)
        and consumed_at is null
        and expires_at > now()
      order by created_at desc, id desc
      limit 5
    `,
    [email],
  );

  const matchingSession = result.rows.find((row) => secureCompareHash(resetToken, row.token_hash));
  if (!matchingSession) {
    throw createError(400, "Invalid or expired reset token");
  }

  return matchingSession;
}

async function consumePasswordResetSession(sessionId, db = pool) {
  await db.query(
    `
      update app.password_reset_sessions
      set consumed_at = now()
      where id = $1
    `,
    [sessionId],
  );
}

module.exports = {
  OTP_EXPIRY_MINUTES,
  OTP_RESEND_COOLDOWN_SECONDS,
  RESET_SESSION_EXPIRY_MINUTES,
  createPasswordResetSession,
  consumePasswordResetSession,
  hashSecret,
  issueOtpCode,
  verifyOtpCode,
  verifyPasswordResetSession,
};
