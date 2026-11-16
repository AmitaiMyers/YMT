// Details of one calendar item: a YMT meeting (prep, summarize, reschedule, cancel) or a Google event (read-only).

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, MapPin, User, Building2, ExternalLink as ExternalIcon, ClipboardList, NotebookPen, Pencil, Ban, Mail, CalendarCheck } from 'lucide-react';
import { useI18n, useFormat } from '../i18n/I18nProvider.jsx';
import { useAction } from '../hooks/useApi.js';
import { patch } from '../api.js';
import { Button, ButtonLink, Dialog, ErrorBox, StatusBadge, useConfirm, useToast } from '../ui/index.js';
import { INPUT_CLASS, isoToLocalInput } from './EntityForm.jsx';
import { meetingState } from '../lib/calendar.js';

const FIELD = `${INPUT_CLASS} border-line-strong mt-1.5`;
const DURATIONS = [15, 30, 45, 60, 90, 120];
const STATE_TONES = { scheduled: 'info', needsSummary: 'signal', done: 'success', cancelled: 'neutral' };

function Row({ icon: Icon, children }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <Icon aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-subtle" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function timeRange(format, start, end) {
  return `${format.dateTime(start.toISOString())} – ${format.time(end)}`;
}

/** Reschedule / rename. Google notifies an already-invited person, so that is confirmed first. */
function EditMeetingForm({ meeting, onSaved, onCancel }) {
  const { t } = useI18n();
  const confirm = useConfirm();
  const [form, setForm] = useState({
    title: meeting.title, scheduled_at: isoToLocalInput(meeting.scheduled_at),
    duration_minutes: String(meeting.duration_minutes), location: meeting.location ?? '',
  });
  const save = useAction(async () => {
    if (meeting.invite_sent_to) {
      const ok = await confirm({ title: t('meetingDetails.notifyTitle'), body: t('meetingDetails.notifyBody', { email: meeting.invite_sent_to }), confirmLabel: t('common.save'), tone: 'primary' });
      if (!ok) return undefined;
    }
    const result = await patch(`/meetings/${meeting.id}`, {
      title: form.title.trim(), scheduled_at: new Date(form.scheduled_at).toISOString(),
      duration_minutes: Number(form.duration_minutes), location: form.location.trim() || null,
    });
    onSaved(result);
    return result;
  });
  return (
    <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); save.run(); }}>
      <ErrorBox message={save.error} />
      <label className="block text-sm font-medium">{t('meeting.title')}<input dir="auto" className={FIELD} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
      <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
        <label className="block text-sm font-medium">{t('meeting.scheduledAt')}<input type="datetime-local" className={FIELD} value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} /></label>
        <label className="block text-sm font-medium">{t('schedule.duration')}
          <select className={FIELD} value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}>
            {[...new Set([...DURATIONS, meeting.duration_minutes])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{t('schedule.minutes', { minutes: m })}</option>)}
          </select>
        </label>
      </div>
      <label className="block text-sm font-medium">{t('meeting.location')}<input dir="auto" className={FIELD} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label>
      <div className="flex gap-2">
        <Button type="submit" loading={save.busy} disabled={!form.title.trim() || !form.scheduled_at} disabledReason={t('form.required')}>{t('common.save')}</Button>
        <Button variant="secondary" offlineOk onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </form>
  );
}

function YmtMeetingDetails({ meeting, onChanged, onClose }) {
  const { t } = useI18n();
  const format = useFormat();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const start = new Date(meeting.scheduled_at);
  const end = new Date(start.getTime() + meeting.duration_minutes * 60_000);
  const state = meetingState(meeting);

  function reportGoogle(result, successTitle) {
    if (result.google_error) toast({ tone: 'error', title: t('meetingDetails.savedGoogleFailed'), body: result.google_error, duration: 10_000 });
    else toast({ title: successTitle });
  }

  const cancelMeeting = useAction(async () => {
    const ok = await confirm({
      title: t('meetingDetails.cancelTitle'),
      body: meeting.invite_sent_to ? t('meetingDetails.cancelBodyInvited', { email: meeting.invite_sent_to }) : t('meetingDetails.cancelBody'),
      confirmLabel: t('meetingDetails.cancelMeeting'),
      tone: 'danger',
    });
    if (!ok) return;
    const result = await patch(`/meetings/${meeting.id}`, { status: 'cancelled' });
    reportGoogle(result, t('meetingDetails.cancelled'));
    onChanged();
    onClose();
  });

  if (editing) {
    return (
      <EditMeetingForm
        meeting={meeting}
        onCancel={() => setEditing(false)}
        onSaved={(result) => {
          reportGoogle(result, t('toast.saved'));
          setEditing(false);
          onChanged();
          onClose();
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <ErrorBox message={cancelMeeting.error} />
      <StatusBadge tone={STATE_TONES[state]}>{t(`calendarState.${state}`)}</StatusBadge>
      <div className="space-y-3">
        <Row icon={Clock}>{timeRange(format, start, end)} <span className="text-subtle">({t('schedule.minutes', { minutes: meeting.duration_minutes })})</span></Row>
        {meeting.contact_name && <Row icon={User}><bdi className="font-medium">{meeting.contact_name}</bdi>{meeting.contact_email && <span dir="ltr" className="ms-2 text-subtle">{meeting.contact_email}</span>}</Row>}
        <Row icon={Building2}>
          {meeting.company_id
            ? <Link className="text-link underline" to={`/companies/${meeting.company_id}`} onClick={onClose}><bdi>{meeting.company_name}</bdi></Link>
            : <span className="text-subtle">{t('meetingDetails.noOrganization')}</span>}
        </Row>
        {meeting.location && <Row icon={MapPin}><bdi>{meeting.location}</bdi></Row>}
        {meeting.google_event_id && (
          <Row icon={CalendarCheck}>
            {t('meetingDetails.inGoogle')}
            {meeting.google_event_link && <a className="ms-2 inline-flex items-center gap-1 text-link underline" href={meeting.google_event_link} target="_blank" rel="noopener noreferrer">{t('meetingDetails.openGoogle')}<ExternalIcon aria-hidden="true" size={12} /></a>}
          </Row>
        )}
        {meeting.invite_sent_to && <Row icon={Mail}>{t('meetingDetails.invited', { email: meeting.invite_sent_to, date: format.dateTime(meeting.invite_sent_at) })}</Row>}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        {state !== 'cancelled' && <ButtonLink size="sm" icon={ClipboardList} to={`/meetings/${meeting.id}/prep`}>{t('meetings.prep')}</ButtonLink>}
        {(state === 'scheduled' || state === 'needsSummary') && (
          <ButtonLink size="sm" variant={state === 'needsSummary' ? 'primary' : 'secondary'} icon={NotebookPen} to={`/meetings/${meeting.id}/complete`}>{t('meetings.complete')}</ButtonLink>
        )}
        {(state === 'scheduled' || state === 'needsSummary') && (
          <>
            <Button size="sm" variant="secondary" icon={Pencil} offlineOk onClick={() => setEditing(true)}>{t('meetingDetails.edit')}</Button>
            <Button size="sm" variant="ghost" icon={Ban} className="text-danger-fg" loading={cancelMeeting.busy} onClick={cancelMeeting.run}>{t('meetingDetails.cancelMeeting')}</Button>
          </>
        )}
      </div>
    </div>
  );
}

function GoogleEventDetails({ event, item }) {
  const { t } = useI18n();
  const format = useFormat();
  return (
    <div className="space-y-3">
      <Row icon={Clock}>{item.allDay ? t('calendar.allDay') : timeRange(format, item.start, item.end)}</Row>
      {event.location && <Row icon={MapPin}><bdi>{event.location}</bdi></Row>}
      <p className="text-[13px] text-subtle">{t('meetingDetails.googleOnly')}</p>
      {event.link && (
        <a className="inline-flex min-h-10 items-center gap-2 rounded-[6px] border border-line-strong px-3 text-sm font-medium hover:bg-hover" href={event.link} target="_blank" rel="noopener noreferrer">
          {t('meetingDetails.openGoogle')}<ExternalIcon aria-hidden="true" size={14} />
        </a>
      )}
    </div>
  );
}

/** item: a calendar item from toCalendarItems(), or null when closed. */
export function MeetingDetailsDialog({ item, onClose, onChanged }) {
  const [shown, setShown] = useState(item);
  useEffect(() => { if (item) setShown(item); }, [item]);
  return (
    <Dialog open={item !== null} onClose={onClose} title={shown ? <bdi>{shown.title}</bdi> : ''} width="max-w-md">
      {shown && (shown.source === 'ymt'
        ? <YmtMeetingDetails key={shown.key} meeting={shown.meeting} onChanged={onChanged} onClose={onClose} />
        : <GoogleEventDetails event={shown.event} item={shown} />)}
    </Dialog>
  );
}
