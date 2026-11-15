import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useAction } from '../../hooks/useApi.js';
import { patch, post, del } from '../../api.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Card, DefinitionList, Button, ErrorBox, Notice, Empty, ExternalLink } from '../../components/ui.jsx';
import { EntityForm } from '../../components/EntityForm.jsx';
import { useCompanyFields } from '../../fields.js';

export function OverviewTab({ data, reload }) {
  const { t } = useI18n();
  const format = useFormat();
  const navigate = useNavigate();
  const { user } = useAuth();
  const fields = useCompanyFields();
  const [editing, setEditing] = useState(false);
  const company = data.company;
  const brief = useAction(async (language) => {
    await post(`/companies/${company.id}/brief`, { language });
    navigate('/approvals');
  });
  const remove = useAction(async () => {
    await del(`/companies/${company.id}`);
    navigate('/leads');
  });

  return (
    <div className="space-y-6">
      <Card
        title={t('company.details')}
        actions={!editing && <Button variant="secondary" onClick={() => setEditing(true)}>{t('common.edit')}</Button>}
      >
        {editing ? (
          <EntityForm
            fields={fields}
            initial={company}
            onCancel={() => setEditing(false)}
            onSubmit={async (values) => {
              await patch(`/companies/${company.id}`, values);
              setEditing(false);
              reload();
              return true;
            }}
          />
        ) : (
          <DefinitionList items={[
            [t('company.industry'), company.industry],
            [t('company.country'), company.country],
            [t('company.website'), company.website && <ExternalLink href={company.website} />],
            [t('company.employees'), format.number(company.employee_count)],
            [t('company.revenue'), format.usd(company.annual_revenue_usd)],
            [t('company.exports'), company.exports ? t('common.yes') : t('common.no')],
            [t('company.exportMarkets'), company.export_markets],
            [t('company.indiaActivity'), t(`indiaActivity.${company.india_activity}`)],
            [t('company.notes'), company.notes],
          ]} />
        )}
      </Card>

      <Card
        title={t('company.brief')}
        actions={<>
          <Button variant="secondary" disabled={brief.busy} onClick={() => brief.run('he')}>{t('company.generateBriefHe')}</Button>
          <Button variant="secondary" disabled={brief.busy} onClick={() => brief.run('en')}>{t('company.generateBriefEn')}</Button>
        </>}
      >
        <ErrorBox message={brief.error} />
        <Notice>{t('company.briefHelp')}</Notice>
        {company.approved_brief ? <pre className="prose-pre text-sm">{company.approved_brief}</pre> : <Empty>{t('company.noBrief')}</Empty>}
      </Card>

      {user.role === 'admin' && (
        <Card title={t('company.dangerZone')}>
          <ErrorBox message={remove.error} />
          <Button variant="danger" disabled={remove.busy} onClick={() => window.confirm(t('company.confirmDelete')) && remove.run()}>
            {t('company.delete')}
          </Button>
        </Card>
      )}
    </div>
  );
}
