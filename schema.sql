-- SokoLeo Database Schema
-- Run: psql -U postgres -d sokoleo -f schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users (all roles)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('farmer', 'trader', 'visitor', 'admin')),
  location VARCHAR(100),
  is_verified BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  otp_code VARCHAR(10),
  otp_expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Farmer profiles
CREATE TABLE IF NOT EXISTS farmers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  farm_size VARCHAR(50),
  crops TEXT[],
  livestock TEXT[],
  created_at TIMESTAMP DEFAULT NOW()
);

-- Trader profiles
CREATE TABLE IF NOT EXISTS traders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  products_interest TEXT[],
  purchase_capacity VARCHAR(100),
  subscription_tier VARCHAR(20) DEFAULT 'none' CHECK (subscription_tier IN ('none','basic','pro','bulk')),
  subscription_expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Produce listings
CREATE TABLE IF NOT EXISTS listings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farmer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  product VARCHAR(100) NOT NULL,
  quantity VARCHAR(100) NOT NULL,
  unit VARCHAR(50) DEFAULT 'bags',
  price_per_unit NUMERIC(10,2),
  location VARCHAR(100) NOT NULL,
  availability VARCHAR(50) NOT NULL CHECK (availability IN ('today','tomorrow','this_week')),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','reserved','sold','expired')),
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '7 days'
);

-- Reservations
CREATE TABLE IF NOT EXISTS reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
  trader_id UUID REFERENCES users(id) ON DELETE CASCADE,
  quantity_reserved VARCHAR(100),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled','completed')),
  payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','failed','refunded')),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Farm tours
CREATE TABLE IF NOT EXISTS farm_tours (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farmer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  farm_type VARCHAR(100) NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  min_visitors INT DEFAULT 1,
  max_visitors INT NOT NULL,
  location VARCHAR(100) NOT NULL,
  available_days TEXT[],
  activities TEXT[],
  description TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tour bookings
CREATE TABLE IF NOT EXISTS tour_bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tour_id UUID REFERENCES farm_tours(id) ON DELETE CASCADE,
  visitor_id UUID REFERENCES users(id) ON DELETE CASCADE,
  visitor_count INT DEFAULT 1,
  visit_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled','completed')),
  payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','failed','refunded')),
  total_amount NUMERIC(10,2),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  reference_id UUID,
  reference_type VARCHAR(50),
  amount NUMERIC(10,2) NOT NULL,
  method VARCHAR(30) DEFAULT 'mpesa',
  transaction_id VARCHAR(100),
  mpesa_checkout_id VARCHAR(100),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','refunded')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- USSD sessions
CREATE TABLE IF NOT EXISTS ussd_sessions (
  session_id VARCHAR(100) PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  state VARCHAR(100) DEFAULT 'MAIN_MENU',
  data JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ─── Escrow / Commission tables ──────────────────────────────────────────────

-- Marketplace transactions (escrow lifecycle)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id UUID REFERENCES users(id),
  seller_id UUID REFERENCES users(id),
  listing_id UUID,
  listing_type VARCHAR(30) DEFAULT 'produce',
  item_description TEXT,
  category VARCHAR(30) DEFAULT 'produce',
  quantity NUMERIC(10,2) DEFAULT 1,
  unit VARCHAR(30) DEFAULT 'kg',
  listing_price NUMERIC(12,2) NOT NULL,
  buyer_fee_rate NUMERIC(5,4),
  seller_fee_rate NUMERIC(5,4),
  buyer_fee_amount NUMERIC(12,2),
  seller_fee_amount NUMERIC(12,2),
  buyer_pays NUMERIC(12,2),
  seller_receives NUMERIC(12,2),
  sokoleo_commission NUMERIC(12,2),
  payment_method VARCHAR(50) DEFAULT 'M-PESA Escrow',
  mpesa_ref VARCHAR(100),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','in_escrow','confirmed','disputed','refunded','cancelled')),
  paid_at TIMESTAMP,
  confirmed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Escrow hold records
CREATE TABLE IF NOT EXISTS escrow (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  amount_held NUMERIC(12,2),
  release_to_seller NUMERIC(12,2),
  release_to_sokoleo NUMERIC(12,2),
  status VARCHAR(20) DEFAULT 'holding' CHECK (status IN ('holding','released','refunded')),
  confirmation_code VARCHAR(10),
  handover_confirmed_by VARCHAR(20),
  held_at TIMESTAMP DEFAULT NOW(),
  released_at TIMESTAMP
);

-- Commission earnings ledger
CREATE TABLE IF NOT EXISTS commission_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID REFERENCES transactions(id),
  amount NUMERIC(12,2),
  source VARCHAR(20) CHECK (source IN ('buyer_fee','seller_fee')),
  category VARCHAR(30),
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Seller payouts
CREATE TABLE IF NOT EXISTS payouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID REFERENCES transactions(id),
  seller_id UUID REFERENCES users(id),
  amount NUMERIC(12,2),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','processing','paid','failed')),
  mpesa_ref VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  paid_at TIMESTAMP
);

-- ─── Livestock listings ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS livestock_listings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farmer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  animal_type VARCHAR(50) NOT NULL,
  breed VARCHAR(100),
  quantity INT NOT NULL DEFAULT 1,
  age_months INT,
  weight_kg NUMERIC(8,2),
  price_per_head NUMERIC(12,2) NOT NULL,
  location VARCHAR(100) NOT NULL,
  health_status VARCHAR(50) DEFAULT 'healthy',
  vaccinated BOOLEAN DEFAULT FALSE,
  description TEXT,
  images TEXT[],
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','reserved','sold','expired')),
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '14 days'
);

-- ─── Farm Services Directory ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS farm_services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID REFERENCES users(id) ON DELETE CASCADE,
  service_type VARCHAR(100) NOT NULL,
  service_name VARCHAR(200) NOT NULL,
  description TEXT,
  price_range VARCHAR(100),
  location VARCHAR(100) NOT NULL,
  coverage_radius_km INT DEFAULT 20,
  contact_phone VARCHAR(20),
  available_days TEXT[],
  rating NUMERIC(2,1) DEFAULT 0,
  reviews_count INT DEFAULT 0,
  is_verified BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ─── Boost / Bump Listings ───────────────────────────────────────────────────
ALTER TABLE listings ADD COLUMN IF NOT EXISTS is_boosted BOOLEAN DEFAULT FALSE;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS boosted_until TIMESTAMP;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS boost_count INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS boosts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id   UUID REFERENCES listings(id) ON DELETE CASCADE,
  farmer_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  amount_paid  DECIMAL(8,2) NOT NULL,
  duration_hrs INTEGER DEFAULT 24,
  started_at   TIMESTAMP DEFAULT NOW(),
  expires_at   TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_boosts_listing ON boosts(listing_id);
CREATE INDEX IF NOT EXISTS idx_boosts_farmer  ON boosts(farmer_id);
CREATE INDEX IF NOT EXISTS idx_boosts_expires ON boosts(expires_at);

-- ─── In-App Messaging ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farmer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  trader_id UUID REFERENCES users(id) ON DELETE CASCADE,
  listing_id UUID,
  last_message_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (farmer_id, trader_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ─── Seller Ratings & Reviews ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reviewer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  farmer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (reviewer_id, farmer_id, transaction_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_listings_product ON listings(product);
CREATE INDEX IF NOT EXISTS idx_listings_location ON listings(location);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_farmer ON listings(farmer_id);
CREATE INDEX IF NOT EXISTS idx_reservations_trader ON reservations(trader_id);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_ussd_phone ON ussd_sessions(phone);
CREATE INDEX IF NOT EXISTS idx_transactions_buyer ON transactions(buyer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_seller ON transactions(seller_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_livestock_farmer ON livestock_listings(farmer_id);
CREATE INDEX IF NOT EXISTS idx_livestock_status ON livestock_listings(status);
CREATE INDEX IF NOT EXISTS idx_services_type ON farm_services(service_type);
CREATE INDEX IF NOT EXISTS idx_services_location ON farm_services(location);
CREATE INDEX IF NOT EXISTS idx_reviews_farmer ON reviews(farmer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_farmer ON conversations(farmer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_trader ON conversations(trader_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
