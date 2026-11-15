import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useLoad } from '../../hooks/useApi.js';
import { Card, Loaded, PageHeader, Table, Notice } from '../../components/ui.jsx';
import { useDocumentColumns } from '../../components/documentColumns.jsx';

export function DocumentsPage() {
  const { t } = useI18n();
  const result = useLoad('/documents');
  const columns = useDocumentColumns({ showCompany: true });
  return (
    <>
      <PageHeader title={t('nav.documents')} subtitle={t('document.subtitle')} />
      <Notice>{t('document.createHint')}</Notice>
      <Card title={t('document.list')}>
        <Loaded result={result}>{(rows) => <Table columns={columns} rows={rows} empty={t('document.none')} />}</Loaded>
      </Card>
    </>
  );
}
