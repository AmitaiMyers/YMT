import { Network } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useLoad } from '../../hooks/useApi.js';
import { Card, Loaded, Table, Notice, EmptyState, ButtonLink } from '../../ui/index.js';
import { useResourceColumns } from '../../components/resourceColumns.jsx';

export function MatchesTab({ data }) {
  const { t } = useI18n();
  const result = useLoad(`/companies/${data.company.id}/matches`);
  const columns = useResourceColumns();
  return (
    <Card title={t('matches.title')}>
      <Notice icon={Network}>{t('matches.help', { industry: data.company.industry })}</Notice>
      <Loaded result={result}>
        {(rows) => (
          <Table
            caption={t('matches.title')}
            columns={columns}
            rows={rows}
            empty={<EmptyState icon={Network} title={t('matches.none')} action={<ButtonLink to="/network" size="sm">{t('nav.network')}</ButtonLink>} />}
          />
        )}
      </Loaded>
    </Card>
  );
}
