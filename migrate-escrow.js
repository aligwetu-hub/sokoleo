// migrate-escrow.js
// Run: node migrate-escrow.js
require('dotenv').config();
let pool;
const paths = ['./db/client','./src/db/client','./db','./src/db','./config/db','./src/config/db'];
for(const p of paths){ try{ pool = require(p); break; }catch(e){} }
if(!pool){ console.error('Cannot find db module'); process.exit(1); }

async function migrate() {
  console.log('🚀 Running escrow & commission migrations...');
  try {

    // ── TRANSACTIONS (master record for every deal) ───────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id                SERIAL PRIMARY KEY,
        -- Parties
        buyer_id          INTEGER REFERENCES users(id),
        seller_id         INTEGER REFERENCES users(id),
        -- What was sold
        listing_id        INTEGER,
        listing_type      VARCHAR(30) DEFAULT 'produce',
        item_description  TEXT,
        category          VARCHAR(50),
        quantity          DECIMAL(10,2),
        unit              VARCHAR(20) DEFAULT 'kg',
        -- Prices
        listing_price     DECIMAL(12,2) NOT NULL,
        buyer_fee_rate    DECIMAL(5,4)  DEFAULT 0.03,
        seller_fee_rate   DECIMAL(5,4)  DEFAULT 0.01,
        buyer_fee_amount  DECIMAL(12,2) DEFAULT 0,
        seller_fee_amount DECIMAL(12,2) DEFAULT 0,
        buyer_pays        DECIMAL(12,2) NOT NULL,
        seller_receives   DECIMAL(12,2) NOT NULL,
        sokoleo_commission DECIMAL(12,2) NOT NULL,
        -- Payment
        payment_method    VARCHAR(30) DEFAULT 'M-PESA Escrow',
        mpesa_ref         VARCHAR(50),
        -- Status
        status            VARCHAR(20) DEFAULT 'pending'
                          CHECK (status IN (
                            'pending',      -- awaiting buyer payment
                            'paid',         -- buyer paid into escrow
                            'in_escrow',    -- money held, awaiting handover
                            'confirmed',    -- handover confirmed, payout released
                            'disputed',     -- dispute raised
                            'refunded',     -- money returned to buyer
                            'cancelled'     -- deal cancelled
                          )),
        -- Timestamps
        created_at        TIMESTAMP DEFAULT NOW(),
        paid_at           TIMESTAMP,
        confirmed_at      TIMESTAMP,
        released_at       TIMESTAMP
      );
    `);
    console.log('✅ transactions table ready');

    // ── ESCROW ACCOUNTS (holds money until handover) ──────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS escrow (
        id              SERIAL PRIMARY KEY,
        transaction_id  INTEGER NOT NULL REFERENCES transactions(id),
        amount_held     DECIMAL(12,2) NOT NULL,
        -- Release details
        release_to_seller DECIMAL(12,2),
        release_to_sokoleo DECIMAL(12,2),
        -- Status
        status          VARCHAR(20) DEFAULT 'holding'
                        CHECK (status IN ('holding','released','refunded')),
        -- Confirmation
        handover_confirmed_by VARCHAR(20), -- 'buyer' | 'seller' | 'admin'
        confirmation_code VARCHAR(6),
        -- Timestamps
        held_at         TIMESTAMP DEFAULT NOW(),
        released_at     TIMESTAMP
      );
    `);
    console.log('✅ escrow table ready');

    // ── COMMISSION LEDGER (SokoLeo earnings tracker) ─────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS commission_ledger (
        id              SERIAL PRIMARY KEY,
        transaction_id  INTEGER REFERENCES transactions(id),
        amount          DECIMAL(12,2) NOT NULL,
        source          VARCHAR(30),  -- 'buyer_fee' | 'seller_fee'
        category        VARCHAR(50),
        description     TEXT,
        created_at      TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ commission_ledger table ready');

    // ── PAYOUTS (money sent to sellers) ──────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payouts (
        id              SERIAL PRIMARY KEY,
        transaction_id  INTEGER REFERENCES transactions(id),
        seller_id       INTEGER REFERENCES users(id),
        amount          DECIMAL(12,2) NOT NULL,
        mpesa_number    VARCHAR(15),
        mpesa_ref       VARCHAR(50),
        status          VARCHAR(20) DEFAULT 'pending'
                        CHECK (status IN ('pending','processing','sent','failed')),
        created_at      TIMESTAMP DEFAULT NOW(),
        sent_at         TIMESTAMP
      );
    `);
    console.log('✅ payouts table ready');

    // ── INDEXES ───────────────────────────────────────────────────────────────
    const indexes = [
      `CREATE INDEX IF NOT EXISTS idx_tx_buyer    ON transactions(buyer_id)`,
      `CREATE INDEX IF NOT EXISTS idx_tx_seller   ON transactions(seller_id)`,
      `CREATE INDEX IF NOT EXISTS idx_tx_status   ON transactions(status)`,
      `CREATE INDEX IF NOT EXISTS idx_tx_listing  ON transactions(listing_id)`,
      `CREATE INDEX IF NOT EXISTS idx_escrow_tx   ON escrow(transaction_id)`,
      `CREATE INDEX IF NOT EXISTS idx_ledger_tx   ON commission_ledger(transaction_id)`,
      `CREATE INDEX IF NOT EXISTS idx_payouts_sel ON payouts(seller_id)`,
    ];
    for(const idx of indexes) await pool.query(idx);
    console.log('✅ Indexes created');

    console.log('\n🎉 Escrow & commission migration complete!');
    process.exit(0);
  } catch(err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}
migrate();
