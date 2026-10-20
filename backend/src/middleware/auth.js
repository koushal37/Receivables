import { supabase } from '../supabase.js';

export async function requireUser(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: 'Invalid or expired token' });

  req.user = data.user;
  next();
}

export async function requireMembership(req, res, next) {
  const { data, error } = await supabase
    .from('business_memberships')
    .select('role, business_id')
    .eq('user_id', req.user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (error) return res.status(500).json({ error: 'Could not load membership' });
  if (!data) return res.status(403).json({ error: 'No business' });

  req.membership = data;
  req.businessId = data.business_id; // Set businessId for invoice & collection routes
  next();
}

export function requireOwner(req, res, next) {
  if (req.membership.role !== 'owner') return res.status(403).json({ error: 'Owner only' });
  next();
}

// Chained middleware: authenticates the user AND attaches their business tenancy
export const requireAuth = [requireUser, requireMembership];