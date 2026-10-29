import { supabase } from '../supabase.js';

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

// Authenticates Supabase Auth token and sets req.user, req.businessId & req.userRole
export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or malformed Authorization header' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user } = {}, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired authentication token' });
    }

    req.user = user;

    // Fetch active business membership (oldest wins if a user somehow has several)
    const { data: memberships, error: memErr } = await supabase
      .from('business_memberships')
      .select('business_id, role, status')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1);

    if (memErr) throw memErr;

    const membership = memberships?.[0];
    if (membership) {
      req.businessId = membership.business_id;
      req.userRole = membership.role;
    }

    next();
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ error: 'Internal authentication error' });
  }
};

// Gate check for onboarded businesses
export const requireBusiness = (req, res, next) => {
  if (!req.businessId) {
    return res.status(403).json({ error: 'No business associated with this account', code: 'NO_BUSINESS' });
  }
  next();
};

// Role-based Access Control Guard (owner, employee, read_only)
export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.userRole || !allowedRoles.includes(req.userRole)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
    }
    next();
  };
};

// Convenience stacks
export const canRead = [requireAuth, requireBusiness];
export const canWrite = [requireAuth, requireBusiness, requireRole('owner', 'employee')];
export const ownerOnly = [requireAuth, requireBusiness, requireRole('owner')];

// Tenant Isolation Guards
export const assertInvoiceInBusiness = async (invoiceId, businessId) => {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, business_id, customer_id, original_amount, record_status')
    .eq('id', invoiceId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (error || !data) throw httpError(404, 'Invoice not found in the authenticated business scope');
  return data;
};

export const assertCustomerInBusiness = async (customerId, businessId) => {
  const { data, error } = await supabase
    .from('customers')
    .select('id, business_id, name, phone, opt_out')
    .eq('id', customerId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (error || !data) throw httpError(404, 'Customer not found in the authenticated business scope');
  return data;
};

// Mutating Route Audit Trail Helper
export const audit = async ({ businessId, userId, action, entity, entityId = null, beforeState = null, afterState = null }) => {
  const { error } = await supabase.from('audit_logs').insert({
    business_id: businessId,
    user_id: userId,
    action,
    entity,
    entity_id: entityId,
    before_state: beforeState,
    after_state: afterState
  });
  if (error) console.error('Failed to log audit event:', error.message);
};
