// Origin allow-list for CORS, built from ALLOWED_ORIGINS (comma-separated).
// Entries are normalised (trailing slash, case, spaces) so "https://App.vercel.app/"
// still matches, and may contain "*" wildcards, e.g. https://receivables-*.vercel.app
// for Vercel preview URLs. A wildcard never matches across dots, so it can't widen
// to another domain.

const normalise = (origin) => String(origin).trim().replace(/\/+$/, '').toLowerCase();

export function buildOriginMatcher(list = 'http://localhost:5173') {
  const entries = String(list).split(',').map(normalise).filter(Boolean);
  const exact = new Set(entries.filter((e) => !e.includes('*')));
  const patterns = entries
    .filter((e) => e.includes('*'))
    .map((e) => new RegExp(`^${e.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^./]*')}$`));

  return (origin) => {
    if (!origin) return true; // same-origin, curl, health checks
    const o = normalise(origin);
    return exact.has(o) || patterns.some((re) => re.test(o));
  };
}
