-- Migrate CarDetails.color from stored keys ('black', 'silver', 'dark_gray', ...)
-- to stored hex ('#1C1C1E', '#B8B8C0', '#4A4A52', ...).
--
-- Why: storing keys means the UI must always know which palette they belong to.
-- If we ever expand or rename the palette, old rows silently break (key 'champagne'
-- has no entry in a new palette → renders nothing). Storing hex is self-describing
-- and survives palette changes — old rows keep their literal color.
--
-- Idempotent: WHEN branches match only the legacy key strings. After first run,
-- all values are hex; subsequent runs fall through to ELSE = color (unchanged).

UPDATE "CarDetails"
SET color = CASE color
  WHEN 'white'     THEN '#F0EDE8'
  WHEN 'black'     THEN '#1C1C1E'
  WHEN 'silver'    THEN '#B8B8C0'
  WHEN 'dark_gray' THEN '#4A4A52'
  WHEN 'dark_red'  THEN '#7B2525'
  WHEN 'dark_blue' THEN '#1E3557'
  WHEN 'brown'     THEN '#7A5C3E'
  WHEN 'champagne' THEN '#C8A97A'
  ELSE color
END
WHERE color IS NOT NULL;
