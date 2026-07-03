import React from 'react';
import { ModalSheet, Button } from 'lunchfy-kitchen';

export function Open() {
  return (
    <ModalSheet
      open={true}
      title="Añadir plato"
      onClose={() => {}}
      actions={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost">Cancelar</Button>
          <Button variant="primary">Añadir</Button>
        </div>
      }
    >
      <div style={{ padding: '8px 0' }}>
        <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--text-secondary)' }}>
          Selecciona un plato para añadir al menú semanal.
        </p>
      </div>
    </ModalSheet>
  );
}
