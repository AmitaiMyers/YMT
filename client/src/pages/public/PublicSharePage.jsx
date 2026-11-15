// Read-only client file for foreign partners (allow-listed data only, link expires and can be revoked).

import { useParams } from 'react-router-dom';
import { Lock, ListChecks, CalendarDays } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useLoad } from '../../hooks/useApi.js';
import { detectLanguage } from '../../lib/text.js';
import { Card, Loaded, Notice, EmptyState, StatusBadge, statusTone, ExternalLink, DefinitionList, GeneratedText, usePageTitle } from '../../ui/index.js';
import { PublicLayout } from './PublicLayout.jsx';

export function PublicSharePage() {
  const { token } = useParams();
  const { t } = useI18n();
  const format = useFormat();
  const result = useLoad(`/public/share/${token}`);
  usePageTitle(result.data ? result.data.company.name : t('shared.profile'));
  return (
    <PublicLayout>
      <Loaded result={result}>
        {(data) => (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold"><bdi>{data.company.name}</bdi></h1>
              <bdi className="text-sm text-subtle">{data.label}</bdi>
            </div>
            <Notice tone="signal" icon={Lock}>{t('shared.confidential', { date: format.dateTime(data.expires_at) })}</Notice>
            <Card title={t('shared.profile')}>
              <DefinitionList items={[
                [t('company.industry'), data.company.industry],
                [t('company.country'), data.company.country],
                [t('company.website'), data.company.website && <ExternalLink href={data.company.website} />],
              ]} />
            </Card>
            <Card title={t('shared.commitments')}>
              {data.commitments.length === 0 ? <EmptyState icon={ListChecks} title={t('task.none')} /> : (
                <ul className="space-y-2 text-sm">
                  {data.commitments.map((c) => (
                    <li key={`${c.description}-${c.due_date}`} className={c.done ? 'text-subtle line-through' : ''}>
                      <bdi>{c.description}</bdi> – <bdi>{c.assignee}</bdi>{c.due_date ? ` (${format.date(c.due_date)})` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title={t('shared.meetings')}>
              {data.meetings.length === 0 ? <EmptyState icon={CalendarDays} title={t('meetings.none')} /> : data.meetings.map((m) => (
                <div key={`${m.title}-${m.scheduled_at}`} className="mb-4 last:mb-0">
                  <div className="font-medium">{format.date(m.scheduled_at)} – <bdi>{m.title}</bdi></div>
                  {m.decisions && <GeneratedText text={m.decisions} language={detectLanguage(m.decisions)} className="text-sm text-muted" />}
                </div>
              ))}
            </Card>
            {data.documents.map((d) => (
              <Card key={d.title} title={<span className="flex flex-wrap items-center gap-2"><bdi>{d.title}</bdi><StatusBadge tone={statusTone('document', d.status)}>{t(`documentStatus.${d.status}`)}</StatusBadge></span>}>
                <GeneratedText text={d.content} language={d.language} />
                {d.signatures.length > 0 && (
                  <p className="mt-4 text-[13px] text-subtle">
                    {t('document.signatures')}: {d.signatures.map((s) => `${s.signer_name} (${format.date(s.signed_at)})`).join(', ')}
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}
      </Loaded>
    </PublicLayout>
  );
}
