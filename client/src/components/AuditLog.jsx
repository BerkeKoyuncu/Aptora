import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { formatDateTimeUK } from '../utils/dateFormat';

const actionLabel = (value) => String(value || '')
  .replace(/[._-]+/g, ' ')
  .replace(/\b\w/g, letter => letter.toUpperCase());

const actorLabel = (log) => {
  if (log.actor_name) return log.actor_name;
  if (log.action?.startsWith('candidate.')) return 'Candidate';
  return 'System / Anonymous';
};

export default function AuditLog({ addToast }) {
  const [logs, setLogs] = useState([]);
  const [actions, setActions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, total_pages: 1 });
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState([]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getAuditLogs({ page, pageSize: 25, search, action });
      setLogs(data.logs || []);
      setActions(data.actions || []);
      setPagination(data.pagination || { page, total: 0, total_pages: 1 });
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [action, addToast, page, search]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const submitSearch = (event) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const toggleExpanded = (id) => {
    setExpanded(current => current.includes(id)
      ? current.filter(item => item !== id)
      : [...current, id]);
  };

  return (
    <div className="animate-fade" style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <ShieldCheck size={26} style={{ color: 'var(--color-primary)' }} />
          <div>
            <h2 style={{ margin: 0 }}>Security Audit Log</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0.25rem 0 0' }}>
              Review administrator, candidate, authentication, email, and assessment activity.
            </p>
          </div>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={fetchLogs} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(220px, 320px)', gap: '0.75rem' }}>
          <form onSubmit={submitSearch} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="search"
              value={searchInput}
              onChange={event => setSearchInput(event.target.value)}
              placeholder="Search actor, action, target, IP or details"
              aria-label="Search audit log"
            />
            <button type="submit" className="btn btn-primary btn-sm"><Search size={15} /> Search</button>
          </form>
          <select
            value={action}
            onChange={event => { setAction(event.target.value); setPage(1); }}
            aria-label="Filter by audit action"
          >
            <option value="">All actions</option>
            {actions.map(item => <option key={item} value={item}>{actionLabel(item)}</option>)}
          </select>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ margin: 0, minWidth: '980px' }}>
            <thead>
              <tr>
                <th style={{ width: 170 }}>Time</th>
                <th style={{ width: 150 }}>Actor</th>
                <th style={{ width: 230 }}>Action</th>
                <th>Target</th>
                <th style={{ width: 140 }}>IP Address</th>
                <th style={{ width: 80 }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {!loading && logs.length === 0 && (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No matching audit records.</td></tr>
              )}
              {loading && (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '3rem' }}><RefreshCw className="animate-spin" size={24} /></td></tr>
              )}
              {!loading && logs.map(log => {
                const isExpanded = expanded.includes(log.id);
                return (
                  <React.Fragment key={log.id}>
                    <tr>
                      <td style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{formatDateTimeUK(log.created_at)}</td>
                      <td>
                        <strong style={{ fontSize: '0.82rem' }}>{actorLabel(log)}</strong>
                        {log.actor_email && <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{log.actor_email}</div>}
                      </td>
                      <td><span className="badge" style={{ background: 'rgba(9, 96, 100, 0.1)', color: 'var(--color-primary)' }}>{actionLabel(log.action)}</span></td>
                      <td style={{ fontSize: '0.78rem' }}>
                        <div>{log.target_type || '--'}</div>
                        {log.target_id && <div style={{ color: 'var(--text-muted)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{log.target_id}</div>}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.76rem' }}>{log.ip_address || '--'}</td>
                      <td>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => toggleExpanded(log.id)} aria-label={`${isExpanded ? 'Hide' : 'Show'} audit details`}>
                          {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan="6" style={{ background: 'var(--color-panel)', padding: '1rem' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 0.35fr) minmax(300px, 1fr)', gap: '1rem' }}>
                            <div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>User Agent</div>
                              <div style={{ fontSize: '0.76rem', wordBreak: 'break-word' }}>{log.user_agent || '--'}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>Recorded Details</div>
                              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.76rem', fontFamily: 'monospace' }}>
                                {log.details == null ? '--' : JSON.stringify(log.details, null, 2)}
                              </pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.9rem 1rem', borderTop: '1px solid var(--color-border)' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
            {pagination.total} records · Page {pagination.page} of {pagination.total_pages}
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="btn btn-secondary btn-sm" disabled={loading || page <= 1} onClick={() => setPage(current => current - 1)}>
              <ChevronLeft size={15} /> Previous
            </button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={loading || page >= pagination.total_pages} onClick={() => setPage(current => current + 1)}>
              Next <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
