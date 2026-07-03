import React from 'react';
import { Badge } from 'lunchfy-kitchen';

export function Default() {
  return <Badge tone="default">Premium</Badge>;
}

export function Success() {
  return <Badge tone="success">Completado</Badge>;
}

export function Warning() {
  return <Badge tone="warning">Pendiente</Badge>;
}

export function AllTones() {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: 8 }}>
      <Badge tone="default">Premium</Badge>
      <Badge tone="success">Activo</Badge>
      <Badge tone="warning">Pendiente</Badge>
    </div>
  );
}
