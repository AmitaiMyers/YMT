// Calendar: day / week / month views of YMT meetings + the user's own Google Calendar events.
// View and date live in the URL (?view=week&date=2030-03-04) so links and Back work.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, CalendarCheck, CalendarX, NotebookPen, Unplug, TriangleAlert } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../../hooks/useApi.js';
import { post, toQuery } from '../../api.js';
import { Button, ButtonLink, Card, Loaded, PageHeader, Skeleton, Badge, useConfirm, useToast } from '../../ui/index.js';
import { TaskList } from '../../components/TaskList.jsx';
import { ScheduleMeetingDialog } from '../../components/ScheduleMeetingDialog.jsx';
import { MeetingDetailsDialog } from '../../components/MeetingDetailsDialog.jsx';
import {
  VIEWS, visibleDays, rangeFor, shiftAnchor, toDateKey, fromDateKey, sameDay, startOfDay, toCalendarItems, itemsOnDay,
  layoutOverlaps, meetingState,
} from '../../lib/calendar.js';

const HOUR_PX = 48;
const FIRST_VISIBLE_HOUR = 7;
const MAX_MONTH_ITEMS = 3;
const NARROW_QUERY = '(max-width: 639px)';

// Mirror direction-dependent arrows in RTL ("previous" points to the reading start).
const PrevIcon = (props) => <ChevronLeft {...props} className="rtl:-scale-x-100" />;
const NextIcon = (props) => <ChevronRight {...props} className="rtl:-scale-x-100" />;

// Colour/marking per meeting state (status is never shown by colour alone: see each item's aria-label).
const STATE_CLASSES = {
  scheduled: 'border-chart bg-info-soft text-fg',
  needsSummary: 'border-signal bg-signal-soft text-fg',
  done: 'border-success-fg bg-success-soft text-fg',
  cancelled: 'border-line-strong bg-surface text-muted line-through',
};
const GOOGLE_CLASSES = 'border-line-strong bg-sunken text-fg';

function itemClasses(item) {
  return item.source === 'google' ? GOOGLE_CLASSES : STATE_CLASSES[meetingState(item.meeting)];
}

function useItemLabel() {
  const { t } = useI18n();
  const format = useFormat();
  return (item) => {
    const who = item.source === 'ymt' ? [item.meeting.contact_name, item.meeting.company_name].filter(Boolean).join(', ') : 'Google';
    const state = item.source === 'ymt' ? t(`calendarState.${meetingState(item.meeting)}`) : t('calendar.googleEvent');
    const when = item.allDay ? t('calendar.allDay') : format.dateTime(item.start.toISOString());
    return `${item.title}, ${when}${who ? `, ${who}` : ''}, ${state}`;
  };
}

// ------------------------------------------------------------------ week / day time grid

function TimedItem({ item, onOpen, label }) {
  const format = useFormat();
  const minutes = item.start.getHours() * 60 + item.start.getMinutes();
  const duration = Math.max(20, (item.end - item.start) / 60_000);
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onOpen(item); }}
      aria-label={label(item)}
      className={`absolute overflow-hidden rounded-[6px] border-s-[3px] px-1.5 py-0.5 text-start text-[12px] leading-tight shadow-e1 transition-shadow transition-ui hover:z-10 hover:shadow-e2 ${itemClasses(item)}`}
      style={{
        top: (minutes / 60) * HOUR_PX,
        height: Math.max(18, (duration / 60) * HOUR_PX - 2),
        insetInlineStart: `calc(${(item.column * 100) / item.columns}% + 2px)`,
        width: `calc(${100 / item.columns}% - 4px)`,
      }}
    >
      <span dir="auto" className="block truncate font-semibold">{item.title}</span>
      <span className="block truncate text-muted">
        {format.time(item.start)}
        {item.source === 'ymt' && item.meeting.contact_name ? ` · ${item.meeting.contact_name}` : ''}
        {item.source === 'google' ? ' · G' : ''}
      </span>
    </button>
  );
}

function TimeGrid({ days, items, onOpen, onSlot }) {
  const { language } = useI18n();
  const label = useItemLabel();
  const scrollRef = useRef(null);
  const [now, setNow] = useState(new Date());
  const locale = language === 'he' ? 'he-IL' : 'en-GB';

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = FIRST_VISIBLE_HOUR * HOUR_PX;
  }, [days.length]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const columns = `3.5rem repeat(${days.length}, minmax(0, 1fr))`;
  const allDayByDay = days.map((day) => itemsOnDay(items, day).filter((item) => item.allDay));
  const hasAllDay = allDayByDay.some((list) => list.length > 0);

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: days.length > 1 ? 720 : 0 }}>
        {/* Day headers */}
        <div className="grid border-b border-line" style={{ gridTemplateColumns: columns }}>
          <div />
          {days.map((day) => {
            const today = sameDay(day, now);
            return (
              <div key={day.toISOString()} className="px-1 py-2 text-center">
                <div className="text-[12px] text-subtle">{day.toLocaleDateString(locale, { weekday: 'short' })}</div>
                <div className={`mx-auto mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${today ? 'bg-primary text-on-primary' : 'text-fg'}`}>{day.getDate()}</div>
              </div>
            );
          })}
        </div>
        {/* All-day row (Google all-day events) */}
        {hasAllDay && (
          <div className="grid border-b border-line" style={{ gridTemplateColumns: columns }}>
            <div />
            {allDayByDay.map((list, index) => (
              <div key={days[index].toISOString()} className="space-y-1 p-1">
                {list.map((item) => (
                  <button key={item.key} type="button" onClick={() => onOpen(item)} aria-label={label(item)} className={`block min-h-6 w-full truncate rounded-[4px] border-s-[3px] px-1.5 text-start text-[12px] leading-6 ${itemClasses(item)}`}>
                    <span dir="auto">{item.title}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
        {/* Scrollable hours */}
        <div ref={scrollRef} className="max-h-[62dvh] overflow-y-auto">
          <div className="relative grid" style={{ gridTemplateColumns: columns, height: 24 * HOUR_PX }}>
            <div className="relative">
              {Array.from({ length: 24 }, (_, hour) => (
                <span key={hour} className="tabular absolute end-2 -translate-y-1/2 text-[11px] text-subtle" style={{ top: hour * HOUR_PX }}>
                  {hour === 0 ? '' : `${String(hour).padStart(2, '0')}:00`}
                </span>
              ))}
            </div>
            {days.map((day) => {
              const dayItems = layoutOverlaps(itemsOnDay(items, day).filter((item) => !item.allDay));
              const today = sameDay(day, now);
              return (
                <div
                  key={day.toISOString()}
                  role="list"
                  aria-label={day.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
                  className={`relative cursor-cell border-s border-line ${today ? 'bg-info-soft/40' : ''}`}
                  style={{ backgroundImage: `repeating-linear-gradient(to bottom, var(--line) 0, var(--line) 1px, transparent 1px, transparent ${HOUR_PX}px)` }}
                  onClick={(e) => {
                    const offset = e.clientY - e.currentTarget.getBoundingClientRect().top;
                    const minutes = Math.max(0, Math.min(23 * 60 + 30, Math.floor((offset / HOUR_PX) * 2) * 30));
                    onSlot(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes));
                  }}
                >
                  {dayItems.map((item) => <div role="listitem" key={item.key}><TimedItem item={item} onOpen={onOpen} label={label} /></div>)}
                  {today && (
                    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-20 h-0.5 bg-danger-fg" style={{ top: ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_PX }}>
                      <span className="absolute -top-1 start-0 h-2.5 w-2.5 -translate-x-1/2 rtl:translate-x-1/2 rounded-full bg-danger-fg" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ month grid

function MonthGrid({ anchor, items, onOpen, onDay }) {
  const { t, language } = useI18n();
  const format = useFormat();
  const label = useItemLabel();
  const locale = language === 'he' ? 'he-IL' : 'en-GB';
  const days = visibleDays('month', anchor);
  const today = new Date();
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-line">
        {days.slice(0, 7).map((day) => <div key={day.getDay()} className="py-2 text-center text-[12px] font-medium text-subtle">{day.toLocaleDateString(locale, { weekday: 'short' })}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dayItems = itemsOnDay(items, day);
          const inMonth = day.getMonth() === anchor.getMonth();
          const isToday = sameDay(day, today);
          return (
            <div key={day.toISOString()} className={`min-h-24 border-b border-s border-line p-1 sm:min-h-28 ${inMonth ? '' : 'bg-sunken/60'}`}>
              <button
                type="button"
                onClick={() => onDay(day)}
                aria-label={t('calendar.openDay', { date: day.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }), count: dayItems.length })}
                className={`mb-1 flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-semibold hover:bg-hover ${isToday ? 'bg-primary text-on-primary hover:bg-primary' : inMonth ? 'text-fg' : 'text-subtle'}`}
              >
                {day.getDate()}
              </button>
              <div className="space-y-0.5">
                {dayItems.slice(0, MAX_MONTH_ITEMS).map((item) => (
                  <button key={item.key} type="button" onClick={() => onOpen(item)} aria-label={label(item)} className={`block w-full truncate rounded-[4px] border-s-[3px] px-1 text-start text-[11px] leading-6 sm:text-[12px] ${itemClasses(item)}`}>
                    {!item.allDay && <span className="tabular me-1 hidden text-muted sm:inline">{format.time(item.start)}</span>}
                    <span dir="auto">{item.title}</span>
                  </button>
                ))}
                {dayItems.length > MAX_MONTH_ITEMS && (
                  <button type="button" onClick={() => onDay(day)} className="px-1 text-[11px] font-semibold text-link hover:underline">
                    {t('calendar.more', { count: dayItems.length - MAX_MONTH_ITEMS })}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Google status

function GoogleStatus({ status, onChanged }) {
  const { t } = useI18n();
  const confirm = useConfirm();
  const toast = useToast();
  const disconnect = useAction(async () => {
    const ok = await confirm({ title: t('google.disconnectTitle'), body: t('google.disconnectBody'), confirmLabel: t('google.disconnect'), tone: 'danger' });
    if (!ok) return;
    const result = await post('/google/disconnect');
    toast(result.revoke_error ? { tone: 'error', title: t('google.disconnectedLocal'), body: result.revoke_error } : { title: t('google.disconnected') });
    onChanged();
  });
  if (!status.configured) return <span className="text-[13px] text-subtle">{t('google.notConfiguredShort')}</span>;
  if (!status.connected) {
    return (
      <a href="/api/google/connect" className="inline-flex min-h-10 items-center gap-2 rounded-[6px] border border-line-strong bg-surface px-3 text-sm font-medium hover:bg-hover">
        <CalendarX aria-hidden="true" size={16} className="text-subtle" />{t('google.connect')}
      </a>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-sm">
      <Badge tone="success"><CalendarCheck aria-hidden="true" size={13} />Google</Badge>
      <span dir="ltr" className="text-[13px] text-muted">{status.email}</span>
      <Button size="sm" variant="ghost" icon={Unplug} loading={disconnect.busy} onClick={disconnect.run}>{t('google.disconnect')}</Button>
    </span>
  );
}

// ------------------------------------------------------------------ page

function rangeTitle(view, anchor, locale) {
  if (view === 'day') return anchor.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (view === 'month') return anchor.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const days = visibleDays('week', anchor);
  return `${days[0].toLocaleDateString(locale, { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export function CalendarPage() {
  const { t, language } = useI18n();
  const toast = useToast();
  const locale = language === 'he' ? 'he-IL' : 'en-GB';
  const [params, setParams] = useSearchParams();
  const defaultView = window.matchMedia(NARROW_QUERY).matches ? 'day' : 'week';
  const view = VIEWS.includes(params.get('view')) ? params.get('view') : defaultView;
  const anchor = fromDateKey(params.get('date')) ?? startOfDay(new Date());
  const range = rangeFor(view, anchor);
  const feed = useLoad(`/calendar/events${toQuery(range)}`);
  const googleStatus = useLoad('/google/status');
  const meetings = useLoad('/meetings');
  const tasks = useLoad('/tasks');
  const [scheduleAt, setScheduleAt] = useState(null); // null = closed; '' = open without a preset time
  const [openItem, setOpenItem] = useState(null);

  const navigate = (next) => setParams({ view: next.view ?? view, date: toDateKey(next.date ?? anchor) }, { replace: !next.push });
  const reloadAll = () => {
    feed.reload();
    meetings.reload();
    googleStatus.reload();
  };

  // Result of the Google sign-in round trip (?google=connected|denied|error&reason=…), shown once.
  useEffect(() => {
    const outcome = params.get('google');
    if (!outcome) return;
    const messages = {
      connected: { title: t('google.connected') },
      denied: { tone: 'info', title: t('google.denied') },
      error: { tone: 'error', title: t('google.connectFailed'), body: params.get('reason') ?? undefined },
    };
    toast(messages[outcome] ?? messages.error);
    const next = new URLSearchParams(params);
    next.delete('google');
    next.delete('reason');
    setParams(next, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // "Schedule meeting" links from elsewhere (#schedule) open the dialog directly.
  useEffect(() => {
    if (window.location.hash === '#schedule') setScheduleAt('');
  }, []);

  const items = useMemo(() => (feed.data ? toCalendarItems(feed.data.meetings, feed.data.google_events) : []), [feed.data]);
  const needsSummary = (meetings.data ?? []).filter((meeting) => meetingState(meeting) === 'needsSummary');

  return (
    <>
      <PageHeader title={t('nav.calendar')} subtitle={t('calendar.subtitle')} actions={<Button icon={Plus} offlineOk onClick={() => setScheduleAt('')}>{t('meetings.schedule')}</Button>} />
      <div className="space-y-6">
        <Card padded={false}>
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-3 sm:px-4">
            <Button size="sm" variant="secondary" offlineOk onClick={() => navigate({ date: startOfDay(new Date()) })}>{t('calendar.today')}</Button>
            <div className="flex">
              <Button size="sm" variant="ghost" icon={PrevIcon} offlineOk aria-label={t('calendar.previous')} onClick={() => navigate({ date: shiftAnchor(view, anchor, -1) })}><span className="sr-only">{t('calendar.previous')}</span></Button>
              <Button size="sm" variant="ghost" icon={NextIcon} offlineOk aria-label={t('calendar.next')} onClick={() => navigate({ date: shiftAnchor(view, anchor, 1) })}><span className="sr-only">{t('calendar.next')}</span></Button>
            </div>
            <h2 className="me-auto text-base font-semibold" aria-live="polite">{rangeTitle(view, anchor, locale)}</h2>
            <div role="radiogroup" aria-label={t('calendar.view')} className="inline-flex rounded-[6px] border border-line-strong p-0.5">
              {VIEWS.map((key) => (
                <button key={key} type="button" role="radio" aria-checked={view === key} onClick={() => navigate({ view: key, push: true })} className={`min-h-9 rounded-[4px] px-3 text-sm font-medium transition-colors transition-ui ${view === key ? 'bg-primary text-on-primary' : 'text-muted hover:text-fg'}`}>
                  {t(`calendar.view.${key}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-3 py-2 sm:px-4">
            {googleStatus.data && <GoogleStatus status={googleStatus.data} onChanged={reloadAll} />}
            {feed.data && feed.data.google_error && (
              <span role="alert" className="inline-flex items-center gap-1.5 text-[13px] text-danger-fg"><TriangleAlert aria-hidden="true" size={14} />{feed.data.google_error}</span>
            )}
          </div>
          <Loaded result={feed} skeleton={<div className="p-4"><Skeleton className="h-96 w-full rounded-[10px]" /></div>}>
            {() => (view === 'month'
              ? <MonthGrid anchor={anchor} items={items} onOpen={setOpenItem} onDay={(day) => navigate({ view: 'day', date: day, push: true })} />
              : <TimeGrid days={visibleDays(view, anchor)} items={items} onOpen={setOpenItem} onSlot={(date) => setScheduleAt(date.toISOString())} />)}
          </Loaded>
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 py-2 text-[12px] text-muted">
            {Object.entries(STATE_CLASSES).map(([state, classes]) => (
              <span key={state} className="inline-flex items-center gap-1.5"><i className={`inline-block h-3 w-3 rounded-[3px] border-s-[3px] ${classes}`} />{t(`calendarState.${state}`)}</span>
            ))}
            <span className="inline-flex items-center gap-1.5"><i className={`inline-block h-3 w-3 rounded-[3px] border-s-[3px] ${GOOGLE_CLASSES}`} />{t('calendar.googleEvent')}</span>
            {view !== 'month' && <span className="ms-auto">{t('calendar.clickToSchedule')}</span>}
          </div>
        </Card>

        {needsSummary.length > 0 && (
          <Card padded={false} accent="signal" title={<span className="flex items-center gap-2"><NotebookPen aria-hidden="true" size={18} className="text-signal-fg" />{t('calendar.needsSummary')}</span>}>
            <ul className="divide-y divide-line">
              {needsSummary.map((meeting) => (
                <li key={meeting.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
                  <div className="min-w-0 flex-1">
                    <div dir="auto" className="align-parent truncate font-medium">{meeting.title}</div>
                    <div className="text-[13px] text-subtle"><bdi>{[meeting.contact_name, meeting.company_name].filter(Boolean).join(' · ')}</bdi> · {new Date(meeting.scheduled_at).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}</div>
                  </div>
                  <ButtonLink size="sm" variant="primary" to={`/meetings/${meeting.id}/complete`}>{t('meetings.complete')}</ButtonLink>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card title={t('task.openTasks')}>
          <Loaded result={tasks}>{(rows) => <TaskList tasks={rows} onChanged={tasks.reload} showCompany />}</Loaded>
        </Card>
      </div>

      <ScheduleMeetingDialog
        open={scheduleAt !== null}
        initialStart={scheduleAt || undefined}
        onClose={() => setScheduleAt(null)}
        onScheduled={reloadAll}
      />
      <MeetingDetailsDialog item={openItem} onClose={() => setOpenItem(null)} onChanged={reloadAll} />
    </>
  );
}
