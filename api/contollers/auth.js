const router = require("express").Router();
const createError = require("http-errors");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");
const pool = require("../db");
const { configureCloudinary, isCloudinaryConfigured } = require("../config/cloudinary");

const {
  EMAIL_VERIFICATION_REQUIRED_CODE,
  clearSessionCookie,
  confirmEmailVerification,
  fetchEmailPreferences,
  loginUser,
  loginWithGoogle,
  mapUser,
  registerUser,
  requestPasswordReset,
  resetPassword,
  sendVerificationCode,
  updateEmailPreferences,
  verifyResetCode,
} = require("../services/authService");
const {
  ensureUserNotificationPreferences,
  updateUserNotificationPreferences,
} = require("../services/pushService");
const { resolveOptionalAuthenticatedUser, verifyToken } = require("./verifytoken");

const AVATAR_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/pjpeg", "image/png", "image/webp"]);
const AVATAR_UPLOAD_ROOT = path.join(__dirname, "..", "uploads", "avatars");

const uploadAvatar = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: AVATAR_MAX_FILE_SIZE_BYTES,
  },
  fileFilter(_req, file, callback) {
    if (!ALLOWED_AVATAR_MIME_TYPES.has(String(file?.mimetype || "").trim().toLowerCase())) {
      callback(createError(400, "Only JPEG, PNG, and WebP images are allowed"));
      return;
    }

    callback(null, true);
  },
});

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
    return { firstName: "", lastName: "" };
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: parts[0] };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function normalizePublicOrigin(value) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return "";
  }

  return normalized.replace(/\/+$/, "");
}

function resolvePublicOrigin(req) {
  const fromEnv = normalizePublicOrigin(process.env.API_PUBLIC_ORIGIN)
    || normalizePublicOrigin(process.env.SERVER_PUBLIC_ORIGIN);
  if (fromEnv) {
    return fromEnv;
  }

  const forwardedHost = normalizeOptionalString(req.get("x-forwarded-host"));
  const host = forwardedHost || normalizeOptionalString(req.get("host"));
  if (!host) {
    return "";
  }

  const forwardedProto = normalizeOptionalString(req.get("x-forwarded-proto"));
  const protocol = forwardedProto || normalizeOptionalString(req.protocol) || "http";
  return `${protocol}://${host}`;
}

function runAvatarUpload(req, res) {
  return new Promise((resolve, reject) => {
    uploadAvatar.single("avatar")(req, res, (error) => {
      if (!error) {
        resolve(req.file || null);
        return;
      }

      if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
          reject(createError(400, "Avatar image must be 5 MB or smaller"));
          return;
        }

        if (error.code === "LIMIT_FILE_COUNT") {
          reject(createError(400, "Only one avatar image can be uploaded"));
          return;
        }

        if (error.code === "LIMIT_UNEXPECTED_FILE") {
          reject(createError(400, 'Avatar file must be sent in the "avatar" field'));
          return;
        }
      }

      reject(error);
    });
  });
}

function toAvatarExtension(mimeType) {
  const normalized = String(mimeType || "").trim().toLowerCase();

  if (normalized === "image/png") {
    return "png";
  }
  if (normalized === "image/webp") {
    return "webp";
  }

  return "jpg";
}

async function uploadAvatarToCloudinary(file, userId) {
  if (!Buffer.isBuffer(file?.buffer) || file.buffer.length === 0) {
    throw createError(400, "Avatar image is empty");
  }

  if (!isCloudinaryConfigured()) {
    throw createError(500, "Cloudinary is not configured");
  }

  const cloudinary = configureCloudinary();
  if (!cloudinary) {
    throw createError(500, "Cloudinary is not configured");
  }

  const folder = `siara/avatars/${userId}`;
  const publicId = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: "image",
        overwrite: true,
      },
      (error, uploadResult) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(uploadResult);
      },
    );

    stream.end(file.buffer);
  });

  if (!result?.secure_url) {
    throw createError(502, "Avatar upload did not return a valid URL");
  }

  return {
    avatarUrl: result.secure_url,
    storageKey: result.public_id || null,
    storageProvider: "cloudinary",
  };
}

async function uploadAvatarToLocalStorage(file, userId, req) {
  if (!Buffer.isBuffer(file?.buffer) || file.buffer.length === 0) {
    throw createError(400, "Avatar image is empty");
  }

  const safeUserId = String(userId || "user").trim() || "user";
  const extension = toAvatarExtension(file.mimetype);
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${extension}`;
  const userDirectory = path.join(AVATAR_UPLOAD_ROOT, safeUserId);
  const absolutePath = path.join(userDirectory, filename);

  await fs.mkdir(userDirectory, { recursive: true });
  await fs.writeFile(absolutePath, file.buffer);

  const relativePath = `/uploads/avatars/${safeUserId}/${filename}`;
  const publicOrigin = resolvePublicOrigin(req);

  return {
    avatarUrl: publicOrigin ? `${publicOrigin}${relativePath}` : relativePath,
    storageKey: `local:avatars/${safeUserId}/${filename}`,
    storageProvider: "local",
  };
}

async function uploadAvatarWithFallback(file, userId, req) {
  try {
    return await uploadAvatarToCloudinary(file, userId);
  } catch (error) {
    console.warn("[auth] avatar_upload_fallback_to_local", {
      userId,
      message: error?.message || "unknown_error",
    });

    return uploadAvatarToLocalStorage(file, userId, req);
  }
}

function normalizeBoolean(value, fallback = null) {
  if (typeof value === "boolean") {
    return value;
  }
  return fallback;
}

function normalizeEnum(value, allowedValues, fallback = null) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return fallback;
  }

  return allowedValues.includes(normalized) ? normalized : fallback;
}

async function fetchUserTrustSignals(userId, db = pool) {
  const result = await db.query(
    `
      select
        u.id,
        u.trust_score,
        u.trust_last_updated_at,
        coalesce(v.legit_count, 0)::int as legit_count,
        coalesce(v.spam_count, 0)::int as spam_count
      from auth.users u
      left join (
        select
          reported_by,
          count(*) filter (where review_verdict = 'confirmed_legit')::int as legit_count,
          count(*) filter (where review_verdict = 'confirmed_spam')::int as spam_count
        from app.accident_reports
        where reported_by = $1
        group by reported_by
      ) v
        on v.reported_by = u.id
      where u.id = $1
      limit 1
    `,
    [userId],
  );

  const row = result.rows[0] || null;
  if (!row) {
    return {
      trustScore: null,
      signals: {
        legitReports: 0,
        spamReports: 0,
        reviewedReports: 0,
      },
      generatedAt: null,
      source: "unavailable",
    };
  }

  const legitCount = Number(row.legit_count || 0);
  const spamCount = Number(row.spam_count || 0);
  const reviewedCount = legitCount + spamCount;

  const storedTrustScoreRaw = Number(row.trust_score);
  const hasStoredTrustScore = Number.isFinite(storedTrustScoreRaw);

  let trustScore = null;
  let source = "unavailable";

  if (hasStoredTrustScore) {
    trustScore = Number(Math.max(0, Math.min(100, storedTrustScoreRaw)).toFixed(2));
    source = "stored";
  } else if (reviewedCount > 0) {
    trustScore = Number(
      (
        ((legitCount + 1) / (reviewedCount + 2))
        * 100
      ).toFixed(2),
    );
    source = "derived";
  }

  const generatedAt = row.trust_last_updated_at
    ? new Date(row.trust_last_updated_at).toISOString()
    : null;

  return {
    trustScore,
    signals: {
      legitReports: legitCount,
      spamReports: spamCount,
      reviewedReports: reviewedCount,
    },
    generatedAt,
    source,
  };
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim(),
  );
}

async function ensureUserProfileSettingsTable(db = pool) {
  await db.query(`
    create table if not exists app.user_profile_settings (
      user_id uuid primary key references auth.users(id) on delete cascade,
      bio text,
      location_label text,
      language varchar(50),
      privacy_visibility varchar(20) not null default 'public',
      report_identity varchar(20) not null default 'show',
      location_sharing varchar(20) not null default 'reporting',
      two_factor_enabled boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint chk_user_profile_settings_visibility check (privacy_visibility in ('public','private')),
      constraint chk_user_profile_settings_identity check (report_identity in ('show','anonymous')),
      constraint chk_user_profile_settings_location check (location_sharing in ('always','reporting','never'))
    )
  `);
}

async function fetchUserSettings(userId, db = pool) {
  await ensureUserProfileSettingsTable(db);

  await db.query(
    `
      insert into app.user_profile_settings (user_id)
      values ($1)
      on conflict (user_id) do nothing
    `,
    [userId],
  );

  const profileResult = await db.query(
    `
      select
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        u.avatar_url,
        u.created_at,
        s.bio,
        s.location_label,
        s.language,
        s.privacy_visibility,
        s.report_identity,
        s.location_sharing,
        s.two_factor_enabled
      from auth.users u
      left join app.user_profile_settings s
        on s.user_id = u.id
      where u.id = $1
      limit 1
    `,
    [userId],
  );

  const row = profileResult.rows[0] || null;
  if (!row) {
    throw createError(404, "User profile not found");
  }

  const trust = await fetchUserTrustSignals(userId, db);

  const fullName = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
  const emailPreferences = await fetchEmailPreferences(userId, db);
  const pushPreferences = await ensureUserNotificationPreferences(userId, db);

  return {
    profile: {
      id: row.id,
      name: fullName || row.email || row.phone || "SIARA User",
      avatarUrl: row.avatar_url || "",
      avatar_url: row.avatar_url || "",
      bio: row.bio || "",
      location: row.location_label || "",
      email: row.email || "",
      phone: row.phone || "",
      language: row.language || "French",
      memberSince: row.created_at || null,
      trustScore: trust.trustScore,
      trustSignals: trust.signals,
      trustScoreGeneratedAt: trust.generatedAt,
      trustScoreSource: trust.source,
    },
    privacy: {
      visibility: row.privacy_visibility || "public",
      identity: row.report_identity || "show",
      location: row.location_sharing || "reporting",
    },
    security: {
      twoFactorEnabled: Boolean(row.two_factor_enabled),
    },
    notifications: {
      emailNearby: Boolean(emailPreferences?.product_updates_enabled),
      emailSevere: Boolean(emailPreferences?.marketing_enabled),
      emailDigest: Boolean(emailPreferences?.weekly_summary_enabled),
      pushRealtime: Boolean(pushPreferences?.pushEnabled),
      pushPredictions: pushPreferences?.pushMode === "all",
      inAppEnabled: Boolean(pushPreferences?.inAppEnabled),
      pushMode: pushPreferences?.pushMode || "important_only",
    },
  };
}

async function fetchUserPrivacyVisibility(userId, db = pool) {
  await ensureUserProfileSettingsTable(db);

  await db.query(
    `
      insert into app.user_profile_settings (user_id)
      values ($1)
      on conflict (user_id) do nothing
    `,
    [userId],
  );

  const result = await db.query(
    `
      select
        u.id,
        u.first_name,
        u.last_name,
        u.avatar_url,
        coalesce(s.bio, '') as bio,
        coalesce(s.privacy_visibility, 'public') as privacy_visibility
      from auth.users u
      left join app.user_profile_settings s
        on s.user_id = u.id
      where u.id = $1
      limit 1
    `,
    [userId],
  );

  const row = result.rows[0] || null;
  if (!row) {
    throw createError(404, "User profile not found");
  }

  const trust = await fetchUserTrustSignals(userId, db);

  return {
    userId: row.id,
    firstName: row.first_name || "",
    lastName: row.last_name || "",
    avatarUrl: row.avatar_url || "",
    avatar_url: row.avatar_url || "",
    bio: row.bio || "",
    visibility: row.privacy_visibility,
    trustScore: trust.trustScore,
    trustSignals: trust.signals,
    trustScoreGeneratedAt: trust.generatedAt,
    trustScoreSource: trust.source,
  };
}

function buildSessionResponse(user, extra = {}) {
  return {
    authenticated: Boolean(user),
    requiresEmailVerification: Boolean(user && user.email && !user.email_verified),
    user: user ? mapUser(user) : null,
    ...extra,
  };
}

router.post("/register", async (req, res, next) => {
  try {
    const fullName = normalizeOptionalString(req.body.fullName)
      || [req.body.first_name, req.body.last_name].filter(Boolean).join(" ").trim();

    const result = await registerUser({
      email: req.body.email,
      password: req.body.password,
      fullName,
      rememberMe: req.body.rememberMe,
    });

    return res.status(201).json(result);
  } catch (error) {
    return next(error);
  }
});

router.post("/verify-email/send", async (req, res, next) => {
  try {
    const result = await sendVerificationCode({
      email: req.body.email,
    });

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

router.post("/verify-email/confirm", async (req, res, next) => {
  try {
    const result = await confirmEmailVerification({
      email: req.body.email,
      code: req.body.code,
      rememberMe: req.body.rememberMe,
      res,
    });

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const result = await loginUser({
      identifier: req.body.email || req.body.emailOrPhone,
      password: req.body.password,
      rememberMe: req.body.rememberMe,
      res,
    });

    return res.status(200).json(result);
  } catch (error) {
    if (error.code === EMAIL_VERIFICATION_REQUIRED_CODE) {
      return res.status(403).json({
        message: error.message,
        code: error.code,
        requiresEmailVerification: true,
        email: error.email || null,
      });
    }

    if (error.code === "ACCOUNT_BANNED") {
      return res.status(403).json({
        message: error.message,
        code: error.code,
        ban: error.ban || { permanent: true, until: null, reason: null },
      });
    }

    return next(error);
  }
});

router.post("/password/forgot", async (req, res, next) => {
  try {
    const result = await requestPasswordReset({
      email: req.body.email,
    });

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

router.post("/password/verify-code", async (req, res, next) => {
  try {
    const result = await verifyResetCode({
      email: req.body.email,
      code: req.body.code,
    });

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

router.post("/password/reset", async (req, res, next) => {
  try {
    const result = await resetPassword({
      email: req.body.email,
      resetToken: req.body.resetToken,
      newPassword: req.body.newPassword,
      res,
    });

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

router.post("/google", async (req, res, next) => {
  try {
    const result = await loginWithGoogle({
      idToken: req.body.idToken || req.body.credential,
      rememberMe: req.body.rememberMe,
      res,
    });

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

router.get("/session", async (req, res, next) => {
  try {
    const user = await resolveOptionalAuthenticatedUser(req);
    return res.status(200).json(buildSessionResponse(user));
  } catch (error) {
    return next(error);
  }
});

router.get("/me", verifyToken, async (req, res, next) => {
  try {
    return res.status(200).json({
      user: mapUser(req.user),
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/settings", verifyToken, async (req, res, next) => {
  try {
    const settings = await fetchUserSettings(req.user.userId);
    return res.status(200).json(settings);
  } catch (error) {
    return next(error);
  }
});

router.get("/users/:userId/privacy", verifyToken, async (req, res, next) => {
  try {
    const userId = String(req.params.userId || "").trim();
    if (!isUuid(userId)) {
      throw createError(400, "Invalid user id");
    }

    const privacy = await fetchUserPrivacyVisibility(userId);
    const isOwner = req.user?.userId === userId;
    const isPrivate = privacy.visibility === "private";
    const canViewActivity = isOwner || !isPrivate;
    const displayName = [privacy.firstName, privacy.lastName].filter(Boolean).join(" ").trim() || "SIARA User";
    const safeName = canViewActivity ? displayName : "Private User";
    const safeAvatarUrl = canViewActivity ? String(privacy.avatarUrl || "") : "";
    const safeBio = canViewActivity ? String(privacy.bio || "") : "";

    return res.status(200).json({
      userId,
      visibility: privacy.visibility,
      isPrivate,
      canViewActivity,
      name: safeName,
      avatarUrl: safeAvatarUrl,
      avatar_url: safeAvatarUrl,
      bio: safeBio,
      trustScore: privacy.trustScore,
      trustSignals: privacy.trustSignals,
      trustScoreGeneratedAt: privacy.trustScoreGeneratedAt,
      trustScoreSource: privacy.trustScoreSource,
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/settings/avatar", verifyToken, async (req, res, next) => {
  try {
    const file = await runAvatarUpload(req, res);
    if (!file) {
      throw createError(400, "Avatar image is required");
    }

    const uploadedAvatar = await uploadAvatarWithFallback(file, req.user.userId, req);

    await pool.query(
      `
        update auth.users
        set
          avatar_url = $2,
          updated_at = now()
        where id = $1
      `,
      [req.user.userId, uploadedAvatar.avatarUrl],
    );

    const nextUser = {
      ...req.user,
      avatar_url: uploadedAvatar.avatarUrl,
    };

    return res.status(200).json({
      ok: true,
      avatarUrl: uploadedAvatar.avatarUrl,
      avatar_url: uploadedAvatar.avatarUrl,
      storageProvider: uploadedAvatar.storageProvider,
      user: mapUser(nextUser),
    });
  } catch (error) {
    return next(error);
  }
});

router.patch("/settings", verifyToken, async (req, res, next) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query("begin");
    transactionStarted = true;

    await ensureUserProfileSettingsTable(client);

    const profile = req.body?.profile && typeof req.body.profile === "object" ? req.body.profile : {};
    const privacy = req.body?.privacy && typeof req.body.privacy === "object" ? req.body.privacy : {};
    const security = req.body?.security && typeof req.body.security === "object" ? req.body.security : {};
    const notifications = req.body?.notifications && typeof req.body.notifications === "object" ? req.body.notifications : {};

    const name = normalizeOptionalString(profile.name);
    const { firstName, lastName } = name ? splitFullName(name) : { firstName: null, lastName: null };
    const phone = normalizeOptionalString(profile.phone);
    const email = normalizeEmail(profile.email);

    if (name || phone || email) {
      await client.query(
        `
          update auth.users
          set
            first_name = coalesce($2, first_name),
            last_name = coalesce($3, last_name),
            phone = coalesce($4, phone),
            email = coalesce($5, email),
            updated_at = now()
          where id = $1
        `,
        [
          req.user.userId,
          firstName,
          lastName,
          phone,
          email,
        ],
      );
    }

    const bio = Object.prototype.hasOwnProperty.call(profile, "bio")
      ? normalizeOptionalString(profile.bio)
      : null;
    const location = Object.prototype.hasOwnProperty.call(profile, "location")
      ? normalizeOptionalString(profile.location)
      : null;
    const language = Object.prototype.hasOwnProperty.call(profile, "language")
      ? normalizeOptionalString(profile.language)
      : null;
    const visibility = normalizeEnum(privacy.visibility, ["public", "private"], null);
    const identity = normalizeEnum(privacy.identity, ["show", "anonymous"], null);
    const locationSharing = normalizeEnum(privacy.location, ["always", "reporting", "never"], null);
    const twoFactorEnabled = normalizeBoolean(security.twoFactorEnabled, null);

    await client.query(
      `
        insert into app.user_profile_settings (
          user_id,
          bio,
          location_label,
          language,
          privacy_visibility,
          report_identity,
          location_sharing,
          two_factor_enabled,
          created_at,
          updated_at
        )
        values (
          $1,
          $2,
          $3,
          $4,
          coalesce($5, 'public'),
          coalesce($6, 'show'),
          coalesce($7, 'reporting'),
          coalesce($8, false),
          now(),
          now()
        )
        on conflict (user_id) do update
        set
          bio = coalesce($2, app.user_profile_settings.bio),
          location_label = coalesce($3, app.user_profile_settings.location_label),
          language = coalesce($4, app.user_profile_settings.language),
          privacy_visibility = coalesce($5, app.user_profile_settings.privacy_visibility),
          report_identity = coalesce($6, app.user_profile_settings.report_identity),
          location_sharing = coalesce($7, app.user_profile_settings.location_sharing),
          two_factor_enabled = coalesce($8, app.user_profile_settings.two_factor_enabled),
          updated_at = now()
      `,
      [
        req.user.userId,
        bio,
        location,
        language,
        visibility,
        identity,
        locationSharing,
        twoFactorEnabled,
      ],
    );

    const emailPreferencesPayload = {
      weeklySummaryEnabled: normalizeBoolean(notifications.emailDigest, undefined),
      productUpdatesEnabled: normalizeBoolean(notifications.emailNearby, undefined),
      marketingEnabled: normalizeBoolean(notifications.emailSevere, undefined),
    };

    if (
      emailPreferencesPayload.weeklySummaryEnabled !== undefined
      || emailPreferencesPayload.productUpdatesEnabled !== undefined
      || emailPreferencesPayload.marketingEnabled !== undefined
    ) {
      await updateEmailPreferences(req.user.userId, emailPreferencesPayload, client);
    }

    const pushMode = normalizeEnum(notifications.pushMode, ["off", "important_only", "all"], null)
      || (notifications.pushPredictions === true ? "all" : null);
    const pushPreferencesPayload = {
      inAppEnabled: normalizeBoolean(notifications.inAppEnabled, undefined),
      pushEnabled: normalizeBoolean(notifications.pushRealtime, undefined),
      pushMode: pushMode || undefined,
    };

    if (
      pushPreferencesPayload.inAppEnabled !== undefined
      || pushPreferencesPayload.pushEnabled !== undefined
      || pushPreferencesPayload.pushMode !== undefined
    ) {
      await updateUserNotificationPreferences(req.user.userId, pushPreferencesPayload, client);
    }

    await client.query("commit");
    transactionStarted = false;

    const settings = await fetchUserSettings(req.user.userId);
    return res.status(200).json(settings);
  } catch (error) {
    if (transactionStarted) {
      await client.query("rollback").catch(() => {});
    }

    if (error.code === "23505") {
      return next(createError(409, "Email is already in use by another account"));
    }

    return next(error);
  } finally {
    client.release();
  }
});

router.post("/change-password", verifyToken, async (req, res, next) => {
  const currentPassword = normalizeOptionalString(req.body?.currentPassword);
  const newPassword = normalizeOptionalString(req.body?.newPassword);

  try {
    if (!currentPassword || !newPassword) {
      throw createError(400, "Current password and new password are required");
    }

    if (newPassword.length < 8) {
      throw createError(400, "New password must be at least 8 characters long");
    }

    if (currentPassword === newPassword) {
      throw createError(400, "New password must be different from current password");
    }

    const userResult = await pool.query(
      `
        select id, password_hash, auth_provider
        from auth.users
        where id = $1
        limit 1
      `,
      [req.user.userId],
    );

    const authUser = userResult.rows[0] || null;
    if (!authUser) {
      throw createError(404, "User not found");
    }

    if (!authUser.password_hash) {
      throw createError(400, "This account does not have a local password yet");
    }

    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, authUser.password_hash);
    if (!isCurrentPasswordValid) {
      throw createError(400, "Current password is incorrect");
    }

    const nextPasswordHash = await bcrypt.hash(newPassword, 12);

    await pool.query(
      `
        update auth.users
        set
          password_hash = $2,
          updated_at = now()
        where id = $1
      `,
      [req.user.userId, nextPasswordHash],
    );

    await pool.query(
      `
        insert into app.user_security_state (user_id, last_password_reset_at, created_at, updated_at)
        values ($1, now(), now(), now())
        on conflict (user_id) do update
        set
          last_password_reset_at = now(),
          updated_at = now()
      `,
      [req.user.userId],
    );

    return res.status(200).json({
      ok: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/logout", async (req, res, next) => {
  try {
    clearSessionCookie(res);
    return res.status(200).json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.get("/email-preferences", verifyToken, async (req, res, next) => {
  try {
    const preferences = await fetchEmailPreferences(req.user.userId);
    return res.status(200).json({ preferences });
  } catch (error) {
    return next(error);
  }
});

router.patch("/email-preferences", verifyToken, async (req, res, next) => {
  try {
    const preferences = await updateEmailPreferences(req.user.userId, {
      weeklySummaryEnabled: req.body.weeklySummaryEnabled,
      productUpdatesEnabled: req.body.productUpdatesEnabled,
      marketingEnabled: req.body.marketingEnabled,
    });

    return res.status(200).json({ preferences });
  } catch (error) {
    return next(error);
  }
});

router.use((error, req, res, next) => {
  if (error.status === 429) {
    return res.status(429).json({
      message: error.message,
      resendAvailableAt: error.resendAvailableAt || null,
    });
  }

  return next(error);
});

module.exports = router;
