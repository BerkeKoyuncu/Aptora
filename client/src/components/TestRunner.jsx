import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Shield, Clock, ArrowLeft, ArrowRight, CheckCircle, RefreshCw, UserCheck, AlertTriangle } from 'lucide-react';

export default function TestRunner({ sessionId, addToast }) {
  const [sessionInfo, setSessionInfo] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [responses, setResponses] = useState({}); // { qId: optId }
  const [loading, setLoading] = useState(true);

  // Registration States
  const [candidateName, setCandidateName] = useState('');
  const [department, setDepartment] = useState('');
  const [jobTitle, setJobTitle] = useState('');

  // Exam taking state
  const [timeLeft, setTimeLeft] = useState(1200); // 20 minutes default (in seconds)
  const [isExamActive, setIsExamActive] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load session meta details
  useEffect(() => {
    const loadSession = async () => {
      try {
        setLoading(true);
        const info = await api.getSessionInfo(sessionId);
        setSessionInfo(info);
        
        if (info.status === 'active') {
          // Re-load questions if candidate refreshed page mid-test
          const takeData = await api.getSessionTake(sessionId);
          setQuestions(takeData.questions);
          setCandidateName(takeData.candidate_name);
          setIsExamActive(true);
          
          // Re-align timer based on started_at
          const elapsedSeconds = Math.floor((Date.now() - new Date(info.started_at).getTime()) / 1000);
          const remaining = Math.max(0, 1200 - elapsedSeconds);
          setTimeLeft(remaining);
        }
      } catch (err) {
        addToast(err.message, 'error');
      } finally {
        setLoading(false);
      }
    };
    loadSession();
  }, [sessionId]);

  // Countdown timer thread
  useEffect(() => {
    if (!isExamActive || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isExamActive, timeLeft]);

  const handleStartExam = async (e) => {
    e.preventDefault();
    if (!candidateName.trim()) {
      addToast('Please enter your full name.', 'warning');
      return;
    }

    try {
      setLoading(true);
      const data = await api.startSession(sessionId, candidateName, { department, jobTitle });
      setSessionInfo(data);
      setQuestions(data.questions);
      setIsExamActive(true);
      setTimeLeft(1200); // Start 20 minutes
      addToast('Assessment started. Timer is active.');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOption = (qId, optId) => {
    setResponses(prev => ({
      ...prev,
      [qId]: optId
    }));
  };

  const handleAutoSubmit = () => {
    addToast('Time has expired! Submitting answers automatically...', 'warning');
    submitExam(true);
  };

  const handleSubmitClick = () => {
    const answeredCount = Object.keys(responses).length;
    const totalCount = questions.length;
    const unanswered = totalCount - answeredCount;

    let confirmMsg = 'Are you sure you want to submit your answers?';
    if (unanswered > 0) {
      confirmMsg = `You have ${unanswered} unanswered questions. ${confirmMsg}`;
    }

    if (confirm(confirmMsg)) {
      submitExam(false);
    }
  };

  const submitExam = async (isAuto = false) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setIsExamActive(false);

    try {
      await api.submitSessionAnswers(sessionId, responses);
      addToast('Assessment responses saved successfully!');
      // Refresh session meta state
      const info = await api.getSessionInfo(sessionId);
      setSessionInfo(info);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Timer formatter
  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-bg)' }}>
        <RefreshCw className="animate-spin" size={48} style={{ color: 'var(--color-primary)' }} />
        <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Securing Exam Connection...</p>
      </div>
    );
  }

  // Phase 1: Candidate Sign-In / locked email area
  if (sessionInfo && sessionInfo.status === 'pending') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: 'var(--color-bg)', padding: '1.5rem' }}>
        <div className="card animate-fade" style={{ width: '100%', maxWidth: '500px', padding: '2.5rem' }}>
          
          <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', borderRadius: 'var(--radius-md)', background: 'rgba(17, 75, 78, 0.1)', color: 'var(--color-primary)', marginBottom: '1rem' }}>
              <UserCheck size={30} />
            </div>
            <h3>Exam Verification Profile</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              You have been invited to take <strong>{sessionInfo.test_title}</strong>. Fill out your profile to start.
            </p>
          </div>

          <form onSubmit={handleStartExam} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label>Prefilled Email Address (Locked)</label>
              <input 
                type="email" 
                value={sessionInfo.candidate_email} 
                disabled 
                style={{ background: 'var(--color-bg)', cursor: 'not-allowed', color: 'var(--text-muted)' }}
              />
            </div>

            <div>
              <label>Full Name</label>
              <input 
                type="text" 
                placeholder="John Doe" 
                value={candidateName} 
                onChange={e => setCandidateName(e.target.value)} 
                required 
                autoFocus
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label>Department</label>
                <input 
                  type="text" 
                  placeholder="e.g. SOC Team" 
                  value={department} 
                  onChange={e => setDepartment(e.target.value)} 
                />
              </div>
              <div>
                <label>Job Title</label>
                <input 
                  type="text" 
                  placeholder="e.g. Cyber Analyst" 
                  value={jobTitle} 
                  onChange={e => setJobTitle(e.target.value)} 
                />
              </div>
            </div>

            <div className="card" style={{ borderLeft: '4px solid var(--color-warning)', padding: '0.75rem', background: 'rgba(237, 108, 2, 0.05)', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              <AlertTriangle size={16} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
              <span>Warning: Once started, the timer will begin. Do not close or refresh this browser tab.</span>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.9rem', fontSize: '1rem' }}>
              Begin Examination
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Phase 2: Active Test Runner
  if (isExamActive && questions.length > 0) {
    const activeQ = questions[currentIdx];
    const answeredCount = Object.keys(responses).length;
    const progressPct = Math.round((answeredCount / questions.length) * 100);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: 'var(--color-bg)' }}>
        
        {/* Top bar with timer */}
        <header style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '1rem 2rem',
          background: 'white',
          borderBottom: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Shield size={22} style={{ color: 'var(--color-primary)' }} />
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{sessionInfo.test_title}</h3>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: timeLeft < 180 ? 'var(--color-error)' : 'var(--text-primary)', fontWeight: 700, background: timeLeft < 180 ? 'rgba(211, 47, 47, 0.08)' : 'var(--color-panel)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)' }}>
              <Clock size={18} className={timeLeft < 180 ? 'animate-spin' : ''} />
              <span style={{ fontSize: '1.1rem', fontFamily: 'monospace' }}>{formatTime(timeLeft)}</span>
            </div>
            
            <button onClick={handleSubmitClick} className="btn btn-secondary btn-sm">
              Submit Assessment
            </button>
          </div>
        </header>

        {/* Workspace Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          
          {/* Main Question view */}
          <main style={{ flex: 1, padding: '2rem 3rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Progress header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                QUESTION {currentIdx + 1} OF {questions.length}
              </span>
              <span className="badge badge-accent">
                {activeQ.points} Points
              </span>
            </div>

            {/* Question Text Card */}
            <div className="card" style={{ padding: '2rem', background: 'white' }}>
              <span className="badge badge-primary" style={{ marginBottom: '0.75rem', fontSize: '0.7rem' }}>
                {activeQ.domain}
              </span>
              <h3 style={{ fontSize: '1.3rem', color: 'var(--text-primary)', lineHeight: 1.4, fontWeight: 700, margin: 0 }}>
                {activeQ.question_text}
              </h3>
            </div>

            {/* Option lists */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {activeQ.options.map((opt, idx) => {
                const isSelected = responses[activeQ.id] === opt.id;
                return (
                  <div 
                    key={opt.id}
                    onClick={() => handleSelectOption(activeQ.id, opt.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                      padding: '1.25rem 1.5rem',
                      borderRadius: 'var(--radius-md)',
                      border: `2px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      background: isSelected ? 'rgba(74, 125, 135, 0.05)' : 'white',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      boxShadow: isSelected ? 'var(--shadow-sm)' : 'none'
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      border: `2px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      background: isSelected ? 'var(--color-primary)' : 'transparent',
                      color: isSelected ? 'white' : 'var(--text-secondary)',
                      fontWeight: 700,
                      fontSize: '0.85rem'
                    }}>
                      {String.fromCharCode(65 + idx)}
                    </div>
                    <span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-primary)' }}>{opt.text}</span>
                  </div>
                );
              })}
            </div>

            {/* Navigation buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'auto', borderTop: '1px solid var(--color-border)', paddingTop: '1.5rem' }}>
              <button 
                onClick={() => setCurrentIdx(prev => Math.max(0, prev - 1))} 
                disabled={currentIdx === 0}
                className="btn btn-accent"
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <ArrowLeft size={16} />
                <span>Previous</span>
              </button>

              {currentIdx === questions.length - 1 ? (
                <button 
                  onClick={handleSubmitClick} 
                  className="btn btn-secondary"
                >
                  Submit Assessment
                </button>
              ) : (
                <button 
                  onClick={() => setCurrentIdx(prev => Math.min(questions.length - 1, prev + 1))} 
                  className="btn btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <span>Next Question</span>
                  <ArrowRight size={16} />
                </button>
              )}
            </div>
          </main>

          {/* Right Sidebar navigation grids */}
          <nav style={{
            width: '280px',
            background: 'white',
            borderLeft: '1px solid var(--color-border)',
            padding: '2rem 1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
            overflowY: 'auto'
          }}>
            <div>
              <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Candidate Profiler</h4>
              <div style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{candidateName}</div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{sessionInfo.candidate_email}</span>
            </div>

            {/* Progress Meter */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600 }}>
                <span>Exam Completion</span>
                <span>{progressPct}%</span>
              </div>
              <div style={{ height: '6px', background: 'var(--color-bg)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progressPct}%`, background: 'var(--color-primary)' }}></div>
              </div>
              <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Answered: {answeredCount} / {questions.length}</small>
            </div>

            {/* Navigation Grid */}
            <div>
              <h4 style={{ fontSize: '0.8rem', marginBottom: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Questions Map</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                {questions.map((q, idx) => {
                  const isAnswered = responses[q.id] !== undefined;
                  const isActive = idx === currentIdx;
                  
                  let btnBg = 'white';
                  let btnColor = 'var(--text-secondary)';
                  let btnBorder = '1px solid var(--color-border)';

                  if (isAnswered) {
                    btnBg = 'rgba(46, 125, 50, 0.1)';
                    btnColor = 'var(--color-success)';
                    btnBorder = '1px solid var(--color-success)';
                  }
                  if (isActive) {
                    btnBorder = '2px solid var(--color-primary)';
                  }

                  return (
                    <button 
                      key={q.id}
                      onClick={() => setCurrentIdx(idx)}
                      style={{
                        height: '42px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 'var(--radius-sm)',
                        background: btnBg,
                        color: btnColor,
                        border: btnBorder,
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          </nav>
        </div>
      </div>
    );
  }

  // Phase 3: Post-Exam submission feedback screen
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyItems: 'center', minHeight: '100vh', backgroundColor: 'var(--color-bg)', padding: '1.5rem', width: '100vw', justifyContent: 'center' }}>
      <div className="card animate-fade" style={{ width: '100%', maxWidth: '480px', padding: '3rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', background: 'white' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(46, 125, 50, 0.1)', color: 'var(--color-success)', marginBottom: '0.5rem' }}>
          <CheckCircle size={38} />
        </div>
        
        <h2>Assessment Completed</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.5, margin: 0 }}>
          Thank you, <strong>{sessionInfo.candidate_name}</strong>. Your networking and cybersecurity assessment has been locked and scored.
        </p>

        <div className="card" style={{ padding: '1rem', width: '100%', background: 'var(--color-panel)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>FINAL SCORE</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-primary)' }}>
            {sessionInfo.score} / {sessionInfo.total_points}
          </div>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-secondary)' }}>
            ({Math.round((sessionInfo.score / sessionInfo.total_points) * 100)}% Grade)
          </span>
        </div>

        <div style={{ display: 'flex', width: '100%', gap: '1rem', marginTop: '0.5rem' }}>
          <a href={`#/results/${sessionId}`} className="btn btn-primary" style={{ flex: 1 }}>
            View Detailed Scorecard
          </a>
        </div>
      </div>
    </div>
  );
}
