require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./infrastructure/db/database');
const routes = require('./interfaces/routes');
const jsonLogger = require('./infrastructure/logger/jsonLogger');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve Static Front-End Assets
app.use(express.static(path.join(__dirname, 'interfaces', 'public')));

// API Routes
app.use('/api', routes);

// Catch-all route to serve the SPA frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'interfaces', 'public', 'index.html'));
});

// Initialize database schema and seeds before listening
initDb()
  .then(() => {
    app.listen(PORT, () => {
      jsonLogger.info(`Antigravity Monolith Server booted successfully!`);
      jsonLogger.info(`Local Dashboard available at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    jsonLogger.error('Fatal initialization error in DB setup', { error: err.message });
    process.exit(1);
  });
