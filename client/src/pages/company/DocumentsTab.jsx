import { useI18n } from '../../i18n/I18nProvider.jsx';
import { Card, Table } from '../../components/ui.jsx';
import { NewDocumentForm } from '../../components/NewDocumentForm.jsx';
import { useDocumentColumns } from '../../components/documentColumns.jsx';

export function DocumentsTab({ data }) {
  const { t } = useI18n();
  const columns = useDocumentColumns({ showCompany: false });
  return (
    <div className="space-y-6">
      <Card title={t('document.list')}>
        <Table columns={columns} rows={data.documents} empty={t('document.none')} />
      </Card>
      <Card title={t('document.new')}>
        <NewDocumentForm companyId={data.company.id} deals={data.deals} meetings={data.meetings.filter((m) => m.status === 'done')} />
      </Card>
    </div>
  );
}
