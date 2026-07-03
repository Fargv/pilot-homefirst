import React from 'react';
import { DatePickerField } from 'lunchfy-kitchen';

export function WithLabel() {
  return <DatePickerField label="Fecha de inicio" id="start-date" />;
}

export function WithValue() {
  return <DatePickerField label="Cumpleaños" id="birthday" defaultValue="2026-06-22" />;
}
