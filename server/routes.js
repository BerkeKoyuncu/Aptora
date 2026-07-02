const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { JWT_SECRET, authenticateToken, requireRole, generate2FASecret, verify2FACode, encrypt, decrypt } = require('./auth');

const router = express.Router();
const nodemailer = require('nodemailer');
const ExcelJS = require('exceljs');

// Helper to generate a 32-char hex session token
const generateToken = () => crypto.randomBytes(16).toString('hex');

// Helper to send real emails via SMTP
async function sendRealEmail(to, subject, text, html) {
  try {
    const config = await db.get('SELECT * FROM email_settings LIMIT 1');
    if (!config || config.is_enabled !== 1) {
      console.log('SMTP email sending is disabled. Skipping real mail.');
      return { success: true, simulated: true };
    }

    if (!config.smtp_host || !config.smtp_user || !config.smtp_pass) {
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
        rejectUnauthorized: false
      }
    });

    const info = await transporter.sendMail({
      from: `"${config.from_email.split('@')[0].toUpperCase()}" <${config.from_email}>`,
      to,
      subject,
      text,
      html
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

// Register standard user
router.post('/auth/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required' });
  }

  try {
    const existing = await db.get('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (existing) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const result = await db.run(
      'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [username, email, hash, 'standard']
    );

    res.status(201).json({ message: 'User registered successfully', userId: result.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
router.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Check if 2FA is enabled
    if (user.twofa_enabled) {
      // Return a temporary token that only authorizes 2FA verification
      const tempToken = jwt.sign({ id: user.id, username: user.username, email: user.email, role: user.role, temp: true }, JWT_SECRET, { expiresIn: '5m' });
      return res.json({ twofa_required: true, tempToken });
    }

    // Direct Login
    const token = jwt.sign({ id: user.id, username: user.username, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        twofa_enabled: !!user.twofa_enabled
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Verify 2FA code during login
router.post('/auth/verify-2fa', async (req, res) => {
  const { code, tempToken } = req.body;
  if (!code || !tempToken) {
    return res.status(400).json({ error: '2FA code and temporary token are required' });
  }

  try {
    const decoded = jwt.verify(tempToken, JWT_SECRET);
    if (!decoded.temp) {
      return res.status(400).json({ error: 'Invalid temporary token' });
    }

    const user = await db.get('SELECT * FROM users WHERE id = ?', [decoded.id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isValid = verify2FACode(code, decrypt(user.twofa_secret));
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid 2FA verification code' });
    }

    // 2FA Succeeded - issue full token
    const token = jwt.sign({ id: user.id, username: user.username, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        twofa_enabled: !!user.twofa_enabled
      }
    });
  } catch (err) {
    res.status(401).json({ error: 'Temporary login token expired or invalid' });
  }
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
    res.status(500).json({ error: err.message });
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

    await db.run('UPDATE users SET twofa_enabled = 1 WHERE id = ?', [req.user.id]);
    res.json({ success: true, message: '2FA enabled successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Disable 2FA (Requires Auth)
router.post('/auth/disable-2fa', authenticateToken, async (req, res) => {
  const { code } = req.body;
  // If user has 2FA enabled, they should verify with code to disable it
  try {
    const user = await db.get('SELECT twofa_secret, twofa_enabled FROM users WHERE id = ?', [req.user.id]);
    if (!user.twofa_enabled) {
      return res.status(400).json({ error: '2FA is not enabled' });
    }

    if (code) {
      const isValid = verify2FACode(code, decrypt(user.twofa_secret));
      if (!isValid) {
        return res.status(400).json({ error: 'Invalid 2FA code' });
      }
    }

    await db.run('UPDATE users SET twofa_enabled = 0, twofa_secret = NULL WHERE id = ?', [req.user.id]);
    res.json({ success: true, message: '2FA disabled successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check current user state
router.get('/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await db.get('SELECT id, username, email, role, twofa_enabled FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      twofa_enabled: !!user.twofa_enabled
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update user profile (username, email, optional password)
router.put('/auth/profile', authenticateToken, async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email) {
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
      const hash = bcrypt.hashSync(password, 10);
      await db.run(
        'UPDATE users SET username = ?, email = ?, password_hash = ? WHERE id = ?',
        [username, email, hash, req.user.id]
      );
    } else {
      await db.run(
        'UPDATE users SET username = ?, email = ? WHERE id = ?',
        [username, email, req.user.id]
      );
    }

    res.json({ message: 'Profile updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

router.post('/users', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { username, email, password, role } = req.body;
  if (!username || !email || !password || !role) {
    return res.status(400).json({ error: 'Username, email, password, and role are required' });
  }

  try {
    const existing = await db.get('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (existing) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const result = await db.run(
      'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [username, email, hash, role]
    );

    res.status(201).json({ id: result.id, username, email, role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/users/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { username, email, password, role } = req.body;
  const userId = req.params.id;

  try {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let queryStr = 'UPDATE users SET username = ?, email = ?, role = ?';
    let params = [username || user.username, email || user.email, role || user.role];

    if (password) {
      queryStr += ', password_hash = ?';
      params.push(bcrypt.hashSync(password, 10));
    }

    queryStr += ' WHERE id = ?';
    params.push(userId);

    await db.run(queryStr, params);
    res.json({ message: 'User updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/users/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    // Prevent self-deletion
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own admin account.' });
    }
    await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

// Delete active question (Admin only)
router.delete('/questions/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    await db.run('DELETE FROM questions WHERE id = ?', [req.params.id]);
    res.json({ message: 'Question deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get advices (Admin sees all, standard sees their own)
router.get('/questions/advices', authenticateToken, async (req, res) => {
  try {
    let advices;
    if (req.user.role === 'admin') {
      advices = await db.query(`
        SELECT qa.*, u.username as advisor_name 
        FROM question_advices qa
        JOIN users u ON qa.advised_by = u.id
        ORDER BY qa.created_at DESC
      `);
    } else {
      advices = await db.query(
        'SELECT * FROM question_advices WHERE advised_by = ? ORDER BY created_at DESC',
        [req.user.id]
      );
    }
    res.json(advices.map(a => ({ ...a, options: JSON.parse(a.options) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Post advice question (Standard user or Admin)
router.post('/questions/advices', authenticateToken, async (req, res) => {
  const { domain, difficulty, points, question_text, options } = req.body;
  if (!domain || !difficulty || !points || !question_text || !options) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    const result = await db.run(
      'INSERT INTO question_advices (advised_by, domain, difficulty, points, question_text, options) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, domain, difficulty, points, question_text, JSON.stringify(options)]
    );
    res.status(201).json({ id: result.id, message: 'Question advice sent successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve advice question (Admin only)
router.post('/questions/advices/:id/approve', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const advice = await db.get('SELECT * FROM question_advices WHERE id = ?', [req.params.id]);
    if (!advice) {
      return res.status(404).json({ error: 'Advice not found' });
    }

    // Check if duplicate question text already exists in active questions table
    const existing = await db.get('SELECT id FROM questions WHERE TRIM(question_text) = ?', [advice.question_text.trim()]);
    if (existing) {
      return res.status(400).json({ error: 'This question text already exists in the live database. Cannot approve.' });
    }

    // Insert into active questions database
    const qResult = await db.run(
      'INSERT INTO questions (domain, difficulty, points, question_text, options, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [advice.domain, advice.difficulty, advice.points, advice.question_text, advice.options, req.user.id]
    );

    // Update advice status
    await db.run("UPDATE question_advices SET status = 'approved' WHERE id = ?", [req.params.id]);

    res.json({ message: 'Advice question approved and added to database', questionId: qResult.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reject advice question (Admin only)
router.post('/questions/advices/:id/reject', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    await db.run("UPDATE question_advices SET status = 'rejected' WHERE id = ?", [req.params.id]);
    res.json({ message: 'Advice question rejected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ==========================================
// 4. TEST GENERATION ENDPOINTS
// ==========================================

// Get list of tests (Admins see all, standard users see their own created tests)
router.get('/tests', authenticateToken, async (req, res) => {
  try {
    let tests;
    if (req.user.role === 'admin') {
      tests = await db.query(`
        SELECT t.*, u.username as creator_name 
        FROM tests t
        JOIN users u ON t.created_by = u.id
        ORDER BY t.created_at DESC
      `);
    } else {
      tests = await db.query(
        'SELECT t.*, u.username as creator_name FROM tests t JOIN users u ON t.created_by = u.id WHERE t.created_by = ? ORDER BY t.created_at DESC',
        [req.user.id]
      );
    }
    res.json(tests.map(t => ({
      ...t,
      domains: JSON.parse(t.domains),
      difficulty_distribution: JSON.parse(t.difficulty_distribution),
      is_random: !!t.is_random
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create Test (randomized or direct selection)
router.post('/tests', authenticateToken, async (req, res) => {
  const { title, num_questions = 10, difficulty_distribution, domains, is_random = true, selected_questions = [] } = req.body;

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
    // 1. Insert test meta
    const result = await db.run(
      'INSERT INTO tests (title, created_by, num_questions, difficulty_distribution, domains, is_random) VALUES (?, ?, ?, ?, ?, ?)',
      [title, req.user.id, num_questions, JSON.stringify(targetDist), JSON.stringify(targetDomains), is_random ? 1 : 0]
    );
    const testId = result.id;

    let finalQuestionIds = [];

    // 2. Select questions
    if (is_random) {
      // Randomized question selector based on domain & difficulty distribution
      const chosenQuestionsMap = new Map();

      // Step A: Calculate how many questions we need per difficulty level
      let allocatedCount = 0;
      const diffTargets = {};
      const diffKeys = ["1", "2", "3", "4", "5"];

      diffKeys.forEach((key) => {
        const pct = targetDist[key] !== undefined ? targetDist[key] : 0;
        const targetForLevel = Math.round(num_questions * (pct / 100));
        diffTargets[key] = targetForLevel;
        allocatedCount += targetForLevel;
      });

      // Adjust rounding discrepancies
      let difference = num_questions - allocatedCount;
      if (difference !== 0) {
        // Adjust Level 3 (the median)
        diffTargets["3"] += difference;
        if (diffTargets["3"] < 0) diffTargets["3"] = 0;
      }

      // Step B: Fetch random questions for each difficulty level
      for (const diff of diffKeys) {
        const countNeeded = diffTargets[diff];
        if (countNeeded <= 0) continue;

        // Domain binding placeholder query
        const placeholders = targetDomains.map(() => '?').join(',');
        const queryStr = `
          SELECT id FROM questions 
          WHERE difficulty = ? AND domain IN (${placeholders}) 
          ORDER BY RANDOM() LIMIT ?
        `;

        const params = [parseInt(diff), ...targetDomains, countNeeded];
        const selected = await db.query(queryStr, params);

        selected.forEach(q => chosenQuestionsMap.set(q.id, true));

        // If not enough questions in this difficulty level, track deficiency
        if (selected.length < countNeeded) {
          console.warn(`Insufficient questions for difficulty ${diff}. Needed: ${countNeeded}, Found: ${selected.length}`);
        }
      }

      // Step C: Fallback. If total selected is less than num_questions, backfill with ANY matching questions in the domains
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    let config = await db.get('SELECT * FROM email_settings LIMIT 1');
    if (!config) {
      // Create default if missing
      await db.run('INSERT INTO email_settings (smtp_host, smtp_port, smtp_user, smtp_pass, from_email, smtp_secure, is_enabled) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['smtp.gmail.com', 587, '', '', 'noreply@aptora.com', 0, 0]);
      config = await db.get('SELECT * FROM email_settings LIMIT 1');
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
    res.status(500).json({ error: err.message });
  }
});

// Update SMTP email configuration settings
router.post('/admin/email-settings', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator access required.' });
  }

  const { smtp_host, smtp_port, smtp_user, smtp_pass, from_email, smtp_secure, is_enabled } = req.body;

  try {
    const existing = await db.get('SELECT * FROM email_settings LIMIT 1');
    
    let passwordToSave = smtp_pass;
    if (smtp_pass === '••••••••') {
      passwordToSave = existing ? existing.smtp_pass : '';
    } else if (smtp_pass) {
      passwordToSave = encrypt(smtp_pass);
    }

    const host = smtp_host || 'smtp.gmail.com';
    const port = parseInt(smtp_port) || 587;
    const user = smtp_user || '';
    const from = from_email || 'noreply@aptora.com';
    const secure = smtp_secure ? 1 : 0;
    const enabled = is_enabled ? 1 : 0;

    if (existing) {
      await db.run(
        'UPDATE email_settings SET smtp_host = ?, smtp_port = ?, smtp_user = ?, smtp_pass = ?, from_email = ?, smtp_secure = ?, is_enabled = ? WHERE id = ?',
        [host, port, user, passwordToSave, from, secure, enabled, existing.id]
      );
    } else {
      await db.run(
        'INSERT INTO email_settings (smtp_host, smtp_port, smtp_user, smtp_pass, from_email, smtp_secure, is_enabled) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [host, port, user, passwordToSave, from, secure, enabled]
      );
    }

    res.json({ message: 'SMTP configurations updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    const config = await db.get('SELECT * FROM email_settings LIMIT 1');
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
        rejectUnauthorized: false
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
    res.status(500).json({ error: `SMTP validation failed: ${err.message}` });
  }
});


// ==========================================
// 5. TEST RUNNER & SESSIONS
// ==========================================

// Create a candidate session link (Admin or Standard User)
router.post('/sessions/create-link', authenticateToken, async (req, res) => {
  const { test_id, candidate_email } = req.body;
  if (!test_id || !candidate_email) {
    return res.status(400).json({ error: 'test_id and candidate_email are required' });
  }

  try {
    const test = await db.get('SELECT * FROM tests WHERE id = ?', [test_id]);
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    const sessionId = generateToken();

    // Create session (pending state)
    await db.run(
      'INSERT INTO test_sessions (id, test_id, candidate_email, status) VALUES (?, ?, ?, ?)',
      [sessionId, test_id, candidate_email, 'pending']
    );

    // Formulate local test URL
    // e.g. using the host header of requesting user or fallback
    const host = req.headers.host || 'localhost:5173';
    const protocol = req.headers.referer ? req.headers.referer.split(':')[0] : 'http';
    const testLink = `${protocol}://${host}/#/session/${sessionId}`; // SPA hash routing friendly

    // Log simulated email
    await db.run(
      'INSERT INTO simulated_emails (to_email, subject, link) VALUES (?, ?, ?)',
      [candidate_email, `Aptora: Your Cybersecurity Test Link`, testLink]
    );

    let mailSent = false;
    let smtpError = null;
    try {
      const emailSubject = `Aptora: Your Cybersecurity Test Link`;
      const emailText = `Hello,\n\nYou have been invited to take the cybersecurity competency assessment "${test.title}".\n\nAccess Link: ${testLink}\n\nGood luck!`;
      const emailHtml = `
        <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; border: 1px solid #becdd6; border-radius: 8px;">
          <h2 style="color: #114B4E; margin-bottom: 1.5rem;">Aptora Competency Assessment Portal</h2>
          <p>Hello,</p>
          <p>You have been invited to take the cybersecurity competency evaluation: <strong>${test.title}</strong>.</p>
          <p>Please click the button below to initiate your exam session. You will have a 20-minute timer once the exam starts.</p>
          <div style="margin: 25px 0;">
            <a href="${testLink}" style="background-color: #114B4E; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Start Assessment</a>
          </div>
          <p style="font-size: 0.9rem; color: #666;">If the button does not work, copy and paste this link in your browser:</p>
          <p style="background: #f3f5f9; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 0.85rem; word-break: break-all; border: 1px solid #becdd6;">${testLink}</p>
          <br/>
          <hr style="border: none; border-top: 1px solid #becdd6;"/>
          <p style="font-size: 0.75rem; color: #738d91; margin-top: 1rem;">This is an automated system notification from the Aptora Security Environment. Please do not reply directly to this mail.</p>
        </div>
      `;
      const mailRes = await sendRealEmail(candidate_email, emailSubject, emailText, emailHtml);
      if (mailRes && !mailRes.simulated) {
        mailSent = true;
      }
    } catch (mailErr) {
      console.error('SMTP Delivery error:', mailErr);
      smtpError = mailErr.message;
    }

    res.status(201).json({
      sessionId,
      testLink,
      mailSent,
      smtpError,
      message: smtpError 
        ? `Invitation generated, but SMTP delivery failed: ${smtpError}. Link is logged in Virtual Mailbox.`
        : (mailSent ? `Invitation generated and sent to ${candidate_email}.` : `Invitation generated successfully. Link logged in Virtual Mailbox.`)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Retrieve session info (Public access: needed by candidate BEFORE logging in)
router.get('/sessions/:id', async (req, res) => {
  try {
    const session = await db.get(`
      SELECT ts.*, t.title as test_title, t.num_questions
      FROM test_sessions ts
      JOIN tests t ON ts.test_id = t.id
      WHERE ts.id = ?
    `, [req.params.id]);

    if (!session) {
      return res.status(404).json({ error: 'Test session not found' });
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
      completed_at: session.completed_at,
      score: session.score,
      total_points: session.total_points
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start session - candidate registers name/profile details and locks target questions
router.post('/sessions/:id/start', async (req, res) => {
  const { candidate_name, candidate_info } = req.body;
  if (!candidate_name) {
    return res.status(400).json({ error: 'Candidate name is required' });
  }

  try {
    const session = await db.get('SELECT * FROM test_sessions WHERE id = ?', [req.params.id]);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status !== 'pending') {
      return res.status(400).json({ error: 'Session is already started or completed' });
    }

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
    await db.run(
      'UPDATE test_sessions SET candidate_name = ?, candidate_info = ?, started_at = CURRENT_TIMESTAMP, status = "active", questions_snapshot = ? WHERE id = ?',
      [candidate_name, JSON.stringify(candidate_info || {}), JSON.stringify(questionsSnapshot), req.params.id]
    );

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
      questions: sanitizedQuestions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Retrieve active session questions (for recovery/refresh)
router.get('/sessions/:id/take', async (req, res) => {
  try {
    const session = await db.get('SELECT * FROM test_sessions WHERE id = ?', [req.params.id]);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status !== 'active') {
      return res.status(400).json({ error: 'Session is not active' });
    }

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
      questions: sanitizedQuestions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Submit answers and grade the test
router.post('/sessions/:id/submit', async (req, res) => {
  const { responses } = req.body; // e.g. { "q1_id": "opt2_id", ... }
  if (!responses) {
    return res.status(400).json({ error: 'Responses object is required' });
  }

  try {
    const session = await db.get('SELECT * FROM test_sessions WHERE id = ?', [req.params.id]);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status !== 'active') {
      return res.status(400).json({ error: 'Session is not in active state' });
    }

    const questions = JSON.parse(session.questions_snapshot);
    let scoredPoints = 0;
    let totalPointsPossible = 0;

    // Structure for grading details
    const questionFeedback = [];

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
      const isCorrect = correctOption && selectedOptId === correctOption.id;

      let awardedPoints = 0;
      if (isCorrect) {
        awardedPoints = q.points;
        scoredPoints += q.points;
        domainBreakdown[q.domain].scored += q.points;
      }

      questionFeedback.push({
        id: q.id,
        question_text: q.question_text,
        domain: q.domain,
        difficulty: q.difficulty,
        points: q.points,
        options: q.options, // Contains correct answer key for feedback reporting
        selectedOptionId: selectedOptId,
        correctOptionId: correctOption ? correctOption.id : null,
        isCorrect
      });
    });

    // Compute domain success rates
    const domainSuccessMap = {};
    Object.keys(domainBreakdown).forEach(domain => {
      const stats = domainBreakdown[domain];
      domainSuccessMap[domain] = {
        possible: stats.possible,
        scored: stats.scored,
        successRate: stats.possible > 0 ? parseFloat(((stats.scored / stats.possible) * 100).toFixed(1)) : 0
      };
    });

    // Save submission records
    await db.run(
      'UPDATE test_sessions SET completed_at = CURRENT_TIMESTAMP, score = ?, total_points = ?, status = "completed", responses = ? WHERE id = ?',
      [scoredPoints, totalPointsPossible, JSON.stringify(responses), req.params.id]
    );

    res.json({
      id: session.id,
      candidate_name: session.candidate_name,
      score: scoredPoints,
      total_points: totalPointsPossible,
      percentage: totalPointsPossible > 0 ? parseFloat(((scoredPoints / totalPointsPossible) * 100).toFixed(1)) : 0,
      domainSuccessRates: domainSuccessMap,
      feedback: questionFeedback
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get detailed scorecard (For report exports and detailed analysis)
router.get('/sessions/:id/results', async (req, res) => {
  try {
    const session = await db.get(`
      SELECT ts.*, t.title as test_title
      FROM test_sessions ts
      JOIN tests t ON ts.test_id = t.id
      WHERE ts.id = ?
    `, [req.params.id]);

    if (!session) {
      return res.status(404).json({ error: 'Test session not found' });
    }

    if (session.status !== 'completed') {
      return res.status(400).json({ error: 'Test session results not available (test incomplete)' });
    }

    const questions = JSON.parse(session.questions_snapshot);
    const responses = JSON.parse(session.responses || '{}');

    const feedback = [];
    const domainBreakdown = {};

    questions.forEach(q => {
      if (!domainBreakdown[q.domain]) {
        domainBreakdown[q.domain] = { possible: 0, scored: 0 };
      }
      domainBreakdown[q.domain].possible += q.points;

      const selectedOptId = responses[q.id];
      const correctOption = q.options.find(opt => opt.isCorrect);
      const isCorrect = correctOption && selectedOptId === correctOption.id;

      if (isCorrect) {
        domainBreakdown[q.domain].scored += q.points;
      }

      feedback.push({
        id: q.id,
        question_text: q.question_text,
        domain: q.domain,
        difficulty: q.difficulty,
        points: q.points,
        options: q.options,
        selectedOptionId: selectedOptId,
        correctOptionId: correctOption ? correctOption.id : null,
        isCorrect
      });
    });

    const domainSuccessMap = {};
    Object.keys(domainBreakdown).forEach(domain => {
      const stats = domainBreakdown[domain];
      domainSuccessMap[domain] = {
        possible: stats.possible,
        scored: stats.scored,
        successRate: stats.possible > 0 ? parseFloat(((stats.scored / stats.possible) * 100).toFixed(1)) : 0
      };
    });

    res.json({
      id: session.id,
      test_title: session.test_title,
      candidate_name: session.candidate_name,
      candidate_email: session.candidate_email,
      candidate_info: JSON.parse(session.candidate_info || '{}'),
      started_at: session.started_at,
      completed_at: session.completed_at,
      score: session.score,
      total_points: session.total_points,
      percentage: session.total_points > 0 ? parseFloat(((session.score / session.total_points) * 100).toFixed(1)) : 0,
      domainSuccessRates: domainSuccessMap,
      feedback
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List all test sessions (history)
// Admins see all, Standard users see sessions for tests they created
router.get('/sessions', authenticateToken, async (req, res) => {
  try {
    let queryStr;
    let params = [];

    if (req.user.role === 'admin') {
      queryStr = `
        SELECT ts.id, ts.candidate_email, ts.candidate_name, ts.started_at, ts.completed_at, ts.score, ts.total_points, ts.status, t.title as test_title, u.username as creator_name
        FROM test_sessions ts
        JOIN tests t ON ts.test_id = t.id
        JOIN users u ON t.created_by = u.id
        ORDER BY ts.completed_at DESC, ts.started_at DESC
      `;
    } else {
      queryStr = `
        SELECT ts.id, ts.candidate_email, ts.candidate_name, ts.started_at, ts.completed_at, ts.score, ts.total_points, ts.status, t.title as test_title, u.username as creator_name
        FROM test_sessions ts
        JOIN tests t ON ts.test_id = t.id
        JOIN users u ON t.created_by = u.id
        WHERE t.created_by = ?
        ORDER BY ts.completed_at DESC, ts.started_at DESC
      `;
      params.push(req.user.id);
    }

    const sessions = await db.query(queryStr, params);
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ==========================================
// 6. VIRTUAL OUTBOX / LOGS ENDPOINTS
// ==========================================
router.get('/emails', authenticateToken, async (req, res) => {
  try {
    const emails = await db.query('SELECT * FROM simulated_emails ORDER BY sent_at DESC');
    res.json(emails);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete simulated email (Admin only)
router.delete('/emails/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    await db.run('DELETE FROM simulated_emails WHERE id = ?', [req.params.id]);
    res.json({ message: 'Simulated email deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete test session (Admin can delete all, Standard can delete if they created the test)
router.delete('/sessions/:id', authenticateToken, async (req, res) => {
  try {
    const session = await db.get(`
      SELECT ts.id, t.created_by 
      FROM test_sessions ts 
      JOIN tests t ON ts.test_id = t.id 
      WHERE ts.id = ?
    `, [req.params.id]);

    if (!session) {
      return res.status(404).json({ error: 'Test session not found' });
    }

    if (req.user.role !== 'admin' && session.created_by !== req.user.id) {
      return res.status(403).json({ error: 'You do not have permission to delete this test session.' });
    }

    await db.run('DELETE FROM test_sessions WHERE id = ?', [req.params.id]);
    res.json({ message: 'Test session deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk delete questions (Admin only)
router.post('/questions/bulk-delete', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'Invalid payload: ids array is required' });
  if (ids.length === 0) return res.status(400).json({ error: 'Ids array is empty' });
  try {
    const placeholders = ids.map(() => '?').join(',');
    await db.run(`DELETE FROM questions WHERE id IN (${placeholders})`, ids);
    res.json({ message: 'Questions deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk delete users (Admin only)
router.post('/users/bulk-delete', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'Invalid payload: ids array is required' });
  if (ids.length === 0) return res.status(400).json({ error: 'Ids array is empty' });
  try {
    const placeholders = ids.map(() => '?').join(',');
    await db.run(`DELETE FROM users WHERE id IN (${placeholders})`, ids);
    res.json({ message: 'Users deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk delete tests (Admin only)
router.post('/tests/bulk-delete', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'Invalid payload: ids array is required' });
  if (ids.length === 0) return res.status(400).json({ error: 'Ids array is empty' });
  try {
    const placeholders = ids.map(() => '?').join(',');
    await db.run(`DELETE FROM tests WHERE id IN (${placeholders})`, ids);
    res.json({ message: 'Tests deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk delete sessions (Admin can delete all, Standard can delete if they created the test)
router.post('/sessions/bulk-delete', authenticateToken, async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'Invalid payload: ids array is required' });
  if (ids.length === 0) return res.status(400).json({ error: 'Ids array is empty' });
  try {
    const placeholders = ids.map(() => '?').join(',');
    if (req.user.role !== 'admin') {
      const sessions = await db.query(`
        SELECT ts.id, t.created_by 
        FROM test_sessions ts 
        JOIN tests t ON ts.test_id = t.id 
        WHERE ts.id IN (${placeholders})
      `, ids);
      const unauthorized = sessions.some(s => s.created_by !== req.user.id);
      if (unauthorized) {
        return res.status(403).json({ error: 'You do not have permission to delete one or more of these test sessions.' });
      }
    }
    await db.run(`DELETE FROM test_sessions WHERE id IN (${placeholders})`, ids);
    res.json({ message: 'Test sessions deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk delete simulated emails (Admin only)
router.post('/emails/bulk-delete', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'Invalid payload: ids array is required' });
  if (ids.length === 0) return res.status(400).json({ error: 'Ids array is empty' });
  try {
    const placeholders = ids.map(() => '?').join(',');
    await db.run(`DELETE FROM simulated_emails WHERE id IN (${placeholders})`, ids);
    res.json({ message: 'Simulated emails deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
