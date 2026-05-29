const { query } = require('../db/pool');

const fraudDB = new Map(); // in-memory velocity tracker (swap for Redis in prod)

const fraudDetection = {
  async isBlacklisted(phone) {
    try {
      const r = await query(
        `SELECT id FROM blacklist WHERE phone=$1 AND active=true`, [phone]
      );
      return r.rows.length > 0;
    } catch (_) { return false; }
  },

  trackActivity(phone, action) {
    const key = `${phone}:${action}`;
    const now = Date.now();
    if (!fraudDB.has(key)) fraudDB.set(key, []);
    const events = fraudDB.get(key).filter(t => now - t < 3_600_000); // last hour
    events.push(now);
    fraudDB.set(key, events);
    return events.length;
  },

  checkVelocity(phone, action, maxCount, windowMs = 3_600_000) {
    const key = `${phone}:${action}`;
    const now = Date.now();
    if (!fraudDB.has(key)) return false;
    const recent = fraudDB.get(key).filter(t => now - t < windowMs);
    return recent.length >= maxCount;
  },
};

module.exports = fraudDetection;
