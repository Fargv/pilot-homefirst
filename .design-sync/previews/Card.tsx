import React from 'react';
import { Card } from 'lunchfy-kitchen';

export function Default() {
  return (
    <Card>
      <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700 }}>Pasta al pesto</h3>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>Lunes · 4 personas · 25 min</p>
    </Card>
  );
}

export function Compact() {
  return (
    <Card className="kitchen-card-compact">
      <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Ensalada mediterránea</p>
    </Card>
  );
}
