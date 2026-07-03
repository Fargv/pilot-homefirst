import React from 'react';
import { Input } from 'lunchfy-kitchen';

export function WithLabel() {
  return <Input label="Nombre del plato" id="dish-name" placeholder="Ej: Pasta carbonara" />;
}

export function WithValue() {
  return <Input label="Email" id="email" type="email" defaultValue="usuario@ejemplo.com" />;
}

export function Disabled() {
  return <Input label="Plan actual" id="plan" defaultValue="Beta Pro" disabled />;
}
