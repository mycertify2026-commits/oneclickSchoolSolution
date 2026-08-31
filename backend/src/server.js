const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
require('dotenv').config();

const initDb = require('./config/initDb');
const { seedDemoData } = require('./config/seed-demo');
const authRoutes = require('./routes/authRoutes');
const walletRoutes = require('./routes/walletRoutes');
const bankDetailsRoutes = require('./routes/bankDetailsRoutes');
const studentRoutes = require('./routes/studentRoutes');
const certificateRoutes = require('./routes/certificateRoutes');
const schoolRoutes = require('./routes/schoolRoutes');
const distributorRoutes = require('./routes/distributorRoutes');
const masterDataRoutes = require('./routes/masterDataRoutes');
const reportRoutes = require('./routes/reportRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const cartRoutes = require('./routes/cartRoutes');
const superDistributorRoutes = require('./routes/superDistributorRoutes');

const app = express();

// Trust Replit's reverse proxy so express-rate-limit reads the correct client IP
app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: false }));

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));
app.use(morgan('dev'));

// General API rate limit - 300 requests per 15 min per IP
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false });
app.use('/api', apiLimiter);

// Stricter limit on login to slow down brute-force attempts
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many login attempts. Please try again later.' } });
app.use('/api/auth/login', loginLimiter);

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Swagger API docs
try {
  const swaggerDoc = YAML.load(path.join(__dirname, '..', 'docs', 'swagger.yaml'));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));
} catch (e) {
  console.warn('Swagger docs not loaded:', e.message);
}

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/bank-details', bankDetailsRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/certificates', certificateRoutes);
app.use('/api/schools', schoolRoutes);
app.use('/api/distributors', distributorRoutes);
app.use('/api/master-data', masterDataRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/super-distributors', superDistributorRoutes);
app.use('/api/camp-requests', require('./routes/campRoutes'));
app.use('/api/id-cards', require('./routes/idCardRoutes'));
app.use('/api/commission', require('./routes/commissionRoutes'));
app.use('/api/certificate-templates', require('./routes/certificateTemplateRoutes'));

// In production, serve the React build from the frontend directory
if (process.env.NODE_ENV === 'production') {
  const frontendBuild = path.join(__dirname, '..', '..', 'frontend', 'build');
  app.use(express.static(frontendBuild));
  // All non-API routes serve the React app (SPA client-side routing)
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendBuild, 'index.html'));
  });
} else {
  app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
}

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  if (err.message && err.message.includes('Only JPG, PNG')) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
const { isMysql, testConnection } = require('./config/db');
// MySQL mode (local XAMPP): schema is imported manually via phpMyAdmin (schema.mysql.sql),
// so the PostgreSQL auto-init is skipped — but connectivity is still verified.
// Tests import the Express app directly and must not open a second listening socket.
if (process.env.NODE_ENV !== 'test') {
  (isMysql ? testConnection() : initDb()).then(async () => {
    if (process.env.SEED_DEMO_DATA === 'true') {
      await seedDemoData({ closePool: false });
    }
    app.listen(PORT, () => {
      console.log(`One Click School Solutions backend running on http://localhost:${PORT}`);
      console.log(`API docs available at http://localhost:${PORT}/api-docs`);
    });
  }).catch(err => {
    console.error('Fatal: DB init failed, starting anyway:', err.message);
    app.listen(PORT, () => {
      console.log(`One Click School Solutions backend running on http://localhost:${PORT}`);
      console.log(`API docs available at http://localhost:${PORT}/api-docs`);
    });
  });
}

module.exports = app;
