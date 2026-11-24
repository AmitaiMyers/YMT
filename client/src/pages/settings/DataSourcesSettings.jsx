// Apollo and Lusha API keys (admins). A key is sent once and never shown again: only its last 4 characters.

import { useState } from 'react';
import { KeyRound, Trash2 } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../../hooks/useApi.js';
import { put, del } from '../../api.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Card, Loaded, SkeletonRows, Button, ErrorBox, StatusBadge, Notice } from '../../ui/index.js';
import { FieldRow, FieldInput } from '../../components/EntityForm.jsx';
import { DATA_SOURCES } from '../../../../shared/enums.js';

function ProviderCard({ provider, status, canEdit, onChanged }) {
  const { t } = useI18n();
  const format = useFormat();
  const [key, setKey] = useState('');
  const save = useAction(async () => {
    onChanged(await put(`/data-sources/${provider}`, { api_key: key.trim() }));
    setKey('');
  });
  const remove = useAction(async () => onChanged(await del(`/data-sources/${provider}`)));
  const inputId = `data-source-${provider}`;
  return (
    <Card title={t(`dataSource.${provider}`)}>
      <p className="mb-3 text-sm text-muted">{t(`dataSources.${provider}Help`)}</p>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge tone={status.configured ? 'success' : 'neutral'}>{status.configured ? t('dataSources.connected') : t('dataSources.notConnected')}</StatusBadge>
        {status.configured && (
          <span className="text-subtle">
            {t('dataSources.keyEnds', { end: status.key_end })} · {status.updated_by_name ?? '—'} · {format.date(status.updated_at)}
          </span>
        )}
      </div>
      {canEdit && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); save.run(); }}>
          <div className="min-w-64 flex-1">
            <FieldRow field={{ name: 'api_key', label: status.configured ? t('dataSources.replaceKey') : t('dataSources.apiKey') }} inputId={inputId}>
              <FieldInput field={{ name: 'api_key', type: 'password' }} inputId={inputId} value={key} onChange={setKey} />
            </FieldRow>
          </div>
          <Button type="submit" icon={KeyRound} loading={save.busy} disabled={key.trim() === ''} disabledReason={t('dataSources.enterKey')}>{t('common.save')}</Button>
          {status.configured && <Button variant="ghost" icon={Trash2} loading={remove.busy} onClick={() => remove.run()}>{t('dataSources.remove')}</Button>}
        </form>
      )}
      <div className="mt-2"><ErrorBox message={save.error ?? remove.error} /></div>
    </Card>
  );
}

export function DataSourcesSettings() {
  const { t } = useI18n();
  const { user } = useAuth();
  const result = useLoad('/data-sources');
  return (
    <div className="space-y-6">
      <Notice>{t('dataSources.help')}</Notice>
      <Loaded result={result} skeleton={<Card><SkeletonRows rows={4} /></Card>}>
        {(status) => DATA_SOURCES.map((provider) => (
          <ProviderCard key={provider} provider={provider} status={status[provider]} canEdit={user.role === 'admin'} onChanged={() => result.reload()} />
        ))}
      </Loaded>
    </div>
  );
}
