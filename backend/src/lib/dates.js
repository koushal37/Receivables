// All business dates are Asia/Kolkata calendar dates as 'YYYY-MM-DD' strings.
export const BUSINESS_TZ = 'Asia/Kolkata';

export function todayInTz(timeZone = BUSINESS_TZ, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
}

export function startOfMonthInTz(timeZone = BUSINESS_TZ, now = new Date()) {
  return `${todayInTz(timeZone, now).slice(0, 7)}-01`;
}
