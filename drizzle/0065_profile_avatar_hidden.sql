-- 0065: per-profile avatar visibility preference (#1328).
-- When true, the viewer's photo is hidden everywhere it renders (own screen
-- AND the partner's screen) and the letter-fallback (Avatar.tsx) shows
-- instead. Owner-only write (each profile toggles its own row); the read
-- side masks avatarUrl for BOTH members wherever it's queried.
ALTER TABLE "Profiles" ADD COLUMN IF NOT EXISTS "avatar_hidden" boolean NOT NULL DEFAULT false;
