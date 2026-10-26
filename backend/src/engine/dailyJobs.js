import cron from 'node-cron';
import { supabase } from '../supabase.js';
import { COLLECTION_RULES } from './rules.js';

export function initDailyJobs() {
  // Runs everyday at 06:00 AM IST (00:30 UTC)
  cron.schedule('30 0 * * *', async () => {
    console.log('[CRON] Executing daily collection & promise status jobs...');
    await markMissedPromises();
    await generateDailyCollectionActions();
  });
}

// 1. Mark Passed Promises as 'missed'
export async function markMissedPromises() {
  const todayIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

  const { data: expiredPromises, error } = await supabase
    .from('promises')
    .update({ status: 'missed', updated_at: new Date().toISOString() })
    .eq('status', 'pending')
    .lt('promise_date', todayIST)
    .select('id, invoice_id');

  if (error) console.error('Error updating missed promises:', error);
  else console.log(`[CRON] Set ${expiredPromises?.length || 0} promises to missed.`);
}

// 2. Generate Idempotent Daily Collection Actions
export async function generateDailyCollectionActions() {
  const todayIST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

  // Fetch all invoices due today or overdue with balances
  const { data: invoices, error } = await supabase
    .from('invoice_summary_view')
    .select('*')
    .in('computed_status', ['due_today', 'overdue'])
    .gt('outstanding_amount', 0);

  if (error || !invoices) return;

  for (const inv of invoices) {
    // Check if open promise exists
    const { data: activePromise } = await supabase
      .from('promises')
      .select('*')
      .eq('invoice_id', inv.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Match priority rule
    let matchedRule = null;
    for (const rule of COLLECTION_RULES) {
      if (rule.evaluate(inv, activePromise)) {
        matchedRule = rule;
        break;
      }
    }

    if (matchedRule) {
      // Upsert one action per invoice per date
      await supabase.from('collection_actions').upsert(
        {
          business_id: inv.business_id,
          invoice_id: inv.id,
          action_date: todayIST,
          priority: matchedRule.priority,
          rule_triggered: matchedRule.code,
          reason: matchedRule.label,
          status: 'pending',
        },
        { onConflict: 'invoice_id, action_date' }
      );
    }
  }
}
