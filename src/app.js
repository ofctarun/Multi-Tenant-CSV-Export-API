const express = require('express');
const { login } = require('./controllers/authController');
const { exportSalesCsv } = require('./controllers/reportController');
const { requireAuth } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

// Parse JSON request bodies
app.use(express.json());

// Healthcheck endpoint for Docker container checks
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Authentication endpoints
app.post('/api/auth/login', login);

// Protected Reporting endpoints
app.get('/api/reports/sales', requireAuth, exportSalesCsv);

// 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Centralized error handler
app.use(errorHandler);

module.exports = app;
