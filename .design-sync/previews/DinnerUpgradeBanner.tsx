import React from 'react';
import { DinnerUpgradeBanner } from 'lunchfy-kitchen';

export function Default() {
  return <DinnerUpgradeBanner />;
}

export function Dismissible() {
  return <DinnerUpgradeBanner onClose={() => {}} />;
}
