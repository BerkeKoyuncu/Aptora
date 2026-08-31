const TURKEY_TIME_ZONE = 'Europe/Istanbul';

const normalizeDateValue = (value) => {
  if (!value || value instanceof Date) return value;
  if (typeof value !== 'string') return value;

  // SQLite timestamps are stored in UTC but do not include a timezone suffix.
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(value) && !/(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    return `${value.replace(' ', 'T')}Z`;
  }

  return value;
};

const toDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(normalizeDateValue(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatDateUK = (value, fallback = '--') => {
  const date = toDate(value);
  if (!date) return fallback;
  return date.toLocaleDateString('en-GB', {
    timeZone: TURKEY_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

export const formatDateTimeUK = (value, fallback = '--') => {
  const date = toDate(value);
  if (!date) return fallback;
  return date.toLocaleString('en-GB', {
    timeZone: TURKEY_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });
};

export const formatTimeUK = (value, fallback = '--') => {
  const date = toDate(value);
  if (!date) return fallback;
  return date.toLocaleTimeString('en-GB', {
    timeZone: TURKEY_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });
};
