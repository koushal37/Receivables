import cron from 'node-cron';
import { supabase } from '../supabase.js';
import { COLLECTION_RULES } from './rules.js';
import { todayInTz } from '../lib/dates.js';

export function initDailyJobs() {
  // Runs every day at 06:00 IST
  cron.schedule('0 6 * * *', async () => {
    console.log('[CRON] Executing daily collection & promise status jobs...');
    await markMissedPromises();
    await generateDailyCollectionActions();
  }, { timezone: 'Asia/Kolkata' });
}

// 1. Mark passed promises as 'missed' (new promises are created as 'upcoming')
export async function markMissedPromises() {
  const { data, error } = await supabase
    .from('payment_promises')
    .update({ status: 'missed', updated_at: new Date().toISOString() })
    .in('status', ['upcoming', 'pending'])
    .lt('promised_date', todayInTz())
    .select('id');

  if (error) console.error('[CRON] Error updating missed promises:', error.message);
  else console.log(`[CRON] Set ${data?.length || 0} promises to missed.`);
}

export function matchRule(invoice, latestPromise) {
  return COLLECTION_RULES.find((rule) => rule.evaluate(invoice, latestPromise)) || null;
}

// 2. Generate idempotent daily collection actions (one per invoice per day)
export async function generateDailyCollectionActions() {
  const today = todayInTz();

  const { data: invoices, error } = await supabase
    .from('invoice_ledger_view')
    .select('id, business_id, customer_id, outstanding_balance, days_overdue, due_date, payment_status')
    .gt('outstanding_balance', 0)
    .lte('due_date', today)
    .not('payment_status', 'in', '(void,disputed)');

  if (error || !invoices) {
    if (error) console.error('[CRON] Could not load invoices:', error.message);
    return;
  }

  for (const inv of invoices) {
    const { data: latestPromise } = await supabase
      .from('payment_promises')
      .select('status')
      .eq('invoice_id', inv.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const rule = matchRule({ ...inv, outstanding_amount: Number(inv.outstanding_balance), computed_status: inv.due_date === today ? 'due_today' : 'overdue' }, latestPromise);
    if (!rule) continue;

    const { error: upErr } = await supabase.from('collection_actions').upsert(
      {
        business_id: inv.business_id,
        customer_id: inv.customer_id,
        invoice_id: inv.id,
        action_date: today,
        scheduled_at: today,
        priority: rule.priority,
        priority_reason: rule.label,
        rule_triggered: rule.code,
        reason: rule.label,
        status: 'queued',
      },
      { onConflict: 'invoice_id,action_date' }
    );
    if (upErr) console.error(`[CRON] Action upsert failed for ${inv.id}:`, upErr.message);
  }
}
