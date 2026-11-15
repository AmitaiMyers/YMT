// "Where is our data?" – full visibility for management, plus backups and the audit trail.

import { useState } from 'react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useLoad, useAction } from '../../hooks/useApi.js';
import { post } from '../../api.js';
import { Card, Loaded, DefinitionList, Button, ErrorBox, Notice, Table } from '../../components/ui.jsx';

export function PrivacySettings() {
  const { t } = useI18n();
  const format = useFormat();
  const { user } = useAuth();
  const result = useLoad('/settings/data-info');
  const backup = useAction(() => post('/settings/backup'));
  const [lastBackup, setLastBackup] = useState(null);
  return (
    <div className="space-y-6">
      <Card title={t('privacy.title')}>
        <Notice>{t('privacy.summary')}</Notice>
        <Loaded result={result}>
          {(info) => (
            <>
              <DefinitionList items={[
                [t('privacy.storage'), info.storage],
                [t('privacy.hosting'), info.hosting_location],
                [t('privacy.dbPath'), <code key="p" className="text-xs">{info.database_path}</code>],
                [t('privacy.dbSize'), `${format.number(Math.round(info.database_size_bytes / 1024))} KB`],
                [t('privacy.external'), info.external_services.length === 0 ? t('privacy.none') : info.external_services.join(', ')],
              ]} />
              <h3 className="mb-2 mt-6 text-sm font-semibold">{t('privacy.records')}</h3>
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                {Object.entries(info.row_counts).map(([table, n]) => (
                  <div key={table} className="rounded bg-slate-50 px-2 py-1"><span className="text-slate-500">{table}</span>: <strong>{n}</strong></div>
                ))}
              </div>
            </>
          )}
        </Loaded>
      </Card>
      <Card title={t('privacy.practices')}>
        <ul className="list-disc space-y-1 ps-5 text-sm">
          {['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((key) => <li key={key}>{t(`privacy.${key}`)}</li>)}
        </ul>
      </Card>
      {user.role === 'admin' && (
        <Card title={t('privacy.backup')}>
          <ErrorBox message={backup.error} />
          <p className="mb-3 text-sm text-slate-600">{t('privacy.backupHelp')}</p>
          <Button
            disabled={backup.busy}
            onClick={async () => {
              const created = await backup.run();
              if (created !== undefined) setLastBackup(created);
            }}
          >
            {t('privacy.backupNow')}
          </Button>
          {lastBackup && <p className="mt-3 text-sm text-emerald-700">{t('privacy.backupDone', { path: lastBackup.backup_path })}</p>}
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
    { key: 'action', label: t('audit.action') },
    { key: 'entity', label: t('audit.entity'), render: (r) => `${r.entity}${r.entity_id ? ` #${r.entity_id}` : ''}` },
    { key: 'detail', label: t('audit.detail') },
  ];
  return (
    <Card title={t('settings.audit')}>
      <Loaded result={result}>{(rows) => <Table columns={columns} rows={rows} empty="—" />}</Loaded>
    </Card>
  );
}
