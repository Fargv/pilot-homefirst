import React from 'react';
import { ProBadge, ProGateButton } from 'lunchfy-kitchen';

export function Badge() {
  return <ProBadge />;
}

export function GateButton() {
  return (
    <ProGateButton>
      Ver análisis nutricional
    </ProGateButton>
  );
}

export function InContext() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 8 }}>
      <span style={{ fontSize: 14, fontWeight: 600 }}>Cenas</span>
      <ProBadge />
    </div>
  );
}
