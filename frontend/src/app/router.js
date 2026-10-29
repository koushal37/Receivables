import { useSyncExternalStore } from 'react';

// Minimal hash router: '#/invoices?status=overdue' -> { path: '/invoices', params }
function parse() {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  return { path: path || '/', params: Object.fromEntries(new URLSearchParams(query)) };
}

let current = parse();
const subscribe = (cb) => {
  const handler = () => { current = parse(); cb(); };
  window.addEventListener('hashchange', handler);
  return () => window.removeEventListener('hashchange', handler);
};

export function useRoute() {
  return useSyncExternalStore(subscribe, () => current);
}

export function href(path, params) {
  const qs = params && Object.keys(params).length ? `?${new URLSearchParams(params)}` : '';
  return `#${path}${qs}`;
}

export function navigate(path, params) {
  window.location.hash = href(path, params).slice(1);
}
