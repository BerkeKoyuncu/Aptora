import React from 'react';
import { ArrowLeft, MapPinOff } from 'lucide-react';
import EDataBranding from './EDataBranding';

export default function NotFound() {
  return (
    <div className="not-found-page">
      <main className="not-found-card" aria-labelledby="not-found-title">
        <img className="not-found-logo" src="/aptora-icon-black.svg" alt="Aptora" />
        <div className="not-found-code">404</div>
        <MapPinOff className="not-found-icon" size={42} aria-hidden="true" />
        <h1 id="not-found-title">Page not found</h1>
        <p>The address may be incorrect, or the page may have been moved.</p>
        <a className="btn btn-primary not-found-action" href="/">
          <ArrowLeft size={18} aria-hidden="true" />
          Return to Aptora
        </a>
        <div className="not-found-branding">
          <EDataBranding variant="light" compact />
        </div>
      </main>
    </div>
  );
}
