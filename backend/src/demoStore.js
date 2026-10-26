import crypto from 'crypto';

// Helper to get IST YYYY-MM-DD
export function getISTDateString(offsetDays = 0) {
  const now = new Date();
  const target = new Date(now.getTime() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(target);
}

const DEMO_BIZ_ID = 'b0000001-0000-4000-8000-000000000001';
const DEMO_OWNER_ID = 'u0000001-0000-4000-8000-000000000001';
const DEMO_EMP_ID = 'u0000002-0000-4000-8000-000000000002';

export const demoStore = {
  businesses: [
    {
      id: DEMO_BIZ_ID,
      name: 'Rourkela Ispat & Alloys Pvt Ltd',
      legal_name: 'Rourkela Ispat & Alloys Private Limited',
      timezone: 'Asia/Kolkata',
      currency_code: 'INR',
      business_settings: {
        overdue_threshold_days: 7,
        critical_threshold_days: 30,
        high_value_threshold: 100000,
        reminder_cooldown_hours: 24,
        whatsapp_enabled: true,
        daily_summary_time: '08:00',
      },
      created_at: new Date(Date.now() - 45 * 86400000).toISOString(),
    },
  ],
  memberships: [
    {
      id: 'm0000001-0000-4000-8000-000000000001',
      business_id: DEMO_BIZ_ID,
      user_id: DEMO_OWNER_ID,
      role: 'owner',
      status: 'active',
      display_name: 'Rajesh Agrawal (Managing Director)',
      phone: '+919437011223',
      email: 'owner@rourkelaispat.in',
      created_at: new Date(Date.now() - 45 * 86400000).toISOString(),
    },
    {
      id: 'm0000002-0000-4000-8000-000000000002',
      business_id: DEMO_BIZ_ID,
      user_id: DEMO_EMP_ID,
      role: 'employee',
      status: 'active',
      display_name: 'Priya Mohanty (Collections Executive)',
      phone: '+919861044556',
      email: 'priya@rourkelaispat.in',
      created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    },
    {
      id: 'm0000003-0000-4000-8000-000000000003',
      business_id: DEMO_BIZ_ID,
      user_id: 'u0000003-0000-4000-8000-000000000003',
      role: 'read_only',
      status: 'active',
      display_name: 'Suresh Dash (Statutory Auditor)',
      phone: '+919438099887',
      email: 'auditor@rourkelaispat.in',
      created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
    },
  ],
  customers: [
    {
      id: 'c0000001-0000-4000-8000-000000000001',
      business_id: DEMO_BIZ_ID,
      name: 'Kalinga Infra Projects Ltd',
      external_customer_reference: 'CUST-KIP-01',
      contact_person: 'Vikram Patnaik (VP Finance)',
      email: 'accounts@kalingainfra.in',
      phone: '+919437123456',
      preferred_channel: 'whatsapp',
      communication_permission_status: 'granted',
      opt_out: false,
      created_at: new Date(Date.now() - 40 * 86400000).toISOString(),
    },
    {
      id: 'c0000002-0000-4000-8000-000000000002',
      business_id: DEMO_BIZ_ID,
      name: 'Mahanadi Heavy Engineering Works',
      external_customer_reference: 'CUST-MHE-02',
      contact_person: 'Anil Tripathy (Purchase Head)',
      email: 'billing@mahanadiheavy.com',
      phone: '+919861234567',
      preferred_channel: 'whatsapp',
      communication_permission_status: 'granted',
      opt_out: false,
      created_at: new Date(Date.now() - 38 * 86400000).toISOString(),
    },
    {
      id: 'c0000003-0000-4000-8000-000000000003',
      business_id: DEMO_BIZ_ID,
      name: 'Konark Structural Steels',
      external_customer_reference: 'CUST-KSS-03',
      contact_person: 'Debasis Sahoo (Director)',
      email: 'debasis@konarksteels.in',
      phone: '+919439112233',
      preferred_channel: 'whatsapp',
      communication_permission_status: 'granted',
      opt_out: false,
      created_at: new Date(Date.now() - 35 * 86400000).toISOString(),
    },
    {
      id: 'c0000004-0000-4000-8000-000000000004',
      business_id: DEMO_BIZ_ID,
      name: 'Utkal Builders & Developers',
      external_customer_reference: 'CUST-UBD-04',
      contact_person: 'Manoj Panda (Accounts Manager)',
      email: 'payables@utkalbuilders.co.in',
      phone: '+919776543210',
      preferred_channel: 'whatsapp',
      communication_permission_status: 'granted',
      opt_out: false,
      created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    },
    {
      id: 'c0000005-0000-4000-8000-000000000005',
      business_id: DEMO_BIZ_ID,
      name: 'Eastern Tubes & Pipes Co',
      external_customer_reference: 'CUST-ETP-05',
      contact_person: 'Subrat Kar (Owner)',
      email: 'subrat@easterntubes.in',
      phone: '+919337098765',
      preferred_channel: 'phone_call',
      communication_permission_status: 'granted',
      opt_out: false,
      created_at: new Date(Date.now() - 25 * 86400000).toISOString(),
    },
  ],
  invoices: [
    {
      id: 'i0000001-0000-4000-8000-000000000001',
      business_id: DEMO_BIZ_ID,
      customer_id: 'c0000001-0000-4000-8000-000000000001',
      invoice_number: 'INV-2026-101',
      invoice_date: getISTDateString(-48),
      due_date: getISTDateString(-18),
      original_amount: 340000,
      amount: 340000,
      record_status: 'active',
      status: 'partially_paid',
      assigned_to: DEMO_EMP_ID,
      created_at: new Date(Date.now() - 48 * 86400000).toISOString(),
    },
    {
      id: 'i0000002-0000-4000-8000-000000000002',
      business_id: DEMO_BIZ_ID,
      customer_id: 'c0000002-0000-4000-8000-000000000002',
      invoice_number: 'INV-2026-104',
      invoice_date: getISTDateString(-65),
      due_date: getISTDateString(-35),
      original_amount: 485000,
      amount: 485000,
      record_status: 'active',
      status: 'unpaid',
      assigned_to: DEMO_EMP_ID,
      created_at: new Date(Date.now() - 65 * 86400000).toISOString(),
    },
    {
      id: 'i0000003-0000-4000-8000-000000000003',
      business_id: DEMO_BIZ_ID,
      customer_id: 'c0000003-0000-4000-8000-000000000003',
      invoice_number: 'INV-2026-108',
      invoice_date: getISTDateString(-39),
      due_date: getISTDateString(-9),
      original_amount: 175000,
      amount: 175000,
      record_status: 'active',
      status: 'unpaid',
      assigned_to: DEMO_EMP_ID,
      created_at: new Date(Date.now() - 39 * 86400000).toISOString(),
    },
    {
      id: 'i0000004-0000-4000-8000-000000000004',
      business_id: DEMO_BIZ_ID,
      customer_id: 'c0000004-0000-4000-8000-000000000004',
      invoice_number: 'INV-2026-112',
      invoice_date: getISTDateString(-30),
      due_date: getISTDateString(0), // Due Today!
      original_amount: 270000,
      amount: 270000,
      record_status: 'active',
      status: 'unpaid',
      assigned_to: DEMO_EMP_ID,
      created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    },
    {
      id: 'i0000005-0000-4000-8000-000000000005',
      business_id: DEMO_BIZ_ID,
      customer_id: 'c0000005-0000-4000-8000-000000000005',
      invoice_number: 'INV-2026-115',
      invoice_date: getISTDateString(-25),
      due_date: getISTDateString(-5),
      original_amount: 125000,
      amount: 125000,
      record_status: 'disputed',
      status: 'disputed',
      assigned_to: DEMO_OWNER_ID,
      created_at: new Date(Date.now() - 25 * 86400000).toISOString(),
    },
    {
      id: 'i0000006-0000-4000-8000-000000000006',
      business_id: DEMO_BIZ_ID,
      customer_id: 'c0000001-0000-4000-8000-000000000001',
      invoice_number: 'INV-2026-119',
      invoice_date: getISTDateString(-10),
      due_date: getISTDateString(12), // Not yet due
      original_amount: 210000,
      amount: 210000,
      record_status: 'active',
      status: 'unpaid',
      assigned_to: DEMO_EMP_ID,
      created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    },
    {
      id: 'i0000007-0000-4000-8000-000000000007',
      business_id: DEMO_BIZ_ID,
      customer_id: 'c0000003-0000-4000-8000-000000000003',
      invoice_number: 'INV-2026-098',
      invoice_date: getISTDateString(-45),
      due_date: getISTDateString(-15),
      original_amount: 310000,
      amount: 310000,
      record_status: 'active',
      status: 'paid',
      assigned_to: DEMO_EMP_ID,
      created_at: new Date(Date.now() - 45 * 86400000).toISOString(),
    },
  ],
  payments: [
    {
      id: 'p0000001-0000-4000-8000-000000000001',
      business_id: DEMO_BIZ_ID,
      customer_id: 'c0000001-0000-4000-8000-000000000001',
      invoice_id: 'i0000001-0000-4000-8000-000000000001',
      received_amount: 140000,
      amount: 140000,
      received_at: getISTDateString(-6),
      payment_date: new Date(Date.now() - 6 * 86400000).toISOString(),
      payment_method: 'neft_rtgs',
      payment_reference: 'UTR88291044512',
      utr: 'UTR88291044512',
      notes: 'Part payment via HDFC RTGS',
      confirmation_status: 'confirmed',
      status: 'completed',
      recorded_by: DEMO_OWNER_ID,
      created_at: new Date(Date.now() - 6 * 86400000).toISOString(),
    },
    {
      id: 'p0000002-0000-4000-8000-000000000002',
      business_id: DEMO_BIZ_ID,
      customer_id: 'c0000003-0000-4000-8000-000000000003',
      invoice_id: 'i0000007-0000-4000-8000-000000000007',
      received_amount: 310000,
      amount: 310000,
      received_at: getISTDateString(-3),
      payment_date: new Date(Date.now() - 3 * 86400000).toISOString(),
      payment_method: 'neft_rtgs',
      payment_reference: 'UTR99401122384',
      utr: 'UTR99401122384',
      notes: 'Full invoice settlement via SBI NEFT',
      confirmation_status: 'confirmed',
      status: 'completed',
      recorded_by: DEMO_OWNER_ID,
      created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    },
  ],
  adjustments: [],
  promises: [
    {
      id: 'pr000001-0000-4000-8000-000000000001',
      business_id: DEMO_BIZ_ID,
      customer_id: 'c0000001-0000-4000-8000-000000000001',
      invoice_id: 'i0000001-0000-4000-8000-000000000001',
      promised_amount: 200000,
      promised_date: getISTDateString(-2),
      promise_date: getISTDateString(-2),
      source: 'phone_call',
      status: 'missed',
      notes: 'VP Finance promised remaining ₹2,00,000 via RTGS two days ago; not received yet.',
      recorded_by: DEMO_EMP_ID,
      created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    },
    {
      id: 'pr000002-0000-4000-8000-000000000002',
      business_id: DEMO_BIZ_ID,
      customer_id: 'c0000004-0000-4000-8000-000000000004',
      invoice_id: 'i0000004-0000-4000-8000-000000000004',
      promised_amount: 270000,
      promised_date: getISTDateString(0),
      promise_date: getISTDateString(0),
      source: 'whatsapp_reply',
      status: 'upcoming',
      notes: 'Customer confirmed bill is queued for evening banking batch today.',
      recorded_by: DEMO_EMP_ID,
      created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    },
  ],
  disputes: [
    {
      id: 'd0000001-0000-4000-8000-000000000001',
      business_id: DEMO_BIZ_ID,
      customer_id: 'c0000005-0000-4000-8000-000000000005',
      invoice_id: 'i0000005-0000-4000-8000-000000000005',
      reason: 'damaged_goods',
      description: 'Customer reported 4 corroded GI pipe bundles in Lot #14; awaiting QC credit note approval.',
      status: 'open',
      assigned_to: DEMO_OWNER_ID,
      created_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    },
  ],
  messages: [
    {
      id: 'msg00001-0000-4000-8000-000000000001',
      business_id: DEMO_BIZ_ID,
      customer_id: 'c0000001-0000-4000-8000-000000000001',
      invoice_id: 'i0000001-0000-4000-8000-000000000001',
      direction: 'outbound',
      channel: 'whatsapp',
      template_name: 'standard_payment_reminder',
      message_content: 'Hello Kalinga Infra Projects Ltd, our records show invoice INV-2026-101 has an outstanding balance of ₹2,00,000. Kindly share the UTR if already paid.',
      provider_message_id: 'wamid.HBgMOTE5NDM3MTIzNDU2FQIAERgSQTlD',
      status: 'delivered',
      sent_at: new Date(Date.now() - 4 * 86400000).toISOString(),
      delivered_at: new Date(Date.now() - 4 * 86400000).toISOString(),
      created_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    },
    {
      id: 'msg00002-0000-4000-8000-000000000002',
      business_id: DEMO_BIZ_ID,
      customer_id: 'c0000004-0000-4000-8000-000000000004',
      invoice_id: 'i0000004-0000-4000-8000-000000000004',
      direction: 'inbound',
      channel: 'whatsapp',
      template_name: null,
      message_content: 'We have approved INV-2026-112 for ₹2,70,000. RTGS will be released today before 5 PM.',
      provider_message_id: 'wamid.HBgMOTE5Nzc2NTQzMjEwFQIAERgSRjJC',
      status: 'read',
      ai_classification: 'payment_promised',
      created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    },
  ],
  audit_logs: [
    {
      id: crypto.randomUUID(),
      business_id: DEMO_BIZ_ID,
      user_id: DEMO_OWNER_ID,
      action: 'PAYMENT_RECORDED',
      entity: 'payments',
      entity_id: 'p0000002-0000-4000-8000-000000000002',
      after_state: { invoice_number: 'INV-2026-098', amount: 310000, utr: 'UTR99401122384' },
      created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    },
  ],
};

// Deterministically compute ledger view rows for demoStore
export function getDemoLedgerInvoices(businessId = DEMO_BIZ_ID) {
  const todayStr = getISTDateString(0);
  const todayMs = new Date(todayStr + 'T00:00:00Z').getTime();

  return demoStore.invoices
    .filter((i) => i.business_id === businessId)
    .map((inv) => {
      const cust = demoStore.customers.find((c) => c.id === inv.customer_id) || {
        name: 'Unknown Customer',
        phone: null,
        email: null,
        opt_out: false,
      };
      const invPayments = demoStore.payments.filter(
        (p) =>
          p.invoice_id === inv.id &&
          p.status !== 'reversed' &&
          p.confirmation_status !== 'reversed'
      );
      const totalPaid = invPayments.reduce((s, p) => s + Number(p.received_amount || p.amount || 0), 0);
      const invAdjustments = demoStore.adjustments.filter((a) => a.invoice_id === inv.id);
      const totalAdjusted = invAdjustments.reduce((s, a) => s + Number(a.amount || 0), 0);

      const origAmt = Number(inv.original_amount || inv.amount || 0);
      const outstanding = Math.max(0, origAmt - totalPaid - totalAdjusted);

      const dueMs = new Date(inv.due_date + 'T00:00:00Z').getTime();
      const diffDays = Math.floor((todayMs - dueMs) / 86400000);
      const daysOverdue = outstanding > 0 && diffDays > 0 ? diffDays : 0;

      const hasOpenDispute =
        inv.record_status === 'disputed' ||
        inv.status === 'disputed' ||
        demoStore.disputes.some((d) => d.invoice_id === inv.id && d.status !== 'resolved');

      let paymentStatus = 'open';
      let computedStatus = 'upcoming';

      if (inv.record_status === 'void' || inv.status === 'void') {
        paymentStatus = 'void';
        computedStatus = 'void';
      } else if (hasOpenDispute && outstanding > 0) {
        paymentStatus = 'disputed';
        computedStatus = 'disputed';
      } else if (outstanding <= 0) {
        paymentStatus = 'paid';
        computedStatus = 'paid';
      } else if (daysOverdue > 0) {
        paymentStatus = 'overdue';
        computedStatus = 'overdue';
      } else if (inv.due_date === todayStr) {
        paymentStatus = 'due_today';
        computedStatus = 'due_today';
      } else if (totalPaid > 0) {
        paymentStatus = 'partially_paid';
        computedStatus = 'partially_paid';
      }

      let ageingBucket = 'not_yet_due';
      if (outstanding <= 0) ageingBucket = 'settled';
      else if (inv.due_date === todayStr) ageingBucket = 'due_today';
      else if (daysOverdue >= 1 && daysOverdue <= 7) ageingBucket = '1-7_days';
      else if (daysOverdue >= 8 && daysOverdue <= 30) ageingBucket = '8-30_days';
      else if (daysOverdue >= 31 && daysOverdue <= 60) ageingBucket = '31-60_days';
      else if (daysOverdue > 60) ageingBucket = 'more_than_60_days';

      return {
        ...inv,
        customer_name: cust.name,
        customer_phone: cust.phone,
        customer_email: cust.email,
        customer_opt_out: cust.opt_out,
        original_amount: origAmt,
        amount: origAmt,
        total_paid: totalPaid,
        total_adjusted: totalAdjusted,
        outstanding_balance: outstanding,
        outstanding_amount: outstanding,
        payment_status: paymentStatus,
        computed_status: computedStatus,
        days_overdue: daysOverdue,
        ageing_bucket: ageingBucket,
      };
    });
}
