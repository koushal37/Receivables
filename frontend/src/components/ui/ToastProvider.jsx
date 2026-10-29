import { useCallback, useMemo, useRef, useState } from 'react';
import { ToastContext } from './toastContext';
import Icon from './Icon';

const ICONS = { success: 'checkCircle', error: 'alert', info: 'info' };

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const show = useCallback((message, type = 'info', duration = 4500) => {
    const id = ++nextId.current;
    setToasts((list) => [...list.slice(-3), { id, message, type }]);
    if (duration) setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  const value = useMemo(() => ({
    show,
    success: (m) => show(m, 'success'),
    error: (m) => show(m, 'error', 7000),
    info: (m) => show(m, 'info'),
  }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" role="region" aria-label="Notifications" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`} role={t.type === 'error' ? 'alert' : 'status'}>
            <Icon name={ICONS[t.type]} className="toast-icon" />
            <span className="toast-message">{t.message}</span>
            <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
