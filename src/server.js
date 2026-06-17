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

// ODK Collect Root Compatibility
app.use((req, res, next) => {
  if (req.path === '/formList' || req.path === '/submission' || req.path.startsWith('/odk/')) {
    req.url = '/api' + req.url;
  }
  next();
});

// API Routes
app.use('/api', routes);

// Catch-all route to serve the SPA frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'interfaces', 'public', 'index.html'));
});

const http = require('http');
const WebSocket = require('ws');

// Initialize database schema and seeds before listening
initDb()
  .then(() => {
    const server = http.createServer(app);
    
    // Initialize WebSockets
    const wss = new WebSocket.Server({ server, path: '/ws' });
    
    // Broadcast function attached to app locals so routes can use it
    app.locals.broadcast = (topic, payload) => {
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ topic, payload }));
        }
      });
    };

    wss.on('connection', (ws) => {
      jsonLogger.info('New WebSocket connection established.');
    });

    server.listen(PORT, () => {
      jsonLogger.info(`DATApesquise Monolith Server booted successfully!`);
      jsonLogger.info(`Local Dashboard available at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    jsonLogger.error('Fatal initialization error in DB setup', { error: err.message });
    process.exit(1);
  });
