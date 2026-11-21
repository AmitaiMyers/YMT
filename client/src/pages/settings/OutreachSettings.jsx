// Release 3 legal rules: countries cleared for first approaches and the opt-out sentence per language (admin),
// and the do-not-contact list (any staff member can add; only an admin can remove).

import { Ban, Trash2, Scale } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../../hooks/useApi.js';
import { api, post, del } from '../../api.js';
import { Card, Loaded, SkeletonRows, Table, IconButton, ErrorBox, Badge, EmptyState, Notice, DefinitionList, useConfirm, useToast } from '../../ui/index.js';
import { EntityForm } from '../../components/EntityForm.jsx';
import { useEnumOptions } from '../../enumOptions.js';
import { SUPPRESSION_KINDS, LANGUAGES } from '../../../../shared/enums.js';

function linesOf(text) {
  return text.split('\n').map((line) => line.trim()).filter(Boolean);
}

function RulesCard() {
  const { t } = useI18n();
  const result = useLoad('/outreach/rules');
  return (
    <Card title={<span className="flex items-center gap-2"><Scale aria-hidden="true" size={18} />{t('outreachRules.title')}</span>}>
      <p className="mb-4 text-sm text-muted">{t('outreachRules.help')}</p>
      <Loaded result={result} skeleton={<SkeletonRows rows={4} />}>
        {(rules) => (rules.can_edit ? (
          <EntityForm
            columns={1}
            fields={[
              { name: 'cleared_countries', label: t('outreachRules.countries'), type: 'textarea', help: t('outreachRules.countriesHelp') },
              ...LANGUAGES.map((language) => ({ name: `opt_out_${language}`, label: t('outreachRules.optOut', { language: t(`language.${language}`) }), type: 'textarea', required: true })),
            ]}
            initial={{ cleared_countries: rules.cleared_countries.join('\n'), ...Object.fromEntries(LANGUAGES.map((language) => [`opt_out_${language}`, rules.opt_out[language]])) }}
            onSubmit={async (values) => {
              const saved = await api('PUT', '/outreach/rules', { ...values, cleared_countries: linesOf(values.cleared_countries ?? '') });
              result.reload();
              return saved;
            }}
          />
        ) : (
          <DefinitionList stacked items={[
            [t('outreachRules.countries'), rules.cleared_countries.length > 0 ? rules.cleared_countries.join(', ') : t('outreachRules.noCountries')],
            ...LANGUAGES.map((language) => [t('outreachRules.optOut', { language: t(`language.${language}`) }), <bdi key={language} dir={language === 'he' ? 'rtl' : 'ltr'}>{rules.opt_out[language]}</bdi>]),
          ]} />
        ))}
      </Loaded>
    </Card>
  );
}

function SuppressionsCard() {
  const { t } = useI18n();
  const format = useFormat();
  const options = useEnumOptions();
  const confirm = useConfirm();
  const toast = useToast();
  const result = useLoad('/suppressions');
  const rules = useLoad('/outreach/rules');
  const canRemove = Boolean(rules.data && rules.data.can_edit);
  const remove = useAction(async (row) => {
    const ok = await confirm({ title: t('suppression.removeTitle'), body: t('suppression.removeBody', { value: row.value }), confirmLabel: t('suppression.remove'), tone: 'danger' });
    if (!ok) return;
    await del(`/suppressions/${row.id}`);
    toast({ title: t('toast.deleted') });
    result.reload();
  });
  const columns = [
    { key: 'kind', label: t('suppression.kind'), render: (row) => <Badge tone="neutral">{t(`suppressionKind.${row.kind}`)}</Badge> },
    { key: 'value', label: t('suppression.value'), render: (row) => <bdi dir="ltr" className="break-all">{row.value}</bdi> },
    { key: 'reason', label: t('suppression.reason'), render: (row) => (row.reason ? <bdi>{row.reason}</bdi> : '—') },
    { key: 'created', label: t('suppression.addedOn'), render: (row) => <span className="text-[13px] text-subtle">{row.created_by_name ?? '—'} · {format.date(row.created_at)}{row.contact_name && <> · <bdi>{row.contact_name}</bdi></>}</span> },
    ...(canRemove ? [{ key: 'actions', label: <span className="sr-only">{t('common.actions')}</span>, render: (row) => <IconButton icon={Trash2} label={`${t('suppression.remove')}: ${row.value}`} onClick={() => remove.run(row)} /> }] : []),
  ];
  return (
    <Card title={<span className="flex items-center gap-2"><Ban aria-hidden="true" size={18} />{t('suppression.title')}</span>}>
      <p className="mb-4 text-sm text-muted">{t('suppression.help')}</p>
      <ErrorBox message={remove.error} />
      <Loaded result={result} skeleton={<SkeletonRows rows={4} />}>
        {(rows) => <Table caption={t('suppression.title')} columns={columns} rows={rows} empty={<EmptyState icon={Ban} title={t('suppression.none')} />} />}
      </Loaded>
      <h3 className="mb-2 mt-6 text-sm font-semibold">{t('suppression.add')}</h3>
      <EntityForm
        fields={[
          { name: 'kind', label: t('suppression.kind'), type: 'select', required: true, options: options('suppressionKind', SUPPRESSION_KINDS) },
          { name: 'value', label: t('suppression.value'), type: 'text', required: true, help: t('suppression.valueHelp') },
          { name: 'reason', label: t('suppression.reason'), type: 'text', wide: true },
        ]}
        initial={{ kind: 'email' }}
        resetOnSuccess
        submitLabel={t('suppression.add')}
        successMessage={t('suppression.addedToast')}
        onSubmit={async (values) => {
          const created = await post('/suppressions', values);
          result.reload();
          return created;
        }}
      />
    </Card>
  );
}

export function OutreachSettings() {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <Notice icon={Scale}>{t('outreachRules.notice')}</Notice>
      <RulesCard />
      <SuppressionsCard />
    </div>
  );
}
