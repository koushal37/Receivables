import cron from 'node-cron';
import { supabase, isSupabaseConfigured } from '../supabase.js';
import { demoStore, getDemoLedgerInvoices, getISTDateString } from '../demoStore.js';
import { COLLECTION_RULES } from './rules.js';

export function initDailyJobs() {
  // Runs everyday at 06:00 AM IST (00:30 UTC)
  cron.schedule('30 0 * * *', async () => {
    try {
      console.log('[CRON] Executing daily collection & promise status jobs...');
      await markMissedPromises();
      await generateDailyCollectionActions();
    } catch (err) {
      console.error('[CRON] Error running daily jobs:', err.message);
    }
  });
}

export async function markMissedPromises() {
  const todayIST = getISTDateString(0);

  if (!isSupabaseConfigured) {
    let count = 0;
    demoStore.promises.forEach((p) => {
      if (['upcoming', 'pending'].includes(p.status) && (p.promised_date || p.promise_date) < todayIST) {
        p.status = 'missed';
        count++;
      }
    });
    console.log(`[CRON Demo] Set ${count} promises to missed.`);
    return;
  }

  const { data: expiredPromises, error } = await supabase
    .from('payment_promises')
    .update({ status: 'missed', updated_at: new Date().toISOString() })
    .in('status', ['upcoming', 'pending'])
    .lt('promised_date', todayIST)
    .select('id, invoice_id');

  if (error) console.error('Error updating missed promises:', error);
  else console.log(`[CRON] Set ${expiredPromises?.length || 0} promises to missed.`);
}

export async function generateDailyCollectionActions() {
  const todayIST = getISTDateString(0);

  if (!isSupabaseConfigured) {
    return;
  }

  const { data: invoices, error } = await supabase
    .from('invoice_ledger_view')
    .select('*')
    .in('computed_status', ['due_today', 'overdue'])
    .gt('outstanding_balance', 0);

  if (error || !invoices) return;

  for (const inv of invoices) {
    const { data: activePromise } = await supabase
      .from('payment_promises')
      .select('*')
      .eq('invoice_id', inv.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let matchedRule = null;
    for (const rule of COLLECTION_RULES) {
      if (rule.evaluate(inv, activePromise)) {
        matchedRule = rule;
        break;
      }
    }

    if (matchedRule) {
      await supabase.from('collection_actions').upsert(
        {
          business_id: inv.business_id,
          customer_id: inv.customer_id,
          invoice_id: inv.id,
          action_date: todayIST,
          priority: String(matchedRule.priority),
          rule_triggered: matchedRule.code,
          priority_reason: matchedRule.label,
          reason: matchedRule.label,
          status: 'queued',
        },
        { onConflict: 'invoice_id, action_date' }
      );
    }
  }
}
