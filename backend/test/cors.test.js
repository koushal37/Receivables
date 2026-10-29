import { describe, it, expect } from 'vitest';
import { buildOriginMatcher } from '../src/lib/cors.js';

describe('CORS origin matcher', () => {
  const allowed = buildOriginMatcher(' https://Receivables.vercel.app/ , https://receivables-*.vercel.app,http://localhost:5173');

  it('tolerates trailing slashes, spaces and capitals in ALLOWED_ORIGINS', () => {
    expect(allowed('https://receivables.vercel.app')).toBe(true);
    expect(allowed('http://localhost:5173')).toBe(true);
  });

  it('matches Vercel preview URLs through a wildcard', () => {
    expect(allowed('https://receivables-git-main-koushal.vercel.app')).toBe(true);
    expect(allowed('https://receivables-abc123.vercel.app')).toBe(true);
  });

  it('never lets a wildcard widen to another domain or scheme', () => {
    expect(allowed('https://receivables-x.evil.com')).toBe(false);
    expect(allowed('https://receivables-x.vercel.app.evil.com')).toBe(false);
    expect(allowed('http://receivables.vercel.app')).toBe(false);
    expect(allowed('https://other.vercel.app')).toBe(false);
  });

  it('allows requests without an Origin header (health checks, curl)', () => {
    expect(allowed(undefined)).toBe(true);
  });

  it('defaults to the local dev server when unset', () => {
    const local = buildOriginMatcher(undefined);
    expect(local('http://localhost:5173')).toBe(true);
    expect(local('https://receivables.vercel.app')).toBe(false);
  });
});
