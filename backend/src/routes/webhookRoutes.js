import { Router } from 'express';
import crypto from 'crypto';
import { supabase } from '../supabase.js';

const router = Router();
const OPT_OUT_WORDS = new Set(['STOP', 'UNSUBSCRIBE', 'STOP ALL', 'OPT OUT']);

// Constant-time check of Meta's X-Hub-Signature-256 header against the raw body
export function isValidSignature(rawBody, signature, appSecret) {
  if (!appSecret || !rawBody || typeof signature !== 'string') return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Meta Webhook Verification (GET)
router.get('/whatsapp', (req, res) => {
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (expected && req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === expected) {
    return res.status(200).send(String(req.query['hub.challenge'] ?? ''));
  }
  return res.sendStatus(403);
});

// Meta Webhook Inbound Handler (POST)
router.post('/whatsapp', async (req, res) => {
  if (!isValidSignature(req.rawBody, req.headers['x-hub-signature-256'], process.env.META_APP_SECRET)) {
    return res.status(401).send('Invalid signature');
  }

  try {
    for (const entry of req.body?.entry || []) {
      for (const change of entry.changes || []) {
        for (const msg of change.value?.messages || []) {
          const last10 = String(msg.from || '').replace(/\D/g, '').slice(-10);
          if (last10.length !== 10) continue;

          // Every business that has this phone as a customer gets the log (and the opt-out)
          const { data: customers } = await supabase
            .from('customers')
            .select('id, business_id')
            .like('phone', `%${last10}`);

          const body = msg.text?.body?.trim() || '';
          const isOptOut = OPT_OUT_WORDS.has(body.toUpperCase());

          for (const c of customers || []) {
            if (isOptOut) {
              await supabase
                .from('customers')
                .update({ opt_out: true, opted_out_at: new Date().toISOString(), communication_permission_status: 'opted_out' })
                .eq('id', c.id);
            }
            const { error } = await supabase.from('message_logs').insert({
              business_id: c.business_id,
              customer_id: c.id,
              direction: 'inbound',
              channel: 'whatsapp',
              message_content: body || `[${msg.type || 'non-text'} message]`,
              provider_message_id: msg.id,
              status: 'delivered',
            });
            if (error) console.error('Webhook log insert failed:', error.message);
          }
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
