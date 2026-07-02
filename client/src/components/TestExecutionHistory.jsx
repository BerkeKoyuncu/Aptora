import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { History, Search, RefreshCw, ExternalLink, Trash2 } from 'lucide-react';

export default function TestExecutionHistory({ user, addToast }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const res = await api.getSessions();
      setSessions(res);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleDeleteSession = async (id) => {
    if (!window.confirm('Are you sure you want to delete this test execution session? This action is permanent.')) {
      return;
    }
    try {
      await api.deleteSession(id);
      addToast('Test session record deleted.');
      setSelectedIds(prev => prev.filter(x => x !== id));
      fetchHistory();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete the ${selectedIds.length} selected test session records? This action is permanent.`)) {
      return;
    }
    try {
      await api.bulkDeleteSessions(selectedIds);
      addToast(`${selectedIds.length} test sessions deleted successfully.`);
      setSelectedIds([]);
      fetchHistory();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const filteredSessions = sessions.filter(s => {
    const term = searchQuery.toLowerCase();
    const name = (s.candidate_name || '').toLowerCase();
    const email = (s.candidate_email || '').toLowerCase();
    const title = (s.test_title || '').toLowerCase();
    return name.includes(term) || email.includes(term) || title.includes(term);
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
        <RefreshCw className="animate-spin" size={32} style={{ color: 'var(--color-primary)' }} />
      </div>
    );
  }

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', margin: 0 }}>
      {/* Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Test Execution History</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Audit completed assessments, candidate details, grades, and domain metrics.
          </p>
        </div>
        <button onClick={fetchHistory} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <RefreshCw size={18} />
          <span>Refresh List</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="card" style={{ display: 'flex', gap: '1rem', padding: '1rem', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, background: 'var(--color-input-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '0.25rem 0.75rem' }}>
          <Search size={18} style={{ color: 'var(--text-muted)' }} />
          <input 
            type="text" 
            placeholder="Search by candidate name, email, or test title..." 
            value={searchQuery} 
            onChange={e => setSearchQuery(e.target.value)} 
            style={{ border: 'none', padding: '0.5rem 0', boxShadow: 'none', background: 'transparent' }}
          />
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="card animate-fade" style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 'var(--radius-md)' }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-danger)' }}>
            {selectedIds.length} test sessions selected
          </span>
          <button onClick={handleBulkDelete} className="btn btn-danger btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Trash2 size={14} />
            <span>Delete Selected</span>
          </button>
        </div>
      )}

      {/* History table */}
      <div className="table-container" style={{ width: '100%' }}>
        <table style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: '40px', textAlign: 'center' }}>
                <input 
                  type="checkbox" 
                  checked={filteredSessions.length > 0 && filteredSessions.every(s => selectedIds.includes(s.id))}
                  onChange={(e) => {
                    if (e.target.checked) {
                      const allFilteredIds = filteredSessions.map(s => s.id);
                      setSelectedIds(prev => Array.from(new Set([...prev, ...allFilteredIds])));
                    } else {
                      const allFilteredIds = filteredSessions.map(s => s.id);
                      setSelectedIds(prev => prev.filter(id => !allFilteredIds.includes(id)));
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                />
              </th>
              <th>Candidate</th>
              <th>Test Name</th>
              <th>Creator</th>
              <th>Score</th>
              <th>Grade Rate</th>
              <th>Status</th>
              <th>Completion Date</th>
              <th style={{ width: '120px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredSessions.map(session => {
              const gradePct = session.total_points > 0 
                ? Math.round((session.score / session.total_points) * 100) 
                : 0;
              return (
                <tr key={session.id}>
                  <td style={{ textAlign: 'center' }}>
                    <input 
                      type="checkbox" 
                      checked={selectedIds.includes(session.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(prev => [...prev, session.id]);
                        } else {
                          setSelectedIds(prev => prev.filter(x => x !== session.id));
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{session.candidate_name || 'Unregistered'}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{session.candidate_email}</div>
                  </td>
                  <td>{session.test_title}</td>
                  <td>{session.creator_name}</td>
                  <td style={{ fontWeight: 600 }}>{session.status === 'completed' ? `${gradePct} / 100` : '--'}</td>
                  <td style={{ fontWeight: 700 }}>
                    {session.status === 'completed' ? (
                      <span style={{ color: gradePct >= 75 ? 'var(--color-success)' : gradePct >= 50 ? 'var(--color-warning)' : 'var(--color-error)' }}>
                        {gradePct}%
                      </span>
                    ) : '--'}
                  </td>
                  <td>
                    <span className={`badge ${session.status === 'completed' ? 'badge-success' : session.status === 'active' ? 'badge-warning' : 'badge-accent'}`}>
                      {session.status}
                    </span>
                  </td>
                  <td>{session.completed_at ? new Date(session.completed_at).toLocaleString() : '--'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                      {session.status === 'completed' && (
                        <a href={`#/results/${session.id}`} className="btn btn-accent btn-sm" style={{ display: 'inline-flex', padding: '0.2rem 0.4rem', fontSize: '0.75rem', alignItems: 'center', gap: '0.25rem' }}>
                          <span>Scorecard</span>
                          <ExternalLink size={12} />
                        </a>
                      )}
                      <button 
                        onClick={() => handleDeleteSession(session.id)} 
                        className="btn btn-danger btn-sm" 
                        style={{ padding: '0.35rem', display: 'inline-flex', alignItems: 'center' }}
                        title="Delete Session Record"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredSessions.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  No candidate records match the criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
