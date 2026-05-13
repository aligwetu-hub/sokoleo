// src/app.js  — add these lines in your existing app.js
// Find where your other routes are registered and add:

const negotiationRoutes = require('../routes/negotiationRoutes');
// ...
app.use('/api/v1/negotiations', negotiationRoutes);
