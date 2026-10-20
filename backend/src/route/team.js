import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../supabase.js';
import { requireUser, requireMembership, requireOwner } from '../middleware/auth.js';

const router = Router();
router.use(requireUser, requireMembership, requireOwner);

function normalizePhone(input) {
  const cleaned = input.replace(/[\s\-()]/g, '');
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

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('business_memberships')
    .select('id, role, status, display_name, phone, email, created_at')
    .eq('business_id', req.membership.business_id)
    .order('created_at');
  if (error) return res.status(500).json({ error: 'Could not load team' });
  res.json(data);
});

router.post('/', async (req, res) => {
  const parsed = addSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Check the name, email, role and a password of 8+ characters' });
  }
  const { name, email, role, tempPassword } = parsed.data;
  const phone = normalizePhone(parsed.data.phone);
  if (!phone) {
    return res.status(400).json({ error: 'Phone must be 10 digits, or start with + and the country code' });
  }

  const { data: created, error: uErr } = await supabase.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });
  if (uErr) return res.status(400).json({ error: uErr.message });

  const { error: mErr } = await supabase.from('business_memberships').insert({
    business_id: req.membership.business_id,
    user_id: created.user.id,
    role,
    display_name: name,
    phone,
    email,
  });
  if (mErr) {
    await supabase.auth.admin.deleteUser(created.user.id); // undo the login we just made
    if (mErr.code === '23505') {
      return res.status(409).json({ error: 'That phone number is already used in your team' });
    }
    console.error(mErr);
    return res.status(500).json({ error: 'Could not add team member' });
  }
  res.status(201).json({ ok: true });
});

export default router;