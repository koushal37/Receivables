import express from 'express';
import crypto from 'crypto';
import { supabase, isSupabaseConfigured } from '../supabase.js';
import { demoStore, getDemoLedgerInvoices } from '../demoStore.js';
import { requireAuth, requireBusiness, requireRole, audit } from '../middleware/auth.js';

const router = express.Router();

// 1. FETCH RECENT MESSAGES
router.get('/', requireAuth, requireBusiness, async (req, res) => {
  try {
    const businessId = req.businessId;
    const { invoiceId, customerId } = req.query;

    if (req.isDemoMode || !isSupabaseConfigured) {
      let logs = demoStore.messages.filter((m) => m.business_id === businessId);
      if (invoiceId) logs = logs.filter((m) => m.invoice_id === invoiceId);
      if (customerId) logs = logs.filter((m) => m.customer_id === customerId);
      return res.json({ messages: logs });
    }

    let query = supabase
      .from('message_logs')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });

    if (invoiceId) query = query.eq('invoice_id', invoiceId);
    if (customerId) query = query.eq('customer_id', customerId);

    const { data, error } = await query;
    if (error) throw error;

    res.json({ messages: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. SEND OUTBOUND WHATSAPP REMINDER
router.post('/send-reminder', requireAuth, requireBusiness, requireRole('owner', 'employee'), async (req, res) => {
  try {
    const businessId = req.businessId;
    const { invoiceId, customMessage } = req.body;

    if (!invoiceId) {
      return res.status(400).json({ error: 'Invoice ID is required' });
    }

    let inv;
    if (req.isDemoMode || !isSupabaseConfigured) {
      inv = getDemoLedgerInvoices(businessId).find((i) => i.id === invoiceId);
    } else {
      const { data, error } = await supabase
        .from('invoice_ledger_view')
        .select('*')
        .eq('id', invoiceId)
        .eq('business_id', businessId)
        .single();
      if (!error) inv = data;
    }

    if (!inv) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const balance = parseFloat(inv.outstanding_balance ?? inv.outstanding_amount ?? 0);
    if (balance <= 0) {
      return res.status(400).json({ error: 'Cannot send reminder: Invoice is already fully paid.' });
    }

    if (inv.payment_status === 'disputed' || inv.computed_status === 'disputed') {
      return res.status(400).json({ error: 'Cannot send reminder: Invoice has an active dispute.' });
    }

    if (inv.customer_opt_out) {
      return res.status(400).json({ error: 'Cannot send reminder: Customer has opted out of WhatsApp communications (STOP).' });
    }

    if (!inv.customer_phone) {
      return res.status(400).json({ error: 'Customer has no valid phone number recorded.' });
    }

    const formattedAmount = `₹${Number(balance).toLocaleString('en-IN')}`;
    const messageBody =
      customMessage ||
      `Hello ${inv.customer_name},\n\nOur records show that invoice ${inv.invoice_number} for ${formattedAmount} (due on ${inv.due_date}) remains outstanding.\n\nIf payment was already made, kindly share the UTR reference so we can update our ledger. If there is any discrepancy, please reply to this message.\n\nThank you!`;

    const token = process.env.META_WHATSAPP_TOKEN;
    const phoneId = process.env.META_PHONE_ID;
    let providerMessageId = `wamid.mock_${Date.now()}`;
    let messageStatus = 'delivered';

    if (token && phoneId && !token.includes('your-meta')) {
      const cleanPhone = inv.customer_phone.replace(/[^0-9]/g, '');
      const metaRes = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: cleanPhone,
          type: 'text',
          text: { body: messageBody },
        }),
      });

      const metaData = await metaRes.json();
      if (!metaRes.ok) {
        throw new Error(metaData?.error?.message || 'Meta API delivery failed');
      }
      providerMessageId = metaData.messages?.[0]?.id || providerMessageId;
      messageStatus = 'sent';
    }

    if (req.isDemoMode || !isSupabaseConfigured) {
      const newLog = {
        id: crypto.randomUUID(),
        business_id: businessId,
        customer_id: inv.customer_id,
        invoice_id: inv.id,
        direction: 'outbound',
        channel: 'whatsapp',
        template_name: 'standard_payment_reminder',
        message_content: messageBody,
        provider_message_id: providerMessageId,
        status: messageStatus,
        sent_at: new Date().toISOString(),
        delivered_at: messageStatus === 'delivered' ? new Date().toISOString() : null,
        created_at: new Date().toISOString(),
      };
      demoStore.messages.unshift(newLog);
      await audit({
        businessId,
        userId: req.user.id,
        action: 'WHATSAPP_REMINDER_SENT',
        entity: 'message_logs',
        entityId: newLog.id,
        afterState: { invoice_number: inv.invoice_number, to: inv.customer_phone },
      });
      return res.json({ success: true, log: newLog });
    }

    const { data: log, error: logErr } = await supabase
      .from('message_logs')
      .insert({
        business_id: businessId,
        customer_id: inv.customer_id,
        invoice_id: inv.id,
        direction: 'outbound',
        channel: 'whatsapp',
        template_name: 'standard_payment_reminder',
        message_content: messageBody,
        provider_message_id: providerMessageId,
        status: messageStatus,
        sent_at: new Date().toISOString(),
        delivered_at: messageStatus === 'delivered' ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (logErr) throw logErr;

    res.json({ success: true, log });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. SIMULATE INBOUND CUSTOMER REPLY WITH AI CLASSIFICATION
router.post('/simulate-reply', requireAuth, requireBusiness, requireRole('owner', 'employee'), async (req, res) => {
  try {
    const businessId = req.businessId;
    const { invoiceId, replyText } = req.body;

    if (!invoiceId || !replyText) {
      return res.status(400).json({ error: 'Invoice ID and reply text are required.' });
    }

    const textUpper = replyText.trim().toUpperCase();
    let classification = 'clarification_requested';
    let confidence = 0.88;
    let suggestedAction = 'Review customer message and respond from invoice timeline.';

    if (textUpper === 'STOP' || textUpper.includes('UNSUBSCRIBE') || textUpper.includes('DO NOT MESSAGE')) {
      classification = 'opt_out_request';
      confidence = 0.99;
      suggestedAction = 'Customer opted out. Suppress automated WhatsApp reminders.';
    } else if (textUpper.includes('UTR') || textUpper.includes('PAID') || textUpper.includes('TRANSFERRED') || textUpper.includes('NEFT') || textUpper.includes('RTGS')) {
      classification = 'payment_made_verification_required';
      confidence = 0.94;
      suggestedAction = 'Verify UTR in bank statement and record confirmed payment.';
    } else if (textUpper.includes('FRIDAY') || textUpper.includes('TOMORROW') || textUpper.includes('NEXT WEEK') || textUpper.includes('PROMISE') || textUpper.includes('RELEASE')) {
      classification = 'payment_promised';
      confidence = 0.91;
      suggestedAction = 'Log payment promise date so the queue tracks commitment.';
    } else if (textUpper.includes('DAMAGED') || textUpper.includes('RATE') || textUpper.includes('DISPUTE') || textUpper.includes('WRONG') || textUpper.includes('SHORT')) {
      classification = 'invoice_dispute';
      confidence = 0.93;
      suggestedAction = 'Flag invoice dispute to pause automated reminders pending review.';
    }

    if (req.isDemoMode || !isSupabaseConfigured) {
      const inv = getDemoLedgerInvoices(businessId).find((i) => i.id === invoiceId);
      if (!inv) return res.status(404).json({ error: 'Invoice not found' });

      if (classification === 'opt_out_request') {
        const cust = demoStore.customers.find((c) => c.id === inv.customer_id);
        if (cust) cust.opt_out = true;
      }

      const inboundLog = {
        id: crypto.randomUUID(),
        business_id: businessId,
        customer_id: inv.customer_id,
        invoice_id: inv.id,
        direction: 'inbound',
        channel: 'whatsapp',
        message_content: replyText.trim(),
        status: 'received',
        ai_classification: classification,
        created_at: new Date().toISOString(),
      };
      demoStore.messages.unshift(inboundLog);

      return res.json({
        success: true,
        log: inboundLog,
        aiClassification: {
          category: classification,
          confidence,
          suggestedAction,
          needsHumanReview: true,
        },
      });
    }

    const { data: inv } = await supabase
      .from('invoice_ledger_view')
      .select('*')
      .eq('id', invoiceId)
      .eq('business_id', businessId)
      .single();

    if (!inv) return res.status(404).json({ error: 'Invoice not found' });

    if (classification === 'opt_out_request') {
      await supabase.from('customers').update({ opt_out: true }).eq('id', inv.customer_id);
    }

    const { data: log, error } = await supabase
      .from('message_logs')
      .insert({
        business_id: businessId,
        customer_id: inv.customer_id,
        invoice_id: inv.id,
        direction: 'inbound',
        channel: 'whatsapp',
        message_content: replyText.trim(),
        status: 'received',
      })
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      log,
      aiClassification: {
        category: classification,
        confidence,
        suggestedAction,
        needsHumanReview: true,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
