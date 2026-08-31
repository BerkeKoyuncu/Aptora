import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { Database, Info, RefreshCw, Server, ShieldCheck, Timer } from 'lucide-react';
import { formatDateTimeUK } from '../utils/dateFormat';

export default function SystemInformation({ addToast }) {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchInfo = useCallback(async () => {
    setLoading(true);
    try {
      setInfo(await api.getSystemInfo());
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchInfo();
  }, [fetchInfo]);

  const items = info ? [
    { icon: <Info size={20} />, label: 'Application Version', value: info.version },
    { icon: <Server size={20} />, label: 'Environment', value: info.environment },
    { icon: <Server size={20} />, label: 'Node.js Runtime', value: info.node_version },
    { icon: <Database size={20} />, label: 'Database', value: info.database },
    { icon: <Timer size={20} />, label: 'Server Time', value: formatDateTimeUK(info.server_time) },
    { icon: <Timer size={20} />, label: 'Display Time Zone', value: info.time_zone },
    { icon: <ShieldCheck size={20} />, label: 'Audit Retention', value: `${info.audit_retention_days} days` }
  ] : [];

  return (
    <div className="animate-fade" style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Info size={26} style={{ color: 'var(--color-primary)' }} />
          <div>
            <h2 style={{ margin: 0 }}>System Information</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0.25rem 0 0' }}>
              Runtime and release details for support and troubleshooting.
            </p>
          </div>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={fetchInfo} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {loading && !info ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center' }}><RefreshCw className="animate-spin" size={28} /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
          {items.map(item => (
            <div className="card" key={item.label} style={{ display: 'flex', gap: '0.85rem', alignItems: 'center', padding: '1.15rem' }}>
              <div style={{ display: 'flex', color: 'var(--color-primary)', background: 'rgba(9, 96, 100, 0.08)', padding: '0.65rem', borderRadius: 'var(--radius-md)' }}>{item.icon}</div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</div>
                <strong style={{ fontSize: '0.95rem' }}>{item.value || '--'}</strong>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
