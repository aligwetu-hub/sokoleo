// migrate-livestock.js
// Run: node migrate-livestock.js
require('dotenv').config();
let pool;
const paths = ['./db/client','./src/db/client','./db','./src/db','./config/db','./src/config/db'];
for(const p of paths){ try{ pool = require(p); break; }catch(e){} }
if(!pool){ console.error('Cannot find db module'); process.exit(1); }
async function migrate() {
  console.log('🚀 Running livestock migrations...');
  try {

    // ── ANIMALS (core herd table) ──────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS animals (
        id                 SERIAL PRIMARY KEY,
        owner_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        -- Identity
        species            VARCHAR(30) NOT NULL,
        breed              VARCHAR(100) NOT NULL,
        sub_species        VARCHAR(100),
        name               VARCHAR(100),
        sex                VARCHAR(20),
        dob                DATE,
        weight             DECIMAL(8,2),
        rfid_tag           VARCHAR(100),
        chip_location      VARCHAR(50),
        production_stage   VARCHAR(60),
        pedigree_no        VARCHAR(100),
        -- Dog-specific
        kennel_no          VARCHAR(100),
        dog_category       VARCHAR(60),
        -- Health
        bcs                SMALLINT CHECK (bcs BETWEEN 1 AND 5),
        last_deworm        DATE,
        withholding_expiry DATE,
        vet_cert           VARCHAR(100),
        health_notes       TEXT,
        vaccinations       JSONB DEFAULT '[]',
        -- Location
        sub_county         VARCHAR(60),
        landmark           VARCHAR(150),
        gps_lat            DECIMAL(10,7),
        gps_lng            DECIMAL(10,7),
        -- Finance
        purchase_price     DECIMAL(12,2),
        market_value       DECIMAL(12,2),
        insurer            VARCHAR(100),
        policy_no          VARCHAR(100),
        -- AI Vision fields
        ai_weight          DECIMAL(8,2),
        ai_bcs             DECIMAL(3,1),
        ai_age_estimate    VARCHAR(50),
        lameness_risk      VARCHAR(20),
        -- Meta
        passport_id        VARCHAR(50) UNIQUE,
        status             VARCHAR(20) DEFAULT 'active'
                           CHECK (status IN ('active','for_sale','sold','reserved','deceased')),
        created_at         TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ animals table ready');

    // ── LIVESTOCK SALE LISTINGS ────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS livestock_sale_listings (
        id              SERIAL PRIMARY KEY,
        animal_id       INTEGER NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
        farmer_id       INTEGER NOT NULL REFERENCES users(id),
        price           DECIMAL(12,2) NOT NULL,
        payment_method  VARCHAR(50) DEFAULT 'M-PESA Escrow',
        sub_county      VARCHAR(60),
        description     TEXT,
        status          VARCHAR(20) DEFAULT 'active'
                        CHECK (status IN ('active','sold','cancelled')),
        created_at      TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ livestock_sale_listings table ready');

    // ── BARTER / SWAP ──────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS livestock_barter (
        id                SERIAL PRIMARY KEY,
        animal_id         INTEGER NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
        farmer_id         INTEGER NOT NULL REFERENCES users(id),
        my_value          DECIMAL(12,2),
        want_description  TEXT NOT NULL,
        want_value        DECIMAL(12,2),
        notes             TEXT,
        location          VARCHAR(100),
        status            VARCHAR(20) DEFAULT 'open'
                          CHECK (status IN ('open','matched','closed')),
        created_at        TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ livestock_barter table ready');

    // ── SIRE HIRE ──────────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sire_hire (
        id                SERIAL PRIMARY KEY,
        animal_id         INTEGER NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
        farmer_id         INTEGER NOT NULL REFERENCES users(id),
        fee               DECIMAL(10,2) NOT NULL,
        breed_description VARCHAR(200),
        vet_cert          VARCHAR(100),
        notes             TEXT,
        location          VARCHAR(100),
        proven_offspring  INTEGER DEFAULT 0,
        available         BOOLEAN DEFAULT true,
        created_at        TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ sire_hire table ready');

    // ── FODDER MARKET ──────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fodder_listings (
        id              SERIAL PRIMARY KEY,
        farmer_id       INTEGER NOT NULL REFERENCES users(id),
        fodder_type     VARCHAR(100) NOT NULL,
        quantity        DECIMAL(10,2) NOT NULL,
        unit            VARCHAR(30) DEFAULT 'kg',
        price_per_unit  DECIMAL(10,2) NOT NULL,
        location        VARCHAR(100),
        delivery_option VARCHAR(100) DEFAULT 'Pickup only',
        notes           TEXT,
        status          VARCHAR(20) DEFAULT 'active'
                        CHECK (status IN ('active','sold out','cancelled')),
        created_at      TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ fodder_listings table ready');

    // ── LIVESTOCK OFFERS ───────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS livestock_offers (
        id               SERIAL PRIMARY KEY,
        listing_id       INTEGER NOT NULL,
        listing_type     VARCHAR(20) DEFAULT 'sale'
                         CHECK (listing_type IN ('sale','barter','sire','fodder')),
        trader_id        INTEGER NOT NULL REFERENCES users(id),
        farmer_id        INTEGER NOT NULL REFERENCES users(id),
        offered_price    DECIMAL(12,2) NOT NULL,
        message          TEXT,
        status           VARCHAR(20) DEFAULT 'pending'
                         CHECK (status IN ('pending','accepted','rejected','countered')),
        counter_price    DECIMAL(12,2),
        response_message TEXT,
        responded_at     TIMESTAMP,
        created_at       TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ livestock_offers table ready');

    // ── INDEXES ────────────────────────────────────────────────────────────────
    const indexes = [
      `CREATE INDEX IF NOT EXISTS idx_animals_owner    ON animals(owner_id)`,
      `CREATE INDEX IF NOT EXISTS idx_animals_species  ON animals(species)`,
      `CREATE INDEX IF NOT EXISTS idx_animals_status   ON animals(status)`,
      `CREATE INDEX IF NOT EXISTS idx_ls_sale_farmer   ON livestock_sale_listings(farmer_id)`,
      `CREATE INDEX IF NOT EXISTS idx_ls_sale_status   ON livestock_sale_listings(status)`,
      `CREATE INDEX IF NOT EXISTS idx_ls_offers_trader ON livestock_offers(trader_id)`,
      `CREATE INDEX IF NOT EXISTS idx_ls_offers_farmer ON livestock_offers(farmer_id)`,
    ];
    for (const idx of indexes) await pool.query(idx);
    console.log('✅ Indexes created');

    console.log('\n🎉 All livestock migrations complete!');
    console.log('Next step: Add to src/app.js:');
    console.log('  const livestockRoutes = require("../routes/livestockRoutes");');
    console.log('  app.use("/api/v1/livestock", livestockRoutes);');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
