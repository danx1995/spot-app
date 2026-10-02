CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  country_code char(2) NOT NULL DEFAULT 'RU',
  center geography(Point, 4326) NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text,
  avatar_url text,
  email text UNIQUE,
  home_city_id uuid REFERENCES cities(id),
  theme text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text UNIQUE NOT NULL,
  city_id uuid NOT NULL REFERENCES cities(id),
  category_id uuid REFERENCES categories(id),
  name text NOT NULL,
  normalized_name text NOT NULL,
  location geography(Point, 4326) NOT NULL,
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

CREATE INDEX places_location_idx ON places USING gist(location);
CREATE INDEX places_city_idx ON places(city_id);
CREATE INDEX places_normalized_name_idx ON places(normalized_name);

CREATE TABLE user_places (
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

CREATE TABLE collections (
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

CREATE TABLE collection_places (
  collection_id uuid NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  place_id uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  added_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(collection_id, place_id)
);

INSERT INTO cities (slug, name, center, is_active) VALUES
('spb', 'Санкт-Петербург', ST_SetSRID(ST_Point(30.3141, 59.9386), 4326)::geography, true),
('moscow', 'Москва', ST_SetSRID(ST_Point(37.6173, 55.7558), 4326)::geography, true);

INSERT INTO categories (slug, name, sort_order) VALUES
('restaurant', 'Рестораны', 10),
('coffee', 'Кофейни', 20),
('bar', 'Бары', 30),
('hotel', 'Отели', 40),
('culture', 'Культура', 50),
('entertainment', 'Развлечения', 60),
('shop', 'Магазины', 70),
('park', 'Места', 80),
('other', 'Другое', 90);
