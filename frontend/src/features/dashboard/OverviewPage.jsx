import { useState } from 'react';
import { useApi } from '../../lib/useApi';
import { useAuth } from '../../app/authContext';
import { href } from '../../app/router';
import { formatMoney } from '../../lib/format';
import Icon from '../../components/ui/Icon';
import Button from '../../components/ui/Button';
import { Skeleton, EmptyState, Alert, Badge } from '../../components/ui/Feedback';
import ActionDialogs from './ActionDialogs';

const STATS = [
  { key: 'totalOutstanding', label: 'Total outstanding', icon: 'wallet', link: { status: 'all' }, hint: 'All open invoices' },
  { key: 'overdue', label: 'Overdue', icon: 'alert', link: { status: 'overdue' }, hint: 'Past due date', tone: 'danger' },
  { key: 'dueToday', label: 'Due today', icon: 'clock', link: { status: 'due_today' }, hint: 'Due on today’s date' },
  { key: 'receivedThisMonth', label: 'Received this month', icon: 'trending', hint: 'Confirmed payments', tone: 'success' },
];

const PRIORITY_TONE = { critical: 'danger', important: 'warning', routine: 'neutral' };

export default function OverviewPage() {
  const { business, can } = useAuth();
  const metrics = useApi('/dashboard/metrics');
  const plan = useApi('/dashboard/action-plan');
  const [active, setActive] = useState(null); // { type, item }

  const m = metrics.data?.metrics;
  const actions = plan.data?.actionPlan ?? [];
  const refreshAll = () => { metrics.reload(); plan.reload(); };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Overview</h1>
          <p className="page-subtitle">{business?.name} · receivables at a glance</p>
        </div>
        {can('write') && (
          <div className="page-actions">
            <a className="btn btn-primary" href={href('/import')}><Icon name="upload" size={17} />Import invoices</a>
          </div>
        )}
      </div>

      {metrics.error && <Alert tone="danger">Couldn’t load metrics: {metrics.error.message}</Alert>}

      <section className="stat-grid" aria-label="Key metrics">
        {STATS.map((s) => {
          const body = (
            <>
              <div className="stat-top">
                <span className="stat-label">{s.label}</span>
                <span className={`stat-icon ${s.tone ? `stat-icon-${s.tone}` : ''}`}><Icon name={s.icon} size={16} /></span>
              </div>
              {metrics.loading && !m ? <Skeleton width="60%" height={28} /> : <div className="stat-value tabular">{formatMoney(m?.[s.key])}</div>}
              <span className="stat-hint">{s.hint}{s.link && <Icon name="arrowRight" size={14} />}</span>
            </>
          );
          return s.link ? (
            <a key={s.key} className="card stat-card stat-card-link" href={href('/invoices', s.link)} aria-label={`${s.label}: view invoices`}>{body}</a>
          ) : (
            <div key={s.key} className="card stat-card">{body}</div>
          );
        })}
      </section>

      <section className="card" aria-labelledby="plan-title">
        <div className="card-header">
          <div>
            <h2 id="plan-title" className="card-title">Today’s action plan</h2>
            <p className="card-subtitle">Due and overdue invoices, ranked by urgency</p>
          </div>
          <Button variant="ghost" size="sm" icon="refresh" onClick={refreshAll} loading={plan.loading && Boolean(plan.data)} aria-label="Refresh action plan">
            <span className="hide-sm">Refresh</span>
          </Button>
        </div>

        {plan.error ? (
          <div className="card-pad"><Alert tone="danger">Couldn’t load the action plan: {plan.error.message}</Alert></div>
        ) : plan.loading && !plan.data ? (
          <ul className="action-list" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="action-item"><div className="stack" style={{ gap: 8, flex: 1 }}><Skeleton width="40%" /><Skeleton width="70%" height={12} /></div><Skeleton width={90} height={20} /></li>
            ))}
          </ul>
        ) : actions.length === 0 ? (
          <EmptyState icon="checkCircle" title="You’re all caught up" action={can('write') && <a className="btn btn-secondary" href={href('/import')}>Import invoices</a>}>
            No invoices are due or overdue today. New follow-ups appear here automatically.
          </EmptyState>
        ) : (
          <ul className="action-list">
            {actions.map((a) => (
              <li key={a.id} className="action-item">
                <div className="action-main">
                  <div className="row" style={{ gap: 8 }}>
                    <Badge tone={PRIORITY_TONE[a.priority]}>{a.priority[0].toUpperCase() + a.priority.slice(1)}</Badge>
                    <span className="action-customer">{a.customerName}</span>
                    <span className="muted">{a.invoiceNumber}</span>
                  </div>
                  <p className="action-reason">{a.priorityReason} <span className="muted">· {a.recommendedNextStep}</span></p>
                </div>
                <div className="action-side">
                  <div className="action-amount tabular">{formatMoney(a.outstandingBalance)}</div>
                  <div className="muted action-days">{a.daysOverdue > 0 ? `${a.daysOverdue} day${a.daysOverdue === 1 ? '' : 's'} overdue` : 'Due today'}</div>
                  {can('write') && (
                    <div className="action-buttons">
                      <Button size="sm" icon="wallet" onClick={() => setActive({ type: 'payment', item: a })}>Payment</Button>
                      <Button size="sm" icon="message" onClick={() => setActive({ type: 'reminder', item: a })}>Remind</Button>
                      <Button size="sm" icon="calendar" onClick={() => setActive({ type: 'promise', item: a })}>Promise</Button>
                      <Button size="sm" variant="ghost" icon="flag" onClick={() => setActive({ type: 'dispute', item: a })} aria-label={`Flag dispute for ${a.invoiceNumber}`} />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ActionDialogs active={active} onClose={() => setActive(null)} onDone={refreshAll} />
    </div>
  );
}
