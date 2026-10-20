import express from 'express';
import { supabase } from '../supabase.js';

const router = express.Router();

// 1. META WEBHOOK VERIFICATION (GET)
router.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const expectedToken = process.env.META_VERIFY_TOKEN || 'receivables_secret_token';

  if (mode === 'subscribe' && token === expectedToken) {
    console.log('WhatsApp Webhook Verified successfully.');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// 2. META WEBHOOK EVENT HANDLER (POST)
router.post('/whatsapp', async (req, res) => {
  try {
    const body = req.body;

    // Acknowledge receipt to Meta immediately (prevents retry storms)
    res.status(200).send('EVENT_RECEIVED');

    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (!value) continue;

        // A. Handle Status Updates (sent, delivered, read, failed)
        if (value.statuses && value.statuses.length > 0) {
          for (const statusObj of value.statuses) {
            const providerMsgId = statusObj.id;
            const newStatus = statusObj.status; // 'delivered', 'read', 'failed'

            const updateData = { status: newStatus };
            if (newStatus === 'delivered') updateData.delivered_at = new Date().toISOString();
            if (newStatus === 'failed') {
              updateData.failure_reason = statusObj.errors?.[0]?.title || 'Delivery failed';
            }

            await supabase
              .from('message_logs')
              .update(updateData)
              .eq('provider_message_id', providerMsgId);
          }
        }

        // B. Handle Inbound Customer Messages (Text responses)
        if (value.messages && value.messages.length > 0) {
          for (const msg of value.messages) {
            if (msg.type !== 'text') continue;

            const fromPhone = msg.from; // e.g. "919876543210"
            const textBody = msg.text?.body || '';

            // Match customer by phone number
            const { data: customer } = await supabase
              .from('customers')
              .select('id, business_id, name')
              .or(`phone.eq.+${fromPhone},phone.eq.${fromPhone}`)
              .limit(1)
              .maybeSingle();

            if (customer) {
              // Log the inbound message
              await supabase.from('message_logs').insert({
                business_id: customer.business_id,
                customer_id: customer.id,
                direction: 'inbound',
                channel: 'whatsapp',
                message_content: textBody,
                provider_message_id: msg.id,
                status: 'delivered'
              });

              // Create or prioritize an urgent call action for human review
              await supabase.from('collection_actions').insert({
                business_id: customer.business_id,
                customer_id: customer.id,
                action_type: 'call',
                priority: 'important',
                priority_reason: `Customer replied on WhatsApp: "${textBody.slice(0, 50)}..."`,
                status: 'queued'
              });
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('Error processing webhook:', err);
  }
});

export default router;