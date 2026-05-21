-- 20260506_user_language_code.sql
-- Adds a normalized BCP-47 language code (en/fr/ar) on the existing
-- app.user_profile_settings table for the multilingual feature.
--
-- The original `language` column (varchar(50)) holds free-text human names
-- ('French', 'English', 'Arabic'). It is preserved for backward compatibility;
-- the new column is the source of truth for the i18n preference.

ALTER TABLE app.user_profile_settings
  ADD COLUMN IF NOT EXISTS language_code varchar(2);

-- Backfill from the existing free-text column. Unknown / NULL → 'en'.
UPDATE app.user_profile_settings
SET language_code = CASE
  WHEN lower(coalesce(language, '')) IN ('en','english','anglais','إنجليزية') THEN 'en'
  WHEN lower(coalesce(language, '')) IN ('fr','french','français','francais','فرنسية') THEN 'fr'
  WHEN lower(coalesce(language, '')) IN ('ar','arabic','arabe','العربية','عربي','عربية') THEN 'ar'
  ELSE 'en'
END
WHERE language_code IS NULL;

ALTER TABLE app.user_profile_settings
  ALTER COLUMN language_code SET DEFAULT 'en';

ALTER TABLE app.user_profile_settings
  ALTER COLUMN language_code SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_user_profile_settings_language_code'
      AND conrelid = 'app.user_profile_settings'::regclass
  ) THEN
    ALTER TABLE app.user_profile_settings
      ADD CONSTRAINT chk_user_profile_settings_language_code
      CHECK (language_code IN ('en','fr','ar'));
  END IF;
END
$$;
