import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import { Shield, Clock, ArrowLeft, ArrowRight, CheckCircle, RefreshCw, UserCheck, AlertTriangle, Sun, Moon, Download, LogOut } from 'lucide-react';
import EDataBranding from './EDataBranding';
import TestResultsView from './TestResultsView';
import { formatTimeUK } from '../utils/dateFormat';

export default function TestRunner({ addToast, darkMode, setDarkMode, onSessionInvalidated }) {
  const [sessionInfo, setSessionInfo] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [responses, setResponses] = useState({}); // { qId: optId }
  const [loading, setLoading] = useState(true);

  // Registration States
  const [candidateName, setCandidateName] = useState('');

  // Exam taking state
  const [timeLeft, setTimeLeft] = useState(1200); // Default placeholder
  const [isExamActive, setIsExamActive] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSubmitConfirmation, setShowSubmitConfirmation] = useState(false);
  const [completedResults, setCompletedResults] = useState(null);
  const [saveStatus, setSaveStatus] = useState('saved');
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const autosaveTimerRef = useRef(null);
  const autosaveVersionRef = useRef(0);
  const autosaveEnabledRef = useRef(false);
  const responsesRef = useRef({});
  const queueAutosaveRef = useRef(null);
  const addToastRef = useRef(addToast);
  const sessionInvalidatedRef = useRef(onSessionInvalidated);
  addToastRef.current = addToast;
  sessionInvalidatedRef.current = onSessionInvalidated;

  const handleCandidateSessionError = useCallback((err) => {
    if (err?.code !== 'CANDIDATE_SESSION_REPLACED') return false;
    autosaveEnabledRef.current = false;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    addToastRef.current('This assessment was signed in on another browser. Sign in here again to continue on this browser.', 'warning');
    sessionInvalidatedRef.current?.();
    return true;
  }, []);

  // Load session meta details
  useEffect(() => {
    const loadSession = async () => {
      try {
        setLoading(true);
        const info = await api.getSessionInfo();
        setSessionInfo(info);
        
        if (info.status === 'active') {
          // Re-load questions if candidate refreshed page mid-test
          const takeData = await api.getSessionTake();
          setQuestions(takeData.questions);
          setCandidateName(takeData.candidate_name);
          const recoveredResponses = takeData.responses || {};
          setResponses(recoveredResponses);
          responsesRef.current = recoveredResponses;
          autosaveVersionRef.current = Number(takeData.responses_version || 0);
          setLastSavedAt(takeData.responses_updated_at ? new Date(`${takeData.responses_updated_at}Z`) : null);
          setSaveStatus('saved');
          autosaveEnabledRef.current = true;
          setIsExamActive(true);
          
          // The backend deadline is authoritative; the UI timer is only a display.
          const remaining = Math.max(0, Math.floor((new Date(takeData.deadline).getTime() - Date.now()) / 1000));
          setTimeLeft(remaining);
        } else if (info.status === 'completed') {
          const result = await api.getCandidateSessionResult();
          setCompletedResults(result);
        } else {
          setTimeLeft((info.duration || 20) * 60);
        }
      } catch (err) {
        if (!handleCandidateSessionError(err)) addToastRef.current(err.message, 'error');
      } finally {
        setLoading(false);
      }
    };
    loadSession();
  }, [handleCandidateSessionError]);

  // Focus loss tracking thread
  useEffect(() => {
    if (!isExamActive) return;

    let focusTimer = null;
    const handleFocusLoss = async () => {
      if (focusTimer) clearTimeout(focusTimer);
      focusTimer = setTimeout(async () => {
        try {
          await api.logFocusLost();
          addToastRef.current('⚠️ Tab switching detected! This event has been logged for review.', 'error');
        } catch (err) {
          if (handleCandidateSessionError(err)) return;
          console.error('Failed to log focus loss:', err);
        }
      }, 500);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleFocusLoss();
      }
    };

    window.addEventListener('blur', handleFocusLoss);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('blur', handleFocusLoss);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (focusTimer) clearTimeout(focusTimer);
    };
  }, [isExamActive, handleCandidateSessionError]);

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
      addToast('Please enter your name.', 'warning');
      return;
    }

    try {
      setLoading(true);
      const data = await api.startSession(candidateName);
      setSessionInfo(data);
      setQuestions(data.questions);
      setResponses({});
      responsesRef.current = {};
      autosaveVersionRef.current = 0;
      setSaveStatus('saved');
      setLastSavedAt(null);
      autosaveEnabledRef.current = true;
      setIsExamActive(true);
      setTimeLeft(Math.max(0, Math.floor((new Date(data.deadline).getTime() - Date.now()) / 1000)));
      addToast('Assessment started. Timer is active.');
    } catch (err) {
      if (!handleCandidateSessionError(err)) addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const persistResponses = async (snapshot, version) => {
    if (!autosaveEnabledRef.current) return;
    if (!navigator.onLine) {
      setSaveStatus('offline');
      return;
    }
    setSaveStatus('saving');
    try {
      const result = await api.saveSessionResponses(snapshot, version);
      if (version === autosaveVersionRef.current && autosaveEnabledRef.current) {
        setSaveStatus('saved');
        setLastSavedAt(result.responses_updated_at ? new Date(`${result.responses_updated_at}Z`) : new Date());
      }
    } catch (err) {
      if (handleCandidateSessionError(err)) return;
      if (version === autosaveVersionRef.current && autosaveEnabledRef.current) {
        setSaveStatus(navigator.onLine ? 'error' : 'offline');
        autosaveTimerRef.current = setTimeout(() => persistResponses(snapshot, version), 3000);
      }
    }
  };

  const queueAutosave = (snapshot, delay = 700) => {
    if (!autosaveEnabledRef.current) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    const version = ++autosaveVersionRef.current;
    setSaveStatus(navigator.onLine ? 'saving' : 'offline');
    autosaveTimerRef.current = setTimeout(() => persistResponses(snapshot, version), delay);
  };
  queueAutosaveRef.current = queueAutosave;

  useEffect(() => {
    const handleOnline = () => {
      if (autosaveEnabledRef.current) queueAutosaveRef.current?.(responsesRef.current, 0);
    };
    const handleOffline = () => {
      if (autosaveEnabledRef.current) setSaveStatus('offline');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      autosaveEnabledRef.current = false;
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, []);

  const handleSelectOption = (qId, optId) => {
    setResponses(prev => {
      if (String(prev[qId]) === String(optId)) return prev;
      const next = { ...prev, [qId]: optId };
      responsesRef.current = next;
      queueAutosave(next);
      return next;
    });
  };

  const handleAutoSubmit = () => {
    addToast('Time has expired! Submitting answers automatically...', 'warning');
    submitExam(true);
  };

  const handleSubmitClick = () => {
    setShowSubmitConfirmation(true);
  };

  const handleConfirmSubmit = () => {
    setShowSubmitConfirmation(false);
    submitExam(false);
  };

  const submitExam = async (isAuto = false) => {
    if (isSubmitting) return;
    autosaveEnabledRef.current = false;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    setShowSubmitConfirmation(false);
    setIsSubmitting(true);
    setIsExamActive(false);

    try {
      const result = await api.submitSessionAnswers(responsesRef.current);
      addToast('Assessment responses saved successfully!');
      setCompletedResults(result);
      setSessionInfo(prev => ({ ...prev, ...result, status: 'completed' }));
    } catch (err) {
      const sessionWasReplaced = handleCandidateSessionError(err);
      if (!sessionWasReplaced) addToast(err.message, 'error');
      if (!sessionWasReplaced && !isAuto) {
        autosaveEnabledRef.current = true;
        setIsExamActive(true);
        queueAutosave(responsesRef.current, 0);
      }
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

  const handleDownloadSebConfig = async () => {
    try {
      const blob = await api.downloadSessionSebConfig();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `aptora_exam_${sessionInfo?.id || 'candidate'}.seb`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      if (!handleCandidateSessionError(err)) addToast(err.message, 'error');
    }
  };

  const handleCandidateLogout = async () => {
    try {
      await api.candidateLogout();
      window.location.reload();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-bg)' }}>
        <RefreshCw className="animate-spin" size={48} style={{ color: 'var(--color-primary)' }} />
        <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Securing Exam Connection...</p>
      </div>
    );
  }

  // Safe Exam Browser Protection check
  const isInSEB = navigator.userAgent.toLowerCase().includes('seb');
  const requireSEB = sessionInfo?.require_seb;

  if (requireSEB && !isInSEB) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: 'var(--color-bg)', padding: '1.5rem', width: '100vw' }}>
        <div className="card animate-fade" style={{ width: '100%', maxWidth: '560px', padding: '3rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', borderLeft: '5px solid var(--color-warning)' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(237, 108, 2, 0.1)', color: 'var(--color-warning)', marginBottom: '0.5rem' }}>
            <AlertTriangle size={36} />
          </div>
          
          <h2 style={{ margin: 0 }}>Safe Exam Browser Enforced</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.5, margin: 0 }}>
            This exam requires **Safe Exam Browser (SEB)** to guarantee a secure, locked-down environment. 
            You cannot start or complete the assessment in standard browsers (Chrome, Edge, Firefox, Safari).
          </p>

          <div className="card" style={{ padding: '1rem', width: '100%', background: 'var(--color-panel)', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h4 style={{ margin: 0 }}>Instructions to launch:</h4>
            <ol style={{ fontSize: '0.8rem', margin: 0, paddingLeft: '1.25rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              <li>Install Safe Exam Browser if you haven't already.</li>
              <li>Download the secure exam configuration file below.</li>
              <li>Double-click the downloaded file (ends with <code>.seb</code>) to launch the locked exam environment.</li>
            </ol>
          </div>

          <div style={{ display: 'flex', width: '100%', gap: '1rem' }}>
            <button
              type="button"
              onClick={handleDownloadSebConfig}
              className="btn btn-primary" 
              style={{ flex: 1, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Download size={16} style={{ marginRight: '0.5rem' }} />
              Download SEB Config
            </button>
            <a 
              href="https://safeexambrowser.org/download_en.html"
              target="_blank" 
              rel="noopener noreferrer" 
              className="btn btn-secondary" 
              style={{ flex: 1, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
              Get SEB Browser
            </a>
          </div>
          <button
            type="button"
            onClick={handleCandidateLogout}
            className="btn btn-accent"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
          >
            <LogOut size={16} />
            Log out
          </button>
          <EDataBranding variant={darkMode ? 'dark' : 'light'} />
        </div>
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
              <label>Name</label>
              <input 
                type="text" 
                placeholder="John"
                value={candidateName} 
                onChange={e => setCandidateName(e.target.value)} 
                required 
                autoFocus
              />
            </div>

            <div className="card" style={{ borderLeft: '4px solid var(--color-warning)', padding: '0.75rem', background: 'rgba(237, 108, 2, 0.05)', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              <AlertTriangle size={16} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
              <span>Warning: Once started, the timer will begin. Do not close or refresh this browser tab.</span>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.9rem', fontSize: '1rem' }}>
              Begin Examination
            </button>
          </form>
          <div style={{ borderTop: '1px solid var(--color-border)', marginTop: '1.5rem', paddingTop: '1rem' }}>
            <EDataBranding variant={darkMode ? 'dark' : 'light'} />
          </div>
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
          background: 'var(--color-header-bg)',
          color: 'var(--text-light)',
          boxShadow: 'var(--shadow-md)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <img
              src="/aptora-favicon-white.svg"
              alt="Aptora Icon"
              style={{ width: '40px', height: '40px', display: 'block' }}
            />
            <div>
              <div style={{ color: 'white', fontSize: '1.15rem', fontWeight: 900, letterSpacing: '0.08em', lineHeight: 1 }}>APTORA</div>
              <h3 style={{ margin: '0.3rem 0 0', fontSize: '0.9rem', color: 'rgba(255,255,255,0.72)', fontWeight: 600 }}>{sessionInfo.test_title}</h3>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            {/* Light/Dark Mode Toggle Switch */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Sun size={16} style={{ color: darkMode ? 'rgba(255,255,255,0.4)' : '#FFD600', transition: 'color 0.2s' }} />
              <button
                type="button"
                onClick={() => setDarkMode(!darkMode)}
                style={{
                  position: 'relative',
                  width: '42px',
                  height: '22px',
                  borderRadius: '11px',
                  backgroundColor: darkMode ? 'var(--color-secondary)' : 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  outline: 'none',
                  transition: 'background-color 0.2s',
                  display: 'flex',
                  alignItems: 'center'
                }}
                title="Toggle Theme"
              >
                <div style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  backgroundColor: '#FFFFFF',
                  position: 'absolute',
                  left: darkMode ? '22px' : '2px',
                  transition: 'left 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                }} />
              </button>
              <Moon size={16} style={{ color: darkMode ? '#90CAF9' : 'rgba(255,255,255,0.4)', transition: 'color 0.2s' }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: timeLeft < 180 ? '#FFCDD2' : '#E0F2F1', fontWeight: 700, background: timeLeft < 180 ? 'rgba(211, 47, 47, 0.2)' : 'rgba(255, 255, 255, 0.08)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255, 255, 255, 0.12)' }}>
              <Clock size={18} className={timeLeft < 180 ? 'animate-spin' : ''} style={{ color: timeLeft < 180 ? '#FF8A80' : '#80CBC4' }} />
              <span style={{ fontSize: '1.1rem', fontFamily: 'monospace', color: 'white' }}>{formatTime(timeLeft)}</span>
            </div>

            <div
              title={lastSavedAt ? `Last saved at ${formatTimeUK(lastSavedAt)}` : 'Answers are saved automatically'}
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', fontWeight: 700, color: saveStatus === 'saved' ? '#C8E6C9' : saveStatus === 'saving' ? '#FFF9C4' : '#FFCDD2' }}
            >
              {saveStatus === 'saved' ? <CheckCircle size={15} /> : saveStatus === 'saving' ? <RefreshCw className="animate-spin" size={15} /> : <AlertTriangle size={15} />}
              <span>{saveStatus === 'saved' ? 'Answers saved' : saveStatus === 'saving' ? 'Saving answers...' : saveStatus === 'offline' ? 'Offline — waiting to save' : 'Save failed — retrying'}</span>
            </div>
            
            <button onClick={handleSubmitClick} className="btn btn-primary btn-sm" style={{ border: '1px solid rgba(255,255,255,0.2)' }}>
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
            </div>

            {/* Question Text Card */}
            <div className="card" style={{ padding: '2rem', background: 'var(--color-card)' }}>
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
                      background: isSelected ? 'rgba(74, 125, 135, 0.05)' : 'var(--color-card)',
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

              <EDataBranding variant={darkMode ? 'dark' : 'light'} compact large />

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
            background: 'var(--color-card)',
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

        {showSubmitConfirmation && (
          <div
            className="modal-overlay"
            role="presentation"
            style={{ alignItems: 'center', padding: '1.5rem' }}
          >
            <div
              className="modal-content animate-fade"
              role="dialog"
              aria-modal="true"
              aria-labelledby="submit-confirmation-title"
              aria-describedby="submit-confirmation-description"
              style={{ maxWidth: '460px' }}
            >
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ display: 'inline-flex', flexShrink: 0, alignItems: 'center', justifyContent: 'center', width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(237, 108, 2, 0.12)', color: 'var(--color-warning)' }}>
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3 id="submit-confirmation-title" style={{ margin: '0 0 0.5rem' }}>Submit your assessment?</h3>
                  <p id="submit-confirmation-description" style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {questions.length - answeredCount > 0
                      ? `You have ${questions.length - answeredCount} unanswered ${questions.length - answeredCount === 1 ? 'question' : 'questions'}. Submitting will finalize your assessment.`
                      : 'All questions have been answered. Submitting will finalize your assessment.'}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.75rem' }}>
                <button
                  type="button"
                  className="btn btn-accent"
                  onClick={() => setShowSubmitConfirmation(false)}
                  disabled={isSubmitting}
                >
                  Continue Assessment
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleConfirmSubmit}
                  disabled={isSubmitting}
                >
                  Submit Answers
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (completedResults) {
    return (
      <TestResultsView
        initialResults={completedResults}
        candidateView
        addToast={addToast}
        onExitExamBrowser={requireSEB && isInSEB
          ? () => window.location.assign('/seb/quit')
          : null}
      />
    );
  }

  // Phase 3: Post-Exam submission feedback screen
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyItems: 'center', minHeight: '100vh', backgroundColor: 'var(--color-bg)', padding: '1.5rem', width: '100vw', justifyContent: 'center' }}>
      <div className="card animate-fade" style={{ width: '100%', maxWidth: '480px', padding: '3rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', background: 'var(--color-card)' }}>
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

        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: 0 }}>
          Your temporary account has been removed. The assessment result remains available to administrators.
        </p>
      </div>
    </div>
  );
}
