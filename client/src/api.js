const API_BASE = window.location.port === '5173'
  ? 'http://localhost:9372/api'
  : `${window.location.protocol}//${window.location.host}/api`;

const getHeaders = () => {
  const token = localStorage.getItem('aptora_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

const request = async (endpoint, options = {}) => {
  const url = `${API_BASE}${endpoint}`;
  const headers = { ...getHeaders(), ...options.headers };
  const config = {
    ...options,
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

export const api = {
  API_BASE,
  // Auth
  login: (username, password) =>
    request('/auth/login', { method: 'POST', body: { username, password } }),
  
  verify2FA: (code, tempToken) =>
    request('/auth/verify-2fa', { method: 'POST', body: { code, tempToken } }),

  register: (username, email, password) =>
    request('/auth/register', { method: 'POST', body: { username, email, password } }),

  setup2FA: () =>
    request('/auth/setup-2fa', { method: 'POST' }),

  confirm2FA: (code) =>
    request('/auth/confirm-2fa', { method: 'POST', body: { code } }),

  disable2FA: (code) =>
    request('/auth/disable-2fa', { method: 'POST', body: { code } }),

  getMe: () =>
    request('/auth/me', { method: 'GET' }),

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

  // Advices
  getAdvices: () =>
    request('/questions/advices', { method: 'GET' }),

  submitAdvice: (qData) =>
    request('/questions/advices', { method: 'POST', body: qData }),

  approveAdvice: (id) =>
    request(`/questions/advices/${id}/approve`, { method: 'POST' }),

  rejectAdvice: (id) =>
    request(`/questions/advices/${id}/reject`, { method: 'POST' }),

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

  createSessionLink: (test_id, candidate_email) =>
    request('/sessions/create-link', { method: 'POST', body: { test_id, candidate_email } }),

  getSessionInfo: (sessionId) =>
    request(`/sessions/${sessionId}`, { method: 'GET' }),

  startSession: (sessionId, candidate_name, candidate_info = {}) =>
    request(`/sessions/${sessionId}/start`, { method: 'POST', body: { candidate_name, candidate_info } }),

  getSessionTake: (sessionId) =>
    request(`/sessions/${sessionId}/take`, { method: 'GET' }),

  submitSessionAnswers: (sessionId, responses) =>
    request(`/sessions/${sessionId}/submit`, { method: 'POST', body: { responses } }),

  getSessionResults: (sessionId) =>
    request(`/sessions/${sessionId}/results`, { method: 'GET' }),

  getEmails: () =>
    request('/emails', { method: 'GET' }),

  deleteEmail: (id) =>
    request(`/emails/${id}`, { method: 'DELETE' }),

  deleteSession: (id) =>
    request(`/sessions/${id}`, { method: 'DELETE' }),

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
    request('/admin/email-settings/test', { method: 'POST', body: { test_email } })
};
