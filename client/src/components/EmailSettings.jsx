import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Mail, Shield, CheckCircle, RefreshCw, Send, Check } from 'lucide-react';

export default function EmailSettings({ user, addToast }) {
  const [settings, setSettings] = useState({
    smtp_host: 'smtp.gmail.com',
    smtp_port: 587,
    smtp_user: '',
    smtp_pass: '',
    from_email: 'noreply@aptora.com',
    smtp_secure: false,
    is_enabled: false
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testEmail, setTestEmail] = useState(user?.email || '');
  const [testing, setTesting] = useState(false);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const data = await api.getEmailSettings();
      setSettings(data);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      await api.updateEmailSettings(settings);
      addToast('SMTP email settings saved successfully.');
      fetchSettings();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async (e) => {
    e.preventDefault();
    if (!testEmail) {
      addToast('Please enter a destination email address.', 'warning');
      return;
    }

    try {
      setTesting(true);
      addToast('Sending test email via SMTP...', 'info');
      const res = await api.testEmailSettings(testEmail);
      addToast(res.message, 'success');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setTesting(false);
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
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '2rem', width: '100%', margin: 0 }}>
      {/* Title */}
      <div>
        <h2>Email Configuration Settings</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Configure SMTP properties to dispatch real-time assessment invites to candidate email inboxes.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem', alignItems: 'flex-start' }}>
        
        {/* Left Side: Configuration Form */}
        <form onSubmit={handleSave} className="card" style={{ background: 'var(--color-card)', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <h3 style={{ fontSize: '1.05rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Mail size={18} style={{ color: 'var(--color-primary)' }} />
            <span>SMTP Server Parameters</span>
          </h3>

          {/* Outgoing Mail Activation */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem', background: 'var(--color-panel)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Enable Real Email Delivery</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Send invitations directly to candidate inboxes.</div>
            </div>
            {/* Sliding Toggle Switch */}
            <button 
              type="button"
              onClick={() => setSettings(prev => ({ ...prev, is_enabled: !prev.is_enabled }))}
              style={{
                position: 'relative',
                width: '42px',
                height: '22px',
                borderRadius: '11px',
                backgroundColor: settings.is_enabled ? 'var(--color-secondary)' : 'var(--color-border)',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                outline: 'none',
                transition: 'background-color 0.2s',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <div style={{
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                backgroundColor: '#FFFFFF',
                position: 'absolute',
                left: settings.is_enabled ? '22px' : '2px',
                transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
              }} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem' }}>SMTP Host Server</label>
              <input 
                type="text" 
                name="smtp_host"
                placeholder="smtp.gmail.com" 
                value={settings.smtp_host} 
                onChange={handleChange} 
                required 
              />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem' }}>SMTP Port</label>
              <input 
                type="number" 
                name="smtp_port"
                placeholder="587" 
                value={settings.smtp_port} 
                onChange={handleChange} 
                required 
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem' }}>Sender From Address</label>
            <input 
              type="email" 
              name="from_email"
              placeholder="noreply@yourdomain.com" 
              value={settings.from_email} 
              onChange={handleChange} 
              required 
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem' }}>SMTP User</label>
              <input 
                type="text" 
                name="smtp_user"
                placeholder="username@gmail.com" 
                value={settings.smtp_user || ''} 
                onChange={handleChange} 
              />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem' }}>SMTP Password</label>
              <input 
                type="password" 
                name="smtp_pass"
                placeholder="••••••••" 
                value={settings.smtp_pass || ''} 
                onChange={handleChange} 
              />
            </div>
          </div>

          {/* Secure connection toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
            <input 
              type="checkbox" 
              name="smtp_secure"
              id="smtp_secure"
              checked={settings.smtp_secure}
              onChange={handleChange}
              style={{ width: 'auto', marginRight: '0.5rem', cursor: 'pointer' }}
            />
            <label htmlFor="smtp_secure" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', cursor: 'pointer', margin: 0 }}>
              Use SSL/TLS secure connection (port 465)
            </label>
          </div>

          <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem' }} disabled={saving}>
            {saving ? 'Saving Configurations...' : 'Save Configuration'}
          </button>
        </form>

        {/* Right Side: SMTP Diagnostics Tool */}
        <div className="card" style={{ background: 'var(--color-card)', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <h3 style={{ fontSize: '1.05rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Shield size={18} style={{ color: 'var(--color-primary)' }} />
            <span>Connection Diagnostics</span>
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4, margin: 0 }}>
            Ensure your SMTP configurations are functional by sending a direct test notification. 
            <strong> Ensure you save settings above before running this diagnostics tool.</strong>
          </p>

          <form onSubmit={handleTestEmail} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem' }}>Destination Test Email</label>
              <input 
                type="email" 
                placeholder="recipient@company.com" 
                value={testEmail} 
                onChange={e => setTestEmail(e.target.value)} 
                required 
              />
            </div>
            <button type="submit" className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }} disabled={testing || settings.smtp_pass === ''}>
              {testing ? (
                <>
                  <RefreshCw className="animate-spin" size={16} />
                  <span>Validating credentials...</span>
                </>
              ) : (
                <>
                  <Send size={16} />
                  <span>Send Diagnostics Email</span>
                </>
              )}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
