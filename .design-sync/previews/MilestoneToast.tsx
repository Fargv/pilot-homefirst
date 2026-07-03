import React, { useEffect } from 'react';
import { MilestoneToast } from 'lunchfy-kitchen';

export function Trophy() {
  useEffect(() => {
    const t = setTimeout(() => {
      document.dispatchEvent(new CustomEvent('lunchfy:milestone', {
        detail: { title: 'Semana completada', subtitle: '+50 Bites', icon: '🏆', variant: 'trophy' }
      }));
    }, 200);
    return () => clearTimeout(t);
  }, []);
  return (
    <div style={{ minHeight: 180, position: 'relative' }}>
      <MilestoneToast />
    </div>
  );
}

export function Challenge() {
  useEffect(() => {
    const t = setTimeout(() => {
      document.dispatchEvent(new CustomEvent('lunchfy:milestone', {
        detail: { title: '¡Reto superado!', subtitle: '+20 Bites', icon: '🔥', variant: 'flame' }
      }));
    }, 200);
    return () => clearTimeout(t);
  }, []);
  return (
    <div style={{ minHeight: 180, position: 'relative' }}>
      <MilestoneToast />
    </div>
  );
}
