import React from 'react';
import { Fab } from 'lunchfy-kitchen';

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={2.5}>
    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={2.5}>
    <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function AddFab() {
  return <Fab aria-label="Añadir plato"><PlusIcon /></Fab>;
}

export function DoneFab() {
  return <Fab aria-label="Marcar completado"><CheckIcon /></Fab>;
}
