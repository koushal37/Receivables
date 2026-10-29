import Icon from '../../components/ui/Icon';
import { FORMATS } from './fileTypes';
import { formatBytes } from '../../lib/format';

export default function FileQueue({ items, onRemove, onRetry }) {
  if (!items.length) return null;
  return (
    <ul className="file-queue" aria-label="Files being processed">
      {items.map((it) => (
        <li key={it.id} className="file-item" data-status={it.status}>
          <span className="file-icon"><Icon name={FORMATS[it.format]?.icon || 'file'} size={18} /></span>
          <div className="file-main">
            <div className="file-name" title={it.file.name}>{it.file.name}</div>
            <div className="file-meta" aria-live="polite">
              {it.status === 'queued' && <span>Waiting · {formatBytes(it.file.size)}</span>}
              {it.status === 'processing' && <span>{it.stage || 'Processing'}…</span>}
              {it.status === 'done' && <span className="text-success"><Icon name="check" size={13} /> {it.draftCount} invoice{it.draftCount === 1 ? '' : 's'} found</span>}
              {it.status === 'error' && <span className="text-danger" role="alert">{it.error}</span>}
            </div>
            {it.status === 'processing' && (
              <div className="progress" role="progressbar" aria-label={`Processing ${it.file.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((it.progress || 0) * 100)}>
                <div className="progress-bar" style={{ width: `${Math.max(4, (it.progress || 0) * 100)}%` }} />
              </div>
            )}
          </div>
          {it.status === 'error' && it.retryable && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRetry(it.id)}>Retry</button>
          )}
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => onRemove(it.id)} aria-label={`Remove ${it.file.name}`} disabled={it.status === 'processing'}>
            <Icon name="x" size={15} />
          </button>
        </li>
      ))}
    </ul>
  );
}
