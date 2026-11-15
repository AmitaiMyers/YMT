// Read-only client file for foreign partners (allow-listed data only, link expires and can be revoked).

import { useParams } from 'react-router-dom';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useLoad } from '../../hooks/useApi.js';
import { Card, Loaded, Notice, Empty, Badge, ExternalLink, DefinitionList } from '../../components/ui.jsx';
import { PublicLayout } from './PublicLayout.jsx';

export function PublicSharePage() {
  const { token } = useParams();
  const { t } = useI18n();
  const format = useFormat();
  const result = useLoad(`/public/share/${token}`);
  return (
    <PublicLayout>
      <Loaded result={result}>
        {(data) => (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-brand-900">{data.company.name}</h1>
              <p className="text-sm text-slate-500">{data.label}</p>
            </div>
            <Notice color="amber">{t('shared.confidential', { date: format.dateTime(data.expires_at) })}</Notice>
            <Card title={t('shared.profile')}>
              <DefinitionList items={[
                [t('company.industry'), data.company.industry],
                [t('company.country'), data.company.country],
                [t('company.website'), data.company.website && <ExternalLink href={data.company.website} />],
              ]} />
            </Card>
            <Card title={t('shared.commitments')}>
              {data.commitments.length === 0 ? <Empty>{t('task.none')}</Empty> : (
                <ul className="space-y-1 text-sm">
                  {data.commitments.map((c) => (
                    <li key={`${c.description}-${c.due_date}`} className={c.done ? 'text-slate-400 line-through' : ''}>
                      {c.description} – {c.assignee}{c.due_date ? ` (${format.date(c.due_date)})` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title={t('shared.meetings')}>
              {data.meetings.length === 0 ? <Empty>{t('meetings.none')}</Empty> : data.meetings.map((m) => (
                <div key={`${m.title}-${m.scheduled_at}`} className="mb-3">
                  <div className="font-medium">{format.date(m.scheduled_at)} – {m.title}</div>
                  {m.decisions && <pre className="prose-pre text-sm text-slate-600">{m.decisions}</pre>}
                </div>
              ))}
            </Card>
            {data.documents.map((d) => (
              <Card key={d.title} title={<span className="flex gap-2">{d.title} <Badge color={d.status === 'signed' ? 'green' : 'amber'}>{t(`documentStatus.${d.status}`)}</Badge></span>}>
                <pre dir={d.language === 'he' ? 'rtl' : 'ltr'} className="prose-pre text-sm">{d.content}</pre>
                {d.signatures.length > 0 && (
                  <p className="mt-3 text-xs text-slate-500">
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
