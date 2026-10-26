import { Router } from 'express';
import crypto from 'crypto';
import { supabase } from '../supabase.js';

const router = Router();

// Meta Webhook Verification (GET)
router.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Meta Webhook Inbound Handler (POST)
// Assumes express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }) is configured in index.js
router.post('/whatsapp', async (req, res) => {
  try {
    const signature = req.headers['x-hub-signature-256'];
    if (!signature) return res.status(401).send('Missing signature');

    const appSecret = process.env.META_APP_SECRET;
    const hmac = crypto.createHmac('sha256', appSecret);
    const expectedSig = 'sha256=' + hmac.update(req.rawBody).digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return res.status(401).send('Invalid signature');
    }

    const payload = req.body;
    const entries = payload.entry || [];

    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const val = change.value;
        const messages = val.messages || [];

        for (const msg of messages) {
          const fromPhone = msg.from; // Customer phone (E.164)
          const text = msg.text?.body?.trim().toUpperCase();

          // Handle STOP / OPT-OUT
          if (text === 'STOP') {
            await supabase
              .from('customers')
              .update({ opt_out: true })
              .ilike('phone', `%${fromPhone.slice(-10)}%`);
          }

          // Record communication inbound log
          await supabase.from('communication_logs').insert({
            phone: fromPhone,
            direction: 'inbound',
            message_type: msg.type,
            content: msg.text?.body || '[Non-text message]',
            meta_message_id: msg.id,
          });
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Webhook error:', err);
    res.sendStatus(500);
  }
});

export default router;
