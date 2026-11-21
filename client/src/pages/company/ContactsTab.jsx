import { useState } from 'react';
import { Users, Send, Pencil, Trash2, ShieldCheck, ShieldAlert, Ban } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useAction } from '../../hooks/useApi.js';
import { patch, post, del } from '../../api.js';
import { Card, Button, IconButton, ErrorBox, Badge, Table, ExternalLink, EmptyState, useConfirm, useToast, usePrompt } from '../../ui/index.js';
import { EntityForm } from '../../components/EntityForm.jsx';
import { useContactFields, CONTACT_DEFAULTS } from '../../fields.js';

export function ContactsTab({ data, reload, flow }) {
  const { t } = useI18n();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const toast = useToast();
  const fields = useContactFields();
  const [editingId, setEditingId] = useState(null);
  const companyId = data.company.id;

  const outreach = useAction(async (contact) => {
    const { id } = await post(`/companies/${companyId}/outreach`, { contact_id: contact.id, language: contact.preferred_language });
    reload();
    flow.openDraft(id);
  });
  const optOut = useAction(async (contact) => {
    const reason = await prompt({ title: t('contact.optOutTitle', { name: contact.full_name }), body: t('contact.optOutBody'), label: t('contact.optOutReason'), confirmLabel: t('contact.optOut'), tone: 'danger', invalidReason: t('contact.optOutNeedsReason') });
    if (reason === null) return;
    await post(`/contacts/${contact.id}/opt-out`, { reason });
    toast({ title: t('contact.optedOutToast') });
    reload();
  });
  const remove = useAction(async (contact) => {
    const ok = await confirm({ title: t('contact.deleteTitle'), body: t('contact.deleteBody', { name: contact.full_name }), confirmLabel: t('common.delete'), tone: 'danger' });
    if (!ok) return;
    await del(`/contacts/${contact.id}`);
    toast({ title: t('toast.deleted') });
    reload();
  });

  const editing = data.contacts.find((c) => c.id === editingId);
  const columns = [
    { key: 'full_name', label: t('contact.fullName'), render: (c) => (
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <bdi className="font-medium">{c.full_name}</bdi>
          {c.verified
            ? <Badge tone="success"><ShieldCheck aria-hidden="true" size={13} />{t('contact.verifiedShort')}</Badge>
            : <Badge tone="signal"><ShieldAlert aria-hidden="true" size={13} />{t('contact.unverified')}</Badge>}
          {c.opted_out_at && <Badge tone="danger"><Ban aria-hidden="true" size={13} />{t('contact.optedOut')}</Badge>}
        </div>
        <bdi className="text-[13px] text-subtle">{c.job_title}</bdi>
      </div>
    ) },
    { key: 'department', label: t('contact.department'), render: (c) => t(`department.${c.department}`) },
    { key: 'details', label: t('contact.details'), render: (c) => (
      <div className="space-y-0.5 text-[13px]">
        {c.email && <a className="block text-link" dir="ltr" href={`mailto:${c.email}`}>{c.email}</a>}
        {c.phone && <a className="block text-link" dir="ltr" href={`tel:${c.phone}`}>{c.phone}</a>}
        {c.linkedin_url && <ExternalLink href={c.linkedin_url}>LinkedIn</ExternalLink>}
        {c.verified_source && <div className="text-subtle">{t('contact.verifiedSource')}: <bdi>{c.verified_source}</bdi></div>}
      </div>
    ) },
    { key: 'actions', label: <span className="sr-only">{t('common.actions')}</span>, render: (c) => (
      <div className="flex items-center gap-1">
        <Button
          variant="secondary"
          size="sm"
          icon={Send}
          loading={outreach.busy}
          disabled={!c.email || c.opted_out_at !== null}
          disabledReason={c.opted_out_at ? t('contact.optedOut') : t('contact.needsEmail')}
          onClick={() => outreach.run(c)}
        >
          {t('contact.draftOutreach')}
        </Button>
        <IconButton icon={Pencil} label={`${t('common.edit')}: ${c.full_name}`} onClick={() => setEditingId(c.id)} />
        {!c.opted_out_at && <IconButton icon={Ban} label={`${t('contact.optOut')}: ${c.full_name}`} onClick={() => optOut.run(c)} />}
        <IconButton icon={Trash2} label={`${t('common.delete')}: ${c.full_name}`} onClick={() => remove.run(c)} />
      </div>
    ) },
  ];

  return (
    <div className="space-y-6">
      <Card title={t('contact.list')}>
        <ErrorBox message={outreach.error ?? remove.error ?? optOut.error} />
        <Table caption={t('contact.list')} columns={columns} rows={data.contacts} empty={<EmptyState icon={Users} title={t('contact.none')}>{t('contact.noneHint')}</EmptyState>} />
      </Card>
      <Card title={editing ? `${t('common.edit')}: ${editing.full_name}` : t('contact.add')}>
        <EntityForm
          key={editingId ?? 'new'}
          fields={fields}
          initial={editing ?? CONTACT_DEFAULTS}
          resetOnSuccess={!editing}
          onCancel={editing ? () => setEditingId(null) : undefined}
          successMessage={editing ? t('toast.saved') : t('toast.contactAdded')}
          onSubmit={async (values) => {
            const result = editing ? await patch(`/contacts/${editing.id}`, values) : await post(`/companies/${data.company.id}/contacts`, values);
            setEditingId(null);
            reload();
            return result;
          }}
        />
      </Card>
    </div>
  );
}
