import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Search, RefreshCw, ExternalLink, Trash2, KeyRound, Eye, EyeOff, X, Mail, Copy, Send, CalendarClock, Ban, Activity } from 'lucide-react';
import { formatDateTimeUK } from '../utils/dateFormat';

const formatServerDate = formatDateTimeUK;

export default function TestExecutionHistory({ addToast }) {
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
  const [timelineSession, setTimelineSession] = useState(null);
  const [extendSession, setExtendSession] = useState(null);
  const [extensionHours, setExtensionHours] = useState(24);
  const [sessionActionBusy, setSessionActionBusy] = useState(false);

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
      await fetchHistory();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSendingCandidateEmail(false);
    }
  };

  const handleExtendSession = async (event) => {
    event.preventDefault();
    if (!extendSession) return;
    try {
      setSessionActionBusy(true);
      const result = await api.extendCandidateSession(extendSession.id, Number(extensionHours));
      addToast(result.message);
      setExtendSession(null);
      await fetchHistory();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSessionActionBusy(false);
    }
  };

  const handleRevokeSession = async (session) => {
    if (!window.confirm(`Revoke access for ${session.candidate_email}? The execution history will be preserved, but the candidate will no longer be able to sign in.`)) return;
    try {
      setSessionActionBusy(true);
      const result = await api.revokeCandidateSession(session.id);
      addToast(result.message);
      await fetchHistory();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSessionActionBusy(false);
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
              <th style={{ width: '220px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredSessions.map(session => {
              const gradePct = session.total_points > 0 
                ? Math.round((session.score / session.total_points) * 100) 
                : 0;
              const displayStatus = session.display_status || session.status;
              const passed = gradePct >= Number(session.pass_threshold ?? 70);
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
                      <div style={{ fontSize: '0.68rem', color: session.revoked_at ? 'var(--color-error)' : 'var(--text-muted)' }}>
                        {session.revoked_at ? 'Access revoked' : 'Temporary account removed'}
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                      <span>{session.test_title}</span>
                      {session.require_seb === 1 || session.require_seb === true ? (
                        <span style={{ fontSize: '0.65rem', color: 'var(--color-primary)', fontWeight: 600 }}>SEB · Direct/LAN Access</span>
                      ) : null}
                    </div>
                  </td>
                  <td>{session.creator_name}</td>
                  <td style={{ fontWeight: 600 }}>{session.status === 'completed' ? `${gradePct} / 100` : '--'}</td>
                  <td style={{ fontWeight: 700 }}>
                    {session.status === 'completed' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <span style={{ color: passed ? 'var(--color-success)' : 'var(--color-error)' }}>{gradePct}%</span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Threshold {session.pass_threshold ?? 70}%</span>
                        {session.decision_status && (
                          <span className="badge badge-accent" style={{ fontSize: '0.6rem', width: 'fit-content' }}>{session.decision_status.replace('_', ' ')}</span>
                        )}
                      </div>
                    ) : '--'}
                  </td>
                  <td>
                    <span className={`badge ${displayStatus === 'completed' ? 'badge-success' : displayStatus === 'active' ? 'badge-warning' : ['revoked', 'expired'].includes(displayStatus) ? 'badge-danger' : 'badge-accent'}`}>
                      {displayStatus}
                    </span>
                  </td>
                  <td>{formatServerDate(session.completed_at)}</td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
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
                      {session.status === 'pending' && session.candidate_account_active && (
                        <button
                          onClick={() => { setExtendSession(session); setExtensionHours(24); }}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '0.35rem', display: 'inline-flex', alignItems: 'center' }}
                          title="Extend candidate access"
                        >
                          <CalendarClock size={12} />
                        </button>
                      )}
                      {session.candidate_account_active && (
                        <button
                          onClick={() => handleRevokeSession(session)}
                          disabled={sessionActionBusy}
                          className="btn btn-danger btn-sm"
                          style={{ padding: '0.35rem', display: 'inline-flex', alignItems: 'center' }}
                          title="Revoke candidate access"
                        >
                          <Ban size={12} />
                        </button>
                      )}
                      <button
                        onClick={() => setTimelineSession(session)}
                        className="btn btn-accent btn-sm"
                        style={{ padding: '0.35rem', display: 'inline-flex', alignItems: 'center' }}
                        title="View activity timeline"
                      >
                        <Activity size={12} />
                      </button>
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

      {extendSession && (
        <div className="modal-overlay">
          <div className="modal-content animate-fade" style={{ maxWidth: '430px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ margin: 0 }}>Extend Candidate Access</h3>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{extendSession.candidate_email}</div>
              </div>
              <button type="button" onClick={() => setExtendSession(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleExtendSession} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="card" style={{ padding: '0.85rem', background: 'var(--color-panel)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Current expiry: <strong>{formatServerDate(extendSession.expires_at)}</strong>
              </div>
              <div>
                <label>Additional Hours</label>
                <select value={extensionHours} onChange={event => setExtensionHours(Number(event.target.value))}>
                  <option value={24}>24 hours</option>
                  <option value={72}>3 days</option>
                  <option value={168}>7 days</option>
                  <option value={336}>14 days</option>
                  <option value={720}>30 days</option>
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" className="btn btn-accent btn-sm" onClick={() => setExtendSession(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={sessionActionBusy}>
                  {sessionActionBusy ? 'Extending...' : 'Extend Access'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {timelineSession && (
        <div className="modal-overlay">
          <div className="modal-content animate-fade" style={{ maxWidth: '560px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ margin: 0 }}>Candidate Activity Timeline</h3>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{timelineSession.candidate_email}</div>
              </div>
              <button type="button" onClick={() => setTimelineSession(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {[
                ['Candidate account created', timelineSession.created_at],
                [`Invitation email sent${timelineSession.email_attempts ? ` (${timelineSession.email_attempts} email record${timelineSession.email_attempts === 1 ? '' : 's'})` : ''}`, timelineSession.last_email_sent_at],
                ['Candidate first signed in', timelineSession.first_login_at],
                ['Assessment started', timelineSession.started_at],
                ['Answers last autosaved', timelineSession.responses_updated_at],
                ['Candidate access revoked', timelineSession.revoked_at],
                ['Assessment completed', timelineSession.completed_at],
                ['Administrator decision updated', timelineSession.decided_at]
              ].filter(([, date]) => date).map(([label, date]) => (
                <div key={label} style={{ display: 'grid', gridTemplateColumns: '14px 1fr auto', gap: '0.75rem', alignItems: 'center' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--color-primary)', boxShadow: '0 0 0 3px rgba(74, 125, 135, 0.14)' }} />
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}>{label}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'right' }}>{formatServerDate(date)}</span>
                </div>
              ))}
              {timelineSession.status === 'pending' && timelineSession.candidate_account_active && (
                <div className="card" style={{ padding: '0.8rem', marginTop: '0.4rem', background: 'var(--color-panel)', fontSize: '0.8rem' }}>
                  Candidate access expires: <strong>{formatServerDate(timelineSession.expires_at)}</strong>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: emailDraft.emailTemplate.includes(emailDraft.sessionLinkPlaceholder) ? 'var(--color-warning)' : 'var(--color-success)', background: 'var(--color-panel)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '0.55rem 0.7rem', fontSize: '0.72rem', marginTop: '0.5rem', fontWeight: 600 }}>
                    {emailDraft.emailTemplate.includes(emailDraft.sessionLinkPlaceholder)
                      ? `Action required: replace ${emailDraft.sessionLinkPlaceholder} with the session link before sending.`
                      : 'Session link placeholder has been replaced. The email is ready to send.'}
                  </div>
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
