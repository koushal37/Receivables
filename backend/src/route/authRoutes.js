import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/me', requireAuth, async (req, res) => {
  try {
    if (!req.businessId) {
      return res.json({ user: req.user, membership: null, business: null });
    }

    const { data: business } = await supabase
      .from('businesses')
      .select('id, name, created_at')
      .eq('id', req.businessId)
      .single();

    res.json({
      user: req.user,
      membership: { role: req.userRole },
      business
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/onboard - Initial business creation
const onboardSchema = z.object({
  businessName: z.string().trim().min(2).max(100)
});

router.post('/onboard', requireAuth, async (req, res) => {
  try {
    if (req.businessId) {
      return res.status(400).json({ error: 'User is already associated with an active business' });
    }

    const { businessName } = onboardSchema.parse(req.body);

    // 1. Create Business
    const { data: business, error: bizErr } = await supabase
      .from('businesses')
      .insert({ name: businessName })
      .select()
      .single();

    if (bizErr) throw bizErr;

    // 2. Associate Creator as Owner
    const { data: membership, error: memErr } = await supabase
      .from('memberships')
      .insert({
        business_id: business.id,
        user_id: req.user.id,
        role: 'owner',
        status: 'active'
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