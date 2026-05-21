// User-scoped preferences API.
//
// GET   /api/users/me/preferences            → returns the authenticated user's
//                                              preferences, including language.
// PATCH /api/users/me/preferences/language   → updates only the language code.
//
// The user id is taken from the verified access token; client-supplied user
// ids are ignored. Language is constrained server-side to {en,fr,ar}.

const router = require("express").Router();
const createError = require("http-errors");

const pool = require("../db");
const { verifyToken } = require("./verifytoken");

const SUPPORTED_LANGUAGES = ["en", "fr", "ar"];

async function ensureLanguageColumn(db = pool) {
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
      updated_at timestamptz not null default now()
    )
  `);
  await db.query(
    `alter table app.user_profile_settings
       add column if not exists language_code varchar(2) not null default 'en'`,
  );
}

function normalizeLanguageInput(value) {
  if (typeof value !== "string") return null;
  const code = value.trim().toLowerCase();
  return SUPPORTED_LANGUAGES.includes(code) ? code : null;
}

async function fetchPreferences(userId, db = pool) {
  await ensureLanguageColumn(db);
  await db.query(
    `insert into app.user_profile_settings (user_id)
     values ($1)
     on conflict (user_id) do nothing`,
    [userId],
  );

  const result = await db.query(
    `select language_code, updated_at
       from app.user_profile_settings
      where user_id = $1
      limit 1`,
    [userId],
  );

  const row = result.rows[0] || null;
  const language = SUPPORTED_LANGUAGES.includes(row?.language_code)
    ? row.language_code
    : "en";

  return {
    user_id: userId,
    language,
    supported_languages: SUPPORTED_LANGUAGES,
    updated_at: row?.updated_at || null,
  };
}

router.get("/", verifyToken, async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) throw createError(401, "Authentication required");
    const prefs = await fetchPreferences(userId);
    return res.status(200).json(prefs);
  } catch (error) {
    return next(error);
  }
});

router.patch("/language", verifyToken, async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) throw createError(401, "Authentication required");

    const language = normalizeLanguageInput(req.body?.language);
    if (!language) {
      throw createError(400, "language must be one of: en, fr, ar");
    }

    await ensureLanguageColumn();
    await pool.query(
      `insert into app.user_profile_settings (user_id, language_code, updated_at)
       values ($1, $2, now())
       on conflict (user_id)
       do update set language_code = excluded.language_code,
                     updated_at = now()`,
      [userId, language],
    );

    const prefs = await fetchPreferences(userId);
    return res.status(200).json(prefs);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
