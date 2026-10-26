import { supabase } from './supabaseClient';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export async function api(endpoint, options = {}) {
  let token = null;
  let demoRole = 'owner';

  try {
    const savedDemo = localStorage.getItem('receivables_demo_session');
    if (savedDemo) {
      const parsed = JSON.parse(savedDemo);
      token = parsed?.access_token;
      demoRole = parsed?.demo_role || 'owner';
    }
    if (!token) {
      const { data } = await supabase.auth.getSession();
      token = data?.session?.access_token;
    }
  } catch (e) {
    console.warn('Session read warning:', e);
  }

  // Normalize endpoint so passing '/api/team' or '/team' both resolve cleanly to '/api/team'
  let cleanPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (cleanPath.startsWith('/api/')) {
    cleanPath = cleanPath.slice(4);
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(token?.startsWith('demo-token') ? { 'X-Demo-Role': demoRole } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${BASE_URL}${cleanPath}`, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');
  const body = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const msg =
      response.status === 502
        ? 'HTTP 502 Bad Gateway: Backend server on port 5001 is not running. Run "npm run dev" inside the /backend folder!'
        : body?.error || body || `HTTP ${response.status}`;
    const error = new Error(msg);
    error.status = response.status;
    error.code = body?.code;
    throw error;
  }

  return body;
}
