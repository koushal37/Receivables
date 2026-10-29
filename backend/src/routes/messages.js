import express from 'express';
import { z } from 'zod';
import { supabase } from '../supabase.js';
import { canRead, canWrite, audit } from '../middleware/auth.js';

const router = express.Router();
const REMINDER_COOLDOWN_HOURS = 24;

// 1. FETCH RECENT MESSAGES FOR AN INVOICE OR CUSTOMER
router.get('/', ...canRead, async (req, res, next) => {
  try {
    const { invoiceId, customerId } = req.query;

    let query = supabase
      .from('message_logs')
      .select('*')
      .eq('business_id', req.businessId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (invoiceId) query = query.eq('invoice_id', String(invoiceId));
    if (customerId) query = query.eq('customer_id', String(customerId));

    const { data, error } = await query;
    if (error) throw error;

    res.json({ messages: data || [] });
  } catch (err) {
    next(err);
  }
});

export function buildReminderText(inv) {
  const formattedAmount = `₹${Number(inv.outstanding_balance).toLocaleString('en-IN')}`;
  return `Hello ${inv.customer_name},\n\nOur records show that invoice ${inv.invoice_number} for ${formattedAmount} was due on ${inv.due_date} and remains outstanding.\n\nIf payment was already made, kindly share the UTR reference. If there are any discrepancies, please reply to this message.\n\nThank you!`;
}

// 2. SEND OUTBOUND WHATSAPP REMINDER
router.post('/send-reminder', ...canWrite, async (req, res, next) => {
  try {
    const { invoiceId } = z.object({ invoiceId: z.string().uuid() }).parse(req.body);

    // A. Eligibility check from the ledger view
    const { data: inv, error: invErr } = await supabase
      .from('invoice_ledger_view')
      .select('*')
      .eq('id', invoiceId)
      .eq('business_id', req.businessId)
      .maybeSingle();

    if (invErr || !inv) return res.status(404).json({ error: 'Invoice not found' });
    if (Number(inv.outstanding_balance) <= 0) return res.status(400).json({ error: 'Invoice is already fully paid.' });
    if (inv.payment_status === 'disputed') return res.status(400).json({ error: 'Invoice has an active dispute.' });
    if (!inv.customer_phone) return res.status(400).json({ error: 'Customer has no phone number recorded.' });
    if (inv.customer_opt_out) return res.status(400).json({ error: 'Customer has opted out of WhatsApp messages.' });

    // B. Frequency cap: no duplicate reminder for the same invoice inside the cooldown window
    const since = new Date(Date.now() - REMINDER_COOLDOWN_HOURS * 3600 * 1000).toISOString();
    const { data: recent } = await supabase
      .from('message_logs')
      .select('id')
      .eq('business_id', req.businessId)
      .eq('invoice_id', inv.id)
      .eq('direction', 'outbound')
      .gte('created_at', since)
      .limit(1);
    if (recent?.length) {
      return res.status(429).json({ error: `A reminder was already sent in the last ${REMINDER_COOLDOWN_HOURS} hours.` });
    }

    const messageBody = buildReminderText(inv);
    const token = process.env.META_WHATSAPP_TOKEN;
    const phoneId = process.env.META_PHONE_ID;
    const templateName = process.env.META_REMINDER_TEMPLATE;
    let providerMessageId = `mock_wamid_${Date.now()}`;
    let messageStatus = 'delivered';

    // C. Dispatch via Meta API if credentials exist, else Dev Mock mode.
    // Business-initiated messages need an approved template outside the 24h window.
    if (token && phoneId) {
      const to = inv.customer_phone.replace(/[^0-9]/g, '');
      const payload = templateName
        ? {
            messaging_product: 'whatsapp',
            to,
            type: 'template',
            template: {
              name: templateName,
              language: { code: process.env.META_TEMPLATE_LANG || 'en' },
              components: [{
                type: 'body',
                parameters: [inv.customer_name, inv.invoice_number, `₹${Number(inv.outstanding_balance).toLocaleString('en-IN')}`, inv.due_date]
                  .map((text) => ({ type: 'text', text: String(text) })),
              }],
            },
          }
        : { messaging_product: 'whatsapp', to, type: 'text', text: { body: messageBody } };

      const metaRes = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const metaData = await metaRes.json().catch(() => ({}));
      if (!metaRes.ok) {
        throw Object.assign(new Error(metaData?.error?.message || 'WhatsApp delivery failed'), { statusCode: 502 });
      }
      providerMessageId = metaData.messages?.[0]?.id || providerMessageId;
      messageStatus = 'sent';
    }

    // D. Record the operation in message_logs
    const { data: log, error: logErr } = await supabase
      .from('message_logs')
      .insert({
        business_id: req.businessId,
        customer_id: inv.customer_id,
        invoice_id: inv.id,
        direction: 'outbound',
        channel: 'whatsapp',
        template_name: templateName || 'standard_payment_reminder',
        message_content: messageBody,
        provider_message_id: providerMessageId,
        status: messageStatus,
        sent_at: new Date().toISOString(),
        delivered_at: messageStatus === 'delivered' ? new Date().toISOString() : null
      })
      .select()
      .single();

    if (logErr) throw logErr;
    await audit({ businessId: req.businessId, userId: req.user.id, action: 'REMINDER_SENT', entity: 'message_logs', entityId: log.id });
    res.json({ success: true, log, mock: !(token && phoneId) });
  } catch (err) {
    next(err);
  }
});

export default router;
