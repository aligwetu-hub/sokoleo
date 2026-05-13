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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_listings_product ON listings(product);
CREATE INDEX IF NOT EXISTS idx_listings_location ON listings(location);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_farmer ON listings(farmer_id);
CREATE INDEX IF NOT EXISTS idx_reservations_trader ON reservations(trader_id);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_ussd_phone ON ussd_sessions(phone);
