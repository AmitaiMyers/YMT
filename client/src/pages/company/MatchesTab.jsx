import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useLoad } from '../../hooks/useApi.js';
import { Card, Loaded, Table, Notice } from '../../components/ui.jsx';
import { useResourceColumns } from '../../components/resourceColumns.jsx';

export function MatchesTab({ data }) {
  const { t } = useI18n();
  const result = useLoad(`/companies/${data.company.id}/matches`);
  const columns = useResourceColumns();
  return (
    <Card title={t('matches.title')}>
      <Notice>{t('matches.help', { industry: data.company.industry })}</Notice>
      <Loaded result={result}>{(rows) => <Table columns={columns} rows={rows} empty={t('matches.none')} />}</Loaded>
    </Card>
  );
}
