import { FileText } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { Card, Table, EmptyState } from '../../ui/index.js';
import { NewDocumentForm } from '../../components/NewDocumentForm.jsx';
import { useDocumentColumns } from '../../components/documentColumns.jsx';

export function DocumentsTab({ data }) {
  const { t } = useI18n();
  const columns = useDocumentColumns({ showCompany: false });
  return (
    <div className="space-y-6">
      <Card title={t('document.list')}>
        <Table caption={t('document.list')} columns={columns} rows={data.documents} empty={<EmptyState icon={FileText} title={t('document.none')} />} />
      </Card>
      <Card title={t('document.new')}>
        <NewDocumentForm companyId={data.company.id} deals={data.deals} meetings={data.meetings.filter((m) => m.status === 'done')} />
      </Card>
    </div>
  );
}
