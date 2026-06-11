const app          = require('./app');
const BackupService = require('./services/backupService');

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║   🌽  SokoLeo API Server Running     ║
  ║   Port: ${PORT}                          ║
  ║   USSD: POST /api/ussd               ║
  ║   Health: GET /health                ║
  ╚══════════════════════════════════════╝
  `);
});

// Run OTP cleanup shortly after startup
setTimeout(async () => {
  await BackupService.cleanupExpiredOTPs();
}, 5000);

// Auto-release pickup escrows every hour
setInterval(async () => {
  try {
    const { query } = require('./db/pool');
    const { sendSMS } = require('./services/smsService');
    const expired = await query(
      `SELECT pt.*, u1.name as farmer_name, u1.phone as farmer_phone
       FROM pickup_transactions pt
       JOIN users u1 ON pt.farmer_id = u1.id
       WHERE pt.status='dispute_window' AND pt.auto_release_at < NOW()`
    );
    for (const pt of expired.rows) {
      await query(`UPDATE pickup_transactions SET status='completed', escrow_released_at=NOW() WHERE id=$1`, [pt.id]);
      if (pt.escrow_id) {
        await query(`UPDATE escrow SET status='released', released_at=NOW() WHERE id=$1`, [pt.escrow_id]).catch(() => {});
      }
      await sendSMS(pt.farmer_phone,
        `SokoLeo: Malipo yametumwa!\nDeal: ${pt.deal_code}\nKES ${pt.total_amount} inatumwa kwa M-PESA yako. Soko Kila Siku!`
      ).catch(() => {});
    }
    if (expired.rows.length) console.log(`Auto-released ${expired.rows.length} pickup escrow(s).`);
  } catch (e) { console.error('Auto-release error:', e.message); }
}, 60 * 60 * 1000);

// Run full maintenance every 24 hours
setInterval(async () => {
  console.log('🔄 Running daily maintenance...');
  await BackupService.cleanupExpiredOTPs();
  await BackupService.cleanupOldLogs();
  console.log('✅ Daily maintenance complete');
}, 24 * 60 * 60 * 1000);
