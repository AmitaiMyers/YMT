import { FileText, Building2 } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useLoad } from '../../hooks/useApi.js';
import { Card, Loaded, PageHeader, Table, Notice, EmptyState, ButtonLink, SkeletonRows } from '../../ui/index.js';
import { useDocumentColumns } from '../../components/documentColumns.jsx';

export function DocumentsPage() {
  const { t } = useI18n();
  const result = useLoad('/documents');
  const columns = useDocumentColumns({ showCompany: true });
  return (
    <>
      <PageHeader title={t('nav.documents')} subtitle={t('document.subtitle')} />
      <Notice>{t('document.createHint')}</Notice>
      <Card>
        <Loaded result={result} skeleton={<SkeletonRows rows={6} />}>
          {(rows) => (
            <Table
              caption={t('document.list')}
              columns={columns}
              rows={rows}
              empty={<EmptyState icon={FileText} title={t('document.none')} action={<ButtonLink to="/clients" icon={Building2}>{t('nav.clients')}</ButtonLink>} />}
            />
          )}
        </Loaded>
      </Card>
    </>
  );
}
