import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { supabase, isSupabaseConfigured } from '../supabase.js';
import { demoStore } from '../demoStore.js';
import { requireAuth, requireBusiness, requireRole, audit } from '../middleware/auth.js';

const router = Router();

function normalizePhone(input) {
  const cleaned = String(input || '').replace(/[\s\-()]/g, '');
  if (/^\d{10}$/.test(cleaned)) return `+91${cleaned}`;
  if (/^\+[1-9]\d{7,14}$/.test(cleaned)) return cleaned;
  return null;
}

const addSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(1),
  role: z.enum(['employee', 'read_only']),
  tempPassword: z.string().min(8).max(72),
});

router.get('/', requireAuth, requireBusiness, async (req, res) => {
  try {
    if (req.isDemoMode || !isSupabaseConfigured) {
      return res.json(demoStore.memberships.filter((m) => m.business_id === req.businessId));
    }

    const { data, error } = await supabase
      .from('business_memberships')
      .select('id, role, status, display_name, phone, email, created_at')
      .eq('business_id', req.businessId)
      .order('created_at');

    if (error) return res.status(500).json({ error: 'Could not load team: ' + error.message });
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireAuth, requireBusiness, requireRole('owner'), async (req, res) => {
  try {
    const parsed = addSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Check the name, email, role and a password of 8+ characters' });
    }
    const { name, email, role, tempPassword } = parsed.data;
    const phone = normalizePhone(parsed.data.phone);
    if (!phone) {
      return res.status(400).json({ error: 'Phone must be 10 digits, or start with + and the country code' });
    }

    if (req.isDemoMode || !isSupabaseConfigured) {
      const newMember = {
        id: crypto.randomUUID(),
        business_id: req.businessId,
        user_id: crypto.randomUUID(),
        role,
        status: 'active',
        display_name: name,
        phone,
        email,
        created_at: new Date().toISOString(),
      };
      demoStore.memberships.push(newMember);
      await audit({
        businessId: req.businessId,
        userId: req.user.id,
        action: 'TEAM_MEMBER_ADDED',
        entity: 'business_memberships',
        entityId: newMember.id,
        afterState: { name, email, role },
      });
      return res.status(201).json({ ok: true, member: newMember });
    }

    const { data: created, error: uErr } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });
    if (uErr) return res.status(400).json({ error: uErr.message });

    const { data: mem, error: mErr } = await supabase
      .from('business_memberships')
      .insert({
        business_id: req.businessId,
        user_id: created.user.id,
        role,
        status: 'active',
        display_name: name,
        phone,
        email,
      })
      .select()
      .single();

    if (mErr) {
      await supabase.auth.admin.deleteUser(created.user.id);
      if (mErr.code === '23505') {
        return res.status(409).json({ error: 'That phone number or user is already used in your team' });
      }
      return res.status(500).json({ error: 'Could not add team member: ' + mErr.message });
    }
    res.status(201).json({ ok: true, member: mem });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle active/revoked status
router.post('/:id/toggle-status', requireAuth, requireBusiness, requireRole('owner'), async (req, res) => {
  try {
    if (req.isDemoMode || !isSupabaseConfigured) {
      const m = demoStore.memberships.find((x) => x.id === req.params.id && x.business_id === req.businessId);
      if (!m) return res.status(404).json({ error: 'Member not found' });
      if (m.role === 'owner') return res.status(400).json({ error: 'Cannot revoke owner account' });
      m.status = m.status === 'active' ? 'revoked' : 'active';
      return res.json({ ok: true, status: m.status });
    }

    const { data: m } = await supabase
      .from('business_memberships')
      .select('id, role, status')
      .eq('id', req.params.id)
      .eq('business_id', req.businessId)
      .single();

    if (!m) return res.status(404).json({ error: 'Member not found' });
    if (m.role === 'owner') return res.status(400).json({ error: 'Cannot revoke owner account' });

    const nextStatus = m.status === 'active' ? 'revoked' : 'active';
    await supabase.from('business_memberships').update({ status: nextStatus }).eq('id', m.id);
    res.json({ ok: true, status: nextStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
