const { sendSMS } = require('./smsService');

class MonitoringService {
  constructor() {
    this.errorCount     = 0;
    this.lastAlertTime  = 0;
    this.ALERT_PHONE    = process.env.ADMIN_PHONE || '';
    this.ALERT_COOLDOWN = 30 * 60 * 1000; // 30 min between alerts
  }

  async trackError(error, context = '') {
    this.errorCount++;
    console.error(`[ERROR #${this.errorCount}] ${context}:`, error.message);

    // SMS alert every 10th error if cooldown passed
    if (this.errorCount % 10 === 0) {
      const now = Date.now();
      if (now - this.lastAlertTime > this.ALERT_COOLDOWN && this.ALERT_PHONE) {
        this.lastAlertTime = now;
        await sendSMS(this.ALERT_PHONE,
          `SokoLeo Alert: ${this.errorCount} errors detected on server. Check Render logs immediately.`
        );
      }
    }
  }

  trackSlowQuery(sql, durationMs) {
    if (durationMs > 2000) {
      console.warn(`[SLOW QUERY] ${durationMs}ms: ${sql.substring(0, 100)}`);
    }
  }

  trackRegistration(role) {
    console.log(`[METRIC] New ${role} registered at ${new Date().toISOString()}`);
  }

  trackDeal(amount, category) {
    console.log(`[METRIC] Deal: KES ${amount} (${category}) at ${new Date().toISOString()}`);
  }
}

module.exports = new MonitoringService();
