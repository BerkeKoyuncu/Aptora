const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { authenticator } = require('otplib');
const qrcode = require('qrcode');

const JWT_SECRET = process.env.JWT_SECRET || 'aptora_secure_secret_key_2026';

// Middleware to authenticate JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
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
  verify2FACode
};
