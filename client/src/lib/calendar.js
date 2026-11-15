// Pure calendar helpers (local time). Weeks start on Sunday, as in Israel.

export const VIEWS = ['day', 'week', 'month'];
const DAY_MS = 86_400_000;

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function startOfWeek(date) {
  return addDays(startOfDay(date), -date.getDay());
}

export function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "YYYY-MM-DD" in local time (for the URL). */
export function toDateKey(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromDateKey(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key ?? '');
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

/** Visible days for a view: 1 (day), 7 (week) or 42 (month grid, 6 full weeks). */
export function visibleDays(view, anchor) {
  if (view === 'day') return [startOfDay(anchor)];
  if (view === 'week') return Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));
  const gridStart = startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

/** [from, to) as ISO strings for the API. */
export function rangeFor(view, anchor) {
  const days = visibleDays(view, anchor);
  return { from: days[0].toISOString(), to: addDays(days[days.length - 1], 1).toISOString() };
}

/** The anchor date one step back/forward in the current view. */
export function shiftAnchor(view, anchor, direction) {
  if (view === 'day') return addDays(anchor, direction);
  if (view === 'week') return addDays(anchor, 7 * direction);
  return new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1);
}

/**
 * Normalise YMT meetings and Google events into one list of { key, source, start, end, title, ... }.
 * Google all-day events have date-only values.
 */
export function toCalendarItems(meetings, googleEvents) {
  const ymt = meetings.map((meeting) => {
    const start = new Date(meeting.scheduled_at);
    return {
      key: `m${meeting.id}`, source: 'ymt', meeting, title: meeting.title, start,
      end: new Date(start.getTime() + meeting.duration_minutes * 60_000), allDay: false,
    };
  });
  const google = googleEvents.map((event) => ({
    key: `g${event.id}`, source: 'google', event, title: event.title, allDay: event.all_day,
    start: event.all_day ? fromDateKey(event.start) : new Date(event.start),
    end: event.all_day ? fromDateKey(event.end) : new Date(event.end),
  }));
  return [...ymt, ...google].sort((a, b) => a.start - b.start);
}

/** Items that touch the given day (timed items by start day; all-day items by their span). */
export function itemsOnDay(items, day) {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = dayStart + DAY_MS;
  return items.filter((item) => (item.allDay
    ? item.start.getTime() < dayEnd && item.end.getTime() > dayStart
    : sameDay(item.start, day)));
}

/**
 * Side-by-side layout for overlapping timed items in one day column.
 * Returns items with `column` and `columns` (how many share the overlap group).
 */
export function layoutOverlaps(items) {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const placed = [];
  let group = [];
  let groupEnd = 0;
  const closeGroup = () => {
    const columns = Math.max(1, ...group.map((entry) => entry.column + 1));
    group.forEach((entry) => placed.push({ ...entry, columns }));
    group = [];
  };
  for (const item of sorted) {
    if (group.length > 0 && item.start.getTime() >= groupEnd) closeGroup();
    const taken = new Set(group.filter((entry) => entry.end > item.start).map((entry) => entry.column));
    let column = 0;
    while (taken.has(column)) column += 1;
    group.push({ ...item, column });
    groupEnd = Math.max(groupEnd, item.end.getTime());
  }
  closeGroup();
  return placed;
}

/** Visual state of a YMT meeting. */
export function meetingState(meeting, now = new Date()) {
  if (meeting.status === 'cancelled') return 'cancelled';
  if (meeting.status === 'done') return 'done';
  return new Date(meeting.scheduled_at) < now ? 'needsSummary' : 'scheduled';
}
