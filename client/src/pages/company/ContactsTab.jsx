import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useAction } from '../../hooks/useApi.js';
import { patch, post, del } from '../../api.js';
import { Card, Button, ErrorBox, Badge, Table, ExternalLink } from '../../components/ui.jsx';
import { EntityForm } from '../../components/EntityForm.jsx';
import { useContactFields, CONTACT_DEFAULTS } from '../../fields.js';

export function ContactsTab({ data, reload }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const fields = useContactFields();
  const [editingId, setEditingId] = useState(null);
  const companyId = data.company.id;

  const outreach = useAction(async (contact) => {
    await post(`/companies/${companyId}/outreach`, { contact_id: contact.id, language: contact.preferred_language });
    navigate('/approvals');
  });
  const remove = useAction(async (contact) => {
    await del(`/contacts/${contact.id}`);
    reload();
  });

  const editing = data.contacts.find((c) => c.id === editingId);
  const columns = [
    { key: 'full_name', label: t('contact.fullName'), render: (c) => (
      <div>
        <div className="font-medium">{c.full_name} {c.verified ? <Badge color="green">✓ {t('contact.verifiedShort')}</Badge> : <Badge color="amber">{t('contact.unverified')}</Badge>}</div>
        <div className="text-xs text-slate-500">{c.job_title}</div>
      </div>
    ) },
    { key: 'department', label: t('contact.department'), render: (c) => t(`department.${c.department}`) },
    { key: 'details', label: t('contact.details'), render: (c) => (
      <div className="space-y-0.5 text-xs">
        {c.email && <div><a className="text-brand-500" href={`mailto:${c.email}`}>{c.email}</a></div>}
        {c.phone && <div><a className="text-brand-500" href={`tel:${c.phone}`}>{c.phone}</a></div>}
        {c.linkedin_url && <div><ExternalLink href={c.linkedin_url}>LinkedIn</ExternalLink></div>}
        {c.verified_source && <div className="text-slate-500">{t('contact.verifiedSource')}: {c.verified_source}</div>}
      </div>
    ) },
    { key: 'actions', label: '', render: (c) => (
      <div className="flex flex-wrap gap-1">
        <Button variant="secondary" className="!px-2 !py-1 text-xs" disabled={outreach.busy} onClick={() => outreach.run(c)}>{t('contact.draftOutreach')}</Button>
        <Button variant="secondary" className="!px-2 !py-1 text-xs" onClick={() => setEditingId(c.id)}>{t('common.edit')}</Button>
        <Button variant="secondary" className="!px-2 !py-1 text-xs" onClick={() => window.confirm(t('common.confirmDelete')) && remove.run(c)}>{t('common.delete')}</Button>
      </div>
    ) },
  ];

  return (
    <div className="space-y-6">
      <Card title={t('contact.list')}>
        <ErrorBox message={outreach.error ?? remove.error} />
        <Table columns={columns} rows={data.contacts} empty={t('contact.none')} />
      </Card>
      <Card title={editing ? `${t('common.edit')}: ${editing.full_name}` : t('contact.add')}>
        <EntityForm
          key={editingId ?? 'new'}
          fields={fields}
          initial={editing ?? CONTACT_DEFAULTS}
          resetOnSuccess={!editing}
          onCancel={editing ? () => setEditingId(null) : undefined}
          onSubmit={async (values) => {
            const result = editing
              ? await patch(`/contacts/${editing.id}`, values)
              : await post(`/companies/${data.company.id}/contacts`, values);
            setEditingId(null);
            reload();
            return result;
          }}
        />
      </Card>
    </div>
  );
}
