import express from 'express';
import { supabase } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// 1. FETCH RECENT MESSAGES FOR AN INVOICE OR CUSTOMER
router.get('/', requireAuth, async (req, res) => {
  try {
    const businessId = req.businessId;
    const { invoiceId, customerId } = req.query;

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
router.post('/send-reminder', requireAuth, async (req, res) => {
  try {
    const businessId = req.businessId;
    const { invoiceId } = req.body;

    if (!invoiceId) {
      return res.status(400).json({ error: 'Invoice ID is required' });
    }

    // A. Eligibility check from the ledger view
    const { data: inv, error: invErr } = await supabase
      .from('invoice_ledger_view')
      .select('*')
      .eq('id', invoiceId)
      .eq('business_id', businessId)
      .single();

    if (invErr || !inv) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (parseFloat(inv.outstanding_balance) <= 0) {
      return res.status(400).json({ error: 'Cannot send reminder: Invoice is already fully paid.' });
    }

    if (inv.payment_status === 'disputed') {
      return res.status(400).json({ error: 'Cannot send reminder: Invoice has an active dispute.' });
    }

    if (!inv.customer_phone) {
      return res.status(400).json({ error: 'Customer has no valid phone number recorded.' });
    }

    // B. Build the approved reminder message
    const formattedAmount = `₹${Number(inv.outstanding_balance).toLocaleString('en-IN')}`;
    const messageBody = `Hello ${inv.customer_name},\n\nOur records show that invoice ${inv.invoice_number} for ${formattedAmount} was due on ${inv.due_date} and remains outstanding.\n\nIf payment was already made, kindly share the UTR reference. If there are any discrepancies, please reply to this message.\n\nThank you!`;

    const token = process.env.META_WHATSAPP_TOKEN;
    const phoneId = process.env.META_PHONE_ID;
    let providerMessageId = `mock_wamid_${Date.now()}`;
    let messageStatus = 'delivered';

    // C. Dispatch via official Meta API if credentials exist, else use Dev Mock mode
    if (token && phoneId) {
      const cleanPhone = inv.customer_phone.replace(/[^0-9]/g, '');
      const metaRes = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: cleanPhone,
          type: 'text',
          text: { body: messageBody }
        })
      });

      const metaData = await metaRes.json();
      if (!metaRes.ok) {
        throw new Error(metaData?.error?.message || 'Meta API delivery failed');
      }
      providerMessageId = metaData.messages?.[0]?.id || providerMessageId;
      messageStatus = 'sent';
    }

    // D. Record the operation in message_logs
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
        delivered_at: messageStatus === 'delivered' ? new Date().toISOString() : null
      })
      .select()
      .single();

    if (logErr) throw logErr;

    res.json({ success: true, log });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;