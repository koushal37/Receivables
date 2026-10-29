import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { buildActionPlan } from '../src/engine/actionPlan.js';
import { COLLECTION_RULES } from '../src/engine/rules.js';
import { todayInTz, startOfMonthInTz } from '../src/lib/dates.js';
import { bucketAgeing } from '../src/routes/reportsRoutes.js';
import { isValidSignature } from '../src/routes/webhookRoutes.js';

const match = (inv, promise) => COLLECTION_RULES.find((r) => r.evaluate(inv, promise))?.code;

describe('dates', () => {
  it('uses the IST calendar date, not UTC', () => {
    // 2026-03-04 20:00 UTC is already 2026-03-05 01:30 in India
    const lateUtc = new Date('2026-03-04T20:00:00Z');
    expect(todayInTz('Asia/Kolkata', lateUtc)).toBe('2026-03-05');
    expect(startOfMonthInTz('Asia/Kolkata', lateUtc)).toBe('2026-03-01');
  });
});

describe('collection rules', () => {
  it('ranks missed promises first and only labels truly due-today invoices as due today', () => {
    expect(match({ days_overdue: 2, outstanding_amount: 10 }, { status: 'missed' })).toBe('MISSED_PROMISE');
    expect(match({ days_overdue: 1, outstanding_amount: 200000 })).toBe('HIGH_VALUE_OVERDUE');
    expect(match({ days_overdue: 45, outstanding_amount: 10 })).toBe('OVERDUE_30_DAYS');
    expect(match({ days_overdue: 3, outstanding_amount: 10 })).toBe('OVERDUE');
    expect(match({ days_overdue: 0, outstanding_amount: 10, computed_status: 'due_today' })).toBe('DUE_TODAY');
    expect(match({ days_overdue: 0, outstanding_amount: 10, computed_status: 'upcoming' })).toBeUndefined();
  });
});

describe('buildActionPlan', () => {
  it('sorts critical > important > routine, then by days overdue', () => {
    const plan = buildActionPlan([
      { id: 'a', days_overdue: 0, outstanding_balance: '100' },
      { id: 'b', days_overdue: 10, outstanding_balance: '100' },
      { id: 'c', days_overdue: 2, outstanding_balance: '100' },
      { id: 'd', days_overdue: 40, outstanding_balance: '100' },
    ], new Set(['c']));
    expect(plan.map((p) => [p.id, p.priority])).toEqual([['c', 'critical'], ['d', 'critical'], ['b', 'important'], ['a', 'routine']]);
    expect(plan.at(-1).priorityReason).toBe('Invoice due today.');
  });
});

describe('bucketAgeing', () => {
  it('puts each balance in exactly one bucket and totals match', () => {
    const b = bucketAgeing([
      { outstanding_balance: 100, days_overdue: 0 },
      { outstanding_balance: 200, days_overdue: 30 },
      { outstanding_balance: 300, days_overdue: 31 },
      { outstanding_balance: 400, days_overdue: 90 },
      { outstanding_balance: 500, days_overdue: 91 },
    ]);
    expect(b).toEqual({ not_due: 100, days_1_30: 200, days_31_60: 300, days_61_90: 400, days_90_plus: 500, total_outstanding: 1500 });
  });
});

describe('webhook signature', () => {
  const body = Buffer.from('{"entry":[]}');
  const sig = 'sha256=' + crypto.createHmac('sha256', 's3cret').update(body).digest('hex');

  it('accepts a valid signature and rejects others without throwing', () => {
    expect(isValidSignature(body, sig, 's3cret')).toBe(true);
    expect(isValidSignature(body, sig, 'other')).toBe(false);
    expect(isValidSignature(body, 'sha256=short', 's3cret')).toBe(false);
    expect(isValidSignature(body, undefined, 's3cret')).toBe(false);
    expect(isValidSignature(body, sig, undefined)).toBe(false);
  });
});
