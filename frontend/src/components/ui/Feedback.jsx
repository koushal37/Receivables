import Icon from './Icon';
import { STATUS_META } from '../../lib/format';

export function Skeleton({ width = '100%', height = 14, radius, style }) {
  return <span className="skeleton" style={{ width, height, borderRadius: radius, ...style }} aria-hidden="true" />;
}

export function EmptyState({ icon = 'file', title, children, action }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon"><Icon name={icon} size={24} /></div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Alert({ tone = 'neutral', children }) {
  const icon = { danger: 'alert', warning: 'alert', success: 'checkCircle' }[tone] || 'info';
  return (
    <div className={`alert alert-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon name={icon} size={16} />
      <div>{children}</div>
    </div>
  );
}

export function Badge({ tone = 'neutral', plain, children }) {
  return <span className={`badge ${tone !== 'neutral' ? `badge-${tone}` : ''} ${plain ? 'badge-plain' : ''}`}>{children}</span>;
}

export function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status || 'Unknown', tone: 'neutral' };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export function Field({ label, htmlFor, hint, error, optional, children }) {
  return (
    <div className="field">
      {label && (
        <label className="label" htmlFor={htmlFor}>
          {label} {optional && <span className="optional">(optional)</span>}
        </label>
      )}
      {children}
      {error ? <span className="field-error" id={htmlFor ? `${htmlFor}-error` : undefined}>{error}</span> : hint && <span className="hint">{hint}</span>}
    </div>
  );
}
