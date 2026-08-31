import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Mail, Copy, RefreshCw, Clock, Trash2, ChevronDown, ChevronUp, AlertTriangle, RotateCcw, CheckCircle, XCircle } from 'lucide-react';
import { formatDateTimeUK } from '../utils/dateFormat';

const isValidWebLink = (value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const formatServerDate = formatDateTimeUK;

export default function VirtualMailbox({ user, addToast }) {
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [expandedIds, setExpandedIds] = useState([]);
  const [retryingIds, setRetryingIds] = useState([]);

  const fetchEmails = async () => {
    try {
      setLoading(true);
      const res = await api.getEmails();
      setEmails(res);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmails();
  }, []);

  const copyText = async (text, label) => {
    try {
      await api.copyText(text);
      addToast(`${label} copied to clipboard!`);
    } catch {
      addToast(`${label} could not be copied.`, 'error');
    }
  };

  const handleDeleteEmail = async (id) => {
    if (!window.confirm('Are you sure you want to delete this email record from the outbox?')) {
      return;
    }
    try {
      await api.deleteEmail(id);
      addToast('Email record deleted.');
      setSelectedIds(prev => prev.filter(x => x !== id));
      fetchEmails();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete the ${selectedIds.length} selected email records? This action is permanent.`)) {
      return;
    }
    try {
      await api.bulkDeleteEmails(selectedIds);
      addToast(`${selectedIds.length} emails deleted successfully.`);
      setSelectedIds([]);
      fetchEmails();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleRetryEmail = async (email) => {
    try {
      setRetryingIds(previous => [...previous, email.id]);
      const result = await api.retryEmail(email.id);
      addToast(result.message);
      await fetchEmails();
    } catch (err) {
      addToast(err.message, 'error');
      await fetchEmails();
    } finally {
      setRetryingIds(previous => previous.filter(id => id !== email.id));
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
        <RefreshCw className="animate-spin" size={32} style={{ color: 'var(--color-primary)' }} />
      </div>
    );
  }

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Virtual Mailbox</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Track queued, delivered, and failed candidate emails sent through your SMTP connection.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {emails.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'var(--color-card)', border: '1px solid var(--color-border)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)' }}>
              <input 
                type="checkbox" 
                checked={emails.length > 0 && emails.every(e => selectedIds.includes(e.id))}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedIds(emails.map(x => x.id));
                  } else {
                    setSelectedIds([]);
                  }
                }}
                style={{ cursor: 'pointer' }}
                id="select-all-emails"
              />
              <label htmlFor="select-all-emails" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', margin: 0 }}>Select All</label>
            </div>
          )}
          <button onClick={fetchEmails} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <RefreshCw size={18} />
            <span>Refresh Mailbox</span>
          </button>
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="card animate-fade" style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 'var(--radius-md)' }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-danger)' }}>
            {selectedIds.length} email records selected
          </span>
          <button onClick={handleBulkDelete} className="btn btn-danger btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Trash2 size={14} />
            <span>Delete Selected</span>
          </button>
        </div>
      )}

      {/* Outbox List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {emails.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
            <Mail size={48} style={{ margin: '0 auto 1rem auto', color: 'var(--color-border)' }} />
            <h4>No Emails Sent Yet</h4>
            <p style={{ fontSize: '0.85rem' }}>
              Create an invitation from the Dashboard using "Invite Candidate" to log outbound mails.
            </p>
          </div>
        ) : (
          emails.map(email => (
            <div key={email.id} className="card" style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              borderLeft: `4px solid ${email.delivery_status === 'sent' ? 'var(--color-success)' : email.delivery_status === 'failed' ? 'var(--color-error)' : 'var(--color-warning)'}`,
              background: selectedIds.includes(email.id) ? 'rgba(74, 125, 135, 0.1)' : 'var(--color-card)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <input 
                    type="checkbox" 
                    checked={selectedIds.includes(email.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(prev => [...prev, email.id]);
                      } else {
                        setSelectedIds(prev => prev.filter(x => x !== email.id));
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>RECIPIENT</div>
                    <div style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{email.to_email}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span className={`badge ${email.delivery_status === 'sent' ? 'badge-success' : email.delivery_status === 'failed' ? 'badge-danger' : 'badge-warning'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                    {email.delivery_status === 'sent' ? <CheckCircle size={12} /> : email.delivery_status === 'failed' ? <XCircle size={12} /> : <RefreshCw className={email.delivery_status === 'sending' ? 'animate-spin' : ''} size={12} />}
                    {email.delivery_status || 'sent'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <Clock size={12} />
                    <span>{formatServerDate(email.delivered_at || email.last_attempt_at || email.sent_at)}</span>
                  </div>
                  {user.role === 'admin' && (
                    <button 
                      onClick={() => handleDeleteEmail(email.id)} 
                      className="btn btn-danger btn-sm" 
                      style={{ padding: '0.25rem', background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      title="Delete email"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>SUBJECT</div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{email.subject}</div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                <span>Attempts: <strong>{email.attempt_count || 0}</strong></span>
                {email.last_attempt_at && <span>Last attempt: <strong>{formatServerDate(email.last_attempt_at)}</strong></span>}
                {email.message_id && <span>Message-ID: <strong style={{ wordBreak: 'break-all' }}>{email.message_id}</strong></span>}
              </div>

              {email.delivery_status === 'failed' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', padding: '0.8rem', borderRadius: 'var(--radius-sm)', background: 'rgba(211, 47, 47, 0.06)', border: '1px solid rgba(211, 47, 47, 0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.45rem', color: 'var(--color-error)', fontSize: '0.78rem' }}>
                    <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '0.05rem' }} />
                    <span style={{ wordBreak: 'break-word' }}>{email.error_message || 'SMTP delivery failed without an error message.'}</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleRetryEmail(email)}
                    disabled={retryingIds.includes(email.id) || !email.can_retry}
                    title={!email.can_retry ? 'The candidate account is no longer active, so this email cannot be retried' : 'Retry SMTP delivery'}
                    style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    <RotateCcw className={retryingIds.includes(email.id) ? 'animate-spin' : ''} size={14} />
                    {retryingIds.includes(email.id) ? 'Retrying...' : 'Retry Delivery'}
                  </button>
                </div>
              )}

              {email.body_text && (
                <div>
                  <button
                    type="button"
                    onClick={() => setExpandedIds(previous => previous.includes(email.id)
                      ? previous.filter(id => id !== email.id)
                      : [...previous, email.id])}
                    className="btn btn-accent btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    {expandedIds.includes(email.id) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {expandedIds.includes(email.id) ? 'Hide Email' : 'View Email'}
                  </button>

                  {expandedIds.includes(email.id) && (
                    <div style={{ marginTop: '0.75rem' }}>
                      <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '1rem', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '0.82rem', lineHeight: 1.5, whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>
                        {email.body_text}
                      </div>
                      <button type="button" onClick={() => copyText(email.body_text, 'Email text')} className="btn btn-accent btn-sm" style={{ marginTop: '0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Copy size={14} />
                        Copy Email Text
                      </button>
                    </div>
                  )}
                </div>
              )}

              {email.link && (
                <div style={{ marginTop: '0.25rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>
                    CANDIDATE SESSION LINK
                  </div>
                  {isValidWebLink(email.link) ? (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input
                        type="text"
                        readOnly
                        value={email.link}
                        style={{ background: 'var(--color-bg)', color: 'var(--text-secondary)', fontSize: '0.8rem', padding: '0.5rem' }}
                      />
                      <button
                        type="button"
                        onClick={() => copyText(email.link, 'Candidate session link')}
                        className="btn btn-accent btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.5rem 0.75rem' }}
                      >
                        <Copy size={16} />
                        Copy Link
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--color-error)', fontSize: '0.8rem' }}>
                      <AlertTriangle size={15} />
                      Invalid session link stored in this historical email.
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
