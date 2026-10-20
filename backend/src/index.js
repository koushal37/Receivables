import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { supabase } from './supabase.js';
import { requireUser } from './middleware/auth.js';
import teamRoutes from './route/team.js';
import invoiceRoutes from './route/invoices.js';
import { requireAuth } from './middleware/auth.js';
import dashboardRoutes from './route/dashboard.js';
import messageRoutes from './route/messages.js';
import webhookRoutes from './route/webhook.js';


const app = express();
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());
app.use('/api/team', teamRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/webhook', webhookRoutes);


app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/db-check', async (_req, res) => {
  const { error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true });
});

// Find the business this user belongs to (or null)
async function getMembership(userId) {
  const { data, error } = await supabase
    .from('business_memberships')
    .select('role, business:businesses(id, name, timezone, currency_code)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

app.get('/api/me', requireUser, async (req, res) => {
  try {
    const membership = await getMembership(req.user.id);
    res.json({ user: { id: req.user.id, email: req.user.email }, membership });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load profile' });
  }
});

const onboardSchema = z.object({ name: z.string().trim().min(2).max(100) });

app.post('/api/onboard', requireUser, async (req, res) => {
  const parsed = onboardSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Business name must be 2 to 100 characters' });
  }
  try {
    if (await getMembership(req.user.id)) {
      return res.status(409).json({ error: 'You already have a business' });
    }
    const { data: business, error: bErr } = await supabase
      .from('businesses')
      .insert({ name: parsed.data.name })
      .select('id')
      .single();
    if (bErr) throw bErr;

    const { error: mErr } = await supabase
      .from('business_memberships')
      .insert({ business_id: business.id, user_id: req.user.id, role: 'owner' });
    if (mErr) {
      await supabase.from('businesses').delete().eq('id', business.id); // undo
      throw mErr;
    }
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not create business' });
  }
});

const port = process.env.PORT || 5001;
app.listen(port, () => console.log(`API on :${port}`));