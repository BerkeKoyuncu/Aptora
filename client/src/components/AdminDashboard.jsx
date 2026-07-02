import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { History, FileText, Award, Shield, Plus, Mail, Copy, ExternalLink, RefreshCw, AlertTriangle } from 'lucide-react';

export default function AdminDashboard({ user, addToast, onInviteCandidate }) {
  const [metrics, setMetrics] = useState({
    totalQuestions: 0,
    totalTests: 0,
    completedSessions: 0,
    avgScore: 0
  });
  const [sessions, setSessions] = useState([]);
  const [tests, setTests] = useState([]);
  const [domainPerformance, setDomainPerformance] = useState([]);
  const [loading, setLoading] = useState(true);

  // Invite Modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedTestId, setSelectedTestId] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');
  const [inviteResult, setInviteResult] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [questionsRes, testsRes, sessionsRes] = await Promise.all([
        api.getQuestions(),
        api.getTests(),
        api.getSessions()
      ]);

      setTests(testsRes);
      setSessions(sessionsRes);

      // Compute statistics
      const completed = sessionsRes.filter(s => s.status === 'completed');
      const avg = completed.length > 0 
        ? completed.reduce((sum, s) => sum + (s.score / s.total_points * 100), 0) / completed.length 
        : 0;

      setMetrics({
        totalQuestions: questionsRes.length,
        totalTests: testsRes.length,
        completedSessions: completed.length,
        avgScore: parseFloat(avg.toFixed(1))
      });

      // Compute domain performance aggregation
      const domainScores = {}; // { domain: { sum: X, count: Y } }
      
      // We need to query results of completed sessions to aggregate domain-specific success rates
      // For simplicity, if we don't fetch full details for all sessions, we can fetch in batch or query from completed sessions.
      // Since fetching detail for each session is expensive, we can calculate a mock profile or aggregate based on feedback if available.
      // Wait, we can fetch detailed reports for the top 5 completed sessions or simulate a breakdown if database details are light.
      // Let's do a fast detail aggregation:
      const detailsPromises = completed.slice(0, 8).map(s => api.getSessionResults(s.id).catch(() => null));
      const detailedResults = await Promise.all(detailsPromises);
      
      detailedResults.forEach(res => {
        if (!res || !res.domainSuccessRates) return;
        Object.keys(res.domainSuccessRates).forEach(domain => {
          const stats = res.domainSuccessRates[domain];
          if (!domainScores[domain]) {
            domainScores[domain] = { sum: 0, count: 0 };
          }
          domainScores[domain].sum += stats.successRate;
          domainScores[domain].count += 1;
        });
      });

      const domainsList = Object.keys(domainScores).map(domain => ({
        name: domain,
        avgScore: parseFloat((domainScores[domain].sum / domainScores[domain].count).toFixed(1))
      })).sort((a, b) => a.avgScore - b.avgScore); // Show lowest performing first as weakness alert

      setDomainPerformance(domainsList);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSendInvite = async (e) => {
    e.preventDefault();
    if (!selectedTestId || !candidateEmail) {
      addToast('Please fill in all fields', 'warning');
      return;
    }

    try {
      const result = await api.createSessionLink(selectedTestId, candidateEmail);
      setInviteResult(result);
      addToast('Invitation link generated and logged in Virtual Mailbox.');
      fetchData(); // Refresh history
    } catch (err) {
      addToast(err.message, 'error');
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
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Welcome Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Security Operations Center Dashboard</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Welcome back to the administrator environment. Manage tests, review domain gaps, and audit users.</p>
        </div>
        <button onClick={onInviteCandidate} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Plus size={18} />
          <span>Invite Candidate</span>
        </button>
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
        <MetricCard icon={<Shield size={24} />} title="Question Pool" value={metrics.totalQuestions} sub="Active cybersecurity topics" />
        <MetricCard icon={<FileText size={24} />} title="Generated Tests" value={metrics.totalTests} sub="Custom configurations active" />
        <MetricCard icon={<History size={24} />} title="Exams Administered" value={metrics.completedSessions} sub="Completed test sessions" />
        <MetricCard icon={<Award size={24} />} title="Average Performance" value={`${metrics.avgScore}%`} sub="Across all scored sessions" />
      </div>

      {/* Analytics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>
        {/* Left Column: Recent Activity */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: '380px' }}>
          <div style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1.1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <History size={18} /> Recent Graded Sessions
            </h3>
            <button onClick={fetchData} className="btn btn-accent btn-sm" style={{ padding: '0.25rem 0.5rem' }}>
              <RefreshCw size={14} />
            </button>
          </div>

          <div style={{ overflowX: 'auto', flex: 1 }}>
            {sessions.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No exams have been completed yet.</p>
            ) : (
              <table style={{ width: '100%', fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Test Name</th>
                    <th>Grade</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.slice(0, 6).map(session => {
                    const gradePct = session.total_points > 0 
                      ? Math.round((session.score / session.total_points) * 100) 
                      : 0;
                    return (
                      <tr key={session.id}>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{session.candidate_name || 'Unregistered'}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{session.candidate_email}</div>
                        </td>
                        <td>{session.test_title}</td>
                        <td style={{ fontWeight: 700 }}>
                          {session.status === 'completed' ? (
                            <span style={{ color: gradePct >= 75 ? 'var(--color-success)' : gradePct >= 50 ? 'var(--color-warning)' : 'var(--color-error)' }}>
                              {gradePct}/100
                            </span>
                          ) : '--'}
                        </td>
                        <td>
                          <span className={`badge ${session.status === 'completed' ? 'badge-success' : session.status === 'active' ? 'badge-warning' : 'badge-accent'}`}>
                            {session.status}
                          </span>
                        </td>
                        <td>
                          {session.status === 'completed' && (
                            <a href={`#/results/${session.id}`} className="btn btn-accent btn-sm" style={{ display: 'inline-flex', padding: '0.2rem 0.4rem', fontSize: '0.75rem', alignItems: 'center', gap: '0.25rem' }}>
                              <span>Scorecard</span>
                              <ExternalLink size={12} />
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Column: Weakness Alerts */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '1.1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertTriangle size={18} style={{ color: 'var(--color-warning)' }} /> Domain Competency Analysis
            </h3>
          </div>

          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Average success rates mapped by domain across recent candidate tests. Critical weaknesses represent targets for training programs.
          </p>

          <div style={{ display: 'flex', flex: 1, flexDirection: 'column', gap: '1rem' }}>
            {domainPerformance.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Need graded test data to calculate domain competence levels.</p>
            ) : (
              domainPerformance.map(dp => {
                const score = dp.avgScore;
                let barColor = 'var(--color-success)';
                if (score < 50) barColor = 'var(--color-error)';
                else if (score < 75) barColor = 'var(--color-warning)';

                return (
                  <div key={dp.name} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 500 }}>
                      <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '300px' }}>{dp.name}</span>
                      <span style={{ fontWeight: 700, color: barColor }}>{score}% Avg</span>
                    </div>
                    {/* Visual Progress Bar */}
                    <div style={{ height: '8px', background: 'var(--color-border)', borderRadius: '4px', width: '100%', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${score}%`, backgroundColor: barColor, borderRadius: '4px', transition: 'width 0.5s ease-out' }}></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Invite Candidate Modal */}
      {showInviteModal && (
        <div className="modal-overlay">
          <div className="modal-content animate-fade" style={{ maxWidth: '500px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Mail size={20} style={{ color: 'var(--color-primary)' }} />
                <h3 style={{ margin: 0 }}>Generate Candidate Session</h3>
              </div>
              <button onClick={() => setShowInviteModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            {!inviteResult ? (
              <form onSubmit={handleSendInvite} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div>
                  <label>Select Test Configuration</label>
                  <select value={selectedTestId} onChange={e => setSelectedTestId(e.target.value)} required>
                    <option value="">-- Choose Active Test Schema --</option>
                    {tests.map(test => (
                      <option key={test.id} value={test.id}>
                        {test.title} ({test.num_questions} questions)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label>Candidate Email Address</label>
                  <input 
                    type="email" 
                    placeholder="candidate@company.com" 
                    value={candidateEmail} 
                    onChange={e => setCandidateEmail(e.target.value)} 
                    required 
                  />
                  <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                    An automated invitation link will be recorded in the local network simulation outbox.
                  </small>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                  <button type="button" onClick={() => setShowInviteModal(false)} className="btn btn-accent btn-sm">Cancel</button>
                  <button type="submit" className="btn btn-primary btn-sm">Generate Link</button>
                </div>
              </form>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div className="card" style={{ borderLeft: '4px solid var(--color-success)', background: 'rgba(46, 125, 50, 0.05)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-success)', fontWeight: 600 }}>
                    <CheckCircle size={18} />
                    <span>Session Created Successfully</span>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Copy this link and send it to the candidate, or navigate to the Virtual Mailbox to click it directly.
                  </p>
                </div>

                <div>
                  <label>Target Candidate</label>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>{candidateEmail}</div>
                </div>

                <div>
                  <label>Access Link</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input type="text" readOnly value={inviteResult.testLink} style={{ background: 'var(--color-bg)', color: 'var(--text-secondary)', fontSize: '0.8rem' }} />
                    <button onClick={copyInviteLink} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center' }}>
                      <Copy size={16} />
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
                  <button onClick={() => setShowInviteModal(false)} className="btn btn-accent btn-sm">Close</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Subcomponent: Card showing individual metrics
function MetricCard({ icon, title, value, sub }) {
  return (
    <div className="card" style={{
      display: 'flex',
      alignItems: 'center',
      gap: '1.25rem',
      padding: '1.25rem'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '50px',
        height: '50px',
        borderRadius: 'var(--radius-md)',
        background: 'rgba(74, 125, 135, 0.12)',
        color: 'var(--color-primary)'
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--color-primary)', lineHeight: 1.2, margin: '0.15rem 0' }}>{value}</div>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{sub}</span>
      </div>
    </div>
  );
}
