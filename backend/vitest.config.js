import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Placeholder values so the Supabase module can load; tests replace the client with a fake.
    env: { SUPABASE_URL: 'http://localhost:54321', SUPABASE_SERVICE_KEY: 'test-placeholder', TZ: 'Asia/Kolkata' },
  },
});
