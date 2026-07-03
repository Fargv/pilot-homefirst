import React from 'react';
import { CategoryChip } from 'lunchfy-kitchen';

export function Basic() {
  return (
    <CategoryChip
      label="Pasta"
      colorBg="#E8F1FF"
      colorText="#1D4ED8"
    />
  );
}

export function WithRemove() {
  return (
    <CategoryChip
      label="Ensaladas"
      colorBg="#DCFCE7"
      colorText="#166534"
      onRemove={() => {}}
    />
  );
}

export function MultipleChips() {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: 8 }}>
      <CategoryChip label="Pasta" colorBg="#E8F1FF" colorText="#1D4ED8" />
      <CategoryChip label="Ensaladas" colorBg="#DCFCE7" colorText="#166534" onRemove={() => {}} />
      <CategoryChip label="Carnes" colorBg="#FEF3C7" colorText="#92400E" />
      <CategoryChip label="Sopas" colorBg="#FCE7F3" colorText="#9D174D" onRemove={() => {}} />
    </div>
  );
}
