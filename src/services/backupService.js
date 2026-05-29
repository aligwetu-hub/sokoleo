const { query } = require('../db/pool');

class BackupService {
  static async logEvent(type, details, severity = 'info') {
    try {
      await query(
        `INSERT INTO system_logs (type, details, severity) VALUES ($1, $2, $3)`,
        [type, JSON.stringify(details), severity]
      );
    } catch (e) { console.error('Log error:', e.message); }
  }

  static async healthCheck() {
    const status = {
      timestamp: new Date().toISOString(),
      server:    'ok',
      database:  'unknown',
      uptime:    process.uptime(),
      memory:    process.memoryUsage(),
    };
    try {
      await query('SELECT 1');
      status.database = 'ok';
    } catch (e) {
      status.database = 'error: ' + e.message;
    }
    return status;
  }

  static async cleanupExpiredOTPs() {
    try {
      const r = await query(
        `DELETE FROM otp_log WHERE expires_at < NOW() - INTERVAL '24 hours'`
      );
      console.log(`🧹 Cleaned up ${r.rowCount} expired OTP records`);
      return r.rowCount;
    } catch (e) {
      console.error('OTP cleanup error:', e.message);
      return 0;
    }
  }

  static async cleanupOldLogs() {
    try {
      const r = await query(
        `DELETE FROM system_logs WHERE created_at < NOW() - INTERVAL '30 days'`
      );
      console.log(`🧹 Cleaned up ${r.rowCount} old log records`);
      return r.rowCount;
    } catch (e) { return 0; }
  }
}

module.exports = BackupService;
