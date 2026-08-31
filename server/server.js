const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const routes = require('./routes');
const { appVersion, isProduction, publicUrl, allowedOrigins, trustProxy, listenHost, auditRetentionDays } = require('./config');

const app = express();
const PORT = process.env.PORT || 9372;
const pidFile = process.env.APTORA_DATA_DIR ? path.join(process.env.APTORA_DATA_DIR, 'aptora.pid') : null;

if (trustProxy) {
  // Trust only the first reverse proxy in front of the Node process.
  app.set('trust proxy', 1);
}

app.disable('x-powered-by');

// Used by the Windows control panel to distinguish a ready Aptora instance
// from a stale PID file or another application listening on the same port.
app.get('/api/health', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ service: 'aptora', status: 'ok', version: appVersion });
});

// Allow normal same-origin access on any server interface while restricting
// genuinely cross-origin API calls to explicitly configured origins.
app.use(cors((req, callback) => {
  let requestOrigin = '';
  try {
    requestOrigin = new URL(`${req.protocol}://${req.get('host')}`).origin;
  } catch {
    // An invalid Host header will not be treated as an allowed origin.
  }

  callback(null, {
    origin(origin, originCallback) {
      const normalizedOrigin = origin ? origin.replace(/\/+$/, '') : '';
      if (!origin || normalizedOrigin === requestOrigin || allowedOrigins.includes(normalizedOrigin)) {
        return originCallback(null, true);
      }
      const error = new Error('Origin is not allowed by CORS.');
      error.status = 403;
      return originCallback(error);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Aptora-Session-Token'],
    credentials: true,
    maxAge: 86400,
  });
}));

// Baseline browser security headers without requiring an additional runtime package.
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  }
  next();
});

const rateLimitBuckets = new Map();
const MAX_RATE_LIMIT_BUCKETS = 10000;
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const configuredAuthLimit = Number.parseInt(process.env.AUTH_RATE_LIMIT || '15', 10);
const AUTH_MAX_ATTEMPTS = Number.isFinite(configuredAuthLimit) && configuredAuthLimit > 0
  ? configuredAuthLimit
  : 15;

const setRateLimitBucket = (key, entry) => {
  if (!rateLimitBuckets.has(key) && rateLimitBuckets.size >= MAX_RATE_LIMIT_BUCKETS) {
    const oldestKey = rateLimitBuckets.keys().next().value;
    rateLimitBuckets.delete(oldestKey);
  }
  rateLimitBuckets.set(key, entry);
};

const authRateLimiter = (req, res, next) => {
  if (!['/login', '/verify-2fa', '/complete-initial-2fa'].includes(req.path)) return next();

  const now = Date.now();
  const key = `auth:${req.ip}`;
  const current = rateLimitBuckets.get(key);
  const entry = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + AUTH_WINDOW_MS }
    : current;

  entry.count += 1;
  setRateLimitBucket(key, entry);
  res.setHeader('RateLimit-Limit', AUTH_MAX_ATTEMPTS);
  res.setHeader('RateLimit-Remaining', Math.max(0, AUTH_MAX_ATTEMPTS - entry.count));
  res.setHeader('RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

  if (entry.count > AUTH_MAX_ATTEMPTS) {
    res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
    return res.status(429).json({ error: 'Too many authentication attempts. Please try again later.' });
  }
  next();
};

const publicSessionRateLimiter = (req, res, next) => {
  if (!req.path.startsWith('/sessions/') && !req.path.startsWith('/candidate/')) return next();
  const now = Date.now();
  const windowMs = 60 * 1000;
  const limit = 120;
  const key = `session:${req.ip}`;
  const current = rateLimitBuckets.get(key);
  const entry = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
  entry.count += 1;
  setRateLimitBucket(key, entry);
  if (entry.count > limit) {
    res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
    return res.status(429).json({ error: 'Too many session requests. Please try again shortly.' });
  }
  next();
};

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitBuckets.entries()) {
    if (entry.resetAt <= now) rateLimitBuckets.delete(key);
  }
}, AUTH_WINDOW_MS).unref();

// Body parsers
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ limit: '256kb', extended: true }));

// API Routes
app.use('/api/auth', authRateLimiter);
app.use('/api', publicSessionRateLimiter);
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    res.on('finish', () => {
      if (!req.user || res.statusCode < 200 || res.statusCode >= 400) return;
      db.run(
        `INSERT INTO security_audit_logs
         (actor_user_id, action, target_type, target_id, ip_address, user_agent, details)
         VALUES (?, ?, 'api', ?, ?, ?, ?)`,
        [req.user.id, 'api.mutation', req.originalUrl.replace(/[a-f0-9]{32}/gi, ':token').slice(0, 500), req.ip,
          String(req.get('user-agent') || '').slice(0, 500), JSON.stringify({ method: req.method, status: res.statusCode })]
      ).catch(error => console.error('Audit log write failed:', error));
      console.info(JSON.stringify({
        type: 'security_audit', actorUserId: req.user.id, action: 'api.mutation',
        method: req.method, path: req.originalUrl.replace(/[a-f0-9]{32}/gi, ':token'),
        status: res.statusCode, ip: req.ip, timestamp: new Date().toISOString()
      }));
    });
  }
  next();
});
app.use('/api', routes);

// Serve static client assets in production
const clientBuildPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientBuildPath));

// Fallback index.html route for client-side routing in production SPA
app.get('*', (req, res, next) => {
  // If request is for /api, skip to error/not found
  if (req.url.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(clientBuildPath, 'index.html'), (err) => {
    if (err) {
      // If client build isn't compiled yet, return a simple welcoming API message
      res.status(200).send('Aptora Backend is Running. Frontend not yet compiled.');
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Express Error Boundary:', err.stack);
  const status = err.status || 500;
  res.status(status).json({
    error: status === 500 ? 'Internal Server Error' : err.message,
    ...(!isProduction && status === 500 ? { message: err.message } : {})
  });
});

// Start database and server
const startServer = async () => {
  try {
    console.log('Initializing SQLite Database...');
    await db.initDb();
    await db.run(`DELETE FROM security_audit_logs WHERE created_at < datetime('now', ?)`, [`-${auditRetentionDays} days`]);
    console.log('Database initialized successfully.');

    const httpServer = app.listen(PORT, listenHost, () => {
      if (pidFile) fs.writeFileSync(pidFile, String(process.pid), { encoding: 'ascii', mode: 0o600 });
      console.log(`===============================================`);
      console.log(` Aptora testing application is now listening! `);
      console.log(` Port:    ${PORT}                               `);
      console.log(` Mode:    ${isProduction ? 'Production' : 'Development'}${' '.repeat(isProduction ? 20 : 19)}`);
      console.log(` URL:     ${publicUrl}${' '.repeat(Math.max(1, 38 - publicUrl.length))}`);
      console.log(` Bind:    ${listenHost}:${PORT}`);
      console.log(`===============================================`);
    });

    const shutdown = signal => {
      console.log(`${signal} received. Stopping Aptora...`);
      httpServer.close(() => {
        try {
          if (pidFile && fs.existsSync(pidFile) && fs.readFileSync(pidFile, 'utf8').trim() === String(process.pid)) {
            fs.unlinkSync(pidFile);
          }
        } catch (error) {
          console.error('Failed to remove PID file:', error.message);
        }
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10000).unref();
    };
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT', () => shutdown('SIGINT'));
    return httpServer;
  } catch (error) {
    console.error('Failed to initialize database or start server:', error);
    if (require.main === module) process.exit(1);
    throw error;
  }
};

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
