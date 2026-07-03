import React from 'react';
import { KitchenProvider, Button, BottomNav } from 'lunchfy-kitchen';

const HomeIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CalendarIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <rect x={3} y={4} width={18} height={18} rx={2} /><line x1={3} y1={10} x2={21} y2={10} />
  </svg>
);

export function RouterWrapper() {
  return (
    <KitchenProvider>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
          KitchenProvider wraps all components in a MemoryRouter so router-dependent components work in the design canvas.
        </p>
        <Button variant="primary">Ir a la semana</Button>
        <BottomNav links={[
          { to: '/', label: 'Inicio', icon: HomeIcon },
          { to: '/lista', label: 'Lista', icon: CalendarIcon },
        ]} />
      </div>
    </KitchenProvider>
  );
}
