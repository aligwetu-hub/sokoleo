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

// Run full maintenance every 24 hours
setInterval(async () => {
  console.log('🔄 Running daily maintenance...');
  await BackupService.cleanupExpiredOTPs();
  await BackupService.cleanupOldLogs();
  console.log('✅ Daily maintenance complete');
}, 24 * 60 * 60 * 1000);
