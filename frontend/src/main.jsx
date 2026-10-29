import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/layout.css';
import './styles/features.css';
import App from './app/App';
import AuthProvider from './app/AuthProvider';
import ToastProvider from './components/ui/ToastProvider';
import { missingEnv } from './lib/supabaseClient';

const root = createRoot(document.getElementById('root'));

if (missingEnv.length) {
  root.render(
    <div className="splash">
      <div className="alert alert-danger" role="alert" style={{ maxWidth: 520 }}>
        Missing environment variables: {missingEnv.join(', ')}. Add them to frontend/.env (see .env.example) and restart the dev server.
      </div>
    </div>
  );
} else {
  root.render(
    <StrictMode>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </StrictMode>
  );
}
