import { describe, it, expect } from 'vitest';
import { parseAmount, parseDate, excelSerialToIso, normalizePhone, normalizeCurrency } from '../../shared/parsing.js';

describe('parseAmount', () => {
  it.each([
    ['1,50,000', 150000],
    ['₹1,50,000.50', 150000.5],
    ['Rs. 500', 500],
    ['INR 2,000', 2000],
    ['$1,234.56', 1234.56],
    [' 750 ', 750],
    [1500, 1500],
  ])('parses %j -> %d', (raw, expected) => expect(parseAmount(raw)).toBe(expected));

  it.each([['0'], ['-500'], ['abc'], [''], [null], [undefined], ['1.2.3'], ['12abc'], [NaN], [-3]])('rejects %j', (raw) => {
    expect(parseAmount(raw)).toBeNull();
  });
});

describe('parseDate', () => {
  it('reads slashed dates day-first (Indian convention)', () => {
    expect(parseDate('03/04/2026')).toBe('2026-04-03');
    expect(parseDate('15/10/2026')).toBe('2026-10-15');
    expect(parseDate('15-10-26')).toBe('2026-10-15');
    expect(parseDate('5.1.2026')).toBe('2026-01-05');
  });

  it('reads ISO and month-name formats', () => {
    expect(parseDate('2026-10-15')).toBe('2026-10-15');
    expect(parseDate('2026-10-15T00:00:00Z')).toBe('2026-10-15');
    expect(parseDate('15 Oct 2026')).toBe('2026-10-15');
    expect(parseDate('1st September, 2026')).toBe('2026-09-01');
    expect(parseDate('Oct 15, 2026')).toBe('2026-10-15');
    expect(parseDate('March 3 2026')).toBe('2026-03-03');
  });

  it('returns null for impossible or garbage dates instead of throwing', () => {
    expect(parseDate('31/02/2026')).toBeNull();
    expect(parseDate('13/13/2026')).toBeNull();
    expect(parseDate('not a date')).toBeNull();
    expect(parseDate('')).toBeNull();
    expect(parseDate(null)).toBeNull();
  });

  it('converts Excel serials without a timezone off-by-one (suite runs in Asia/Kolkata)', () => {
    expect(excelSerialToIso(45385)).toBe('2024-04-03');
    expect(parseDate(45385)).toBe('2024-04-03');
    expect(parseDate('45385')).toBe('2024-04-03');
    expect(parseDate(45385.75)).toBe('2024-04-03');
  });

  it('accepts Date objects (e.g. from spreadsheet parsers)', () => {
    expect(parseDate(new Date(2026, 9, 15))).toBe('2026-10-15');
  });
});

describe('normalizePhone', () => {
  it('adds +91 to Indian numbers but keeps foreign country codes', () => {
    expect(normalizePhone('98765 43210')).toBe('+919876543210');
    expect(normalizePhone('919876543210')).toBe('+919876543210');
    expect(normalizePhone('09876543210')).toBe('+919876543210');
    expect(normalizePhone('+1 (415) 555-0100')).toBe('+14155550100');
    expect(normalizePhone('+971 50 123 4567')).toBe('+971501234567');
  });

  it('rejects junk', () => {
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('')).toBeNull();
  });
});

describe('normalizeCurrency', () => {
  it('maps symbols and codes', () => {
    expect(normalizeCurrency('₹')).toBe('INR');
    expect(normalizeCurrency('usd')).toBe('USD');
    expect(normalizeCurrency('')).toBe('INR');
    expect(normalizeCurrency('dollars')).toBe('INR');
  });
});
