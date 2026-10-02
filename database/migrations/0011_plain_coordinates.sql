DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cities'
      AND column_name = 'center'
  ) THEN
    ALTER TABLE cities ADD COLUMN IF NOT EXISTS center_lat double precision;
    ALTER TABLE cities ADD COLUMN IF NOT EXISTS center_lng double precision;

    EXECUTE 'UPDATE cities
      SET center_lat = ST_Y(center::geometry),
          center_lng = ST_X(center::geometry)
      WHERE center IS NOT NULL';

    ALTER TABLE cities ALTER COLUMN center_lat SET NOT NULL;
    ALTER TABLE cities ALTER COLUMN center_lng SET NOT NULL;
    ALTER TABLE cities DROP COLUMN center;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'places'
      AND column_name = 'location'
  ) THEN
    ALTER TABLE places ADD COLUMN IF NOT EXISTS latitude double precision;
    ALTER TABLE places ADD COLUMN IF NOT EXISTS longitude double precision;

    EXECUTE 'UPDATE places
      SET latitude = ST_Y(location::geometry),
          longitude = ST_X(location::geometry)
      WHERE location IS NOT NULL';

    DROP INDEX IF EXISTS places_location_idx;
    ALTER TABLE places ALTER COLUMN latitude SET NOT NULL;
    ALTER TABLE places ALTER COLUMN longitude SET NOT NULL;
    ALTER TABLE places DROP COLUMN location;
  END IF;
END $$;

ALTER TABLE cities
  DROP CONSTRAINT IF EXISTS cities_center_lat_check,
  DROP CONSTRAINT IF EXISTS cities_center_lng_check;

ALTER TABLE cities
  ADD CONSTRAINT cities_center_lat_check CHECK (center_lat BETWEEN -90 AND 90),
  ADD CONSTRAINT cities_center_lng_check CHECK (center_lng BETWEEN -180 AND 180);

ALTER TABLE places
  DROP CONSTRAINT IF EXISTS places_latitude_check,
  DROP CONSTRAINT IF EXISTS places_longitude_check;

ALTER TABLE places
  ADD CONSTRAINT places_latitude_check CHECK (latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT places_longitude_check CHECK (longitude BETWEEN -180 AND 180);

CREATE INDEX IF NOT EXISTS places_coordinates_idx
  ON places(latitude, longitude);
