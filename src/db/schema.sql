CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('farmer', 'trader', 'visitor', 'admin')),
  location VARCHAR(120),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS farmers (
  user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  farm_size VARCHAR(50),
  crops TEXT,
  livestock TEXT
);

CREATE TABLE IF NOT EXISTS traders (
  user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  products_purchased TEXT,
  purchase_capacity VARCHAR(80)
);

CREATE TABLE IF NOT EXISTS listings (
  id SERIAL PRIMARY KEY,
  farmer_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product VARCHAR(80) NOT NULL,
  quantity VARCHAR(80) NOT NULL,
  location VARCHAR(120) NOT NULL,
  availability VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reservations (
  id SERIAL PRIMARY KEY,
  listing_id INT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  trader_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  payment_status VARCHAR(20) NOT NULL DEFAULT 'unpaid',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS farm_tours (
  id SERIAL PRIMARY KEY,
  farmer_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  farm_type VARCHAR(80) NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  capacity VARCHAR(50) NOT NULL,
  location VARCHAR(120) NOT NULL,
  available_days VARCHAR(120) NOT NULL,
  activities TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL,
  method VARCHAR(40) NOT NULL,
  transaction_id VARCHAR(120),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  code VARCHAR(6) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  consumed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(80) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inbound_sms (
  id SERIAL PRIMARY KEY,
  from_phone VARCHAR(20),
  to_phone VARCHAR(20),
  message TEXT,
  link_id VARCHAR(100),
  network_code VARCHAR(20),
  at_message_id VARCHAR(120),
  raw_payload TEXT,
  received_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sms_delivery_reports (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(20),
  status VARCHAR(60),
  network_code VARCHAR(20),
  failure_reason TEXT,
  at_message_id VARCHAR(120),
  retry_count INT,
  raw_payload TEXT,
  received_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listings_product ON listings(product);
CREATE INDEX IF NOT EXISTS idx_listings_location ON listings(location);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes(phone);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(token);
CREATE INDEX IF NOT EXISTS idx_inbound_sms_from_phone ON inbound_sms(from_phone);
CREATE INDEX IF NOT EXISTS idx_sms_delivery_reports_phone ON sms_delivery_reports(phone);
