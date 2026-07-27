const API_BASE = window.location.port === '5173'
  ? 'http://localhost:9372/api'
  : `${window.location.protocol}//${window.location.host}/api`;

const getHeaders = () => {
  return {
    'Content-Type': 'application/json'
  };
};

const request = async (endpoint, options = {}) => {
  const url = `${API_BASE}${endpoint}`;
  const headers = { ...getHeaders(), ...options.headers };
  const config = {
    ...options,
    credentials: 'include',
    headers
  };

  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(url, config);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }

  return response.json();
};

const candidateRequest = (endpoint, options = {}) => request(`/candidate/${endpoint}`, options);

export const api = {
  API_BASE,
  // Auth
  login: (username, password) =>
    request('/auth/login', { method: 'POST', body: { username, password } }),
  
  verify2FA: (code, tempToken) =>
    request('/auth/verify-2fa', { method: 'POST', body: { code, tempToken } }),

  completeInitial2FA: (code, tempToken) =>
    request('/auth/complete-initial-2fa', { method: 'POST', body: { code, tempToken } }),

  logout: () =>
    request('/auth/logout', { method: 'POST' }),

  setup2FA: () =>
    request('/auth/setup-2fa', { method: 'POST' }),

  confirm2FA: (code) =>
    request('/auth/confirm-2fa', { method: 'POST', body: { code } }),

  disable2FA: (code) =>
    request('/auth/disable-2fa', { method: 'POST', body: { code } }),

  getMe: () =>
    request('/auth/me', { method: 'GET' }),

  getCandidateMe: () =>
    request('/auth/candidate-me', { method: 'GET' }),

  candidateLogout: () =>
    request('/auth/candidate-logout', { method: 'POST' }),

  updateProfile: (payload) =>
    request('/auth/profile', { method: 'PUT', body: payload }),

  // User Management (Admin)
  getUsers: () =>
    request('/users', { method: 'GET' }),

  createUser: (userData) =>
    request('/users', { method: 'POST', body: userData }),

  updateUser: (id, userData) =>
    request(`/users/${id}`, { method: 'PUT', body: userData }),

  deleteUser: (id) =>
    request(`/users/${id}`, { method: 'DELETE' }),

  // Questions Database
  getQuestions: () =>
    request('/questions', { method: 'GET' }),

  createQuestion: (qData) =>
    request('/questions', { method: 'POST', body: qData }),

  importQuestions: (questions) =>
    request('/questions/bulk', { method: 'POST', body: { questions } }),

  updateQuestion: (id, qData) =>
    request(`/questions/${id}`, { method: 'PUT', body: qData }),

  deleteQuestion: (id) =>
    request(`/questions/${id}`, { method: 'DELETE' }),

  // Tests
  getTests: () =>
    request('/tests', { method: 'GET' }),

  createTest: (testData) =>
    request('/tests', { method: 'POST', body: testData }),

  regenerateTest: (id) =>
    request(`/tests/${id}/regenerate`, { method: 'POST' }),

  deleteTest: (id) =>
    request(`/tests/${id}`, { method: 'DELETE' }),

  // Sessions
  getSessions: () =>
    request('/sessions', { method: 'GET' }),

  createCandidateSession: (test_id, candidate_email, candidate_password) =>
    request('/sessions', { method: 'POST', body: { test_id, candidate_email, candidate_password } }),

  getSessionInfo: () =>
    candidateRequest('session', { method: 'GET' }),

  startSession: (candidate_name) =>
    candidateRequest('start', { method: 'POST', body: { candidate_name } }),

  getSessionTake: () =>
    candidateRequest('take', { method: 'GET' }),

  submitSessionAnswers: (responses) =>
    candidateRequest('submit', { method: 'POST', body: { responses } }),

  downloadSessionSebConfig: async () => {
    const response = await fetch(`${API_BASE}/candidate/seb-config`, {
      method: 'GET', credentials: 'include'
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to download Safe Exam Browser configuration.');
    }
    return response.blob();
  },

  getAdminSessionResults: (sessionId) =>
    request('/admin/session-results', { method: 'GET', headers: { 'X-Aptora-Session-Token': sessionId } }),

  getEmails: () =>
    request('/emails', { method: 'GET' }),

  deleteEmail: (id) =>
    request(`/emails/${id}`, { method: 'DELETE' }),

  deleteSession: (id) =>
    request('/admin/session', { method: 'DELETE', headers: { 'X-Aptora-Session-Token': id } }),

  updateCandidateCredentials: (sessionId, candidate_email, candidate_password) =>
    request('/admin/candidate-credentials', {
      method: 'PUT',
      headers: { 'X-Aptora-Session-Token': sessionId },
      body: { candidate_email, candidate_password }
    }),

  getCandidateCredentials: (sessionId) =>
    request('/admin/candidate-credentials', {
      method: 'GET',
      headers: { 'X-Aptora-Session-Token': sessionId }
    }),

  sendCandidateEmail: (candidate_email, subject, text) =>
    request('/admin/candidate-email', {
      method: 'POST',
      body: { candidate_email, subject, text }
    }),

  getCandidateEmailTemplate: (sessionId) =>
    request('/admin/candidate-email-template', {
      method: 'GET',
      headers: { 'X-Aptora-Session-Token': sessionId }
    }),

  bulkDeleteQuestions: (ids) =>
    request('/questions/bulk-delete', { method: 'POST', body: { ids } }),

  bulkDeleteUsers: (ids) =>
    request('/users/bulk-delete', { method: 'POST', body: { ids } }),

  bulkDeleteTests: (ids) =>
    request('/tests/bulk-delete', { method: 'POST', body: { ids } }),

  bulkDeleteSessions: (ids) =>
    request('/sessions/bulk-delete', { method: 'POST', body: { ids } }),

  bulkDeleteEmails: (ids) =>
    request('/emails/bulk-delete', { method: 'POST', body: { ids } }),

  // SMTP Email Settings Configuration
  getEmailSettings: () =>
    request('/admin/email-settings', { method: 'GET' }),

  updateEmailSettings: (settings) =>
    request('/admin/email-settings', { method: 'POST', body: settings }),

  testEmailSettings: (test_email) =>
    request('/admin/email-settings/test', { method: 'POST', body: { test_email } }),

  // Clipboard Copy Helper for secure & insecure contexts
  copyText: (text) => {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.top = "0";
      textArea.style.left = "0";
      textArea.style.position = "fixed";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      let success = false;
      try {
        success = document.execCommand('copy');
      } catch (err) {
        console.error('Fallback copy failed', err);
      }
      document.body.removeChild(textArea);
      if (success) {
        return Promise.resolve();
      } else {
        return Promise.reject(new Error('Copy failed'));
      }
    }
  },
  logFocusLost: () =>
    candidateRequest('focus-lost', { method: 'POST' })
};
