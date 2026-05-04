const app = require('./app');
const config = require('./config/env');

app.listen(config.port, () => {
  console.log(`SokoLeo backend running on port ${config.port}`);
});
