import crypto from 'crypto';
import { supabase, isSupabaseConfigured } from '../supabase.js';
import { demoStore, getDemoLedgerInvoices } from '../demoStore.js';

export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

    // 1. Handle Demo Token or Unconfigured Supabase Fallback
    if (!isSupabaseConfigured || (token && token.startsWith('demo-token'))) {
      const demoRole = req.headers['x-demo-role'] || 'owner';
      const mem = demoStore.memberships.find((m) => m.role === demoRole) || demoStore.memberships[0];
      req.user = {
        id: mem.user_id,
        email: mem.email,
        user_metadata: { name: mem.display_name },
      };
      req.businessId = mem.business_id;
      req.userRole = mem.role;
      req.membership = mem;
      req.isDemoMode = true;
      return next();
    }

    if (!token) {
      return res.status(401).json({ error: 'Missing or malformed Authorization header' });
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired authentication token' });
    }

    req.user = user;

    // Fetch active business membership (supports both business_memberships and memberships)
    let { data: membership, error: memErr } = await supabase
      .from('business_memberships')
      .select('id, business_id, role, status, display_name, phone, email')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (memErr && memErr.code === '42P01') {
      const fallback = await supabase
        .from('memberships')
        .select('id, business_id, role, status')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();
      membership = fallback.data;
    }

    if (membership) {
      req.businessId = membership.business_id;
      req.userRole = membership.role;
      req.membership = membership;
    }

    next();
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ error: 'Internal authentication error' });
  }
};

export const requireBusiness = (req, res, next) => {
  if (!req.businessId) {
    return res.status(403).json({ error: 'No business associated with this account', code: 'NO_BUSINESS' });
  }
  next();
};

export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.userRole || !allowedRoles.includes(req.userRole)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges for role ' + (req.userRole || 'none') });
    }
    next();
  };
};

// Backwards-compatible aliases used in team.js
export const requireUser = requireAuth;
export const requireMembership = requireBusiness;
export const requireOwner = requireRole('owner');

// Tenant Isolation Guards
export const assertInvoiceInBusiness = async (invoiceId, businessId) => {
  if (!isSupabaseConfigured) {
    const inv = getDemoLedgerInvoices(businessId).find((i) => i.id === invoiceId);
    if (!inv) {
      const notFound = new Error('Invoice not found in the authenticated business scope');
      notFound.statusCode = 404;
      throw notFound;
    }
    return inv;
  }

  const { data, error } = await supabase
    .from('invoice_ledger_view')
    .select('*')
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
  if (!isSupabaseConfigured) {
    const cust = demoStore.customers.find((c) => c.id === customerId && c.business_id === businessId);
    if (!cust) {
      const notFound = new Error('Customer not found in the authenticated business scope');
      notFound.statusCode = 404;
      throw notFound;
    }
    return cust;
  }

  const { data, error } = await supabase
    .from('customers')
    .select('*')
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

export const audit = async ({ businessId, userId, action, entity, entityId = null, beforeState = null, afterState = null }) => {
  try {
    if (!isSupabaseConfigured) {
      demoStore.audit_logs.unshift({
        id: crypto.randomUUID(),
        business_id: businessId,
        user_id: userId,
        action,
        entity,
        entity_id: entityId,
        before_state: beforeState,
        after_state: afterState,
        created_at: new Date().toISOString(),
      });
      return;
    }

    await supabase.from('audit_logs').insert({
      business_id: businessId,
      user_id: userId,
      action,
      entity,
      entity_id: entityId,
      before_state: beforeState,
      after_state: afterState,
    });
  } catch (err) {
    console.error('Failed to log audit event:', err);
  }
};
