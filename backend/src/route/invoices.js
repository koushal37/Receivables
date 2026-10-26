import express from 'express';
import crypto from 'crypto';
import { supabase, isSupabaseConfigured } from '../supabase.js';
import { demoStore, getDemoLedgerInvoices, getISTDateString } from '../demoStore.js';
import { requireAuth, requireBusiness, requireRole, assertInvoiceInBusiness, audit } from '../middleware/auth.js';

const router = express.Router();

// 1. GET ALL INVOICES
router.get('/', requireAuth, requireBusiness, async (req, res) => {
  try {
    const businessId = req.businessId;
    const { status, search, customerId } = req.query;

    if (req.isDemoMode || !isSupabaseConfigured) {
      let rows = getDemoLedgerInvoices(businessId);
      if (customerId) rows = rows.filter((r) => r.customer_id === customerId);
      if (status && status !== 'all') {
        rows = rows.filter((r) => r.payment_status === status || r.computed_status === status);
      }
      if (search) {
        const q = search.toLowerCase();
        rows = rows.filter(
          (r) =>
            r.customer_name?.toLowerCase().includes(q) ||
            r.invoice_number?.toLowerCase().includes(q)
        );
      }
      rows.sort((a, b) => a.due_date.localeCompare(b.due_date));
      return res.json(rows);
    }

    let query = supabase
      .from('invoice_ledger_view')
      .select('*')
      .eq('business_id', businessId)
      .order('due_date', { ascending: true });

    if (customerId) query = query.eq('customer_id', customerId);
    if (status && status !== 'all') {
      query = query.eq('payment_status', status);
    }
    if (search) {
      query = query.or(`customer_name.ilike.%${search}%,invoice_number.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. CREATE MANUAL INVOICE
router.post('/', requireAuth, requireBusiness, requireRole('owner', 'employee'), async (req, res) => {
  try {
    const businessId = req.businessId;
    const { customerName, customerPhone, customerEmail, invoiceNumber, invoiceDate, dueDate, amount } = req.body;

    if (!customerName || !invoiceNumber || !dueDate || !amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Customer name, invoice number, due date, and positive amount are required.' });
    }

    if (req.isDemoMode || !isSupabaseConfigured) {
      let cust = demoStore.customers.find(
        (c) => c.business_id === businessId && c.name.toLowerCase() === customerName.trim().toLowerCase()
      );
      if (!cust) {
        cust = {
          id: crypto.randomUUID(),
          business_id: businessId,
          name: customerName.trim(),
          phone: customerPhone || '+919000000000',
          email: customerEmail || null,
          preferred_channel: 'whatsapp',
          communication_permission_status: 'granted',
          opt_out: false,
          created_at: new Date().toISOString(),
        };
        demoStore.customers.push(cust);
      }

      const newInv = {
        id: crypto.randomUUID(),
        business_id: businessId,
        customer_id: cust.id,
        invoice_number: invoiceNumber.trim(),
        invoice_date: invoiceDate || getISTDateString(0),
        due_date: dueDate,
        original_amount: Number(amount),
        amount: Number(amount),
        record_status: 'active',
        status: 'unpaid',
        created_at: new Date().toISOString(),
      };
      demoStore.invoices.unshift(newInv);
      return res.status(201).json(newInv);
    }

    // Upsert customer in Supabase
    let customerId;
    const { data: existingCust } = await supabase
      .from('customers')
      .select('id')
      .eq('business_id', businessId)
      .ilike('name', customerName.trim())
      .maybeSingle();

    if (existingCust) {
      customerId = existingCust.id;
    } else {
      const { data: createdCust, error: cErr } = await supabase
        .from('customers')
        .insert({
          business_id: businessId,
          name: customerName.trim(),
          phone: customerPhone || null,
          email: customerEmail || null,
        })
        .select('id')
        .single();
      if (cErr) throw cErr;
      customerId = createdCust.id;
    }

    const { data: createdInv, error: iErr } = await supabase
      .from('invoices')
      .insert({
        business_id: businessId,
        customer_id: customerId,
        invoice_number: invoiceNumber.trim(),
        invoice_date: invoiceDate || getISTDateString(0),
        due_date: dueDate,
        original_amount: Number(amount),
        amount: Number(amount),
        record_status: 'active',
        status: 'unpaid',
      })
      .select()
      .single();

    if (iErr) throw iErr;
    res.status(201).json(createdInv);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 3. GET UNIFIED TIMELINE FOR AN INVOICE
router.get('/:id/timeline', requireAuth, requireBusiness, async (req, res) => {
  try {
    const invoice = await assertInvoiceInBusiness(req.params.id, req.businessId);

    if (req.isDemoMode || !isSupabaseConfigured) {
      const pmts = demoStore.payments.filter((p) => p.invoice_id === invoice.id);
      const promises = demoStore.promises.filter((pr) => pr.invoice_id === invoice.id);
      const disputes = demoStore.disputes.filter((d) => d.invoice_id === invoice.id);
      const msgs = demoStore.messages.filter((m) => m.invoice_id === invoice.id);

      const timeline = [
        {
          type: 'created',
          date: invoice.created_at || invoice.invoice_date,
          details: { note: `Invoice ${invoice.invoice_number} issued for ₹${Number(invoice.original_amount).toLocaleString('en-IN')}` },
        },
        ...pmts.map((p) => ({ type: 'payment', date: p.payment_date || p.created_at, details: p })),
        ...promises.map((pr) => ({ type: 'promise', date: pr.created_at, details: pr })),
        ...disputes.map((d) => ({ type: 'dispute', date: d.created_at, details: d })),
        ...msgs.map((m) => ({ type: 'message', date: m.created_at, details: m })),
      ].sort((a, b) => new Date(b.date) - new Date(a.date));

      return res.json({ invoice, timeline });
    }

    const [pmts, promises, disputes, msgs] = await Promise.all([
      supabase.from('payments').select('*').eq('invoice_id', invoice.id).order('created_at', { ascending: false }),
      supabase.from('payment_promises').select('*').eq('invoice_id', invoice.id).order('created_at', { ascending: false }),
      supabase.from('disputes').select('*').eq('invoice_id', invoice.id).order('created_at', { ascending: false }),
      supabase.from('message_logs').select('*').eq('invoice_id', invoice.id).order('created_at', { ascending: false }),
    ]);

    const timeline = [
      {
        type: 'created',
        date: invoice.created_at || invoice.invoice_date,
        details: { note: `Invoice ${invoice.invoice_number} issued for ₹${Number(invoice.original_amount).toLocaleString('en-IN')}` },
      },
      ...(pmts.data || []).map((p) => ({ type: 'payment', date: p.payment_date || p.created_at, details: p })),
      ...(promises.data || []).map((pr) => ({ type: 'promise', date: pr.created_at, details: pr })),
      ...(disputes.data || []).map((d) => ({ type: 'dispute', date: d.created_at, details: d })),
      ...(msgs.data || []).map((m) => ({ type: 'message', date: m.created_at, details: m })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({ invoice, timeline });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// 4. VOID INVOICE (Owner Only)
router.post('/:id/void', requireAuth, requireBusiness, requireRole('owner'), async (req, res) => {
  try {
    const invoice = await assertInvoiceInBusiness(req.params.id, req.businessId);
    const { reason } = req.body;

    if (req.isDemoMode || !isSupabaseConfigured) {
      const target = demoStore.invoices.find((i) => i.id === invoice.id);
      if (target) {
        target.record_status = 'void';
        target.status = 'void';
      }
      await audit({
        businessId: req.businessId,
        userId: req.user.id,
        action: 'INVOICE_VOIDED',
        entity: 'invoices',
        entityId: invoice.id,
        afterState: { reason },
      });
      return res.json({ success: true });
    }

    await supabase
      .from('invoices')
      .update({ record_status: 'void', status: 'void' })
      .eq('id', invoice.id)
      .eq('business_id', req.businessId);

    await audit({
      businessId: req.businessId,
      userId: req.user.id,
      action: 'INVOICE_VOIDED',
      entity: 'invoices',
      entityId: invoice.id,
      afterState: { reason },
    });

    res.json({ success: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

export default router;
