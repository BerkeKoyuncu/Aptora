import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { FileText, RefreshCw, Mail, CheckCircle, Trash2, Copy, Play } from 'lucide-react';

export default function TestHistory({ user, addToast }) {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  
  // Invitation workflow states
  const [selectedTest, setSelectedTest] = useState(null);
  const [candidateEmail, setCandidateEmail] = useState('');
  const [inviteResult, setInviteResult] = useState(null);
  const [inviting, setInviting] = useState(false);

  const fetchTests = async () => {
    try {
      setLoading(true);
      const res = await api.getTests();
      setTests(res);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTests();
  }, []);

  const handleRegenerate = async (testId) => {
    if (!confirm('Are you sure you want to regenerate the questions? This will draw a fresh set of randomized questions for this test schema.')) return;
    try {
      await api.regenerateTest(testId);
      addToast('Questions regenerated successfully.');
      fetchTests();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleDelete = async (testId) => {
    if (!confirm('Are you sure you want to delete this test configuration? All linked candidate session records will be deleted.')) return;
    try {
      await api.deleteTest(testId);
      addToast('Test configuration deleted.');
      setSelectedIds(prev => prev.filter(x => x !== testId));
      if (selectedTest?.id === testId) {
        setSelectedTest(null);
        setInviteResult(null);
      }
      fetchTests();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleBulkDelete = async () => {
    if (user.role !== 'admin') {
      addToast('Only administrators can delete test configurations.', 'warning');
      return;
    }
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete the ${selectedIds.length} selected tests? All associated candidate session records will be deleted.`)) {
      return;
    }
    try {
      await api.bulkDeleteTests(selectedIds);
      addToast(`${selectedIds.length} tests deleted successfully.`);
      setSelectedIds([]);
      if (selectedTest && selectedIds.includes(selectedTest.id)) {
        setSelectedTest(null);
        setInviteResult(null);
      }
      fetchTests();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleSendInvite = async (e) => {
    e.preventDefault();
    if (!selectedTest || !candidateEmail) return;

    try {
      setInviting(true);
      const result = await api.createSessionLink(selectedTest.id, candidateEmail);
      setInviteResult(result);
      addToast(`Invitation link created for ${candidateEmail}`);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setInviting(false);
    }
  };

  const copyInviteLink = () => {
    if (!inviteResult) return;
    api.copyText(inviteResult.testLink);
    addToast('Invitation link copied to clipboard!');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
        <RefreshCw className="animate-spin" size={32} style={{ color: 'var(--color-primary)' }} />
      </div>
    );
  }

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '2rem', width: '100%', margin: 0 }}>
      {/* Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Test Configurations</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Review created test configurations, regenerate question drafts, or invite candidate sessions.
          </p>
        </div>
        <button onClick={fetchTests} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <RefreshCw size={18} />
          <span>Refresh</span>
        </button>
      </div>

      {selectedIds.length > 0 && user.role === 'admin' && (
        <div className="card animate-fade" style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 'var(--radius-md)' }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-danger)' }}>
            {selectedIds.length} tests selected
          </span>
          <button onClick={handleBulkDelete} className="btn btn-danger btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Trash2 size={14} />
            <span>Delete Selected</span>
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: selectedTest ? '1fr 350px' : '1fr', gap: '2rem', alignItems: 'flex-start' }}>
        {/* Left Side: Test list */}
        <div className="table-container" style={{ width: '100%' }}>
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                {user.role === 'admin' && (
                  <th style={{ width: '40px', textAlign: 'center' }}>
                    <input 
                      type="checkbox" 
                      checked={tests.length > 0 && tests.every(t => selectedIds.includes(t.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(tests.map(t => t.id));
                        } else {
                          setSelectedIds([]);
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                )}
                <th>Test Title</th>
                <th>Domains</th>
                <th>Questions Count</th>
                <th>Generation Mode</th>
                <th>Created By</th>
                <th>Created At</th>
                <th style={{ width: '220px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tests.map(test => (
                <tr key={test.id} style={{ background: selectedTest?.id === test.id ? 'rgba(74, 125, 135, 0.08)' : 'transparent' }}>
                  {user.role === 'admin' && (
                    <td style={{ textAlign: 'center' }}>
                      <input 
                        type="checkbox" 
                        checked={selectedIds.includes(test.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(prev => [...prev, test.id]);
                          } else {
                            setSelectedIds(prev => prev.filter(x => x !== test.id));
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                  )}
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{test.title}</div>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {test.domains.length} selected
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{test.num_questions}</td>
                  <td>
                    <span className={`badge ${test.is_random ? 'badge-primary' : 'badge-accent'}`}>
                      {test.is_random ? 'Randomized' : 'Manual'}
                    </span>
                  </td>
                  <td>{test.creator_name}</td>
                  <td style={{ fontSize: '0.8rem' }}>{new Date(test.created_at).toLocaleDateString()}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button 
                        onClick={() => { setSelectedTest(test); setCandidateEmail(''); setInviteResult(null); }} 
                        className="btn btn-primary btn-sm"
                        style={{ display: 'inline-flex', padding: '0.2rem 0.5rem', fontSize: '0.75rem', alignItems: 'center', gap: '0.25rem' }}
                      >
                        <Mail size={12} />
                        <span>Invite</span>
                      </button>
                      
                      {test.is_random && (
                        <button 
                          onClick={() => handleRegenerate(test.id)} 
                          className="btn btn-accent btn-sm"
                          style={{ display: 'inline-flex', padding: '0.2rem 0.5rem', fontSize: '0.75rem', alignItems: 'center', gap: '0.25rem' }}
                        >
                          <RefreshCw size={12} />
                          <span>Re-draw</span>
                        </button>
                      )}

                      <button 
                        onClick={() => handleDelete(test.id)} 
                        className="btn btn-danger btn-sm"
                        style={{ display: 'inline-flex', padding: '0.2rem', fontSize: '0.75rem', alignItems: 'center' }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {tests.length === 0 && (
                <tr>
                  <td colSpan={user.role === 'admin' ? 8 : 7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    No test configurations found. Generate one in the creation panel.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Right Side: Invite Panel (Appears when a test is selected) */}
        {selectedTest && (
          <div className="card animate-fade" style={{ background: 'var(--color-card)', display: 'flex', flexDirection: 'column', gap: '1.25rem', position: 'sticky', top: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
              <h3 style={{ fontSize: '1rem', margin: 0 }}>Invite to Test</h3>
              <button onClick={() => setSelectedTest(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Close</button>
            </div>
            
            <div style={{ fontSize: '0.85rem' }}>
              <strong>Test:</strong> {selectedTest.title}
            </div>

            {!inviteResult ? (
              <form onSubmit={handleSendInvite} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem' }}>Candidate Email</label>
                  <input 
                    type="email" 
                    placeholder="candidate@company.com" 
                    value={candidateEmail} 
                    onChange={e => setCandidateEmail(e.target.value)} 
                    required 
                  />
                </div>
                <button type="submit" className="btn btn-primary btn-sm" style={{ width: '100%' }} disabled={inviting}>
                  {inviting ? 'Generating Link...' : 'Generate Access Link'}
                </button>
              </form>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ borderLeft: '4px solid var(--color-success)', background: 'rgba(46, 125, 50, 0.05)', padding: '0.5rem', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--color-success)', fontWeight: 600, fontSize: '0.8rem' }}>
                    <CheckCircle size={14} />
                    <span>Link Generated</span>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem' }}>Access Link</label>
                  <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.25rem' }}>
                    <input 
                      type="text" 
                      readOnly 
                      value={inviteResult.testLink} 
                      style={{ background: 'var(--color-panel)', fontSize: '0.75rem', padding: '0.4rem', border: '1px solid var(--color-border)', borderRadius: '4px' }} 
                    />
                    <button onClick={copyInviteLink} className="btn btn-secondary btn-sm" style={{ padding: '0.4rem' }}>
                      <Copy size={14} />
                    </button>
                  </div>
                  <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'block', marginTop: '0.5rem' }}>
                    Copy this link and send it to the candidate. They can take the test immediately.
                  </small>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
