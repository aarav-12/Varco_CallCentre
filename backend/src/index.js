require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');

const { runMigrations } = require('./db');
const errorHandler = require('./middleware/errorHandler');
const { checkAndGenerateAlerts } = require('./services/alertService');

const app = express();

// Security middleware
app.use(helmet());
app.use(compression());

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// Global rate limiter
app.use('/api/', rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 300,
  message: { error: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
}));

// Trust proxy for accurate IP
app.set('trust proxy', 1);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/leads', require('./routes/leads'));
app.use('/api/follow-ups', require('./routes/followups'));
app.use('/api/calls', require('./routes/calls'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/activity-logs', require('./routes/activitylogs'));
app.use('/api/reports', require('./routes/reports'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), env: process.env.NODE_ENV });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use(errorHandler);

// Cron: Run alert checks every 15 minutes
cron.schedule('*/15 * * * *', () => {
  checkAndGenerateAlerts().catch(console.error);
});

// Cron: Cleanup expired refresh tokens daily
cron.schedule('0 0 * * *', async () => {
  try {
    const { query } = require('./db');
    await query('DELETE FROM refresh_tokens WHERE expires_at < NOW()');
    console.log('Expired refresh tokens cleaned up');
  } catch (err) {
    console.error('Token cleanup error:', err.message);
  }
});

const PORT = process.env.PORT || 5000;

const start = async () => {
  try {
    await runMigrations();
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
};

start();

module.exports = app;
