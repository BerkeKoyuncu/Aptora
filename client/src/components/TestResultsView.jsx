import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Printer, Download, ArrowLeft, RefreshCw, Award, Clock, BookOpen, AlertCircle, CheckCircle, XCircle } from 'lucide-react';

const DIFFICULTY_LABELS = { 1: 'Beginner', 2: 'Elementary', 3: 'Intermediate', 4: 'Advanced', 5: 'Expert' };

const getDifficultyBadgeStyle = (diff) => {
  const styles = {
    1: { backgroundColor: 'rgba(46, 125, 50, 0.1)', color: 'var(--color-success)', border: '1px solid rgba(46, 125, 50, 0.2)' },
    2: { backgroundColor: 'rgba(2, 136, 209, 0.1)', color: 'var(--color-info)', border: '1px solid rgba(2, 136, 209, 0.2)' },
    3: { backgroundColor: 'rgba(74, 125, 135, 0.1)', color: 'var(--color-secondary)', border: '1px solid rgba(74, 125, 135, 0.2)' },
    4: { backgroundColor: 'rgba(237, 108, 2, 0.1)', color: 'var(--color-warning)', border: '1px solid rgba(237, 108, 2, 0.2)' },
    5: { backgroundColor: 'rgba(211, 47, 47, 0.1)', color: 'var(--color-error)', border: '1px solid rgba(211, 47, 47, 0.2)' }
  };
  return styles[diff] || { backgroundColor: 'var(--color-border)', color: 'var(--text-secondary)' };
};

export default function TestResultsView({ sessionId, addToast, onBackToDashboard }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchResults = async () => {
      try {
        setLoading(true);
        const data = await api.getSessionResults(sessionId);
        setResults(data);
      } catch (err) {
        addToast(err.message, 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchResults();
  }, [sessionId]);

  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    if (!results) return;

    // Header info
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "APTORA ASSESSMENT SCORECARD REPORT\n";
    csvContent += `Assessment:,"${results.test_title}"\n`;
    csvContent += `Candidate:,"${results.candidate_name}"\n`;
    csvContent += `Email:,"${results.candidate_email}"\n`;
    csvContent += `Date Completed:,${new Date(results.completed_at).toLocaleString()}\n`;
    csvContent += `Total Score:,${results.percentage} / 100\n\n`;

    // Domain breakdown header
    csvContent += "DOMAIN SUCCESS BREAKDOWN\n";
    csvContent += "Domain,Possible Points,Scored Points,Success Rate (%)\n";
    Object.keys(results.domainSuccessRates).forEach(domain => {
      const dStats = results.domainSuccessRates[domain];
      csvContent += `"${domain}",${dStats.possible},${dStats.scored},${dStats.successRate}%\n`;
    });
    csvContent += "\n";

    // Detailed responses header
    csvContent += "QUESTION LEVEL RESPONSES AUDIT LOG\n";
    csvContent += "Question Number,Domain,Points,Difficulty,Evaluation,Selected Choice,Correct Choice,Question Text\n";
    results.feedback.forEach((q, idx) => {
      const selectedOptText = q.options.find(o => o.id === q.selectedOptionId)?.text || "Skipped";
      const correctOptText = q.options.find(o => o.id === q.correctOptionId)?.text || "";
      const evaluation = q.isCorrect ? "CORRECT" : "INCORRECT";
      
      csvContent += `${idx + 1},"${q.domain}",${q.points},${DIFFICULTY_LABELS[q.difficulty] || q.difficulty},${evaluation},"${selectedOptText.replace(/"/g, '""')}"` +
                    `,"${correctOptText.replace(/"/g, '""')}","${q.question_text.replace(/"/g, '""')}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const filename = `scorecard_${results.candidate_name.replace(/\s+/g, '_')}_${results.id.substring(0, 6)}.csv`;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast('CSV export completed.');
  };

  const getElapsedTime = (start, end) => {
    if (!start || !end) return 'N/A';
    const diff = new Date(end).getTime() - new Date(start).getTime();
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return `${mins}m ${secs}s`;
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem', height: '100vh', alignItems: 'center' }}>
        <RefreshCw className="animate-spin" size={32} style={{ color: 'var(--color-primary)' }} />
      </div>
    );
  }

  if (!results) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <AlertCircle size={48} style={{ color: 'var(--color-error)', margin: '0 auto 1rem auto' }} />
        <h3>Failed to Load Grade Scorecard</h3>
        <button onClick={onBackToDashboard} className="btn btn-primary" style={{ marginTop: '1rem' }}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  const passed = results.percentage >= 70;

  return (
    <div className="animate-fade" style={{ maxWidth: '1000px', margin: '2rem auto', padding: '0 1.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Top action controls */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={onBackToDashboard} className="btn btn-accent" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <ArrowLeft size={16} />
          <span>Back to Portal</span>
        </button>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={handleExportCSV} className="btn btn-accent" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Download size={16} />
            <span>Export CSV</span>
          </button>
          <button onClick={handlePrint} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Printer size={16} />
            <span>Print Report (PDF)</span>
          </button>
        </div>
      </div>

      {/* Main Scorecard Sheet */}
      <div className="glass-panel" style={{ padding: '3rem', background: 'white', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        {/* Print Brand Header (Hidden in UI by CSS classes, but shown in print layout) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid var(--color-primary)', paddingBottom: '1rem' }}>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-secondary)', letterSpacing: '0.1em' }}>APTORA TESTING REPORT</span>
            <h1 style={{ margin: '0.2rem 0', fontSize: '2rem' }}>{results.test_title}</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Cybersecurity and Network Engineering Competency Assessment Verification
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className={`badge ${passed ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '1rem', padding: '0.5rem 1rem' }}>
              {passed ? 'PASSED' : 'RE-AUDIT NEEDED'}
            </span>
          </div>
        </div>

        {/* Profiles Metadata Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', background: 'var(--color-panel)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>CANDIDATE</div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1.05rem' }}>{results.candidate_name}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{results.candidate_email}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>METRICS SUMMARY</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Dep: <strong>{results.candidate_info?.department || 'N/A'}</strong>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Title: <strong>{results.candidate_info?.jobTitle || 'N/A'}</strong>
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>DURATION TIME</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem', marginTop: '0.2rem' }}>
              <Clock size={16} />
              <span>{getElapsedTime(results.started_at, results.completed_at)}</span>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Ended {new Date(results.completed_at).toLocaleDateString()}
            </span>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>SCORE CARD</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem', marginTop: '0.1rem' }}>
              <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-primary)' }}>{results.percentage}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>/ 100</span>
            </div>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: passed ? 'var(--color-success)' : 'var(--color-error)' }}>
              ({passed ? 'PASSED' : 'RE-AUDIT NEEDED'})
            </span>
          </div>
        </div>

        {/* Domain success list (visual breakdown) */}
        <div>
          <h3 style={{ fontSize: '1.1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem', marginBottom: '1.25rem' }}>
            Domain Success Analysis
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
            {Object.keys(results.domainSuccessRates).map(domain => {
              const stats = results.domainSuccessRates[domain];
              const success = stats.successRate;
              
              let statusColor = 'var(--color-success)';
              if (success < 50) statusColor = 'var(--color-error)';
              else if (success < 75) statusColor = 'var(--color-warning)';

              return (
                <div key={domain} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', background: 'var(--color-panel)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: '0.85rem' }}>
                    <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{domain}</span>
                    <span style={{ fontWeight: 800, color: statusColor }}>{success}%</span>
                  </div>
                  {/* Progress bar */}
                  <div style={{ height: '8px', background: 'var(--color-border)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${success}%`, backgroundColor: statusColor, borderRadius: '4px' }}></div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <span>Points Achieved:</span>
                    <span>{stats.scored} / {stats.possible}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detailed Question Review Audit */}
        <div className="print-page-break" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h3 style={{ fontSize: '1.1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
            Question Audit Log
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {results.feedback.map((q, idx) => (
              <div key={q.id} className="print-break-inside" style={{
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: '1.25rem',
                background: q.isCorrect ? 'rgba(46, 125, 50, 0.02)' : 'rgba(211, 47, 47, 0.02)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                    <span className="badge badge-accent" style={{ fontSize: '0.65rem' }}>Q{idx + 1}</span>
                    <span className="badge badge-primary" style={{ fontSize: '0.65rem' }}>{q.domain}</span>
                    <span className="badge" style={{ fontSize: '0.65rem', ...getDifficultyBadgeStyle(q.difficulty) }}>{DIFFICULTY_LABELS[q.difficulty] || q.difficulty}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                    <span style={{ fontWeight: 600 }}>{q.isCorrect ? `+${q.points}` : '0'} / {q.points} Points</span>
                    {q.isCorrect ? (
                      <CheckCircle size={18} style={{ color: 'var(--color-success)' }} />
                    ) : (
                      <XCircle size={18} style={{ color: 'var(--color-error)' }} />
                    )}
                  </div>
                </div>

                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: '1rem', lineHeight: 1.4 }}>
                  {q.question_text}
                </div>

                {/* Grid of options showing candidate selection vs correct key */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {q.options.map(opt => {
                    const isCandidateChoice = q.selectedOptionId === opt.id;
                    const isCorrectChoice = opt.isCorrect;
                    
                    let bg = 'transparent';
                    let border = '1px solid var(--color-border)';
                    let color = 'var(--text-primary)';
                    let labelText = '';

                    if (isCorrectChoice) {
                      bg = 'rgba(46, 125, 50, 0.12)';
                      border = '1px solid var(--color-success)';
                      color = 'var(--color-success)';
                      labelText = ' [Correct Key]';
                    }
                    if (isCandidateChoice) {
                      if (q.isCorrect) {
                        bg = 'rgba(46, 125, 50, 0.16)';
                        border = '2px solid var(--color-success)';
                        color = 'var(--color-success)';
                        labelText = ' [Selected & Correct]';
                      } else {
                        bg = 'rgba(211, 47, 47, 0.12)';
                        border = '2px solid var(--color-error)';
                        color = 'var(--color-error)';
                        labelText = ' [Selected Answer]';
                      }
                    }

                    return (
                      <div 
                        key={opt.id} 
                        style={{
                          padding: '0.65rem 1rem',
                          borderRadius: 'var(--radius-sm)',
                          background: bg,
                          border: border,
                          color: color,
                          fontSize: '0.85rem',
                          fontWeight: (isCandidateChoice || isCorrectChoice) ? 600 : 400,
                          display: 'flex',
                          justifyContent: 'space-between'
                        }}
                      >
                        <span>{opt.text}</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{labelText}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
