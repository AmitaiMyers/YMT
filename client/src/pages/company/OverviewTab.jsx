import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, FileText, Trash2 } from 'lucide-react';
import { detectLanguage } from '../../lib/text.js';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useAction } from '../../hooks/useApi.js';
import { patch, post, del } from '../../api.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Card, DefinitionList, Button, ErrorBox, EmptyState, ExternalLink, GeneratedText, useConfirm, useToast } from '../../ui/index.js';
import { EntityForm } from '../../components/EntityForm.jsx';
import { useCompanyFields } from '../../fields.js';

export function OverviewTab({ data, reload, flow }) {
  const { t } = useI18n();
  const format = useFormat();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const { user } = useAuth();
  const fields = useCompanyFields();
  const [editing, setEditing] = useState(false);
  const company = data.company;
  const brief = useAction(async (language) => {
    const { id } = await post(`/companies/${company.id}/brief`, { language });
    reload();
    flow.openDraft(id);
  });
  const remove = useAction(async () => {
    const ok = await confirm({ title: t('company.delete'), body: t('company.confirmDelete', { name: company.name }), confirmLabel: t('common.delete'), tone: 'danger' });
    if (!ok) return;
    await del(`/companies/${company.id}`);
    toast({ title: t('toast.deleted') });
    navigate('/clients');
  });

  return (
    <div className="space-y-6">
      <Card title={t('company.details')} actions={!editing && <Button variant="secondary" size="sm" icon={Pencil} offlineOk onClick={() => setEditing(true)}>{t('common.edit')}</Button>}>
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
          <Button variant="secondary" size="sm" loading={brief.busy} onClick={() => brief.run('he')}>{t('company.generateBriefHe')}</Button>
          <Button variant="secondary" size="sm" loading={brief.busy} onClick={() => brief.run('en')}>{t('company.generateBriefEn')}</Button>
        </>}
      >
        <ErrorBox message={brief.error} />
        {company.approved_brief
          ? <GeneratedText text={company.approved_brief} language={detectLanguage(company.approved_brief)} />
          : <EmptyState icon={FileText} title={t('company.noBrief')}>{t('company.briefHelp')}</EmptyState>}
      </Card>

      {user.role === 'admin' && (
        <Card title={t('company.dangerZone')}>
          <ErrorBox message={remove.error} />
          <p className="mb-3 text-sm text-muted">{t('company.deleteHint')}</p>
          <Button variant="danger" icon={Trash2} loading={remove.busy} onClick={remove.run}>{t('company.delete')}</Button>
        </Card>
      )}
    </div>
  );
}
