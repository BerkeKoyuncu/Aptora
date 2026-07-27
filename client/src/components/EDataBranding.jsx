import React, { useState } from 'react';

export default function EDataBranding({ variant = 'light', compact = false, showText = true, large = false }) {
  const [logoAvailable, setLogoAvailable] = useState(true);
  const isDark = variant === 'dark';
  const logoSrc = isDark
    ? '/e-data-logo-white.png'
    : variant === 'contrast'
      ? '/e-data-logo-black.png'
      : '/e-data-logo.png';
  const textColor = isDark ? 'rgba(255, 255, 255, 0.68)' : 'var(--text-secondary)';

  return (
    <div
      aria-label="Developed by E-Data Teknoloji"
      style={{
        display: 'flex',
        flexDirection: compact ? 'row' : 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: compact ? '0.65rem' : '0.45rem',
        color: textColor,
        fontSize: compact ? '0.7rem' : '0.75rem',
        letterSpacing: '0.02em'
      }}
    >
      {showText && (
        <span style={{
          fontSize: compact ? '0.58rem' : '0.62rem',
          fontWeight: 700,
          letterSpacing: '0.16em',
          lineHeight: 1,
          opacity: 0.82,
          whiteSpace: 'nowrap'
        }}>
          DEVELOPED BY
        </span>
      )}
      {logoAvailable && (
        <img
          src={logoSrc}
          alt="E-Data Teknoloji"
          onError={() => setLogoAvailable(false)}
          style={{
            display: 'block',
            maxWidth: large ? (compact ? '125px' : '180px') : (compact ? '110px' : '150px'),
            maxHeight: large ? (compact ? '36px' : '52px') : (compact ? '32px' : '44px'),
            width: 'auto',
            height: 'auto',
            objectFit: 'contain'
          }}
        />
      )}
    </div>
  );
}
