import { supabase } from './supabaseClient';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, { status, code, body } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

// Single fetch wrapper: attaches the Supabase session token and normalizes errors.
export async function api(endpoint, { body, ...options } = {}) {
  const { data: { session } = {} } = (await supabase?.auth.getSession()) ?? {};
  const token = session?.access_token;

  let response;
  try {
    response = await fetch(`${BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`, {
      ...options,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and that the backend is running.', { status: 0 });
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message = (isJson && data?.error) || (response.status === 404 ? 'Not found' : `Request failed (${response.status})`);
    throw new ApiError(message, { status: response.status, code: data?.code, body: data });
  }
  return data;
}
