import React from 'react';
import { WeekDayTabs } from 'lunchfy-kitchen';

const WEEK_DAYS = [
  '2026-06-22',
  '2026-06-23',
  '2026-06-24',
  '2026-06-25',
  '2026-06-26',
];

export function Default() {
  return (
    <WeekDayTabs
      days={WEEK_DAYS}
      selectedDay="2026-06-22"
      onSelectDay={() => {}}
    />
  );
}

export function MidWeek() {
  return (
    <WeekDayTabs
      days={WEEK_DAYS}
      selectedDay="2026-06-24"
      onSelectDay={() => {}}
    />
  );
}
