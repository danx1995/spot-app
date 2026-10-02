CREATE TABLE IF NOT EXISTS cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  country_code char(2) NOT NULL DEFAULT 'RU',
  center_lat double precision NOT NULL CHECK (center_lat BETWEEN -90 AND 90),
  center_lng double precision NOT NULL CHECK (center_lng BETWEEN -180 AND 180),
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text,
  avatar_url text,
  email text UNIQUE,
  home_city_id uuid REFERENCES cities(id),
  theme text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text UNIQUE NOT NULL,
  city_id uuid NOT NULL REFERENCES cities(id),
  category_id uuid REFERENCES categories(id),
  name text NOT NULL,
  normalized_name text NOT NULL,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  address text,
  district text,
  cover_image_url text,
  rating numeric(3,2),
  rating_count integer,
  price_level smallint,
  phone text,
  website text,
  working_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_verified boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS places_coordinates_idx ON places(latitude, longitude);
CREATE INDEX IF NOT EXISTS places_city_idx ON places(city_id);
CREATE INDEX IF NOT EXISTS places_normalized_name_idx ON places(normalized_name);

CREATE TABLE IF NOT EXISTS user_places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  place_id uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'want' CHECK (status IN ('want','visited','booked')),
  note text,
  source_type text,
  source_url text,
  is_favorite boolean NOT NULL DEFAULT false,
  booking_start date,
  booking_end date,
  saved_at timestamptz NOT NULL DEFAULT now(),
  visited_at timestamptz,
  UNIQUE(user_id, place_id)
);

CREATE TABLE IF NOT EXISTS collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text UNIQUE NOT NULL,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  city_id uuid REFERENCES cities(id),
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','shared','public')),
  cover_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collection_places (
  collection_id uuid NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  place_id uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  added_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(collection_id, place_id)
);

INSERT INTO cities (slug, name, center_lat, center_lng, is_active) VALUES
('spb', 'Санкт-Петербург', 59.9386, 30.3141, true),
('moscow', 'Москва', 55.7558, 37.6173, true)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    center_lat = EXCLUDED.center_lat,
    center_lng = EXCLUDED.center_lng,
    is_active = EXCLUDED.is_active;

INSERT INTO categories (slug, name, sort_order) VALUES
('restaurant', 'Рестораны', 10),
('coffee', 'Кофейни', 20),
('bar', 'Бары', 30),
('hotel', 'Отели', 40),
('culture', 'Культура', 50),
('entertainment', 'Развлечения', 60),
('shop', 'Магазины', 70),
('park', 'Места', 80),
('other', 'Другое', 90)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    sort_order = EXCLUDED.sort_order;
