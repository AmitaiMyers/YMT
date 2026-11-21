// Release 3: the first approach to a confirmed decision maker, from an accepted card.
// The owner picks the person and the channel; the AI (or the owner) writes the draft; the draft is reviewed, approved
// and sent right here with the shared approval editor. Channels a person cannot receive show why.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, PenLine, Send } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useAction } from '../../hooks/useApi.js';
import { post } from '../../api.js';
import { Card, Button, ErrorBox, Badge, StatusBadge, statusTone, Notice } from '../../ui/index.js';
import { FieldRow, FieldInput } from '../../components/EntityForm.jsx';
import { ApprovalEditor } from '../../components/ApprovalEditor.jsx';
import { useCounts } from '../../app/CountsProvider.jsx';
import { OUTREACH_CHANNELS } from '../../../../shared/enums.js';

const OPEN_STATUSES = ['pending', 'approved', 'sent'];

function ChannelChoice({ contact, channel, onChange }) {
  const { t } = useI18n();
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">{t('outreach.channel')}</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {OUTREACH_CHANNELS.map((key) => {
          const problem = contact.channels[key];
          const id = `approach-channel-${key}`;
          return (
            <label key={key} htmlFor={id} className={`flex min-h-11 cursor-pointer items-start gap-2 rounded-[8px] border p-2.5 text-sm ${channel === key ? 'border-link bg-info-soft' : 'border-line-strong'} ${problem ? 'cursor-not-allowed opacity-70' : ''}`}>
              <input id={id} type="radio" name="approach-channel" className="mt-1" value={key} checked={channel === key} disabled={problem !== null} onChange={() => onChange(key)} />
              <span>
                <span className="font-medium">{t(`channel.${key}`)}</span>
                {problem && <span className="block text-[13px] text-subtle">{t(`outreachBlock.${problem}`)}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function firstOpenChannel(contact) {
  return OUTREACH_CHANNELS.find((key) => contact.channels[key] === null) ?? null;
}

function DraftForm({ card, onDrafted }) {
  const { t } = useI18n();
  const { refresh } = useCounts();
  const { contacts, approaches, ai_problem: aiProblem } = card.outreach;
  const approachedIds = new Set(approaches.filter((item) => OPEN_STATUSES.includes(item.status)).map((item) => item.contact_id));
  const available = contacts.filter((contact) => !approachedIds.has(contact.id));
  const [contactId, setContactId] = useState(available.length > 0 ? String(available[0].id) : '');
  const contact = available.find((item) => String(item.id) === contactId) ?? null;
  const [channel, setChannel] = useState(contact ? firstOpenChannel(contact) : null);
  const draft = useAction(async (mode) => {
    await post(`/opportunities/${card.id}/approaches`, { contact_id: contact.id, channel, mode });
    refresh();
    onDrafted();
  });

  if (contacts.length === 0) return <p className="text-sm text-muted">{t('outreach.noContacts')}</p>;
  if (available.length === 0) return <p className="text-sm text-muted">{t('outreach.allApproached')}</p>;
  const blocked = channel === null || contact.channels[channel] !== null;
  return (
    <div className="space-y-4">
      <FieldRow field={{ name: 'contact', label: t('outreach.person') }} inputId="approach-contact">
        <FieldInput
          inputId="approach-contact"
          field={{ name: 'contact', type: 'select', required: true, options: available.map((item) => ({ value: String(item.id), label: `${item.full_name}${item.job_title ? ` · ${item.job_title}` : ''}` })) }}
          value={contactId}
          onChange={(value) => {
            setContactId(value);
            setChannel(firstOpenChannel(available.find((item) => String(item.id) === value)));
          }}
        />
      </FieldRow>
      <p className="text-[13px] text-subtle">
        {t('outreach.personFacts', { language: t(`language.${contact.preferred_language}`), country: contact.recipient_country ?? '—' })}
      </p>
      <ChannelChoice contact={contact} channel={channel} onChange={setChannel} />
      <ErrorBox message={draft.error} />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          icon={Sparkles}
          loading={draft.busy}
          loadingLabel={t('outreach.drafting')}
          disabled={blocked || aiProblem !== null}
          disabledReason={blocked ? t('outreach.pickChannel') : aiProblem}
          onClick={() => draft.run('ai')}
        >
          {t('outreach.draftWithAi')}
        </Button>
        <Button variant="secondary" icon={PenLine} disabled={blocked || draft.busy} disabledReason={t('outreach.pickChannel')} onClick={() => draft.run('blank')}>
          {t('outreach.writeMyself')}
        </Button>
      </div>
    </div>
  );
}

function Approach({ item, onChanged }) {
  const { t } = useI18n();
  return (
    <li className="rounded-[8px] border border-line p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge tone={statusTone('approval', item.status)}>{t(`approvalStatus.${item.status}`)}</StatusBadge>
        <Badge tone="neutral">{t(`channel.${item.channel}`)}</Badge>
        <span className="font-medium"><bdi>{item.contact_name}</bdi></span>
        {item.review_note && <span className="text-subtle">· <bdi>{item.review_note}</bdi></span>}
      </div>
      <ApprovalEditor item={item} onDone={onChanged} />
    </li>
  );
}

export function FirstApproachPanel({ card, onChanged }) {
  const { t } = useI18n();
  return (
    <Card title={<span className="flex items-center gap-2"><Send aria-hidden="true" size={18} />{t('outreach.title')}</span>}>
      <Notice>{t('outreach.hint')}</Notice>
      <div className="mt-4">
        {/* A new approach or a new contact resets the form so it never points at a person who is no longer offered. */}
        <DraftForm key={`${card.outreach.approaches.length}:${card.outreach.contacts.map((contact) => contact.id).join(',')}`} card={card} onDrafted={onChanged} />
      </div>
      <p className="mt-4 text-[13px] text-subtle">
        {t('outreach.peopleHint')} <Link className="text-link underline" to={`/companies/${card.company.id}`}>{t('outreach.editPeople')}</Link>
      </p>
      {card.outreach.approaches.length > 0 && (
        <>
          <h3 className="mb-2 mt-6 text-sm font-semibold">{t('outreach.approaches')}</h3>
          <ul className="space-y-3">
            {card.outreach.approaches.map((item) => <Approach key={`${item.id}-${item.status}`} item={item} onChanged={onChanged} />)}
          </ul>
        </>
      )}
    </Card>
  );
}
