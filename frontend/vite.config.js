import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        // Parsers shared with the backend (amounts, dates, phones, header aliases)
        '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      fs: { allow: ['..'] },
      proxy: {
        '/api': {
          target: env.VITE_BACKEND_URL || 'http://localhost:5001',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      // Only the lazy HEIC converter and the PDF worker exceed this, and they load on demand.
      chunkSizeWarningLimit: 1400,
      rollupOptions: {
        output: {
          // Keep heavy, rarely-used parsers out of the main bundle
          manualChunks(id) {
            if (id.includes('pdfjs-dist')) return 'pdf';
            if (id.includes('tesseract')) return 'ocr';
            if (id.includes('/xlsx/')) return 'xlsx';
            if (id.includes('mammoth')) return 'docx';
            if (id.includes('heic2any')) return 'heic';
            if (id.includes('@supabase')) return 'supabase';
            if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
            return undefined;
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{js,jsx}'],
    },
  };
});
