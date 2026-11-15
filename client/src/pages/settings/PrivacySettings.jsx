// "Where is our data?" – full visibility for management, plus backups and the audit trail.

import { useState } from 'react';
import { HardDrive, ShieldCheck, DatabaseBackup, ScrollText } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useLoad, useAction } from '../../hooks/useApi.js';
import { post } from '../../api.js';
import { Card, Loaded, DefinitionList, Button, ErrorBox, Notice, Table, EmptyState, useToast } from '../../ui/index.js';

export function PrivacySettings() {
  const { t } = useI18n();
  const format = useFormat();
  const toast = useToast();
  const { user } = useAuth();
  const result = useLoad('/settings/data-info');
  const [lastBackup, setLastBackup] = useState(null);
  const backup = useAction(async () => {
    const created = await post('/settings/backup');
    setLastBackup(created);
    toast({ title: t('toast.backupCreated') });
  });
  return (
    <div className="space-y-6">
      <Card title={t('privacy.title')}>
        <Notice icon={HardDrive}>{t('privacy.summary')}</Notice>
        <Loaded result={result}>
          {(info) => (
            <>
              <DefinitionList items={[
                [t('privacy.storage'), info.storage],
                [t('privacy.hosting'), info.hosting_location],
                [t('privacy.dbPath'), <code key="p" dir="ltr" className="text-xs [overflow-wrap:anywhere]">{info.database_path}</code>],
                [t('privacy.dbSize'), `${format.number(Math.round(info.database_size_bytes / 1024))} KB`],
                [t('privacy.external'), info.external_services.length === 0 ? t('privacy.none') : info.external_services.join(', ')],
              ]} />
              <h3 className="mb-3 mt-6 text-sm font-semibold">{t('privacy.records')}</h3>
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                {Object.entries(info.row_counts).map(([table, n]) => (
                  <div key={table} className="flex justify-between rounded-[6px] bg-sunken px-3 py-2"><span className="text-muted">{table}</span><strong className="tabular">{n}</strong></div>
                ))}
              </div>
            </>
          )}
        </Loaded>
      </Card>
      <Card title={t('privacy.practices')}>
        <ul className="space-y-2 text-sm">
          {['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((key) => (
            <li key={key} className="flex items-start gap-2"><ShieldCheck aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-success-fg" />{t(`privacy.${key}`)}</li>
          ))}
        </ul>
      </Card>
      {user.role === 'admin' && (
        <Card title={t('privacy.backup')}>
          <ErrorBox message={backup.error} />
          <p className="mb-4 text-sm text-muted">{t('privacy.backupHelp')}</p>
          <Button icon={DatabaseBackup} loading={backup.busy} loadingLabel={t('privacy.backingUp')} onClick={backup.run}>{t('privacy.backupNow')}</Button>
          {lastBackup && <p className="animate-rise mt-3 text-sm text-success-fg">{t('privacy.backupDone', { path: lastBackup.backup_path })}</p>}
        </Card>
      )}
    </div>
  );
}

export function AuditLog() {
  const { t } = useI18n();
  const format = useFormat();
  const result = useLoad('/audit-log');
  const columns = [
    { key: 'created_at', label: t('audit.when'), render: (r) => format.dateTime(r.created_at) },
    { key: 'user_name', label: t('audit.who'), render: (r) => r.user_name ?? t('audit.external') },
    { key: 'action', label: t('audit.action'), render: (r) => <code dir="ltr" className="text-xs">{r.action}</code> },
    { key: 'entity', label: t('audit.entity'), render: (r) => `${r.entity}${r.entity_id ? ` #${r.entity_id}` : ''}` },
    { key: 'detail', label: t('audit.detail') },
  ];
  return (
    <Card title={t('settings.audit')}>
      <Loaded result={result}>{(rows) => <Table caption={t('settings.audit')} columns={columns} rows={rows} empty={<EmptyState icon={ScrollText} title="—" />} />}</Loaded>
    </Card>
  );
}
