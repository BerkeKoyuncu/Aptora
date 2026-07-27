const isProduction = process.env.NODE_ENV === 'production';

const parseBoolean = (value, defaultValue = false) => {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true';
};

const normalizeUrl = (value) => value ? value.replace(/\/+$/, '') : '';
const parsePositiveInteger = (value, defaultValue) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue;
};

const publicUrl = normalizeUrl(process.env.PUBLIC_URL || (isProduction ? '' : 'http://localhost:9372'));
const defaultOrigins = isProduction ? publicUrl : `${publicUrl},http://localhost:5173`;
const allowedOrigins = (process.env.ALLOWED_ORIGINS || defaultOrigins)
  .split(',')
  .map((origin) => normalizeUrl(origin.trim()))
  .filter(Boolean);
const listenHost = process.env.APTORA_LISTEN_HOST || (isProduction ? '127.0.0.1' : '0.0.0.0');
const allowInsecureHttp = parseBoolean(process.env.ALLOW_INSECURE_HTTP, false);
let secureCookies = !isProduction;

if (!/^(127\.0\.0\.1|::1|localhost|0\.0\.0\.0)$/.test(listenHost)) {
  throw new Error('APTORA_LISTEN_HOST must be localhost, 127.0.0.1, ::1, or 0.0.0.0.');
}
if (isProduction && listenHost === '0.0.0.0' && !parseBoolean(process.env.ALLOW_PUBLIC_NODE_BIND, false)) {
  throw new Error('Production cannot bind Node to 0.0.0.0 unless ALLOW_PUBLIC_NODE_BIND=true is explicitly set.');
}

if (isProduction && !publicUrl) {
  throw new Error('PUBLIC_URL is required when NODE_ENV=production.');
}

if (publicUrl) {
  let parsedPublicUrl;
  try {
    parsedPublicUrl = new URL(publicUrl);
  } catch {
    throw new Error('PUBLIC_URL must be an absolute URL.');
  }
  if (isProduction && parsedPublicUrl.protocol !== 'https:' &&
      !(parsedPublicUrl.protocol === 'http:' && allowInsecureHttp)) {
    throw new Error('PUBLIC_URL must use HTTPS unless ALLOW_INSECURE_HTTP=true is explicitly set.');
  }
  secureCookies = parsedPublicUrl.protocol === 'https:';
}

module.exports = {
  isProduction,
  publicUrl,
  allowedOrigins,
  trustProxy: parseBoolean(process.env.TRUST_PROXY, false),
  secureCookies,
  listenHost,
  auditRetentionDays: parsePositiveInteger(process.env.AUDIT_RETENTION_DAYS, 180),
  sessionLinkTtlHours: parsePositiveInteger(process.env.SESSION_LINK_TTL_HOURS, 72),
  resultLinkTtlHours: parsePositiveInteger(process.env.RESULT_LINK_TTL_HOURS, 168),
  sessionSubmitGraceSeconds: parsePositiveInteger(process.env.SESSION_SUBMIT_GRACE_SECONDS, 30),
};
