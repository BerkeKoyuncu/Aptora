const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { authenticator } = require('otplib');
const qrcode = require('qrcode');
const crypto = require('crypto');
const { isProduction, secureCookies } = require('./config');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || (isProduction ? '' : 'aptora_development_jwt_secret_key_2026');
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || (isProduction ? '' : 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6');
const IV_LENGTH = 12;
const SESSION_COOKIE = 'aptora_session';
const CANDIDATE_SESSION_COOKIE = 'aptora_candidate_session';
const CANDIDATE_SESSION_MAX_AGE_MS = 5 * 60 * 60 * 1000;
const JWT_OPTIONS = { algorithm: 'HS256', issuer: 'aptora', audience: 'aptora-admin' };
const CANDIDATE_JWT_OPTIONS = { algorithm: 'HS256', issuer: 'aptora', audience: 'aptora-candidate' };
const PASSWORD_POLICY_MESSAGE = 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.';

const getPasswordPolicyError = (password) => {
  if (typeof password !== 'string' || password.length < 8 ||
      !/\p{Lu}/u.test(password) || !/\p{Ll}/u.test(password) ||
      !/\p{N}/u.test(password) || !/[^\p{L}\p{N}\s]/u.test(password)) {
    return PASSWORD_POLICY_MESSAGE;
  }
  return null;
};

if (JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set to a random value of at least 32 characters.');
}

if (Buffer.byteLength(ENCRYPTION_KEY, 'utf8') !== 32) {
  throw new Error('ENCRYPTION_KEY must be exactly 32 bytes.');
}

function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return `gcm:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(text) {
  if (!text) return null;
  try {
    const textParts = text.split(':');
    if (textParts[0] === 'gcm' && textParts.length === 4) {
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        Buffer.from(ENCRYPTION_KEY),
        Buffer.from(textParts[1], 'hex')
      );
      decipher.setAuthTag(Buffer.from(textParts[2], 'hex'));
      return Buffer.concat([
        decipher.update(Buffer.from(textParts[3], 'hex')),
        decipher.final()
      ]).toString('utf8');
    }
    // Backward compatibility for values encrypted by earlier releases.
    if (textParts.length < 2) return text;
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (err) {
    return text;
  }
}

const cookieOptions = () => ({
  httpOnly: true,
  secure: secureCookies,
  sameSite: 'strict',
  path: '/',
  maxAge: 4 * 60 * 60 * 1000
});

const createSessionToken = (user) => jwt.sign({
  id: user.id,
  username: user.username,
  email: user.email,
  role: user.role,
  ver: Number(user.token_version || 0),
  jti: crypto.randomUUID()
}, JWT_SECRET, { ...JWT_OPTIONS, expiresIn: '4h' });

const createTemporaryToken = (user, purpose) => jwt.sign({
  id: user.id,
  role: user.role,
  purpose,
  temp: true,
  jti: crypto.randomUUID()
}, JWT_SECRET, { ...JWT_OPTIONS, expiresIn: '5m' });

const verifyTemporaryToken = (token, purpose) => {
  const payload = jwt.verify(token, JWT_SECRET, JWT_OPTIONS);
  if (!payload.temp || payload.purpose !== purpose) throw new Error('Invalid temporary token');
  return payload;
};

const setSessionCookie = (res, user) => {
  res.cookie(SESSION_COOKIE, createSessionToken(user), cookieOptions());
};

const clearSessionCookie = (res) => {
  const options = cookieOptions();
  delete options.maxAge;
  res.clearCookie(SESSION_COOKIE, options);
};

const candidateCookieOptions = () => ({
  httpOnly: true,
  secure: secureCookies,
  sameSite: 'strict',
  path: '/',
  maxAge: CANDIDATE_SESSION_MAX_AGE_MS
});

const setCandidateSessionCookie = (res, candidate) => {
  const token = jwt.sign({
    id: candidate.id,
    session_id: candidate.session_id,
    session_key: candidate.candidate_session_key || undefined,
    role: 'candidate',
    jti: crypto.randomUUID()
  }, JWT_SECRET, { ...CANDIDATE_JWT_OPTIONS, expiresIn: '5h' });
  res.cookie(CANDIDATE_SESSION_COOKIE, token, candidateCookieOptions());
};

const clearCandidateSessionCookie = (res) => {
  const options = candidateCookieOptions();
  delete options.maxAge;
  res.clearCookie(CANDIDATE_SESSION_COOKIE, options);
};

const readCookie = (req, name) => {
  const raw = req.headers.cookie || '';
  const entry = raw.split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
};

// Authenticate the signed cookie and confirm that the account still exists.
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const token = readCookie(req, SESSION_COOKIE) || bearerToken;

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET, JWT_OPTIONS);
    const user = await db.get(
      'SELECT id, username, email, role, twofa_enabled, must_setup_2fa, token_version FROM users WHERE id = ?',
      [payload.id]
    );
    if (!user || user.role !== 'admin' || Number(payload.ver) !== Number(user.token_version)) {
      return res.status(403).json({ error: 'Administrator access is required' });
    }
    if (user.must_setup_2fa) {
      return res.status(403).json({ error: 'Initial 2FA setup is required' });
    }
    req.user = { ...user, twofa_enabled: !!user.twofa_enabled };
    next();
  } catch {
    clearSessionCookie(res);
    return res.status(403).json({ error: 'Invalid or expired session' });
  }
};

const authenticateCandidate = async (req, res, next) => {
  const token = readCookie(req, CANDIDATE_SESSION_COOKIE);
  if (!token) return res.status(401).json({ error: 'Candidate login is required' });

  try {
    const payload = jwt.verify(token, JWT_SECRET, CANDIDATE_JWT_OPTIONS);
    const candidate = await db.get(
      `SELECT ca.id, ca.email, ca.session_id, ts.status, ts.expires_at, ts.candidate_session_key
       FROM candidate_accounts ca
       JOIN test_sessions ts ON ts.id = ca.session_id
       WHERE ca.id = ? AND ca.session_id = ?`,
      [payload.id, payload.session_id]
    );
    if (!candidate) {
      const completedSession = await db.get(
        `SELECT id AS session_id, candidate_email AS email, status, candidate_session_key
         FROM test_sessions WHERE id = ? AND status = 'completed'`,
        [payload.session_id]
      );
      if (completedSession) {
        if (payload.session_key !== (completedSession.candidate_session_key || undefined)) {
          clearCandidateSessionCookie(res);
          return res.status(401).json({
            error: 'This candidate session was replaced by a newer login. Sign in again to continue.',
            code: 'CANDIDATE_SESSION_REPLACED'
          });
        }
        req.candidate = { ...completedSession, id: payload.id, completed_recovery: true };
        return next();
      }
      clearCandidateSessionCookie(res);
      return res.status(403).json({ error: 'Candidate account is no longer active' });
    }
    // A successful login replaces the previous browser session. Null remains
    // compatible with cookies issued before this migration until the next login.
    if (payload.session_key !== (candidate.candidate_session_key || undefined)) {
      clearCandidateSessionCookie(res);
      return res.status(401).json({
        error: 'This candidate session was replaced by a newer login. Sign in again to continue.',
        code: 'CANDIDATE_SESSION_REPLACED'
      });
    }
    if (!['pending', 'active'].includes(candidate.status)) {
      clearCandidateSessionCookie(res);
      return res.status(403).json({ error: 'Candidate account is no longer active' });
    }
    if (candidate.status === 'pending' && candidate.expires_at &&
        new Date(`${candidate.expires_at}Z`) <= new Date()) {
      await db.run('DELETE FROM candidate_accounts WHERE id = ?', [candidate.id]);
      clearCandidateSessionCookie(res);
      return res.status(410).json({ error: 'Candidate account has expired' });
    }
    req.candidate = candidate;
    next();
  } catch {
    clearCandidateSessionCookie(res);
    return res.status(403).json({ error: 'Invalid or expired candidate session' });
  }
};

// Middleware for RBAC
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied: insufficient permissions' });
    }
    next();
  };
};

// Generate 2FA Secret and QR Code
const generate2FASecret = async (email) => {
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(email, 'Aptora Security', secret);
  const qrCodeUrl = await qrcode.toDataURL(otpauthUrl);
  return { secret, qrCodeUrl };
};

// Verify 2FA Code
const verify2FACode = (token, secret) => {
  try {
    return authenticator.verify({ token, secret });
  } catch (error) {
    console.error('2FA verification error:', error);
    return false;
  }
};

module.exports = {
  JWT_SECRET,
  authenticateToken,
  requireRole,
  generate2FASecret,
  verify2FACode,
  encrypt,
  decrypt,
  getPasswordPolicyError,
  createTemporaryToken,
  verifyTemporaryToken,
  setSessionCookie,
  clearSessionCookie,
  authenticateCandidate,
  setCandidateSessionCookie,
  clearCandidateSessionCookie
};
