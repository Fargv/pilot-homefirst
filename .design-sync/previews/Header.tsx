import React from 'react';
import { Header } from 'lunchfy-kitchen';

const BackIcon = () => (
  <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function AppHeader() {
  return (
    <Header
      center={<span style={{ fontWeight: 700, fontSize: 16 }}>Lunchfy</span>}
      left={<button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><BackIcon /></button>}
      right={<button type="button" style={{ fontSize: 13, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--hf-brand)' }}>Editar</button>}
    />
  );
}

export function TitleOnly() {
  return (
    <Header
      center={<span style={{ fontWeight: 700, fontSize: 16 }}>Mi menú semanal</span>}
    />
  );
}
