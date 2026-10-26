import { Router } from 'express';
import { z } from 'zod';
import { supabase, isSupabaseConfigured } from '../supabase.js';
import { demoStore } from '../demoStore.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    supabaseConnected: isSupabaseConfigured,
    mode: isSupabaseConfigured ? 'supabase_live' : 'interactive_prototype_store',
    timestamp: new Date().toISOString(),
  });
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    if (!req.businessId) {
      return res.json({
        user: req.user,
        membership: null,
        business: null,
        supabaseConnected: isSupabaseConfigured,
      });
    }

    if (req.isDemoMode || !isSupabaseConfigured) {
      const business = demoStore.businesses.find((b) => b.id === req.businessId) || demoStore.businesses[0];
      return res.json({
        user: req.user,
        membership: { role: req.userRole, display_name: req.membership?.display_name },
        business,
        supabaseConnected: isSupabaseConfigured,
        isDemoMode: true,
      });
    }

    const { data: business } = await supabase
      .from('businesses')
      .select('id, name, legal_name, timezone, currency_code, business_settings, created_at')
      .eq('id', req.businessId)
      .single();

    res.json({
      user: req.user,
      membership: { role: req.userRole, display_name: req.membership?.display_name },
      business,
      supabaseConnected: isSupabaseConfigured,
      isDemoMode: false,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const onboardSchema = z.object({
  businessName: z.string().trim().min(2).max(100),
});

router.post('/onboard', requireAuth, async (req, res) => {
  try {
    if (req.businessId) {
      return res.status(400).json({ error: 'User is already associated with an active business' });
    }

    const { businessName } = onboardSchema.parse(req.body);

    const { data: business, error: bizErr } = await supabase
      .from('businesses')
      .insert({ name: businessName })
      .select()
      .single();

    if (bizErr) throw bizErr;

    const { data: membership, error: memErr } = await supabase
      .from('business_memberships')
      .insert({
        business_id: business.id,
        user_id: req.user.id,
        role: 'owner',
        status: 'active',
        email: req.user.email || null,
        display_name: req.user.user_metadata?.name || 'Business Owner',
      })
      .select()
      .single();

    if (memErr) throw memErr;

    res.status(201).json({ business, membership });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
