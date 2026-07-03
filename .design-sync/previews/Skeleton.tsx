import React from 'react';
import { Skeleton } from 'lunchfy-kitchen';

export function TextLines() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}>
      <Skeleton style={{ height: 20, width: '70%', borderRadius: 6 }} />
      <Skeleton style={{ height: 14, width: '90%', borderRadius: 4 }} />
      <Skeleton style={{ height: 14, width: '60%', borderRadius: 4 }} />
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, background: 'var(--surface)', borderRadius: 14, boxShadow: 'var(--shadow-sm)' }}>
      <Skeleton style={{ height: 24, width: '55%', borderRadius: 8 }} />
      <Skeleton style={{ height: 16, width: '80%', borderRadius: 6 }} />
      <Skeleton style={{ height: 16, width: '65%', borderRadius: 6 }} />
      <Skeleton style={{ height: 36, borderRadius: 999 }} />
    </div>
  );
}
