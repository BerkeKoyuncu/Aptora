const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./db');
const {
  authenticateToken, requireRole, generate2FASecret, verify2FACode, encrypt, decrypt,
  getPasswordPolicyError, createTemporaryToken, verifyTemporaryToken,
  setSessionCookie, clearSessionCookie, authenticateCandidate,
  setCandidateSessionCookie, clearCandidateSessionCookie
} = require('./auth');

const router = express.Router();
const nodemailer = require('nodemailer');
const ExcelJS = require('exceljs');
const { publicUrl, isProduction, sessionLinkTtlHours, resultLinkTtlHours, sessionSubmitGraceSeconds } = require('./config');

// Helper to generate a 32-char hex session token
const generateToken = () => crypto.randomBytes(16).toString('hex');
const safeError = (err) => isProduction ? 'An internal server error occurred' : err.message;
const cleanString = (value, maxLength) => typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
const isValidEmail = (value) => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const sha256 = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
const redactToken = (value) => String(value || '').replace(/[a-f0-9]{32}/gi, ':token');
const SESSION_LINK_PLACEHOLDER = '[PASTE_SESSION_LINK_HERE]';
const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const buildCandidateEmailHtml = (text) => {
  const headings = new Set(['ASSESSMENT DETAILS', 'ACCESS INFORMATION', 'INSTRUCTIONS']);
  const content = String(text).replace(/\r\n/g, '\n').split('\n').map(rawLine => {
    const line = rawLine.trim();
    if (!line) return '<div style="height: 10px; line-height: 10px;">&nbsp;</div>';
    if (headings.has(line)) {
      return `<div style="margin: 18px 0 9px; padding-bottom: 5px; border-bottom: 1px solid #dddddd; color: #222222; font-size: 13px; font-weight: 700; letter-spacing: 0.06em;">${escapeHtml(line)}</div>`;
    }

    const instruction = line.match(/^(\d+)\.\s+(.+)$/);
    if (instruction) {
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 8px;">
        <tr>
          <td width="26" valign="top" style="color: #222222; font-weight: 700;">${instruction[1]}.</td>
          <td valign="top" style="color: #222222;">${escapeHtml(instruction[2])}</td>
        </tr>
      </table>`;
    }

    const detail = line.match(/^([^:]{1,40}):\s*(.*)$/);
    if (detail) {
      const keepOnOneLine = detail[1] === 'Number of questions' ? ' white-space: nowrap;' : '';
      return `<div style="margin: 0 0 6px; color: #222222; word-break: break-word;${keepOnOneLine}">
        <span style="font-weight: 700;">${escapeHtml(detail[1])}:</span> <span>${escapeHtml(detail[2])}</span>
      </div>`;
    }

    const isSignature = line === 'E-Data Assessment Team';
    return `<div style="margin: 0 0 6px;${isSignature ? ' font-weight: 700; color: #222222;' : ''}">${escapeHtml(line)}</div>`;
  }).join('');

  return `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #222222; font-size: 14px; line-height: 1.55; max-width: 680px; margin: 0 auto;">
      <div>${content}</div>
      <div style="margin-top: 38px; padding-top: 18px; border-top: 1px solid #dddddd; text-align: left;">
        <img src="cid:edata-logo@edata.local" alt="E-Data Teknoloji" width="135" align="left" style="display: block; width: 135px; max-width: 135px; height: auto; border: 0; margin: 0;" />
      </div>
    </div>`;
};

const buildCandidateEmailTemplate = (test, candidateEmail, candidatePassword) => {
  const duration = Number(test.duration) || 20;
  const questionCount = Number(test.num_questions) || 0;
  const sebRequired = !!test.require_seb;
  return `Hello,

You have been invited to complete an E-Data assessment.

ASSESSMENT DETAILS
Number of questions: ${questionCount}
Time limit: ${duration} minutes
${sebRequired ? 'Safe Exam Browser (SEB): Required\n' : ''}

ACCESS INFORMATION
Session link: ${SESSION_LINK_PLACEHOLDER}
Username / Email: ${candidateEmail}
Password: ${candidatePassword}

INSTRUCTIONS
1. At the agreed assessment time, open the session link.
2. Sign in using the email address and password provided above.
3. Enter your name on the welcome screen to begin the assessment.
${sebRequired
    ? `4. Safe Exam Browser is required. Download and open the SEB configuration when prompted, then continue the assessment inside SEB.
5. Once the assessment starts, the ${duration}-minute timer cannot be paused. Do not close or refresh the assessment page.
6. Submit your answers when finished. You will be able to review your detailed result immediately after submission.
7. Your candidate account is temporary and will be removed automatically after submission.`
    : `4. Once the assessment starts, the ${duration}-minute timer cannot be paused. Do not close or refresh the assessment page.
5. Submit your answers when finished. You will be able to review your detailed result immediately after submission.
6. Your candidate account is temporary and will be removed automatically after submission.`}

Please do not share these credentials or the session link with anyone.

Best regards,
E-Data Assessment Team`;
};

const verifySebRequest = (req, session) => {
  if (!session.require_seb) return true;
  const received = String(req.get('x-safeexambrowser-configkeyhash') || '').toLowerCase();
  if (!session.seb_config_key || !/^[a-f0-9]{64}$/.test(received)) return false;
  const absoluteUrl = `${publicUrl}${req.originalUrl.split('#')[0]}`;
  const expected = sha256(`${absoluteUrl}${session.seb_config_key}`);
  return crypto.timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expected, 'hex'));
};

const enforceSeb = (req, res, session) => {
  if (verifySebRequest(req, session)) return true;
  res.status(403).json({ error: 'This test must be opened with its approved Safe Exam Browser configuration' });
  return false;
};

async function audit(req, action, targetType = null, targetId = null, details = null) {
  try {
    const storedTargetId = targetType === 'test_session' && targetId
      ? `sha256:${sha256(String(targetId)).slice(0, 16)}`
      : (targetId ? redactToken(targetId) : null);
    await db.run(
      `INSERT INTO security_audit_logs
       (actor_user_id, action, target_type, target_id, ip_address, user_agent, details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user?.id || null, action, targetType, storedTargetId,
        req.ip, cleanString(req.get('user-agent') || '', 500), details ? JSON.stringify(details) : null]
    );
  } catch (err) {
    console.error('Security audit log failure:', err);
  }
}

const publicUser = (user) => ({
  id: user.id,
  username: user.username,
  email: user.email,
  role: user.role,
  twofa_enabled: !!user.twofa_enabled
});

// Helper to send real emails via SMTP
async function sendRealEmail(adminUserId, to, subject, text, html) {
  try {
    const config = await db.get('SELECT * FROM email_settings WHERE user_id = ?', [adminUserId]);
    if (!config || config.is_enabled !== 1) {
      throw new Error('SMTP email delivery is disabled for your administrator account.');
    }

    if (!config.smtp_host || !config.smtp_user || !config.smtp_pass || !config.from_email) {
      throw new Error('SMTP Configuration details are incomplete.');
    }

    const transporter = nodemailer.createTransport({
      host: config.smtp_host,
      port: config.smtp_port,
      secure: config.smtp_secure === 1,
      auth: {
        user: config.smtp_user,
        pass: decrypt(config.smtp_pass)
      },
      tls: {
        rejectUnauthorized: true
      }
    });

    const logoCandidates = [
      path.join(__dirname, '../client/dist/e-data-logo.png'),
      path.join(__dirname, '../client/public/e-data-logo.png')
    ];
    const logoPath = logoCandidates.find(candidate => fs.existsSync(candidate));
    if (!logoPath) throw new Error('E-Data email logo asset is missing.');

    const info = await transporter.sendMail({
      from: `"${config.from_email.split('@')[0].toUpperCase()}" <${config.from_email}>`,
      to,
      subject,
      text,
      html,
      attachments: [{
        filename: 'e-data-logo.png',
        path: logoPath,
        cid: 'edata-logo@edata.local'
      }]
    });

    console.log('Real email sent: %s', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error('Failed to send real SMTP email:', err);
    throw err;
  }
}

// ==========================================
// 1. AUTHENTICATION ENDPOINTS
// ==========================================

// Login
router.post('/auth/login', async (req, res) => {
  const username = cleanString(req.body?.username, 100);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) {
      const candidate = await db.get(
        `SELECT ca.*, ts.status, ts.expires_at
         FROM candidate_accounts ca
         JOIN test_sessions ts ON ts.id = ca.session_id
         WHERE ca.email = ?`,
        [username.toLowerCase()]
      );
      if (!candidate || !bcrypt.compareSync(password, candidate.password_hash)) {
        await audit(req, 'auth.login_failed', 'account', null, { username });
        return res.status(401).json({ error: 'Invalid email/username or password' });
      }
      if (!['pending', 'active'].includes(candidate.status) ||
          (candidate.status === 'pending' && candidate.expires_at &&
           new Date(`${candidate.expires_at}Z`) <= new Date())) {
        await db.run('DELETE FROM candidate_accounts WHERE id = ?', [candidate.id]);
        return res.status(403).json({ error: 'This candidate account is no longer active' });
      }
      clearSessionCookie(res);
      setCandidateSessionCookie(res, candidate);
      await audit(req, 'candidate.login_succeeded', 'test_session', candidate.session_id, { candidateEmail: candidate.email });
      return res.json({ candidate: { email: candidate.email, role: 'candidate' } });
    }
    if (!bcrypt.compareSync(password, user.password_hash)) {
      await audit(req, 'auth.login_failed', 'user', user.id, { username });
      return res.status(401).json({ error: 'Invalid email/username or password' });
    }

    if (user.must_setup_2fa) {
      const { secret, qrCodeUrl } = await generate2FASecret(user.email);
      await db.run('UPDATE users SET twofa_secret = ?, twofa_enabled = 0 WHERE id = ?', [encrypt(secret), user.id]);
      const tempToken = createTemporaryToken(user, 'initial-2fa');
      await audit(req, 'auth.initial_2fa_started', 'user', user.id);
      return res.json({ twofa_setup_required: true, tempToken, secret, qrCodeUrl });
    }

    if (user.twofa_enabled) {
      const tempToken = createTemporaryToken(user, 'verify-2fa');
      return res.json({ twofa_required: true, tempToken });
    }

    setSessionCookie(res, user);
    clearCandidateSessionCookie(res);
    await audit(req, 'auth.login_succeeded', 'user', user.id, { twofa: false });
    res.json({ user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// Verify 2FA code during login
router.post('/auth/verify-2fa', async (req, res) => {
  const { code, tempToken } = req.body;
  if (!code || !tempToken) {
    return res.status(400).json({ error: '2FA code and temporary token are required' });
  }

  try {
    const decoded = verifyTemporaryToken(tempToken, 'verify-2fa');

    const user = await db.get('SELECT * FROM users WHERE id = ?', [decoded.id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isValid = verify2FACode(code, decrypt(user.twofa_secret));
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid 2FA verification code' });
    }

    setSessionCookie(res, user);
    req.user = user;
    await audit(req, 'auth.login_succeeded', 'user', user.id, { twofa: true });
    res.json({ user: publicUser(user) });
  } catch (err) {
    res.status(401).json({ error: 'Temporary login token expired or invalid' });
  }
});

// Mandatory setup for a newly-created admin account.
router.post('/auth/complete-initial-2fa', async (req, res) => {
  const { code, tempToken } = req.body || {};
  if (!/^\d{6}$/.test(String(code || '')) || !tempToken) {
    return res.status(400).json({ error: 'A valid 2FA code and temporary token are required' });
  }
  try {
    const decoded = verifyTemporaryToken(tempToken, 'initial-2fa');
    const user = await db.get('SELECT * FROM users WHERE id = ? AND must_setup_2fa = 1', [decoded.id]);
    if (!user || !user.twofa_secret || !verify2FACode(String(code), decrypt(user.twofa_secret))) {
      return res.status(400).json({ error: 'Invalid 2FA verification code' });
    }
    await db.run('UPDATE users SET twofa_enabled = 1, must_setup_2fa = 0 WHERE id = ?', [user.id]);
    user.twofa_enabled = 1;
    user.must_setup_2fa = 0;
    setSessionCookie(res, user);
    req.user = user;
    await audit(req, 'auth.initial_2fa_completed', 'user', user.id);
    res.json({ user: publicUser(user) });
  } catch {
    res.status(401).json({ error: 'Temporary setup token expired or invalid' });
  }
});

router.post('/auth/logout', authenticateToken, async (req, res) => {
  await db.run('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [req.user.id]);
  await audit(req, 'auth.logout', 'user', req.user.id);
  clearSessionCookie(res);
  res.json({ success: true });
});

// Setup 2FA - Generate secret and QR code (Requires Auth)
router.post('/auth/setup-2fa', authenticateToken, async (req, res) => {
  try {
    const user = await db.get('SELECT email, twofa_enabled FROM users WHERE id = ?', [req.user.id]);
    if (user.twofa_enabled) {
      return res.status(400).json({ error: '2FA is already enabled' });
    }

    const { secret, qrCodeUrl } = await generate2FASecret(user.email);
    // Temporarily save secret in DB, but don't set enabled yet
    await db.run('UPDATE users SET twofa_secret = ? WHERE id = ?', [encrypt(secret), req.user.id]);

    res.json({ secret, qrCodeUrl });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// Confirm 2FA - Verifies code before fully enabling (Requires Auth)
router.post('/auth/confirm-2fa', authenticateToken, async (req, res) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ error: 'Verification code is required' });
  }

  try {
    const user = await db.get('SELECT twofa_secret FROM users WHERE id = ?', [req.user.id]);
    if (!user.twofa_secret) {
      return res.status(400).json({ error: '2FA has not been set up. Initiate setup first.' });
    }

    const isValid = verify2FACode(code, decrypt(user.twofa_secret));
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid code. Verification failed.' });
    }

    await db.run('UPDATE users SET twofa_enabled = 1, must_setup_2fa = 0 WHERE id = ?', [req.user.id]);
    res.json({ success: true, message: '2FA enabled successfully' });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// Disable 2FA (Requires Auth)
router.post('/auth/disable-2fa', authenticateToken, async (req, res) => {
  const { code } = req.body;
  try {
    const user = await db.get('SELECT twofa_secret, twofa_enabled FROM users WHERE id = ?', [req.user.id]);
    if (!user.twofa_enabled) {
      return res.status(400).json({ error: '2FA is not enabled' });
    }

    if (!/^\d{6}$/.test(String(code || '')) || !verify2FACode(String(code), decrypt(user.twofa_secret))) {
      return res.status(400).json({ error: 'A valid 2FA code is required' });
    }

    await db.run('UPDATE users SET twofa_enabled = 0, twofa_secret = NULL WHERE id = ?', [req.user.id]);
    res.json({ success: true, message: '2FA disabled successfully' });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// Check current user state
router.get('/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await db.get('SELECT id, username, email, role, twofa_enabled FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(publicUser(user));
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.get('/auth/candidate-me', authenticateCandidate, async (req, res) => {
  res.json({ email: req.candidate.email, role: 'candidate' });
});

router.post('/auth/candidate-logout', authenticateCandidate, async (req, res) => {
  clearCandidateSessionCookie(res);
  res.json({ success: true });
});

// Update user profile (username, email, optional password)
router.put('/auth/profile', authenticateToken, async (req, res) => {
  const username = cleanString(req.body?.username, 100);
  const email = cleanString(req.body?.email, 254).toLowerCase();
  const password = req.body?.password;
  if (username.length < 3 || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Username and email are required' });
  }

  try {
    // Check if username/email already taken by someone else
    const existing = await db.get(
      'SELECT id FROM users WHERE (username = ? OR email = ?) AND id != ?',
      [username, email, req.user.id]
    );
    if (existing) {
      return res.status(400).json({ error: 'Username or email is already taken' });
    }

    if (password && password.trim()) {
      const passwordError = getPasswordPolicyError(password);
      if (passwordError) return res.status(400).json({ error: passwordError });
      const hash = bcrypt.hashSync(password, 10);
      await db.run(
        'UPDATE users SET username = ?, email = ?, password_hash = ?, token_version = token_version + 1 WHERE id = ?',
        [username, email, hash, req.user.id]
      );
    } else {
      await db.run(
        'UPDATE users SET username = ?, email = ? WHERE id = ?',
        [username, email, req.user.id]
      );
    }

    const refreshedUser = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    setSessionCookie(res, refreshedUser);
    await audit(req, 'user.profile_updated', 'user', req.user.id, { passwordChanged: !!(password && password.trim()) });
    res.json({ message: 'Profile updated successfully' });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});


// ==========================================
// 2. USER MANAGEMENT ENDPOINTS (Admin Only)
// ==========================================
router.get('/users', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const users = await db.query('SELECT id, username, email, role, twofa_enabled, created_at FROM users');
    res.json(users.map(u => ({ ...u, twofa_enabled: !!u.twofa_enabled })));
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.post('/users', authenticateToken, requireRole(['admin']), async (req, res) => {
  const username = cleanString(req.body?.username, 100);
  const email = cleanString(req.body?.email, 254).toLowerCase();
  const password = req.body?.password;
  if (username.length < 3 || !isValidEmail(email) || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required' });
  }
  const passwordError = getPasswordPolicyError(password);
  if (passwordError) return res.status(400).json({ error: passwordError });

  try {
    const existing = await db.get('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (existing) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const result = await db.run(
      'INSERT INTO users (username, email, password_hash, role, must_setup_2fa) VALUES (?, ?, ?, ?, 1)',
      [username, email, hash, 'admin']
    );

    await audit(req, 'admin.created', 'user', result.id);
    res.status(201).json({ id: result.id, username, email, role: 'admin' });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.put('/users/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const username = req.body?.username === undefined ? undefined : cleanString(req.body.username, 100);
  const email = req.body?.email === undefined ? undefined : cleanString(req.body.email, 254).toLowerCase();
  const password = req.body?.password;
  const userId = req.params.id;

  if ((username !== undefined && username.length < 3) || (email !== undefined && !isValidEmail(email))) {
    return res.status(400).json({ error: 'A valid username and email are required' });
  }

  try {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let queryStr = 'UPDATE users SET username = ?, email = ?';
    let params = [username || user.username, email || user.email];

    if (password) {
      const passwordError = getPasswordPolicyError(password);
      if (passwordError) return res.status(400).json({ error: passwordError });
      queryStr += ', password_hash = ?';
      params.push(bcrypt.hashSync(password, 10));
    }

    queryStr += ' WHERE id = ?';
    params.push(userId);

    await db.run(queryStr, params);
    await audit(req, 'admin.updated', 'user', userId, { passwordChanged: !!password });
    res.json({ message: 'User updated successfully' });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.delete('/users/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    // Prevent self-deletion
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own admin account.' });
    }
    const result = await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
    if (!result.changes) return res.status(404).json({ error: 'User not found' });
    await audit(req, 'admin.deleted', 'user', req.params.id);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});


// ==========================================
// 3. QUESTIONS & ADVICES ENDPOINTS
// ==========================================

// Get all active database questions (Admin only, or Standard to see, but Admin is primary manager)
router.get('/questions', authenticateToken, async (req, res) => {
  try {
    const questions = await db.query('SELECT * FROM questions ORDER BY domain, difficulty');
    res.json(questions.map(q => ({ ...q, options: JSON.parse(q.options) })));
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// Add active question (Admin only)
router.post('/questions', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { domain, difficulty, points, question_text, options } = req.body;
  if (!domain || !difficulty || !points || !question_text || !options) {
    return res.status(400).json({ error: 'Missing required question parameters' });
  }

  try {
    const existing = await db.get('SELECT id FROM questions WHERE TRIM(question_text) = ?', [question_text.trim()]);
    if (existing) {
      return res.status(400).json({ error: 'A question with this exact text already exists in the database.' });
    }

    const result = await db.run(
      'INSERT INTO questions (domain, difficulty, points, question_text, options, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [domain, difficulty, points, question_text, JSON.stringify(options), req.user.id]
    );
    res.status(201).json({ id: result.id, message: 'Question created successfully' });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// GET /questions/template - Download Excel Template with Data Validations
router.get('/questions/template', authenticateToken, async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Questions');
    const listSheet = workbook.addWorksheet('Lists');

    // Add list options in listSheet
    const domains = [
      'Network Fundamentals',
      'Network Security & Edge Security',
      'Identity & Access Security',
      'Security Operations & Monitoring',
      'Vulnerability, Exposure & Security Testing',
      'Application & Software Security',
      'Data Security & Storage',
      'Cloud & Data Centre Infrastructure',
      'OT Security',
      'General'
    ];
    const difficulties = ['1', '2', '3', '4', '5'];
    const correctOptions = ['A', 'B', 'C', 'D'];

    // Write Lists sheet values
    domains.forEach((val, idx) => {
      listSheet.getCell(`A${idx + 1}`).value = val;
    });
    difficulties.forEach((val, idx) => {
      listSheet.getCell(`B${idx + 1}`).value = val;
    });
    correctOptions.forEach((val, idx) => {
      listSheet.getCell(`C${idx + 1}`).value = val;
    });

    // Hide lists worksheet
    listSheet.state = 'hidden';

    // Set up Questions sheet headers
    const headers = [
      'domain',
      'difficulty',
      'points',
      'question_text',
      'option_a',
      'option_b',
      'option_c',
      'option_d',
      'correct_option'
    ];

    const headerRow = sheet.getRow(1);
    headers.forEach((h, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF114B4E' } // Deep Forest Teal header color
      };
      cell.alignment = { horizontal: 'center' };
    });
    headerRow.height = 25;

    // Define data validations for domain, difficulty, and correct_option
    const domainValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`Lists!$A$1:$A$${domains.length}`],
      showErrorMessage: true,
      errorTitle: 'Invalid Selection',
      error: 'Please select a valid domain from the dropdown list.'
    };

    const difficultyValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`Lists!$B$1:$B$${difficulties.length}`],
      showErrorMessage: true,
      errorTitle: 'Invalid Selection',
      error: 'Please select a difficulty between 1 and 5.'
    };

    const correctValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`Lists!$C$1:$C$${correctOptions.length}`],
      showErrorMessage: true,
      errorTitle: 'Invalid Selection',
      error: 'Please select a valid option letter (A, B, C, or D).'
    };

    // Apply validations to first 500 rows
    for (let r = 2; r <= 500; r++) {
      sheet.getCell(`A${r}`).dataValidation = domainValidation;
      sheet.getCell(`B${r}`).dataValidation = difficultyValidation;
      sheet.getCell(`I${r}`).dataValidation = correctValidation;
      sheet.getCell(`C${r}`).value = { formula: `IF(ISNUMBER(B${r}), B${r}*5, "")` };
    }

    // Set column widths
    sheet.getColumn(1).width = 35; // domain
    sheet.getColumn(2).width = 12; // difficulty
    sheet.getColumn(3).width = 10; // points
    sheet.getColumn(4).width = 50; // question_text
    sheet.getColumn(5).width = 25; // option_a
    sheet.getColumn(6).width = 25; // option_b
    sheet.getColumn(7).width = 25; // option_c
    sheet.getColumn(8).width = 25; // option_d
    sheet.getColumn(9).width = 15; // correct_option

    // Write a sample question row
    sheet.getCell('A2').value = 'Network Fundamentals';
    sheet.getCell('B2').value = 3;
    sheet.getCell('C2').value = { formula: 'IF(ISNUMBER(B2), B2*5, "")' };
    sheet.getCell('D2').value = 'Which protocol is used to automatically assign IP addresses in a network?';
    sheet.getCell('E2').value = 'Dynamic Host Configuration Protocol (DHCP)';
    sheet.getCell('F2').value = 'Simple Mail Transfer Protocol (SMTP)';
    sheet.getCell('G2').value = 'Domain Name System (DNS)';
    sheet.getCell('H2').value = 'Transmission Control Protocol (TCP)';
    sheet.getCell('I2').value = 'A';

    // Set response headers to force download as Excel file
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=aptora_question_import_template.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Failed to generate template:', err);
    res.status(500).json({ error: safeError(err) });
  }
});

// Bulk import active questions (Admin only)
router.post('/questions/bulk', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { questions } = req.body;
  if (!questions || !Array.isArray(questions)) {
    return res.status(400).json({ error: 'Invalid payload: questions array is required' });
  }

  if (questions.length === 0) {
    return res.status(400).json({ error: 'Questions array is empty' });
  }

  // Validate all questions first to fail early
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q.domain || q.difficulty === undefined || q.points === undefined || !q.question_text || !q.options || !Array.isArray(q.options)) {
      return res.status(400).json({ error: `Question at index ${i} is missing required parameters` });
    }
    const diff = parseInt(q.difficulty);
    if (isNaN(diff) || diff < 1 || diff > 5) {
      return res.status(400).json({ error: `Question at index ${i} has invalid difficulty (must be between 1 and 5)` });
    }
    const pts = parseInt(q.points);
    if (isNaN(pts) || pts <= 0) {
      return res.status(400).json({ error: `Question at index ${i} has invalid points (must be greater than 0)` });
    }
    if (q.options.length < 2) {
      return res.status(400).json({ error: `Question at index ${i} must have at least 2 options` });
    }
    const hasCorrect = q.options.some(opt => opt.isCorrect === true || opt.isCorrect === 'true' || opt.isCorrect === 1);
    if (!hasCorrect) {
      return res.status(400).json({ error: `Question at index ${i} has no correct option marked` });
    }

    // Check duplicate in database
    const dbExisting = await db.get('SELECT id FROM questions WHERE TRIM(question_text) = ?', [q.question_text.trim()]);
    if (dbExisting) {
      return res.status(400).json({ error: `Question at index ${i} ("${q.question_text.substring(0, 30)}...") already exists in the database.` });
    }
  }

  // Check duplicates within the uploaded batch array itself
  const seenTexts = new Set();
  for (let i = 0; i < questions.length; i++) {
    const text = questions[i].question_text.trim();
    if (seenTexts.has(text)) {
      return res.status(400).json({ error: `Duplicate question text found within the uploaded list at index ${i}.` });
    }
    seenTexts.add(text);
  }

  try {
    // Run bulk inserts in a transaction to guarantee atomic operation
    await db.run('BEGIN TRANSACTION');
    for (const q of questions) {
      const parsedOptions = q.options.map(opt => ({
        id: opt.id || Math.random().toString(36).substr(2, 9),
        text: opt.text,
        isCorrect: opt.isCorrect === true || opt.isCorrect === 'true' || opt.isCorrect === 1
      }));
      await db.run(
        'INSERT INTO questions (domain, difficulty, points, question_text, options, created_by) VALUES (?, ?, ?, ?, ?, ?)',
        [q.domain, parseInt(q.difficulty), parseInt(q.points), q.question_text, JSON.stringify(parsedOptions), req.user.id]
      );
    }
    await db.run('COMMIT');
    res.status(201).json({ success: true, count: questions.length });
  } catch (err) {
    try {
      await db.run('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Failed to rollback transaction:', rollbackErr);
    }
    res.status(500).json({ error: safeError(err) });
  }
});

// Update active question (Admin only)
router.put('/questions/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { domain, difficulty, points, question_text, options } = req.body;
  try {
    await db.run(
      'UPDATE questions SET domain = ?, difficulty = ?, points = ?, question_text = ?, options = ? WHERE id = ?',
      [domain, difficulty, points, question_text, JSON.stringify(options), req.params.id]
    );
    res.json({ message: 'Question updated successfully' });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// Delete active question (Admin only)
router.delete('/questions/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    await db.run('DELETE FROM questions WHERE id = ?', [req.params.id]);
    res.json({ message: 'Question deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// ==========================================
// 4. TEST GENERATION ENDPOINTS
// ==========================================

// Get all tests (authenticated administrators only)
router.get('/tests', authenticateToken, async (req, res) => {
  try {
    const tests = await db.query(`
      SELECT t.*, u.username as creator_name
      FROM tests t
      JOIN users u ON t.created_by = u.id
      ORDER BY t.created_at DESC
    `);
    res.json(tests.map(t => ({
      ...t,
      domains: JSON.parse(t.domains),
      difficulty_distribution: JSON.parse(t.difficulty_distribution),
      is_random: !!t.is_random
    })));
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// Create Test (randomized or direct selection)
router.post('/tests', authenticateToken, async (req, res) => {
  const { title, num_questions = 10, difficulty_distribution, domains, is_random = true, selected_questions = [], duration, require_seb } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Test title is required' });
  }

  // Set default domains (all domains by default)
  const defaultDomains = [
    'Network Fundamentals',
    'Network Security & Edge Security',
    'Identity & Access Security',
    'Security Operations & Monitoring',
    'Vulnerability, Exposure & Security Testing',
    'Application & Software Security',
    'Data Security & Storage',
    'Cloud & Data Centre Infrastructure',
    'OT Security',
    'General'
  ];
  const targetDomains = (domains && domains.length > 0) ? domains : defaultDomains;

  // Set default difficulty distribution (Bell Curve)
  // Level 1 (Beginner): 10%, Level 2: 20%, Level 3: 40%, Level 4: 20%, Level 5 (Expert): 10%
  const defaultDist = { "1": 10, "2": 20, "3": 40, "4": 20, "5": 10 };
  const targetDist = difficulty_distribution || defaultDist;

  try {
    const testDuration = parseInt(duration) || 20;
    const testRequireSeb = require_seb === true || require_seb === 1 || require_seb === 'true' ? 1 : 0;
    // 1. Insert test meta
    const result = await db.run(
      'INSERT INTO tests (title, created_by, num_questions, difficulty_distribution, domains, is_random, duration, require_seb) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [title, req.user.id, num_questions, JSON.stringify(targetDist), JSON.stringify(targetDomains), is_random ? 1 : 0, testDuration, testRequireSeb]
    );
    const testId = result.id;

    let finalQuestionIds = [];

    // 2. Select questions
    if (is_random) {
      // Randomized question selector based on domain & difficulty distribution
      const chosenQuestionsMap = new Map();

      // Calculate domain quotas
      const domainsQuota = {};
      const D = targetDomains.length;
      const baseCount = Math.floor(num_questions / D);
      let remainder = num_questions % D;
      
      targetDomains.forEach((domain, idx) => {
        domainsQuota[domain] = baseCount + (idx < remainder ? 1 : 0);
      });

      // Calculate difficulty quotas
      const difficultyQuota = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
      let allocatedCount = 0;
      const diffKeys = ["1", "2", "3", "4", "5"];
      diffKeys.forEach((key) => {
        const pct = targetDist[key] !== undefined ? targetDist[key] : 0;
        const targetForLevel = Math.round(num_questions * (pct / 100));
        difficultyQuota[key] = targetForLevel;
        allocatedCount += targetForLevel;
      });

      // Adjust rounding discrepancy for difficulties
      let diffDiff = num_questions - allocatedCount;
      if (diffDiff !== 0) {
        difficultyQuota["3"] += diffDiff;
        if (difficultyQuota["3"] < 0) difficultyQuota["3"] = 0;
      }

      // If pre-selected (hybrid mode), pull their details to populate chosenQuestionsMap
      let pinnedQuestions = [];
      if (selected_questions && selected_questions.length > 0) {
        const placeholders = selected_questions.map(() => '?').join(',');
        pinnedQuestions = await db.query(`SELECT id, difficulty, domain FROM questions WHERE id IN (${placeholders})`, selected_questions);
        pinnedQuestions.forEach(q => {
          chosenQuestionsMap.set(q.id, q);

          // Deduct from domain quota
          if (domainsQuota[q.domain] !== undefined && domainsQuota[q.domain] > 0) {
            domainsQuota[q.domain]--;
          } else {
            // If domain is not selected or quota is 0, deduct from any domain that has quota > 0
            const k = Object.keys(domainsQuota).find(d => domainsQuota[d] > 0);
            if (k) domainsQuota[k]--;
          }

          // Deduct from difficulty quota
          const diffStr = String(q.difficulty);
          if (difficultyQuota[diffStr] > 0) {
            difficultyQuota[diffStr]--;
          } else {
            const k = diffKeys.find(d => difficultyQuota[d] > 0);
            if (k) difficultyQuota[k]--;
          }
        });
      }

      // Greedy slot builder for the remaining count
      const slots = [];
      const remainingCount = num_questions - chosenQuestionsMap.size;
      for (let i = 0; i < remainingCount; i++) {
        // Find active domain with max quota
        let bestDomain = null;
        let maxDQuota = -1;
        for (const d of Object.keys(domainsQuota)) {
          if (domainsQuota[d] > maxDQuota && domainsQuota[d] > 0) {
            maxDQuota = domainsQuota[d];
            bestDomain = d;
          }
        }

        // Find active difficulty with max quota
        let bestDiff = null;
        let maxDiffQuota = -1;
        for (const df of diffKeys) {
          if (difficultyQuota[df] > maxDiffQuota && difficultyQuota[df] > 0) {
            maxDiffQuota = difficultyQuota[df];
            bestDiff = df;
          }
        }

        if (!bestDomain || !bestDiff) break; // Quotas exhausted

        slots.push({ domain: bestDomain, difficulty: parseInt(bestDiff) });
        domainsQuota[bestDomain]--;
        difficultyQuota[bestDiff]--;
      }

      // Now, fetch questions for each slot
      for (const slot of slots) {
        // 1. Try to find questions with exact domain & difficulty, ordered by usage_count ASC, RANDOM()
        const queryStr = `
          SELECT q.id, q.difficulty, q.domain, (SELECT COUNT(*) FROM test_selected_questions tsq WHERE tsq.question_id = q.id) as usage_count
          FROM questions q
          WHERE q.domain = ? AND q.difficulty = ?
          ORDER BY usage_count ASC, RANDOM()
        `;
        let pool = await db.query(queryStr, [slot.domain, slot.difficulty]);
        
        let matchedQ = pool.find(q => !chosenQuestionsMap.has(q.id));
        
        // 2. Fallback A: If no exact match, relax difficulty constraint (same domain, any difficulty)
        if (!matchedQ) {
          const fbQuery = `
            SELECT q.id, q.difficulty, q.domain, (SELECT COUNT(*) FROM test_selected_questions tsq WHERE tsq.question_id = q.id) as usage_count
            FROM questions q
            WHERE q.domain = ?
            ORDER BY ABS(q.difficulty - ?) ASC, usage_count ASC, RANDOM()
          `;
          const fbPool = await db.query(fbQuery, [slot.domain, slot.difficulty]);
          matchedQ = fbPool.find(q => !chosenQuestionsMap.has(q.id));
        }

        // 3. Fallback B: If still no match, relax domain constraint (any domain, same difficulty)
        if (!matchedQ) {
          const fbQuery = `
            SELECT q.id, q.difficulty, q.domain, (SELECT COUNT(*) FROM test_selected_questions tsq WHERE tsq.question_id = q.id) as usage_count
            FROM questions q
            WHERE q.difficulty = ?
            ORDER BY usage_count ASC, RANDOM()
          `;
          const fbPool = await db.query(fbQuery, [slot.difficulty]);
          matchedQ = fbPool.find(q => !chosenQuestionsMap.has(q.id));
        }

        // 4. Fallback C: Grab any question
        if (!matchedQ) {
          const fbQuery = `
            SELECT q.id, q.difficulty, q.domain, (SELECT COUNT(*) FROM test_selected_questions tsq WHERE tsq.question_id = q.id) as usage_count
            FROM questions q
            ORDER BY usage_count ASC, RANDOM()
          `;
          const fbPool = await db.query(fbQuery, []);
          matchedQ = fbPool.find(q => !chosenQuestionsMap.has(q.id));
        }

        if (matchedQ) {
          chosenQuestionsMap.set(matchedQ.id, matchedQ);
        }
      }

      finalQuestionIds = Array.from(chosenQuestionsMap.keys());
    } else {
      // Manual/Direct Selection
      finalQuestionIds = selected_questions;
    }

    // 3. Link questions to test
    for (const qId of finalQuestionIds) {
      await db.run(
        'INSERT INTO test_selected_questions (test_id, question_id) VALUES (?, ?)',
        [testId, qId]
      );
    }

    res.status(201).json({
      testId,
      title,
      questionCount: finalQuestionIds.length,
      is_random,
      message: 'Test generated and saved successfully'
    });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// Regenerate randomized questions for an existing test
router.post('/tests/:id/regenerate', authenticateToken, async (req, res) => {
  try {
    const test = await db.get('SELECT * FROM tests WHERE id = ?', [req.params.id]);
    if (!test) {
      return res.status(404).json({ error: 'Test configuration not found' });
    }

    if (!test.is_random) {
      return res.status(400).json({ error: 'Only dynamically generated tests can be regenerated' });
    }

    const num_questions = test.num_questions;
    const targetDist = JSON.parse(test.difficulty_distribution);
    const targetDomains = JSON.parse(test.domains);

    // Randomized question selector based on domain & difficulty distribution
    const chosenQuestionsMap = new Map();
    let allocatedCount = 0;
    const diffTargets = {};
    const diffKeys = ["1", "2", "3", "4", "5"];

    diffKeys.forEach((key) => {
      const pct = targetDist[key] !== undefined ? targetDist[key] : 0;
      const targetForLevel = Math.round(num_questions * (pct / 100));
      diffTargets[key] = targetForLevel;
      allocatedCount += targetForLevel;
    });

    let difference = num_questions - allocatedCount;
    if (difference !== 0) {
      diffTargets["3"] += difference;
      if (diffTargets["3"] < 0) diffTargets["3"] = 0;
    }

    for (const diff of diffKeys) {
      const countNeeded = diffTargets[diff];
      if (countNeeded <= 0) continue;

      const placeholders = targetDomains.map(() => '?').join(',');
      const queryStr = `
        SELECT id FROM questions 
        WHERE difficulty = ? AND domain IN (${placeholders}) 
        ORDER BY RANDOM() LIMIT ?
      `;

      const params = [parseInt(diff), ...targetDomains, countNeeded];
      const selected = await db.query(queryStr, params);
      selected.forEach(q => chosenQuestionsMap.set(q.id, true));
    }

    if (chosenQuestionsMap.size < num_questions) {
      const neededBackfill = num_questions - chosenQuestionsMap.size;
      const placeholders = targetDomains.map(() => '?').join(',');
      const queryStr = `
        SELECT id FROM questions 
        WHERE domain IN (${placeholders}) 
        ORDER BY RANDOM()
      `;
      const allPossible = await db.query(queryStr, targetDomains);
      for (const q of allPossible) {
        if (chosenQuestionsMap.size >= num_questions) break;
        chosenQuestionsMap.set(q.id, true);
      }
    }

    const finalQuestionIds = Array.from(chosenQuestionsMap.keys());

    // Update DB: delete old linked questions and insert new ones
    await db.run('DELETE FROM test_selected_questions WHERE test_id = ?', [test.id]);
    for (const qId of finalQuestionIds) {
      await db.run(
        'INSERT INTO test_selected_questions (test_id, question_id) VALUES (?, ?)',
        [test.id, qId]
      );
    }

    res.json({ message: 'Questions regenerated successfully', questionCount: finalQuestionIds.length });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// Delete a test template configuration
router.delete('/tests/:id', authenticateToken, async (req, res) => {
  try {
    const test = await db.get('SELECT * FROM tests WHERE id = ?', [req.params.id]);
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }
    // Delete it (cascades automatically to test_selected_questions and test_sessions in sqlite schema)
    await db.run('DELETE FROM tests WHERE id = ?', [req.params.id]);
    res.json({ message: 'Test template deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});


// ==========================================
// 4B. EMAIL CONFIGURATION ENDPOINTS (Admin Only)
// ==========================================

// Get SMTP email configuration settings
router.get('/admin/email-settings', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator access required.' });
  }

  try {
    let config = await db.get('SELECT * FROM email_settings WHERE user_id = ?', [req.user.id]);
    if (!config) {
      await db.run(
        `INSERT INTO email_settings
         (user_id, smtp_host, smtp_port, smtp_user, smtp_pass, from_email, smtp_secure, is_enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.id, 'smtp.gmail.com', 587, '', '', req.user.email || 'noreply@aptora.com', 0, 0]
      );
      config = await db.get('SELECT * FROM email_settings WHERE user_id = ?', [req.user.id]);
    }

    // Mask password if it exists
    const clientConfig = {
      ...config,
      smtp_pass: decrypt(config.smtp_pass) ? '••••••••' : '',
      smtp_secure: !!config.smtp_secure,
      is_enabled: !!config.is_enabled
    };

    res.json(clientConfig);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// Update SMTP email configuration settings
router.post('/admin/email-settings', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator access required.' });
  }

  const { smtp_host, smtp_port, smtp_user, smtp_pass, from_email, smtp_secure, is_enabled } = req.body;

  try {
    const existing = await db.get('SELECT * FROM email_settings WHERE user_id = ?', [req.user.id]);
    
    let passwordToSave = smtp_pass;
    if (smtp_pass === '••••••••') {
      passwordToSave = existing ? existing.smtp_pass : '';
    } else if (smtp_pass) {
      passwordToSave = encrypt(smtp_pass);
    }

    const host = smtp_host || 'smtp.gmail.com';
    const secure = smtp_secure ? 1 : 0;
    const port = secure ? 465 : (parseInt(smtp_port) || 587);
    const user = smtp_user || '';
    const from = from_email || 'noreply@aptora.com';
    const enabled = is_enabled ? 1 : 0;

    if (existing) {
      await db.run(
        'UPDATE email_settings SET smtp_host = ?, smtp_port = ?, smtp_user = ?, smtp_pass = ?, from_email = ?, smtp_secure = ?, is_enabled = ? WHERE id = ?',
        [host, port, user, passwordToSave, from, secure, enabled, existing.id]
      );
    } else {
      await db.run(
        `INSERT INTO email_settings
         (user_id, smtp_host, smtp_port, smtp_user, smtp_pass, from_email, smtp_secure, is_enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.id, host, port, user, passwordToSave, from, secure, enabled]
      );
    }

    res.json({ message: 'SMTP configurations updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// Send a test email to verify SMTP credentials
router.post('/admin/email-settings/test', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator access required.' });
  }

  const { test_email } = req.body;
  if (!test_email) {
    return res.status(400).json({ error: 'Destination test_email address is required.' });
  }

  try {
    const config = await db.get('SELECT * FROM email_settings WHERE user_id = ?', [req.user.id]);
    if (!config) {
      return res.status(400).json({ error: 'SMTP configuration is not initialized.' });
    }

    if (!config.smtp_host || !config.smtp_user || !config.smtp_pass) {
      return res.status(400).json({ error: 'SMTP configuration is incomplete.' });
    }

    const transporter = nodemailer.createTransport({
      host: config.smtp_host,
      port: config.smtp_port,
      secure: config.smtp_secure === 1,
      auth: {
        user: config.smtp_user,
        pass: decrypt(config.smtp_pass)
      },
      tls: {
        rejectUnauthorized: true
      }
    });

    const info = await transporter.sendMail({
      from: `"${config.from_email.split('@')[0].toUpperCase()}" <${config.from_email}>`,
      to: test_email,
      subject: `Aptora: SMTP Diagnostic Test Email`,
      text: `Congratulations! If you receive this message, it means your SMTP email setup in the Aptora testing platform is working correctly.\n\nSent at: ${new Date().toLocaleString()}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; border: 1px solid #becdd6; border-radius: 8px;">
          <h2 style="color: #2E7D32; margin-bottom: 1.5rem;">SMTP Diagnostic Check Passed</h2>
          <p>Hello Administrator,</p>
          <p>Congratulations! Your SMTP settings are correctly validated, and this message indicates that outgoing mail delivery is operational.</p>
          <br/>
          <hr style="border: none; border-top: 1px solid #becdd6;"/>
          <p style="font-size: 0.75rem; color: #738d91; margin-top: 1rem;">Timestamp: ${new Date().toLocaleString()}</p>
        </div>
      `
    });

    res.json({ message: `Test email successfully sent. Message ID: ${info.messageId}` });
  } catch (err) {
    res.status(500).json({ error: isProduction ? 'SMTP validation failed' : `SMTP validation failed: ${err.message}` });
  }
});


// ==========================================
// 5. TEST RUNNER & SESSIONS
// ==========================================

// Candidate endpoints resolve the test session from the authenticated temporary account.
const candidateRouteMap = new Map([
  ['GET /candidate/session', ''],
  ['POST /candidate/start', '/start'],
  ['GET /candidate/take', '/take'],
  ['POST /candidate/submit', '/submit'],
  ['POST /candidate/focus-lost', '/log-focus-lost'],
  ['GET /candidate/seb-config', '/seb-config']
]);

router.use((req, res, next) => {
  const suffix = candidateRouteMap.get(`${req.method} ${req.path}`);
  if (suffix === undefined) return next();
  authenticateCandidate(req, res, () => {
    req.url = `/sessions/${req.candidate.session_id}${suffix}`;
    next();
  });
});

const requireCandidateAccount = (req, res, next) => {
  if (req.candidate && req.candidate.session_id === req.params.id) return next();
  return res.status(404).json({ error: 'Not found' });
};

// Create a temporary candidate account and its test session (Admin only).
router.post('/sessions', authenticateToken, async (req, res) => {
  const { test_id } = req.body;
  const candidate_email = cleanString(req.body?.candidate_email, 254).toLowerCase();
  const candidate_password = typeof req.body?.candidate_password === 'string' ? req.body.candidate_password : '';
  if (!test_id || !isValidEmail(candidate_email) || !candidate_password) {
    return res.status(400).json({ error: 'Test, candidate email, and password are required' });
  }
  try {
    const test = await db.get('SELECT * FROM tests WHERE id = ?', [test_id]);
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    const staffConflict = await db.get(
      'SELECT id FROM users WHERE lower(username) = ? OR lower(email) = ?',
      [candidate_email, candidate_email]
    );
    if (staffConflict) {
      return res.status(409).json({ error: 'This email is already associated with an administrator account' });
    }

    const sessionId = generateToken();

    const existing = await db.get('SELECT id FROM candidate_accounts WHERE email = ?', [candidate_email]);
    if (existing) {
      return res.status(409).json({ error: 'An active candidate account already exists for this email' });
    }

    await db.run(
      `INSERT INTO test_sessions (id, test_id, candidate_email, status, expires_at)
       VALUES (?, ?, ?, 'pending', datetime('now', ?))`,
      [sessionId, test_id, candidate_email, `+${sessionLinkTtlHours} hours`]
    );
    try {
      await db.run(
        'INSERT INTO candidate_accounts (email, password_hash, password_encrypted, session_id) VALUES (?, ?, ?, ?)',
        [candidate_email, bcrypt.hashSync(candidate_password, 12), encrypt(candidate_password), sessionId]
      );
    } catch (accountError) {
      await db.run('DELETE FROM test_sessions WHERE id = ?', [sessionId]);
      throw accountError;
    }

    await audit(req, 'candidate.account_created', 'test_session', sessionId, { testId: test.id, candidateEmail: candidate_email });
    res.status(201).json({
      candidateEmail: candidate_email,
      emailSubject: 'E-Data Assessment Access Details',
      emailTemplate: buildCandidateEmailTemplate(test, candidate_email, candidate_password),
      sessionLinkPlaceholder: SESSION_LINK_PLACEHOLDER,
      message: `Temporary candidate account created for ${candidate_email}.`
    });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// Retrieve session info (Public access: needed by candidate BEFORE logging in)
router.get('/sessions/:id', requireCandidateAccount, async (req, res) => {
  try {
    const session = await db.get(`
      SELECT ts.*, t.title as test_title, t.num_questions, t.duration, t.require_seb
      FROM test_sessions ts
      JOIN tests t ON ts.test_id = t.id
      WHERE ts.id = ?
    `, [req.params.id]);

    if (!session) {
      return res.status(404).json({ error: 'Test session not found' });
    }
    if (session.status === 'pending' && session.expires_at && new Date(`${session.expires_at}Z`) <= new Date()) {
      return res.status(410).json({ error: 'This candidate account has expired' });
    }

    // Return limited parameters for security (Do not send answers yet!)
    res.json({
      id: session.id,
      test_title: session.test_title,
      num_questions: session.num_questions,
      candidate_email: session.candidate_email,
      candidate_name: session.candidate_name,
      status: session.status,
      started_at: session.started_at,
      ...(session.status === 'completed' ? {
        completed_at: session.completed_at,
        score: session.score,
        total_points: session.total_points
      } : {}),
      duration: session.duration || 20,
      require_seb: !!session.require_seb,
      focus_lost_count: session.focus_lost_count || 0
    });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// Start session - candidate registers name/profile details and locks target questions
router.post('/sessions/:id/start', requireCandidateAccount, async (req, res) => {
  const candidate_name = cleanString(req.body?.candidate_name, 100);
  if (!candidate_name) {
    return res.status(400).json({ error: 'Candidate name is required' });
  }

  try {
    const session = await db.get(`
      SELECT ts.*, t.require_seb FROM test_sessions ts
      JOIN tests t ON t.id = ts.test_id WHERE ts.id = ?
    `, [req.params.id]);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status !== 'pending') {
      return res.status(409).json({ error: 'Session is already started or completed' });
    }
    if (session.expires_at && new Date(`${session.expires_at}Z`) <= new Date()) {
      return res.status(410).json({ error: 'This candidate account has expired' });
    }
    if (!enforceSeb(req, res, session)) return;

    // Gather questions at this exact time, store snapshot
    const rawQuestions = await db.query(`
      SELECT q.id, q.domain, q.difficulty, q.points, q.question_text, q.options 
      FROM questions q
      JOIN test_selected_questions tsq ON q.id = tsq.question_id
      WHERE tsq.test_id = ?
    `, [session.test_id]);

    const questionsSnapshot = rawQuestions.map(q => ({
      id: q.id,
      domain: q.domain,
      difficulty: q.difficulty,
      points: q.points,
      question_text: q.question_text,
      options: JSON.parse(q.options)
    }));

    // Update session state
    const update = await db.run(
      `UPDATE test_sessions
       SET candidate_name = ?, candidate_info = ?, started_at = CURRENT_TIMESTAMP,
           status = 'active', questions_snapshot = ?
       WHERE id = ? AND status = 'pending'
         AND (expires_at IS NULL OR datetime(expires_at) > CURRENT_TIMESTAMP)`,
      [candidate_name, '{}', JSON.stringify(questionsSnapshot), req.params.id]
    );
    if (update.changes !== 1) {
      return res.status(409).json({ error: 'Session was already started or the candidate account expired' });
    }

    // Get test duration and SEB requirements
    const testObj = await db.get('SELECT duration, require_seb FROM tests WHERE id = ?', [session.test_id]);

    // Return questions snapshot to runner, STRIPPING correct answers for cheating protection
    const sanitizedQuestions = questionsSnapshot.map(q => ({
      id: q.id,
      domain: q.domain,
      difficulty: q.difficulty,
      points: q.points,
      question_text: q.question_text,
      options: q.options.map(opt => ({ id: opt.id, text: opt.text })) // Omit isCorrect flag!
    }));

    res.json({
      id: session.id,
      candidate_name,
      candidate_email: session.candidate_email,
      status: 'active',
      questions: sanitizedQuestions,
      duration: testObj?.duration || 20,
      deadline: new Date(Date.now() + (testObj?.duration || 20) * 60000).toISOString(),
      require_seb: !!testObj?.require_seb
    });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// Log candidate focus loss / tab switching violation
router.post('/sessions/:id/log-focus-lost', requireCandidateAccount, async (req, res) => {
  try {
    const session = await db.get(`SELECT ts.seb_config_key, t.require_seb FROM test_sessions ts JOIN tests t ON t.id = ts.test_id WHERE ts.id = ?`, [req.params.id]);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (!enforceSeb(req, res, session)) return;
    const result = await db.run(
      `UPDATE test_sessions SET focus_lost_count = focus_lost_count + 1
       WHERE id = ? AND status = 'active'`,
      [req.params.id]
    );
    if (!result.changes) return res.status(409).json({ error: 'Session is not active' });
    const updated = await db.get('SELECT focus_lost_count FROM test_sessions WHERE id = ?', [req.params.id]);
    res.json({ success: true, focus_lost_count: updated.focus_lost_count });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// Generate Safe Exam Browser configuration file (.seb)
router.get('/sessions/:id/seb-config', requireCandidateAccount, async (req, res) => {
  try {
    const session = await db.get(`
      SELECT ts.id, ts.status, ts.expires_at, t.require_seb
      FROM test_sessions ts JOIN tests t ON t.id = ts.test_id WHERE ts.id = ?
    `, [req.params.id]);
    if (!session) {
      return res.status(404).send('Session not found');
    }
    if (!session.require_seb) return res.status(400).send('Safe Exam Browser is not required for this session');
    if (session.status !== 'pending' || (session.expires_at && new Date(`${session.expires_at}Z`) <= new Date())) {
      return res.status(410).send('This Safe Exam Browser configuration is no longer available');
    }
    
    const startUrl = `${publicUrl}/`;
    const quitUrl = `${publicUrl}/`;
    const sebSettings = {
      allowPreferencesWindow: false,
      allowQuit: false,
      browserWindowAllowNewWindows: false,
      browserWindowAllowReload: false,
      browserWindowWebView: 2,
      enableAltEsc: false,
      enableAltF4: false,
      enableAltTab: false,
      enableCtrlEsc: false,
      enableEsc: false,
      enablePrintScreen: false,
      enableRightMouse: false,
      quitURL: quitUrl,
      sendBrowserExamKey: true,
      showTaskBar: false,
      startURL: startUrl
    };
    const sortedSettings = Object.fromEntries(Object.entries(sebSettings).sort(([a], [b]) => a.localeCompare(b)));
    const configKey = sha256(JSON.stringify(sortedSettings));
    await db.run('UPDATE test_sessions SET seb_config_key = ? WHERE id = ? AND status = ?', [configKey, session.id, 'pending']);

    const xmlEscape = value => String(value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    const sebSettingsXml = Object.entries(sebSettings).map(([key, value]) => {
      let serialized;
      if (typeof value === 'boolean') serialized = value ? '<true/>' : '<false/>';
      else if (Number.isInteger(value)) serialized = `<integer>${value}</integer>`;
      else serialized = `<string>${xmlEscape(value)}</string>`;
      return `    <key>${xmlEscape(key)}</key>\n    ${serialized}`;
    }).join('\n');

    const sebXml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
${sebSettingsXml}
  </dict>
</plist>`;

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename=aptora_exam_${session.id}.seb`);
    res.send(sebXml);
  } catch (err) {
    res.status(500).send(safeError(err));
  }
});

// Retrieve active session questions (for recovery/refresh)
router.get('/sessions/:id/take', requireCandidateAccount, async (req, res) => {
  try {
    const session = await db.get(`
      SELECT ts.*, t.duration, t.require_seb,
             datetime(ts.started_at, '+' || t.duration || ' minutes') AS deadline,
             CASE WHEN CURRENT_TIMESTAMP >= datetime(ts.started_at, '+' || t.duration || ' minutes') THEN 1 ELSE 0 END AS expired
      FROM test_sessions ts JOIN tests t ON t.id = ts.test_id WHERE ts.id = ?
    `, [req.params.id]);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status !== 'active') {
      return res.status(400).json({ error: 'Session is not active' });
    }
    if (session.expired) {
      return res.status(410).json({ error: 'The server-enforced test duration has elapsed' });
    }
    if (!enforceSeb(req, res, session)) return;

    const snapshot = JSON.parse(session.questions_snapshot);
    const sanitizedQuestions = snapshot.map(q => ({
      id: q.id,
      domain: q.domain,
      difficulty: q.difficulty,
      points: q.points,
      question_text: q.question_text,
      options: q.options.map(opt => ({ id: opt.id, text: opt.text })) // Omit isCorrect flag!
    }));

    res.json({
      id: session.id,
      candidate_name: session.candidate_name,
      candidate_email: session.candidate_email,
      status: 'active',
      questions: sanitizedQuestions,
      duration: session.duration,
      deadline: `${session.deadline.replace(' ', 'T')}Z`
    });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// Submit answers and grade the test
router.post('/sessions/:id/submit', requireCandidateAccount, async (req, res) => {
  const { responses } = req.body; // e.g. { "q1_id": "opt2_id", ... }
  if (!responses || typeof responses !== 'object' || Array.isArray(responses) || Object.keys(responses).length > 500) {
    return res.status(400).json({ error: 'Responses object is required' });
  }

  try {
    const session = await db.get(`
      SELECT ts.*, t.duration, t.require_seb,
             CASE WHEN CURRENT_TIMESTAMP > datetime(ts.started_at, '+' || t.duration || ' minutes', ?)
                  THEN 1 ELSE 0 END AS expired
      FROM test_sessions ts JOIN tests t ON t.id = ts.test_id WHERE ts.id = ?
    `, [`+${sessionSubmitGraceSeconds} seconds`, req.params.id]);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status !== 'active') {
      return res.status(409).json({ error: 'Session is not in active state' });
    }
    if (!enforceSeb(req, res, session)) return;

    const questions = JSON.parse(session.questions_snapshot);
    if (session.expired) {
      const total = questions.reduce((sum, question) => sum + Number(question.points || 0), 0);
      await db.run(
        `UPDATE test_sessions SET completed_at = CURRENT_TIMESTAMP, score = 0, total_points = ?,
         status = 'completed', responses = '{}', result_expires_at = datetime('now', ?)
         WHERE id = ? AND status = 'active'`,
        [total, `+${resultLinkTtlHours} hours`, req.params.id]
      );
      await db.run('DELETE FROM candidate_accounts WHERE session_id = ?', [req.params.id]);
      clearCandidateSessionCookie(res);
      return res.status(410).json({ error: 'The server-enforced submission deadline has elapsed' });
    }
    let scoredPoints = 0;
    let totalPointsPossible = 0;

    // Tracks success breakdown per domain
    // Schema: { [domain]: { possible: X, scored: Y } }
    const domainBreakdown = {};

    questions.forEach(q => {
      totalPointsPossible += q.points;

      if (!domainBreakdown[q.domain]) {
        domainBreakdown[q.domain] = { possible: 0, scored: 0 };
      }
      domainBreakdown[q.domain].possible += q.points;

      const selectedOptId = responses[q.id];
      const correctOption = q.options.find(opt => opt.isCorrect);
      const isCorrect = correctOption && String(selectedOptId) === String(correctOption.id);

      let awardedPoints = 0;
      if (isCorrect) {
        awardedPoints = q.points;
        scoredPoints += q.points;
        domainBreakdown[q.domain].scored += q.points;
      }

    });

    // Save submission records
    const update = await db.run(
      `UPDATE test_sessions
       SET completed_at = CURRENT_TIMESTAMP, score = ?, total_points = ?, status = 'completed',
           responses = ?, result_expires_at = datetime('now', ?)
       WHERE id = ? AND status = 'active'
         AND CURRENT_TIMESTAMP <= datetime(started_at, '+' || ? || ' minutes', ?)`,
      [scoredPoints, totalPointsPossible, JSON.stringify(responses), `+${resultLinkTtlHours} hours`,
        req.params.id, session.duration, `+${sessionSubmitGraceSeconds} seconds`]
    );
    if (update.changes !== 1) return res.status(409).json({ error: 'Session was already submitted or expired' });
    const result = await loadSessionResult(req.params.id, true);
    await db.run('DELETE FROM candidate_accounts WHERE session_id = ?', [req.params.id]);
    clearCandidateSessionCookie(res);
    delete result.result_expires_at;
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

async function loadSessionResult(sessionId, includeFeedback) {
  const session = await db.get(`
    SELECT ts.*, t.require_seb, t.title AS test_title
    FROM test_sessions ts JOIN tests t ON ts.test_id = t.id WHERE ts.id = ?
  `, [sessionId]);
  if (!session) return { errorStatus: 404, error: 'Test session not found' };
  if (session.status !== 'completed') return { errorStatus: 400, error: 'Test session results are not available' };

  const questions = JSON.parse(session.questions_snapshot || '[]');
  const responses = JSON.parse(session.responses || '{}');
  const feedback = [];
  const domainBreakdown = {};
  for (const question of questions) {
    if (!domainBreakdown[question.domain]) domainBreakdown[question.domain] = { possible: 0, scored: 0 };
    domainBreakdown[question.domain].possible += question.points;
    const selectedOptionId = responses[question.id];
    const correctOption = question.options.find(option => option.isCorrect);
    const isCorrect = !!correctOption && String(selectedOptionId) === String(correctOption.id);
    if (isCorrect) domainBreakdown[question.domain].scored += question.points;
    if (includeFeedback) {
      feedback.push({
        id: question.id, question_text: question.question_text, domain: question.domain,
        difficulty: question.difficulty, points: question.points, options: question.options,
        selectedOptionId, correctOptionId: correctOption?.id || null, isCorrect
      });
    }
  }
  const domainSuccessRates = Object.fromEntries(Object.entries(domainBreakdown).map(([domain, stats]) => [domain, {
    ...stats,
    successRate: stats.possible > 0 ? Number(((stats.scored / stats.possible) * 100).toFixed(1)) : 0
  }]));
  return {
    id: session.id,
    candidate_name: session.candidate_name,
    candidate_email: session.candidate_email,
    started_at: session.started_at,
    completed_at: session.completed_at,
    score: session.score,
    total_points: session.total_points,
    percentage: session.total_points > 0 ? Number(((session.score / session.total_points) * 100).toFixed(1)) : 0,
    domainSuccessRates,
    ...(includeFeedback ? { feedback, test_title: session.test_title } : {}),
    require_seb: !!session.require_seb,
    focus_lost_count: session.focus_lost_count || 0,
    result_expires_at: session.result_expires_at
  };
}

// Detailed question-level report is available only to authenticated administrators.
router.get('/admin/session-results', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const sessionId = String(req.get('x-aptora-session-token') || '').toLowerCase();
    if (!/^[a-f0-9]{32}$/.test(sessionId)) return res.status(400).json({ error: 'A valid session token is required' });
    const result = await loadSessionResult(sessionId, true);
    if (result.errorStatus) return res.status(result.errorStatus).json({ error: result.error });
    delete result.result_expires_at;
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// List all test sessions (Admin only)
router.get('/sessions', authenticateToken, async (req, res) => {
  try {
    const sessions = await db.query(`
      SELECT ts.id, ts.candidate_email, ts.candidate_name, ts.started_at, ts.completed_at,
             ts.score, ts.total_points, ts.status, ts.focus_lost_count,
             t.title as test_title, t.require_seb, u.username as creator_name,
             ca.id AS candidate_account_id
      FROM test_sessions ts
      JOIN tests t ON ts.test_id = t.id
      JOIN users u ON t.created_by = u.id
      LEFT JOIN candidate_accounts ca ON ca.session_id = ts.id
      ORDER BY ts.completed_at DESC, ts.started_at DESC
    `);
    res.json(sessions.map(session => {
      const { candidate_account_id, ...publicSession } = session;
      return {
        ...publicSession,
        candidate_account_active: !!candidate_account_id
      };
    }));
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.get('/admin/candidate-credentials', authenticateToken, requireRole(['admin']), async (req, res) => {
  const sessionId = String(req.get('x-aptora-session-token') || '').toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(sessionId)) {
    return res.status(400).json({ error: 'A valid session is required' });
  }
  try {
    const account = await db.get(
      `SELECT ca.email, ca.password_encrypted
       FROM candidate_accounts ca
       JOIN test_sessions ts ON ts.id = ca.session_id
       WHERE ca.session_id = ? AND ts.status IN ('pending', 'active')`,
      [sessionId]
    );
    if (!account) return res.status(404).json({ error: 'The temporary candidate account is no longer active' });
    res.json({
      candidate_email: account.email,
      candidate_password: account.password_encrypted ? decrypt(account.password_encrypted) : ''
    });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.put('/admin/candidate-credentials', authenticateToken, requireRole(['admin']), async (req, res) => {
  const sessionId = String(req.get('x-aptora-session-token') || '').toLowerCase();
  const candidateEmail = cleanString(req.body?.candidate_email, 254).toLowerCase();
  const candidatePassword = typeof req.body?.candidate_password === 'string' ? req.body.candidate_password : '';
  if (!/^[a-f0-9]{32}$/.test(sessionId) || !isValidEmail(candidateEmail) || !candidatePassword) {
    return res.status(400).json({ error: 'A valid session, candidate email, and non-empty password are required' });
  }
  try {
    const account = await db.get(
      `SELECT ca.id, ca.email FROM candidate_accounts ca
       JOIN test_sessions ts ON ts.id = ca.session_id
       WHERE ca.session_id = ? AND ts.status IN ('pending', 'active')`,
      [sessionId]
    );
    if (!account) return res.status(404).json({ error: 'The temporary candidate account is no longer active' });

    const staffConflict = await db.get(
      'SELECT id FROM users WHERE lower(username) = ? OR lower(email) = ?',
      [candidateEmail, candidateEmail]
    );
    if (staffConflict) {
      return res.status(409).json({ error: 'This email is already associated with an administrator account' });
    }
    const candidateConflict = await db.get(
      'SELECT id FROM candidate_accounts WHERE email = ? AND id <> ?',
      [candidateEmail, account.id]
    );
    if (candidateConflict) {
      return res.status(409).json({ error: 'An active candidate account already exists for this email' });
    }

    await db.run(
      `UPDATE candidate_accounts
       SET email = ?, password_hash = ?, password_encrypted = ?
       WHERE id = ?`,
      [candidateEmail, bcrypt.hashSync(candidatePassword, 12), encrypt(candidatePassword), account.id]
    );
    await db.run('UPDATE test_sessions SET candidate_email = ? WHERE id = ?', [candidateEmail, sessionId]);
    await audit(req, 'candidate.credentials_updated', 'test_session', sessionId, {
      previousEmail: account.email,
      candidateEmail
    });
    res.json({ candidate_email: candidateEmail, candidate_password: candidatePassword });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.post('/admin/candidate-email', authenticateToken, requireRole(['admin']), async (req, res) => {
  const candidateEmail = cleanString(req.body?.candidate_email, 254).toLowerCase();
  const subject = cleanString(req.body?.subject, 200);
  const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 20000) : '';
  if (!isValidEmail(candidateEmail) || !subject || !text) {
    return res.status(400).json({ error: 'Candidate email, subject, and email text are required' });
  }
  if (text.includes(SESSION_LINK_PLACEHOLDER)) {
    return res.status(400).json({ error: 'Replace the session-link placeholder before sending the email' });
  }

  try {
    const account = await db.get(
      `SELECT ca.email, ca.session_id
       FROM candidate_accounts ca
       JOIN test_sessions ts ON ts.id = ca.session_id
       WHERE ca.email = ? AND ts.status IN ('pending', 'active')`,
      [candidateEmail]
    );
    if (!account) {
      return res.status(404).json({ error: 'The temporary candidate account is no longer active' });
    }

    const delivery = await sendRealEmail(
      req.user.id,
      account.email,
      subject,
      text,
      buildCandidateEmailHtml(text)
    );
    const sessionLinkMatch = text.match(/^Session link:\s*(\S+)/im);
    await db.run(
      `INSERT INTO simulated_emails
       (to_email, subject, link, body_text, sender_user_id, delivery_status, message_id)
       VALUES (?, ?, ?, ?, ?, 'sent', ?)`,
      [
        account.email,
        subject,
        sessionLinkMatch?.[1] || '',
        text,
        req.user.id,
        delivery.messageId || null
      ]
    );
    await audit(req, 'candidate.email_sent', 'test_session', account.session_id, {
      candidateEmail: account.email,
      messageId: delivery.messageId
    });
    res.json({ message: `Candidate email sent successfully to ${account.email}.` });
  } catch (err) {
    res.status(502).json({
      error: isProduction ? 'Email delivery failed. Check your SMTP settings.' : err.message
    });
  }
});

router.get('/admin/candidate-email-template', authenticateToken, requireRole(['admin']), async (req, res) => {
  const sessionId = String(req.get('x-aptora-session-token') || '').toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(sessionId)) {
    return res.status(400).json({ error: 'A valid session is required' });
  }
  try {
    const session = await db.get(
      `SELECT ca.email, ca.password_encrypted, ts.status,
              t.title, t.num_questions, t.duration, t.require_seb
       FROM candidate_accounts ca
       JOIN test_sessions ts ON ts.id = ca.session_id
       JOIN tests t ON t.id = ts.test_id
       WHERE ca.session_id = ? AND ts.status = 'pending'`,
      [sessionId]
    );
    if (!session) {
      return res.status(404).json({ error: 'Email access is available only for pending candidate accounts' });
    }
    const candidatePassword = session.password_encrypted ? decrypt(session.password_encrypted) : '';
    res.json({
      candidateEmail: session.email,
      emailSubject: 'E-Data Assessment Access Details',
      emailTemplate: buildCandidateEmailTemplate(session, session.email, candidatePassword),
      sessionLinkPlaceholder: SESSION_LINK_PLACEHOLDER
    });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});


// ==========================================
// 6. VIRTUAL OUTBOX / LOGS ENDPOINTS
// ==========================================
router.get('/emails', authenticateToken, async (req, res) => {
  try {
    const emails = await db.query(
      `SELECT * FROM simulated_emails
       WHERE sender_user_id = ? OR sender_user_id IS NULL
       ORDER BY sent_at DESC`,
      [req.user.id]
    );
    res.json(emails);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// Delete simulated email (Admin only)
router.delete('/emails/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    await db.run(
      'DELETE FROM simulated_emails WHERE id = ? AND (sender_user_id = ? OR sender_user_id IS NULL)',
      [req.params.id, req.user.id]
    );
    res.json({ message: 'Simulated email deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// Delete test session (Admin only)
router.delete('/admin/session', authenticateToken, async (req, res) => {
  try {
    const sessionId = String(req.get('x-aptora-session-token') || '').toLowerCase();
    if (!/^[a-f0-9]{32}$/.test(sessionId)) return res.status(400).json({ error: 'A valid session token is required' });
    const session = await db.get(`
      SELECT ts.id, t.created_by 
      FROM test_sessions ts 
      JOIN tests t ON ts.test_id = t.id 
      WHERE ts.id = ?
    `, [sessionId]);

    if (!session) {
      return res.status(404).json({ error: 'Test session not found' });
    }

    await db.run('DELETE FROM test_sessions WHERE id = ?', [sessionId]);
    res.json({ message: 'Test session deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// Bulk delete questions (Admin only)
router.post('/questions/bulk-delete', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'Invalid payload: ids array is required' });
  if (ids.length === 0) return res.status(400).json({ error: 'Ids array is empty' });
  if (ids.length > 500 || ids.some(id => !Number.isInteger(Number(id)))) return res.status(400).json({ error: 'A maximum of 500 numeric ids is allowed' });
  try {
    const placeholders = ids.map(() => '?').join(',');
    await db.run(`DELETE FROM questions WHERE id IN (${placeholders})`, ids);
    res.json({ message: 'Questions deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// Bulk delete users (Admin only)
router.post('/users/bulk-delete', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'Invalid payload: ids array is required' });
  if (ids.length === 0) return res.status(400).json({ error: 'Ids array is empty' });
  if (ids.length > 500 || ids.some(id => !Number.isInteger(Number(id)))) {
    return res.status(400).json({ error: 'A maximum of 500 numeric ids is allowed' });
  }
  if (ids.some(id => Number(id) === Number(req.user.id))) {
    return res.status(400).json({ error: 'You cannot delete your own admin account' });
  }
  try {
    const placeholders = ids.map(() => '?').join(',');
    const result = await db.run(`DELETE FROM users WHERE id IN (${placeholders})`, ids);
    await audit(req, 'admin.bulk_deleted', 'user', null, { count: result.changes });
    res.json({ message: 'Users deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// Bulk delete tests (Admin only)
router.post('/tests/bulk-delete', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'Invalid payload: ids array is required' });
  if (ids.length === 0) return res.status(400).json({ error: 'Ids array is empty' });
  if (ids.length > 500 || ids.some(id => !Number.isInteger(Number(id)))) return res.status(400).json({ error: 'A maximum of 500 numeric ids is allowed' });
  try {
    const placeholders = ids.map(() => '?').join(',');
    await db.run(`DELETE FROM tests WHERE id IN (${placeholders})`, ids);
    res.json({ message: 'Tests deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// Bulk delete sessions (Admin only)
router.post('/sessions/bulk-delete', authenticateToken, async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'Invalid payload: ids array is required' });
  if (ids.length === 0) return res.status(400).json({ error: 'Ids array is empty' });
  if (ids.length > 500 || ids.some(id => typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id))) return res.status(400).json({ error: 'A maximum of 500 valid session ids is allowed' });
  try {
    const placeholders = ids.map(() => '?').join(',');
    await db.run(`DELETE FROM test_sessions WHERE id IN (${placeholders})`, ids);
    res.json({ message: 'Test sessions deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// Bulk delete simulated emails (Admin only)
router.post('/emails/bulk-delete', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'Invalid payload: ids array is required' });
  if (ids.length === 0) return res.status(400).json({ error: 'Ids array is empty' });
  if (ids.length > 500 || ids.some(id => !Number.isInteger(Number(id)))) return res.status(400).json({ error: 'A maximum of 500 numeric ids is allowed' });
  try {
    const placeholders = ids.map(() => '?').join(',');
    await db.run(
      `DELETE FROM simulated_emails
       WHERE id IN (${placeholders}) AND (sender_user_id = ? OR sender_user_id IS NULL)`,
      [...ids, req.user.id]
    );
    res.json({ message: 'Simulated emails deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

module.exports = router;
