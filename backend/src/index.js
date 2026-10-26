import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import authRoutes from './route/authRoutes.js';
import importRoutes from './route/importRoutes.js';
import paymentsRoutes from './route/paymentsRoutes.js';
import invoiceDetailRoutes from './route/invoiceDetailRoutes.js';
import webhookRoutes from './route/webhookRoutes.js';
import reportsRoutes from './route/reportsRoutes.js';
import { initDailyJobs } from './engine/dailyJobs.js';

dotenv.config();

const app = express();

// Security Headers
app.use(helmet());

const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : ['http://localhost:5173'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS policy'));
    }
  },
  credentials: true
}));

// Rate Limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(generalLimiter);

// Preserve raw body buffer for Meta Webhook HMAC validation
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));

// Routes
app.use('/api', authRoutes);
app.use('/api/import', importRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/invoices', invoiceDetailRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/reports', reportsRoutes);

// Error Handling Middleware
app.use((err, req, res, _next) => {
  console.error('Unhandled Server Error:', err);
  const status = err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Internal Server Error' });
});

// Initialize Cron Jobs
initDailyJobs();

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Receivables backend running on port ${PORT}`);
});