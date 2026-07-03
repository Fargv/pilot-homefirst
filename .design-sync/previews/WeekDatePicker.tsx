import React from 'react';
import { WeekDatePicker } from 'lunchfy-kitchen';

export function CurrentWeek() {
  return (
    <WeekDatePicker
      selectedWeek="2026-06-22"
      onWeekChange={() => {}}
    />
  );
}

export function PastWeek() {
  return (
    <WeekDatePicker
      selectedWeek="2026-06-15"
      onWeekChange={() => {}}
    />
  );
}
