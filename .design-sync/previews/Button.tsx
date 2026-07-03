import React from 'react';
import { Button } from 'lunchfy-kitchen';

export function Primary() {
  return <Button variant="primary">Guardar cambios</Button>;
}

export function Secondary() {
  return <Button variant="secondary">Cancelar</Button>;
}

export function Ghost() {
  return <Button variant="ghost">Ver más</Button>;
}

export function Danger() {
  return <Button variant="danger">Eliminar semana</Button>;
}

export function Disabled() {
  return <Button variant="primary" disabled>Procesando...</Button>;
}
