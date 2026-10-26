import { supabase } from '../supabase.js';

// Authenticates Supabase Auth token and sets req.user & req.businessId
export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or malformed Authorization header' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired authentication token' });
    }

    req.user = user;

    // Fetch active business membership
    const { data: membership, error: memErr } = await supabase
      .from('memberships')
      .select('business_id, role, status')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (memErr) throw memErr;

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

// Tenant Isolation Guards
export const assertInvoiceInBusiness = async (invoiceId, businessId) => {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, business_id, amount, status')
    .eq('id', invoiceId)
    .eq('business_id', businessId)
    .single();

  if (error || !data) {
    const notFound = new Error('Invoice not found in the authenticated business scope');
    notFound.statusCode = 404;
    throw notFound;
  }
  return data;
};

export const assertCustomerInBusiness = async (customerId, businessId) => {
  const { data, error } = await supabase
    .from('customers')
    .select('id, business_id, name, phone, opt_out')
    .eq('id', customerId)
    .eq('business_id', businessId)
    .single();

  if (error || !data) {
    const notFound = new Error('Customer not found in the authenticated business scope');
    notFound.statusCode = 404;
    throw notFound;
  }
  return data;
};

// Mutating Route Audit Trail Helper
export const audit = async ({ businessId, userId, action, entity, entityId, beforeState = null, afterState = null }) => {
  try {
    await supabase.from('audit_logs').insert({
      business_id: businessId,
      user_id: userId,
      action,
      entity,
      entity_id: entityId,
      before_state: beforeState,
      after_state: afterState
    });
  } catch (err) {
    console.error('Failed to log audit event:', err);
  }
};