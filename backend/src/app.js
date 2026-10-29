import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { ZodError } from 'zod';
import authRoutes from './routes/authRoutes.js';
import dashboardRoutes from './routes/dashboard.js';
import importRoutes from './routes/importRoutes.js';
import invoiceRoutes from './routes/invoices.js';
import invoiceDetailRoutes from './routes/invoiceDetailRoutes.js';
import messageRoutes from './routes/messages.js';
import paymentsRoutes from './routes/paymentsRoutes.js';
import reportsRoutes from './routes/reportsRoutes.js';
import teamRoutes from './routes/team.js';
import webhookRoutes from './routes/webhookRoutes.js';

export const app = express();

// Behind a hosting proxy (Render, Railway, Fly...), trust its X-Forwarded-For hop so
// rate limiting sees real client IPs. Set TRUST_PROXY=1 in production.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

// Security Headers
app.use(helmet());

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
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
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
}));

// Preserve raw body buffer for Meta Webhook HMAC validation.
// Imports carry parsed rows (incl. line items), so allow more than the 100kb default.
app.use(express.json({
  limit: '5mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Routes
app.use('/api', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/import', importRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/invoices', invoiceDetailRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/webhook', webhookRoutes);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// Error Handling Middleware
app.use((err, _req, res, _next) => {
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    return res.status(400).json({ error: `${issue.path.join('.') || 'input'}: ${issue.message}` });
  }
  const status = err.statusCode || err.status || 500;
  if (status >= 500) console.error('Unhandled Server Error:', err);
  res.status(status).json({ error: status >= 500 ? 'Internal Server Error' : err.message });
});
