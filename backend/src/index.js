import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import authRoutes from './route/authRoutes.js';
import dashboardRoutes from './route/dashboard.js';
import invoicesRoutes from './route/invoices.js';
import importRoutes from './route/importRoutes.js';
import paymentsRoutes from './route/paymentsRoutes.js';
import messagesRoutes from './route/messages.js';
import teamRoutes from './route/team.js';
import webhookRoutes from './route/webhookRoutes.js';
import reportsRoutes from './route/reportsRoutes.js';
import { initDailyJobs } from './engine/dailyJobs.js';
import { isSupabaseConfigured } from './supabase.js';

dotenv.config();

const app = express();

// Security Headers
app.use(helmet());

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
  : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173'];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        callback(null, true);
      } else {
        callback(null, true); // Allow preview hosts during prototype testing
      }
    },
    credentials: true,
  })
);

// Rate Limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(generalLimiter);

// Preserve raw body buffer for Meta Webhook HMAC validation
app.use(
  express.json({
    limit: '10mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Mount All Backend Routes
app.use('/api', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/invoices', invoicesRoutes);
app.use('/api/import', importRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/reports', reportsRoutes);

// Error Handling Middleware
app.use((err, _req, res, _next) => {
  console.error('Unhandled Server Error:', err);
  const status = err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Internal Server Error' });
});

// Initialize Cron Jobs
initDailyJobs();

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`\n✅ Receivables Recovery Backend running on http://localhost:${PORT}`);
  console.log(`   Database Mode: ${isSupabaseConfigured ? '🟢 Live Supabase PostgreSQL' : '🟡 Interactive Prototype Store (No 502 Errors)'}\n`);
});

export default app;
