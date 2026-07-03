import React from 'react';
import { PageHeader, Button } from 'lunchfy-kitchen';

export function WithTitle() {
  return (
    <PageHeader
      title="Mi menú semanal"
      subtitle="Semana del 22 al 28 de junio"
    />
  );
}

export function WithActions() {
  return (
    <PageHeader
      title="Catálogo de recetas"
      subtitle="Busca y añade platos a tu semana"
      primaryAction={<Button variant="primary">+ Añadir</Button>}
    />
  );
}

export function WithFilters() {
  return (
    <PageHeader
      title="Lista de la compra"
      secondaryLeft={<span style={{ fontSize: 13, fontWeight: 600 }}>3 secciones</span>}
      secondaryRight={<Button variant="ghost">Limpiar</Button>}
    />
  );
}
