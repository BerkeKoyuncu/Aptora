import React, { useState, useEffect, useCallback } from 'react';
import { api } from './api';
import {
  Shield, Key, Users, Database, Mail, History, FileText, CheckCircle,
  XCircle, AlertCircle, Plus, Edit, Trash2, LogOut, Settings, Award,
  Clock, ArrowRight, ArrowLeft, RefreshCw, Check, X, Download, Printer, ChevronRight,
  Sun, Moon, Menu, ChevronLeft, Eye, EyeOff, ShieldCheck, Info
} from 'lucide-react';

// Subcomponents (we will create these next)
import AdminDashboard from './components/AdminDashboard';
import TestCreator from './components/TestCreator';
import QuestionDb from './components/QuestionDb';
import UserManagement from './components/UserManagement';
import VirtualMailbox from './components/VirtualMailbox';
import TestRunner from './components/TestRunner';
import TestResultsView from './components/TestResultsView';
import TestHistory from './components/TestHistory';
import TestExecutionHistory from './components/TestExecutionHistory';
import EDataBranding from './components/EDataBranding';
import EmailSettings from './components/EmailSettings';
import AuditLog from './components/AuditLog';
import SystemInformation from './components/SystemInformation';

export default function App() {
  // Navigation / Routing state
  const [currentRoute, setCurrentRoute] = useState({ path: 'home', params: {} });

  // Auth state
  const [user, setUser] = useState(null);
  const [candidate, setCandidate] = useState(null);
  const [loading, setLoading] = useState(true);

  // Settings / Profile states
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [openAddModalOnLoad, setOpenAddModalOnLoad] = useState(false);
  const [twofaSetup, setTwofaSetup] = useState(null); // { secret, qrCodeUrl }
  const [twofaCode, setTwofaCode] = useState('');
  const [twofaDisableCode, setTwofaDisableCode] = useState('');

  // Editable Profile States
  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');

  useEffect(() => {
    if (user) {
      setEditUsername(user.username || '');
      setEditEmail(user.email || '');
    }
  }, [user]);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!editUsername.trim() || !editEmail.trim()) {
      addToast('Username and email are required.', 'warning');
      return;
    }
    try {
      await api.updateProfile({
        username: editUsername,
        email: editEmail,
        password: editPassword.trim() ? editPassword : undefined
      });
      addToast('Profile details updated successfully.');
      setEditPassword('');
      const freshUser = await api.getMe();
      setUser(freshUser);
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  // UI Toast alert state
  const [toasts, setToasts] = useState([]);

  // Active dashboard view/tab state
  const [activeTab, setActiveTab] = useState('overview');

  // Dark/Light Mode Theme
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('aptora_theme') === 'dark';
  });

  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-theme');
      localStorage.setItem('aptora_theme', 'dark');
    } else {
      document.body.classList.remove('dark-theme');
      localStorage.setItem('aptora_theme', 'light');
    }
  }, [darkMode]);

  // Sidebar Collapse state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('aptora_sidebar_collapsed') === 'true';
  });

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('aptora_sidebar_collapsed', String(next));
      return next;
    });
  };

  // Trigger custom toast
  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  // Only administrator report deep links remain; candidates enter from the login page.
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#/admin-results/')) {
        const sessionId = hash.substring(16);
        setCurrentRoute({ path: 'admin-results', params: { sessionId } });
      } else {
        setCurrentRoute({ path: 'home', params: {} });
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Fetch current user details on load
  useEffect(() => {
    const fetchUser = async () => {
      localStorage.removeItem('aptora_token');
      try {
        const me = await api.getMe();
        setUser(me);
      } catch (err) {
        setUser(null);
        try {
          const candidateMe = await api.getCandidateMe();
          setCandidate(candidateMe);
        } catch {
          setCandidate(null);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, []);

  const handleLogin = (account) => {
    if (account.role === 'candidate') {
      setCandidate(account);
      setUser(null);
      addToast(`Welcome, ${account.email}!`);
      return;
    }
    setUser(account);
    setCandidate(null);
    addToast(`Welcome back, ${account.username}!`);
  };

  const handleLogout = async () => {
    try { await api.logout(); } catch { /* Clear local state even if the session expired. */ }
    setUser(null);
    setActiveTab('overview');
    addToast('Logged out successfully.');
  };

  // Toggle 2FA in user settings
  const initiate2FASetup = async () => {
    try {
      const data = await api.setup2FA();
      setTwofaSetup(data);
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const confirm2FA = async (e) => {
    e.preventDefault();
    if (!twofaCode) return;
    try {
      await api.confirm2FA(twofaCode);
      setUser(prev => ({ ...prev, twofa_enabled: true }));
      setTwofaSetup(null);
      setTwofaCode('');
      addToast('2FA has been successfully enabled!');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const disable2FA = async (e) => {
    e.preventDefault();
    try {
      await api.disable2FA(twofaDisableCode);
      setUser(prev => ({ ...prev, twofa_enabled: false }));
      setTwofaDisableCode('');
      addToast('2FA has been successfully disabled.');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-bg)' }}>
        <RefreshCw size={48} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
        <p style={{ marginTop: '1rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Loading Aptora Security Environment...</p>
      </div>
    );
  }

  if (candidate) {
    return (
      <>
        <TestRunner
          addToast={addToast}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          onSessionInvalidated={() => setCandidate(null)}
        />
        <ToastContainer toasts={toasts} />
      </>
    );
  }

  if (currentRoute.path === 'admin-results' && user) {
    return (
      <>
        <TestResultsView sessionId={currentRoute.params.sessionId} adminView addToast={addToast} onBackToDashboard={() => window.location.hash = ''} />
        <ToastContainer toasts={toasts} />
      </>
    );
  }

  // Standard Login / Registration gates if no user session active
  if (!user) {
    return (
      <>
        <AuthGate onLogin={handleLogin} addToast={addToast} />
        <ToastContainer toasts={toasts} />
      </>
    );
  }

  // Authenticated Layout Shell (Admins and Standard users)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: 'var(--color-bg)' }}>
      {/* Header Bar */}
      <header className="no-print" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '1rem 2rem',
        background: 'var(--color-header-bg)',
        color: 'var(--text-light)',
        boxShadow: 'var(--shadow-md)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Collapse/Expand Sidebar Button */}
          <button
            type="button"
            onClick={toggleSidebar}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#FFFFFF',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.5rem',
              borderRadius: '50%',
              transition: 'all 0.2s ease-in-out',
              boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.18)';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
            title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {sidebarCollapsed ? <Menu size={16} /> : <ChevronLeft size={16} />}
          </button>

          {/* Brand Name & App Icon SVG */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <img
              src="/aptora-favicon-white.svg"
              alt="Aptora Icon"
              style={{ width: '40px', height: '40px', display: 'block' }}
            />
            <h1 style={{ color: 'var(--text-light)', fontSize: '1.4rem', marginBottom: 0, fontWeight: 800, letterSpacing: '0.04em' }}>APTORA</h1>
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

          {/* Profile Dropdown Container */}
          <div className="profile-dropdown-container">
            <button onClick={() => setShowProfileDropdown(!showProfileDropdown)} className="profile-trigger" style={{ display: 'flex', alignItems: 'center', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'var(--color-accent)',
                color: 'var(--color-primary)',
                fontWeight: 700,
                fontSize: '0.9rem',
                marginRight: '0.5rem'
              }}>
                {user.username[0].toUpperCase()}
              </div>
              <div style={{ textAlign: 'right', fontSize: '0.85rem' }}>
                <div style={{ fontWeight: 700, lineHeight: 1.1, color: 'white' }}>{user.username}</div>
                <span style={{ fontSize: '0.7rem', color: 'var(--color-accent)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {user.role}
                </span>
              </div>
            </button>

            {showProfileDropdown && (
              <div className="profile-dropdown">
                <button onClick={() => { setActiveTab('settings'); setOpenAddModalOnLoad(false); setShowProfileDropdown(false); }} className="profile-dropdown-item">
                  <Settings size={14} />
                  <span>Account Settings</span>
                </button>
                <div style={{ height: '1px', background: 'var(--color-border)', margin: '0.25rem 0' }}></div>
                <button onClick={() => { handleLogout(); setShowProfileDropdown(false); }} className="profile-dropdown-item danger">
                  <LogOut size={14} />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Workspace Layout with Sidebar navigation */}
      <div style={{ display: 'flex', flex: 1 }}>
        {/* Sidebar */}
        <nav className={`no-print sidebar-nav ${sidebarCollapsed ? 'collapsed' : ''}`}>
          <SidebarButton active={activeTab === 'overview'} onClick={() => { setActiveTab('overview'); setOpenAddModalOnLoad(false); }} icon={<History size={18} />} label="Dashboard" collapsed={sidebarCollapsed} />

          {sidebarCollapsed ? (
            <hr style={{ border: 'none', borderTop: '1px solid rgba(255, 255, 255, 0.08)', margin: '0.75rem 0' }} />
          ) : (
            <div className="sidebar-header">Test</div>
          )}
          <SidebarButton active={activeTab === 'creator'} onClick={() => { setActiveTab('creator'); setOpenAddModalOnLoad(false); }} icon={<Plus size={18} />} label="Generate a Test" collapsed={sidebarCollapsed} />
          <SidebarButton active={activeTab === 'test-history'} onClick={() => { setActiveTab('test-history'); setOpenAddModalOnLoad(false); }} icon={<FileText size={18} />} label="Test History" collapsed={sidebarCollapsed} />
          <SidebarButton active={activeTab === 'execution-history'} onClick={() => { setActiveTab('execution-history'); setOpenAddModalOnLoad(false); }} icon={<History size={18} />} label="Test Execution History" collapsed={sidebarCollapsed} />

          {user.role === 'admin' && (
            <>
              {sidebarCollapsed ? (
                <hr style={{ border: 'none', borderTop: '1px solid rgba(255, 255, 255, 0.08)', margin: '0.75rem 0' }} />
              ) : (
                <div className="sidebar-header">Questions</div>
              )}
              <SidebarButton active={activeTab === 'add-question'} onClick={() => { setActiveTab('add-question'); setOpenAddModalOnLoad(false); }} icon={<Plus size={18} />} label="Add Question" collapsed={sidebarCollapsed} />
              <SidebarButton active={activeTab === 'questions'} onClick={() => { setActiveTab('questions'); setOpenAddModalOnLoad(false); }} icon={<Database size={18} />} label="Question List" collapsed={sidebarCollapsed} />

              {sidebarCollapsed ? (
                <hr style={{ border: 'none', borderTop: '1px solid rgba(255, 255, 255, 0.08)', margin: '0.75rem 0' }} />
              ) : (
                <div className="sidebar-header">Administration</div>
              )}
              <SidebarButton active={activeTab === 'users'} onClick={() => { setActiveTab('users'); setOpenAddModalOnLoad(false); }} icon={<Users size={18} />} label="Manage Users" collapsed={sidebarCollapsed} />
              <SidebarButton active={activeTab === 'mailbox'} onClick={() => { setActiveTab('mailbox'); setOpenAddModalOnLoad(false); }} icon={<Mail size={18} />} label="Virtual Mailbox" collapsed={sidebarCollapsed} />
              <SidebarButton active={activeTab === 'email-settings'} onClick={() => { setActiveTab('email-settings'); setOpenAddModalOnLoad(false); }} icon={<Settings size={18} />} label="Email Settings" collapsed={sidebarCollapsed} />
              <SidebarButton active={activeTab === 'audit-log'} onClick={() => { setActiveTab('audit-log'); setOpenAddModalOnLoad(false); }} icon={<ShieldCheck size={18} />} label="Security Audit Log" collapsed={sidebarCollapsed} />
              <SidebarButton active={activeTab === 'system-info'} onClick={() => { setActiveTab('system-info'); setOpenAddModalOnLoad(false); }} icon={<Info size={18} />} label="System Information" collapsed={sidebarCollapsed} />
            </>
          )}

          {!sidebarCollapsed && (
            <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '1rem' }}>
              <EDataBranding variant="dark" compact />
            </div>
          )}
        </nav>

        {/* Workspace Panels */}
        <main style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
          {activeTab === 'overview' && (
            <AdminDashboard user={user} addToast={addToast} onInviteCandidate={() => setActiveTab('test-history')} />
          )}

          {activeTab === 'creator' && (
            <TestCreator user={user} addToast={addToast} onViewMailbox={() => setActiveTab('mailbox')} />
          )}

          {activeTab === 'test-history' && (
            <TestHistory user={user} addToast={addToast} />
          )}

          {activeTab === 'execution-history' && (
            <TestExecutionHistory user={user} addToast={addToast} />
          )}

          {activeTab === 'questions' && user.role === 'admin' && (
            <QuestionDb
              user={user}
              addToast={addToast}
              defaultView="list"
              onNavigateToAdd={() => setActiveTab('add-question')}
            />
          )}

          {activeTab === 'add-question' && user.role === 'admin' && (
            <QuestionDb
              user={user}
              addToast={addToast}
              defaultView="add"
              onSaveSuccess={() => setActiveTab('questions')}
            />
          )}

          {activeTab === 'users' && user.role === 'admin' && (
            <UserManagement user={user} addToast={addToast} />
          )}

          {activeTab === 'mailbox' && user.role === 'admin' && (
            <VirtualMailbox user={user} addToast={addToast} />
          )}

          {activeTab === 'email-settings' && user.role === 'admin' && (
            <EmailSettings user={user} addToast={addToast} />
          )}

          {activeTab === 'audit-log' && user.role === 'admin' && (
            <AuditLog addToast={addToast} />
          )}

          {activeTab === 'system-info' && user.role === 'admin' && (
            <SystemInformation addToast={addToast} />
          )}

          {activeTab === 'settings' && (
            <div className="animate-fade" style={{ width: '100%', margin: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                <Key size={24} style={{ color: 'var(--color-primary)' }} />
                <div>
                  <h2 style={{ margin: 0 }}>Account Settings</h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    Manage your profile details and security configurations.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
                {/* Profile Info Details */}
                <form onSubmit={handleUpdateProfile} className="card">
                  <h3 style={{ fontSize: '1.05rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>User Profile Details</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                      <div>
                        <label style={{ fontSize: '0.75rem' }}>Username</label>
                        <input
                          type="text"
                          value={editUsername}
                          onChange={e => setEditUsername(e.target.value)}
                          required
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem' }}>Email Address</label>
                        <input
                          type="email"
                          value={editEmail}
                          onChange={e => setEditEmail(e.target.value)}
                          required
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem' }}>New Password (Leave blank to keep current)</label>
                        <input
                          type="password"
                          placeholder="••••••••"
                          value={editPassword}
                          onChange={e => setEditPassword(e.target.value)}
                          minLength={editPassword ? 8 : undefined}
                          title="Minimum 8 characters with uppercase, lowercase, number, and special character"
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--color-border)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Role: <strong className="text-uppercase" style={{ color: 'var(--color-primary)' }}>{user.role}</strong>
                      </span>
                      <button type="submit" className="btn btn-primary btn-sm">
                        Save Profile Details
                      </button>
                    </div>
                  </div>
                </form>

                {/* 2FA Settings Form */}
                <div className="card">
                  <h3 style={{ fontSize: '1.05rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>2FA Settings</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4, margin: 0 }}>
                      Ensure your account security by generating time-based one-time codes (TOTP) using standard tools like Microsoft Authenticator or Google Authenticator.
                    </p>

                    {user.twofa_enabled ? (
                      <div className="card" style={{ borderLeft: '4px solid var(--color-success)', background: 'rgba(46, 125, 50, 0.05)', boxShadow: 'none', margin: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-success)', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                          <CheckCircle size={18} />
                          <span>2FA Security is Enabled</span>
                        </div>

                        <form onSubmit={disable2FA} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          <div>
                            <label style={{ fontSize: '0.75rem' }}>Confirm 2FA Code to Disable</label>
                            <input
                              type="text"
                              maxLength={6}
                              placeholder="••••••"
                              value={twofaDisableCode}
                              onChange={e => setTwofaDisableCode(e.target.value.replace(/\D/g, ''))}
                              required
                              style={{ textAlign: 'center', fontSize: '1.2rem', letterSpacing: '0.3em', maxWidth: '300px' }}
                            />
                          </div>
                          <button type="submit" className="btn btn-danger btn-sm" style={{ width: '150px' }}>Disable 2FA</button>
                        </form>
                      </div>
                    ) : (
                      <div style={{ margin: 0 }}>
                        {!twofaSetup ? (
                          <button onClick={initiate2FASetup} className="btn btn-primary" style={{ width: '100%', maxWidth: '300px' }}>
                            Enable 2FA Protection
                          </button>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '1rem', padding: '1rem', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-panel)' }}>
                            <div style={{ textAlign: 'left' }}>
                              <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                                1. Scan this QR Code with your Authenticator App
                              </p>
                              <img src={twofaSetup.qrCodeUrl} alt="2FA QR Code" style={{ width: '180px', height: '180px', border: '1px solid var(--color-border)', padding: '4px', borderRadius: '4px', background: 'white' }} />
                              <div style={{ marginTop: '0.5rem', background: 'var(--color-card)', padding: '0.4rem', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'monospace', wordBreak: 'break-all', border: '1px solid var(--color-border)' }}>
                                Secret: {twofaSetup.secret}
                              </div>
                            </div>

                            <form onSubmit={confirm2FA} style={{ width: '100%', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
                              <label style={{ display: 'block', fontSize: '0.75rem' }}>
                                2. Enter the 6-digit verification code below
                              </label>
                              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', maxWidth: '400px' }}>
                                <input
                                  type="text"
                                  maxLength={6}
                                  placeholder="••••••"
                                  value={twofaCode}
                                  onChange={e => setTwofaCode(e.target.value.replace(/\D/g, ''))}
                                  required
                                  style={{ textAlign: 'center', fontSize: '1.2rem', letterSpacing: '0.3em' }}
                                />
                                <button type="submit" className="btn btn-success">Verify</button>
                              </div>
                            </form>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Global Alert Toast Component */}
      <ToastContainer toasts={toasts} />
    </div>
  );
}

// Helper: Sidebar Button Component
function SidebarButton({ active, onClick, icon, label, collapsed }) {
  return (
    <button
      onClick={onClick}
      className={`sidebar-btn ${active ? 'active' : ''}`}
      title={collapsed ? label : undefined}
      style={{
        justifyContent: collapsed ? 'center' : 'flex-start',
        padding: collapsed ? '0.75rem 0' : '0.75rem 1rem'
      }}
    >
      <span className="sidebar-btn-icon" style={{ margin: collapsed ? 0 : '0 0.75rem 0 0' }}>{icon}</span>
      {!collapsed && <span style={{ fontSize: '0.9rem' }}>{label}</span>}
      {active && !collapsed && <ChevronRight size={14} style={{ marginLeft: 'auto' }} />}
    </button>
  );
}

// Helper: Toast Container Component
function ToastContainer({ toasts }) {
  return (
    <div className="toast-container no-print">
      {toasts.map(toast => (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          {toast.type === 'success' && <CheckCircle size={18} style={{ color: 'var(--color-success)' }} />}
          {toast.type === 'error' && <XCircle size={18} style={{ color: 'var(--color-error)' }} />}
          {toast.type === 'warning' && <AlertCircle size={18} style={{ color: 'var(--color-warning)' }} />}
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}

// Authentication Gate Component (Handles administrator login and 2FA prompts)
function AuthGate({ onLogin, addToast }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [twofaCode, setTwofaCode] = useState('');
  const [temp2FAToken, setTemp2FAToken] = useState(null); // When login returns 2fa_required
  const [initial2FASetup, setInitial2FASetup] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [logoLoaded, setLogoLoaded] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    try {
      if (temp2FAToken) {
        const response = initial2FASetup
          ? await api.completeInitial2FA(twofaCode, temp2FAToken)
          : await api.verify2FA(twofaCode, temp2FAToken);
        onLogin(response.user);
      } else {
        // Login
        const response = await api.login(username, password);
        if (response.twofa_required) {
          setTemp2FAToken(response.tempToken);
          addToast('2FA code verification required.', 'warning');
        } else if (response.twofa_setup_required) {
          setTemp2FAToken(response.tempToken);
          setInitial2FASetup({ secret: response.secret, qrCodeUrl: response.qrCodeUrl });
          addToast('Authenticator setup is required before first access.', 'warning');
        } else {
          onLogin(response.candidate || response.user);
        }
      }
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setTemp2FAToken(null);
    setInitial2FASetup(null);
    setTwofaCode('');
    setUsername('');
    setPassword('');
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at top, #FFFFFF 0%, var(--color-bg) 100%)',
      padding: '1.5rem'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '420px',
        padding: '2.5rem 2rem',
        borderRadius: 'var(--radius-lg)',
        background: '#092022', /* Premium Dark Brand Teal */
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 20px 50px rgba(9, 32, 34, 0.25)'
      }}>
        {/* Title Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '0.75rem' }}>
            <img
              src="/aptora-logo-white.svg"
              alt="Aptora Logo"
              style={{ maxWidth: '180px', height: 'auto', display: logoLoaded ? 'block' : 'none', margin: '0 auto 0.75rem auto' }}
              onLoad={() => setLogoLoaded(true)}
              onError={() => setLogoLoaded(false)}
            />
            {!logoLoaded && (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '60px',
                height: '60px',
                borderRadius: 'var(--radius-lg)',
                background: 'white',
                color: 'var(--color-primary)',
                boxShadow: 'var(--shadow-md)',
                marginBottom: '0.75rem'
              }}>
                <Shield size={36} />
              </div>
            )}
          </div>
          {temp2FAToken ? (
            <h2 style={{ color: 'white', fontSize: '1.8rem', margin: '0 0 0.5rem 0', fontWeight: 800, letterSpacing: '-0.03em' }}>
              Secure Verification
            </h2>
          ) : null}
          <p style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            {initial2FASetup ? 'Scan the QR code, then enter the six-digit code' : temp2FAToken
              ? 'Enter authenticator credentials'
              : 'Sign in to continue'}
          </p>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {temp2FAToken ? (
            /* 2FA Input Panel */
            <div>
              {initial2FASetup && (
                <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                  <img src={initial2FASetup.qrCodeUrl} alt="Authenticator QR code" style={{ width: 190, height: 190, borderRadius: 8, background: 'white', padding: 8 }} />
                  <div style={{ color: 'rgba(255,255,255,.75)', fontSize: '.75rem', marginTop: '.5rem', wordBreak: 'break-all' }}>
                    Manual key: {initial2FASetup.secret}
                  </div>
                </div>
              )}
              <label style={{ color: 'rgba(255, 255, 255, 0.8)' }}>Authenticator Token Code</label>
              <input
                type="text"
                maxLength={6}
                placeholder="••••••"
                value={twofaCode}
                onChange={e => setTwofaCode(e.target.value.replace(/\D/g, ''))}
                required
                autoFocus
                style={{
                  textAlign: 'center',
                  fontSize: '1.5rem',
                  letterSpacing: '0.3em',
                  background: '#FFFFFF',
                  color: '#0F2527',
                  border: '1px solid var(--color-border)',
                  padding: '1rem'
                }}
              />
            </div>
          ) : (
            /* Regular Login/Register Form */
            <>
              <div>
                <label style={{ color: 'rgba(255, 255, 255, 0.8)' }}>Email or Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Enter username or email"
                  required
                  style={{ background: '#FFFFFF', color: '#0F2527', border: '1px solid var(--color-border)' }}
                />
              </div>

              <div>
                <label style={{ color: 'rgba(255, 255, 255, 0.8)' }}>Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    style={{ background: '#FFFFFF', color: '#0F2527', border: '1px solid var(--color-border)', paddingRight: '2.8rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(value => !value)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                    style={{
                      position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                      border: 'none', background: 'transparent', color: '#526568', cursor: 'pointer',
                      padding: '0.2rem', display: 'inline-flex', alignItems: 'center'
                    }}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </>
          )}

          <button type="submit" className="btn btn-secondary" style={{
            width: '100%',
            padding: '0.9rem',
            marginTop: '0.5rem',
            background: 'var(--color-secondary)',
            color: 'white',
            border: 'none',
            fontSize: '1rem'
          }}>
            {submitting ? 'Authenticating...' : (temp2FAToken ? 'Verify and Enter' : 'Sign In')}
          </button>
        </form>

        {/* Navigation Footer */}
        <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.85rem' }}>
          {temp2FAToken ? (
            <button onClick={handleReset} style={{ background: 'none', border: 'none', color: 'white', textDecoration: 'underline', cursor: 'pointer' }}>
              Back to Login screen
            </button>
          ) : null}
        </div>
        <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', marginTop: '1.25rem', paddingTop: '1rem' }}>
          <EDataBranding variant="dark" />
        </div>
      </div>
    </div>
  );
}
