import React from 'react';
import { SearchableSelect } from 'lunchfy-kitchen';

const categoryOptions = [
  { value: 'pasta', label: 'Pasta' },
  { value: 'ensalada', label: 'Ensaladas' },
  { value: 'carne', label: 'Carnes' },
  { value: 'pescado', label: 'Pescado' },
  { value: 'sopa', label: 'Sopas' },
];

export function Empty() {
  return (
    <SearchableSelect
      options={categoryOptions}
      value=""
      onChange={() => {}}
      placeholder="Buscar categoría..."
    />
  );
}

export function WithValue() {
  return (
    <SearchableSelect
      options={categoryOptions}
      value="pasta"
      onChange={() => {}}
    />
  );
}
