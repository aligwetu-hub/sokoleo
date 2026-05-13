const app = require('./app');

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
