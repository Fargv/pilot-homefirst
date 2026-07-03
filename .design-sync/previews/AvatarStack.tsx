import React from 'react';
import { AvatarStack } from 'lunchfy-kitchen';

export function TwoUsers() {
  return (
    <AvatarStack users={[
      { id: '1', name: 'Ana García' },
      { id: '2', name: 'Carlos López' },
    ]} />
  );
}

export function FourUsers() {
  return (
    <AvatarStack users={[
      { id: '1', name: 'Ana García' },
      { id: '2', name: 'Carlos López' },
      { id: '3', name: 'María Martínez' },
      { id: '4', name: 'Javier Ruiz' },
    ]} />
  );
}
