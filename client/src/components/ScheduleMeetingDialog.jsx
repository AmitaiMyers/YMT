// Schedule a meeting, person-first: search anyone you know or type a new person; the organization is optional.
// Google: "add to my calendar" is a personal convenience; "send invitation" e-mails an outside person, so it is
// opt-in and confirmed in a dialog that names the recipient (human-in-the-loop).

import { useEffect, useId, useMemo, useState } from 'react';
import { CalendarPlus, UserPlus, X, Search, Building2, Mail } from 'lucide-react';
import { useI18n, useFormat } from '../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../hooks/useApi.js';
import { get, post, toQuery } from '../api.js';
import { Button, Dialog, ErrorBox, Notice, useConfirm, useToast } from '../ui/index.js';
import { FieldInput, FieldRow, INPUT_CLASS, isoToLocalInput } from './EntityForm.jsx';
import { useCounts } from '../app/CountsProvider.jsx';

const DURATIONS = [15, 30, 45, 60, 90, 120];
const SEARCH_DELAY_MS = 200;
const FIELD = `${INPUT_CLASS} border-line-strong`;

function nextHalfHour() {
  const date = new Date(Date.now() + 30 * 60_000);
  date.setMinutes(date.getMinutes() < 30 ? 30 : 60, 0, 0);
  return date.toISOString();
}

function usePeopleSearch(query) {
  const [results, setResults] = useState([]);
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      // Suggestions are best-effort while typing; a failed lookup just shows no suggestions.
      get(`/contacts${toQuery({ q: query.trim() })}`).then((rows) => !cancelled && setResults(rows), () => undefined);
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);
  return results;
}

/** Combobox: existing contacts, plus "add new person" for whatever was typed. */
function PersonPicker({ person, onChange }) {
  const { t } = useI18n();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const results = usePeopleSearch(query);
  const options = useMemo(() => [
    ...results.map((contact) => ({ kind: 'existing', contact })),
    ...(query.trim().length >= 2 ? [{ kind: 'new', name: query.trim() }] : []),
  ], [results, query]);

  if (person) {
    const label = person.kind === 'existing' ? person.contact.full_name : person.full_name;
    const detail = person.kind === 'existing'
      ? [person.contact.company_name, person.contact.email].filter(Boolean).join(' · ')
      : t('schedule.newPerson');
    return (
      <div className="flex items-center gap-3 rounded-[10px] border border-line-strong bg-info-soft px-3 py-2">
        <div className="min-w-0 flex-1">
          <div dir="auto" className="align-parent truncate font-medium">{label}</div>
          <div dir="auto" className="align-parent truncate text-[13px] text-muted">{detail}</div>
        </div>
        <button type="button" onClick={() => { onChange(null); setQuery(''); }} aria-label={t('schedule.changePerson')} className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-hover">
          <X aria-hidden="true" size={16} />
        </button>
      </div>
    );
  }

  function choose(option) {
    onChange(option.kind === 'existing'
      ? { kind: 'existing', contact: option.contact }
      : { kind: 'new', full_name: option.name, email: '', phone: '' });
  }

  return (
    <div className="relative">
      <Search aria-hidden="true" size={16} className="absolute start-3 top-3 text-subtle" />
      <input
        role="combobox"
        aria-expanded={options.length > 0}
        aria-controls={listId}
        aria-activedescendant={options[active] ? `${listId}-${active}` : undefined}
        aria-label={t('schedule.person')}
        placeholder={t('schedule.personPlaceholder')}
        className={`${FIELD} ps-9`}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setActive(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && options.length) { e.preventDefault(); setActive((active + 1) % options.length); }
          if (e.key === 'ArrowUp' && options.length) { e.preventDefault(); setActive((active - 1 + options.length) % options.length); }
          if (e.key === 'Enter' && options[active]) { e.preventDefault(); choose(options[active]); }
        }}
      />
      {options.length > 0 && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-[10px] border border-line bg-surface p-1 shadow-e2">
          {options.map((option, index) => (
            <li
              key={option.kind === 'existing' ? option.contact.id : 'new'}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              onMouseMove={() => setActive(index)}
              onMouseDown={(e) => { e.preventDefault(); choose(option); }}
              className={`flex cursor-pointer items-center gap-2 rounded-[6px] px-3 py-2 text-sm ${index === active ? 'bg-info-soft' : ''}`}
            >
              {option.kind === 'existing' ? (
                <span className="min-w-0">
                  <span dir="auto" className="align-parent block truncate font-medium">{option.contact.full_name}</span>
                  <span dir="auto" className="align-parent block truncate text-[13px] text-subtle">{[option.contact.company_name, option.contact.email].filter(Boolean).join(' · ') || t('schedule.noDetails')}</span>
                </span>
              ) : (
                <span className="flex items-center gap-2 font-medium text-link"><UserPlus aria-hidden="true" size={16} />{t('schedule.addNewPerson', { name: option.name })}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * @param {{ open: boolean, onClose: () => void, onScheduled: (result) => void,
 *   initialStart?: string, company?: { id: number, name: string, deals?: Array<{ id: number, title: string }> } }} props
 */
export function ScheduleMeetingDialog({ open, onClose, onScheduled, initialStart, company }) {
  const { t } = useI18n();
  const format = useFormat();
  const toast = useToast();
  const confirm = useConfirm();
  const { refresh } = useCounts();
  const googleStatus = useLoad(open ? '/google/status' : null);
  const companies = useLoad(open && !company ? '/companies' : null);
  const formId = useId();
  const blank = () => ({
    title: '', scheduled_at: isoToLocalInput(initialStart ?? nextHalfHour()), duration_minutes: '60', location: '',
    organization: '', deal_id: '', add_to_google: true, send_invite: false,
  });
  const [form, setForm] = useState(blank);
  const [person, setPerson] = useState(null);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (open) {
      setForm(blank());
      setPerson(null);
      setErrors({});
    }
  }, [open, initialStart]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const personEmail = person ? (person.kind === 'existing' ? person.contact.email : person.email) : '';
  const personCompany = person && person.kind === 'existing' ? person.contact.company_name : null;
  const google = googleStatus.data;
  const canUseGoogle = Boolean(google && google.configured && google.connected);

  const submit = useAction(async () => {
    const body = {
      title: form.title.trim() || t('schedule.defaultTitle', { name: person ? (person.kind === 'existing' ? person.contact.full_name : person.full_name) : (company ? company.name : form.organization) }),
      scheduled_at: new Date(form.scheduled_at).toISOString(),
      duration_minutes: Number(form.duration_minutes),
      location: form.location.trim() || null,
      ...(company ? { company_id: company.id } : {}),
      ...(!company && !personCompany && form.organization.trim() ? { organization: form.organization.trim() } : {}),
      ...(form.deal_id ? { deal_id: Number(form.deal_id) } : {}),
      ...(person && person.kind === 'existing' ? { contact_id: person.contact.id } : {}),
      ...(person && person.kind === 'new' ? { new_contact: { full_name: person.full_name, email: person.email.trim() || null, phone: person.phone.trim() || null } } : {}),
      add_to_google: canUseGoogle && form.add_to_google,
      send_invite: canUseGoogle && form.add_to_google && form.send_invite,
    };
    if (body.send_invite) {
      const ok = await confirm({
        title: t('schedule.confirmInviteTitle'),
        body: t('schedule.confirmInviteBody', { email: personEmail, when: format.dateTime(body.scheduled_at) }),
        confirmLabel: t('schedule.sendInvite'),
        tone: 'primary',
      });
      if (!ok) return undefined;
    }
    const result = await post('/meetings', body);
    if (result.google.status === 'failed') {
      toast({ tone: 'error', title: t('schedule.savedGoogleFailed'), body: result.google.message, duration: 10_000 });
    } else {
      toast({ title: result.google.status === 'invited' ? t('schedule.savedInvited', { email: personEmail }) : t('toast.meetingScheduled') });
    }
    refresh();
    onScheduled(result);
    onClose();
    return result;
  });

  function handleSubmit(event) {
    event.preventDefault();
    const next = {};
    if (!form.scheduled_at) next.scheduled_at = t('form.required');
    if (!person && !company && !form.organization.trim()) next.person = t('schedule.personOrOrganization');
    if (person && person.kind === 'new' && !person.full_name.trim()) next.person = t('form.required');
    setErrors(next);
    if (Object.keys(next).length === 0) submit.run();
  }

  const fieldId = (name) => `${formId}-${name}`;
  const durationField = { name: 'duration_minutes', label: t('schedule.duration'), type: 'select', required: true,
    options: DURATIONS.map((minutes) => ({ value: String(minutes), label: t('schedule.minutes', { minutes }) })) };

  return (
    <Dialog open={open} onClose={onClose} variant="sheet" title={t('meetings.schedule')} description={company ? <bdi>{company.name}</bdi> : t('schedule.subtitle')}>
      <form id={formId} noValidate onSubmit={handleSubmit} className="space-y-5">
        <ErrorBox message={submit.error} />

        <div>
          <div className="mb-1.5 text-sm font-medium">{t('schedule.person')}</div>
          <PersonPicker person={person} onChange={setPerson} />
          {errors.person && <p className="mt-1.5 text-[13px] font-medium text-danger-fg" role="alert">{errors.person}</p>}
          {person && person.kind === 'new' && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 animate-rise">
              <label className="block text-sm">{t('contact.fullName')}
                <input dir="auto" className={`${FIELD} mt-1`} value={person.full_name} onChange={(e) => setPerson({ ...person, full_name: e.target.value })} />
              </label>
              <label className="block text-sm">{t('contact.email')}
                <input type="email" dir="ltr" autoComplete="off" className={`${FIELD} mt-1`} value={person.email} onChange={(e) => setPerson({ ...person, email: e.target.value })} />
              </label>
              <label className="block text-sm">{t('contact.phone')}
                <input type="tel" dir="ltr" className={`${FIELD} mt-1`} value={person.phone} onChange={(e) => setPerson({ ...person, phone: e.target.value })} />
              </label>
            </div>
          )}
        </div>

        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"><Building2 aria-hidden="true" size={15} />{t('schedule.organization')}</div>
          {company || personCompany
            ? <p dir="auto" className="align-parent rounded-[6px] bg-sunken px-3 py-2 text-sm">{company ? company.name : personCompany}</p>
            : (
              <>
                <input
                  list={`${formId}-companies`}
                  dir="auto"
                  aria-label={t('schedule.organization')}
                  className={FIELD}
                  placeholder={t('schedule.organizationPlaceholder')}
                  value={form.organization}
                  onChange={(e) => set('organization', e.target.value)}
                />
                <datalist id={`${formId}-companies`}>{(companies.data ?? []).map((c) => <option key={c.id} value={c.name} />)}</datalist>
                <p className="mt-1.5 text-[13px] text-subtle">{t('schedule.organizationHelp')}</p>
              </>
            )}
        </div>

        <label className="block text-sm font-medium">{t('meeting.title')}
          <input dir="auto" className={`${FIELD} mt-1.5`} placeholder={t('schedule.titlePlaceholder')} value={form.title} onChange={(e) => set('title', e.target.value)} />
        </label>

        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <FieldRow field={{ name: 'scheduled_at', label: t('meeting.scheduledAt'), type: 'datetime', required: true }} inputId={fieldId('when')} errorId={`${fieldId('when')}-e`} error={errors.scheduled_at}>
            <FieldInput field={{ name: 'scheduled_at', type: 'datetime', required: true }} inputId={fieldId('when')} invalid={Boolean(errors.scheduled_at)} value={form.scheduled_at} onChange={(value) => set('scheduled_at', value)} />
          </FieldRow>
          <FieldRow field={durationField} inputId={fieldId('duration')}>
            <FieldInput field={durationField} inputId={fieldId('duration')} value={form.duration_minutes} onChange={(value) => set('duration_minutes', value)} />
          </FieldRow>
        </div>

        <label className="block text-sm font-medium">{t('meeting.location')}
          <input dir="auto" className={`${FIELD} mt-1.5`} value={form.location} onChange={(e) => set('location', e.target.value)} placeholder={t('schedule.locationPlaceholder')} />
        </label>

        {company && company.deals && company.deals.length > 0 && (
          <label className="block text-sm font-medium">{t('meeting.deal')}
            <select className={`${FIELD} mt-1.5`} value={form.deal_id} onChange={(e) => set('deal_id', e.target.value)}>
              <option value="">—</option>
              {company.deals.map((deal) => <option key={deal.id} value={deal.id}>{deal.title}</option>)}
            </select>
          </label>
        )}

        <fieldset className="rounded-[10px] border border-line p-4">
          <legend className="px-1 text-sm font-semibold">Google Calendar</legend>
          {!google ? null : !google.configured ? (
            <p className="text-[13px] text-subtle">{t('google.notConfiguredShort')}</p>
          ) : !google.connected ? (
            <Notice icon={CalendarPlus}>{t('google.connectHint')} <a className="font-semibold text-link underline" href="/api/google/connect">{t('google.connect')}</a></Notice>
          ) : (
            <div className="space-y-3">
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--primary)]" checked={form.add_to_google} onChange={(e) => set('add_to_google', e.target.checked)} />
                <span>{t('schedule.addToGoogle')} <span dir="ltr" className="text-subtle">({google.email})</span></span>
              </label>
              <label className={`flex items-start gap-3 text-sm ${!form.add_to_google || !personEmail ? 'opacity-50' : ''}`}>
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 accent-[var(--primary)]"
                  disabled={!form.add_to_google || !personEmail}
                  checked={form.add_to_google && Boolean(personEmail) && form.send_invite}
                  onChange={(e) => set('send_invite', e.target.checked)}
                />
                <span>
                  <span className="flex items-center gap-1.5"><Mail aria-hidden="true" size={14} />{personEmail ? t('schedule.inviteTo', { email: personEmail }) : t('schedule.inviteNeedsEmail')}</span>
                  <span className="block text-[13px] text-subtle">{t('schedule.inviteHelp')}</span>
                </span>
              </label>
            </div>
          )}
        </fieldset>

        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Button type="submit" icon={CalendarPlus} loading={submit.busy} loadingLabel={t('common.saving')}>{t('meetings.scheduleButton')}</Button>
          <Button variant="secondary" offlineOk onClick={onClose}>{t('common.cancel')}</Button>
        </div>
      </form>
    </Dialog>
  );
}
