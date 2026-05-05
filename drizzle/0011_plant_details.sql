-- Plant愛物 detail fields

CREATE TABLE IF NOT EXISTS "PlantDetails" (
  asset_id     uuid PRIMARY KEY REFERENCES "Assets"(id),
  species      text,
  location     text,
  sprouted_at  date,
  cost         integer,
  water_every  integer
);
