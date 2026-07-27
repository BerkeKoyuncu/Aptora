import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { History, Search, RefreshCw, ExternalLink, Trash2, KeyRound, Eye, EyeOff, X, Mail, Copy, Send } from 'lucide-react';

export default function TestExecutionHistory({ user, addToast }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [credentialSession, setCredentialSession] = useState(null);
  const [credentialEmail, setCredentialEmail] = useState('');
  const [credentialPassword, setCredentialPassword] = useState('');
  const [showCredentialPassword, setShowCredentialPassword] = useState(false);
  const [loadingCredentials, setLoadingCredentials] = useState(false);
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [emailDraftSession, setEmailDraftSession] = useState(null);
  const [emailDraft, setEmailDraft] = useState(null);
  const [loadingEmailDraft, setLoadingEmailDraft] = useState(false);
  const [sendingCandidateEmail, setSendingCandidateEmail] = useState(false);

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

  const openCredentials = async (session) => {
    setCredentialSession(session);
    setCredentialEmail(session.candidate_email || '');
    setCredentialPassword('');
    setShowCredentialPassword(false);
    setLoadingCredentials(true);
    try {
      const credentials = await api.getCandidateCredentials(session.id);
      setCredentialEmail(credentials.candidate_email);
      setCredentialPassword(credentials.candidate_password);
    } catch (err) {
      addToast(err.message, 'error');
      setCredentialSession(null);
    } finally {
      setLoadingCredentials(false);
    }
  };

  const handleSaveCredentials = async (event) => {
    event.preventDefault();
    if (!credentialSession) return;
    try {
      setSavingCredentials(true);
      await api.updateCandidateCredentials(credentialSession.id, credentialEmail, credentialPassword);
      addToast('Candidate login credentials updated.');
      setCredentialSession(null);
      await fetchHistory();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSavingCredentials(false);
    }
  };

  const openEmailDraft = async (session) => {
    setEmailDraftSession(session);
    setEmailDraft(null);
    setLoadingEmailDraft(true);
    try {
      const draft = await api.getCandidateEmailTemplate(session.id);
      setEmailDraft(draft);
    } catch (err) {
      addToast(err.message, 'error');
      setEmailDraftSession(null);
    } finally {
      setLoadingEmailDraft(false);
    }
  };

  const copyDraftField = async (value, label) => {
    try {
      await api.copyText(value);
      addToast(`${label} copied to clipboard.`);
    } catch {
      addToast(`${label} could not be copied.`, 'error');
    }
  };

  const sendEmailDraft = async () => {
    if (!emailDraft) return;
    if (emailDraft.emailTemplate.includes(emailDraft.sessionLinkPlaceholder)) {
      addToast('Replace the session-link placeholder before sending.', 'warning');
      return;
    }
    try {
      setSendingCandidateEmail(true);
      const result = await api.sendCandidateEmail(
        emailDraft.candidateEmail,
        emailDraft.emailSubject,
        emailDraft.emailTemplate
      );
      addToast(result.message);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSendingCandidateEmail(false);
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
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span>{session.candidate_name || 'Unregistered'}</span>
                      {session.focus_lost_count > 0 && (
                        <span className="badge badge-danger" style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem' }} title={`Tab switched ${session.focus_lost_count} times`}>
                          ⚠️ {session.focus_lost_count} Warning{session.focus_lost_count > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{session.candidate_email}</div>
                    {!session.candidate_account_active && (
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Temporary account removed</div>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                      <span>{session.test_title}</span>
                      {session.require_seb === 1 || session.require_seb === true ? (
                        <span style={{ fontSize: '0.65rem', color: 'var(--color-primary)', fontWeight: 600 }}>🛡️ SEB Enforced</span>
                      ) : null}
                    </div>
                  </td>
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
                        <a href={`#/admin-results/${session.id}`} className="btn btn-accent btn-sm" style={{ display: 'inline-flex', padding: '0.2rem 0.4rem', fontSize: '0.75rem', alignItems: 'center', gap: '0.25rem' }}>
                          <span>Scorecard</span>
                          <ExternalLink size={12} />
                        </a>
                      )}
                      {session.candidate_account_active && (
                        <button
                          onClick={() => openCredentials(session)}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '0.35rem', display: 'inline-flex', alignItems: 'center' }}
                          title="View or edit candidate login credentials"
                        >
                          <KeyRound size={12} />
                        </button>
                      )}
                      {session.status === 'pending' && session.candidate_account_active && (
                        <button
                          onClick={() => openEmailDraft(session)}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '0.35rem', display: 'inline-flex', alignItems: 'center' }}
                          title="Open candidate email"
                        >
                          <Mail size={12} />
                        </button>
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

      {credentialSession && (
        <div className="modal-overlay">
          <div className="modal-content animate-fade" style={{ maxWidth: '460px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ margin: 0 }}>Candidate Login Credentials</h3>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{credentialSession.test_title}</div>
              </div>
              <button type="button" onClick={() => setCredentialSession(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveCredentials} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label>Candidate Email</label>
                <input
                  type="email"
                  value={credentialEmail}
                  onChange={event => setCredentialEmail(event.target.value)}
                  disabled={loadingCredentials}
                  required
                />
              </div>

              <div>
                <label>Candidate Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showCredentialPassword ? 'text' : 'password'}
                    value={credentialPassword}
                    onChange={event => setCredentialPassword(event.target.value)}
                    placeholder={loadingCredentials ? 'Loading...' : 'Set a new password'}
                    disabled={loadingCredentials}
                    required
                    style={{ paddingRight: '2.8rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCredentialPassword(value => !value)}
                    aria-label={showCredentialPassword ? 'Hide password' : 'Show password'}
                    title={showCredentialPassword ? 'Hide password' : 'Show password'}
                    style={{
                      position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                      border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
                      padding: '0.2rem', display: 'inline-flex', alignItems: 'center'
                    }}
                  >
                    {showCredentialPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-accent btn-sm" onClick={() => setCredentialSession(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={savingCredentials || loadingCredentials}>
                  {savingCredentials ? 'Saving...' : 'Save Credentials'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {emailDraftSession && (
        <div className="modal-overlay">
          <div className="modal-content animate-fade" style={{ maxWidth: '720px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ margin: 0 }}>Candidate Email</h3>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  {emailDraftSession.candidate_email}
                </div>
              </div>
              <button type="button" onClick={() => setEmailDraftSession(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            {loadingEmailDraft || !emailDraft ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                <RefreshCw className="animate-spin" size={28} style={{ color: 'var(--color-primary)' }} />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label>Email Subject</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text"
                      value={emailDraft.emailSubject}
                      onChange={event => setEmailDraft(current => ({ ...current, emailSubject: event.target.value }))}
                    />
                    <button type="button" onClick={() => copyDraftField(emailDraft.emailSubject, 'Email subject')} className="btn btn-secondary btn-sm" title="Copy email subject">
                      <Copy size={14} />
                    </button>
                  </div>
                </div>

                <div>
                  <label>Email Text</label>
                  <textarea
                    value={emailDraft.emailTemplate}
                    onChange={event => setEmailDraft(current => ({ ...current, emailTemplate: event.target.value }))}
                    rows={20}
                    style={{ width: '100%', resize: 'vertical', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '0.82rem', lineHeight: 1.45 }}
                  />
                  <small style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: '0.4rem' }}>
                    Replace {emailDraft.sessionLinkPlaceholder} with the session link before sending.
                  </small>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '0.75rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
                  <button type="button" onClick={() => copyDraftField(emailDraft.emailTemplate, 'Email text')} className="btn btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Copy size={14} />
                    Copy Email Text
                  </button>
                  <button type="button" onClick={sendEmailDraft} className="btn btn-secondary btn-sm" disabled={sendingCandidateEmail} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    {sendingCandidateEmail ? <RefreshCw className="animate-spin" size={14} /> : <Send size={14} />}
                    {sendingCandidateEmail ? 'Sending...' : 'Send Email'}
                  </button>
                  <button type="button" onClick={() => setEmailDraftSession(null)} className="btn btn-accent btn-sm">Close</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
