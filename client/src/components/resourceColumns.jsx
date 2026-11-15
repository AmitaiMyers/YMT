import { useI18n } from '../i18n/I18nProvider.jsx';
import { Badge, ExternalLink } from './ui.jsx';

export function useResourceColumns(extra = []) {
  const { t } = useI18n();
  return [
    { key: 'name', label: t('resource.name'), render: (r) => (
      <div>
        <div className="font-medium">{r.name}</div>
        <div className="text-xs text-slate-500">{[r.city, r.country].filter(Boolean).join(', ')}</div>
      </div>
    ) },
    { key: 'type', label: t('resource.type'), render: (r) => <Badge color="blue">{t(`resourceType.${r.type}`)}</Badge> },
    { key: 'industries', label: t('resource.industries') },
    { key: 'capabilities', label: t('resource.capabilities'), render: (r) => <span className="text-xs">{r.capabilities}{r.certifications ? ` · ${r.certifications}` : ''}</span> },
    { key: 'contact', label: t('contact.details'), render: (r) => (
      <div className="space-y-0.5 text-xs">
        {r.contact_name && <div>{r.contact_name}</div>}
        {r.email && <div><a className="text-brand-500" href={`mailto:${r.email}`}>{r.email}</a></div>}
        {r.phone && <div>{r.phone}</div>}
        {r.website && <div><ExternalLink href={r.website}>{t('common.website')}</ExternalLink></div>}
      </div>
    ) },
    { key: 'nda', label: t('resource.ndaSigned'), render: (r) => (r.nda_signed ? <Badge color="green">NDA ✓</Badge> : <Badge color="amber">{t('resource.noNda')}</Badge>) },
    { key: 'rating', label: t('resource.rating'), render: (r) => (r.rating ? '★'.repeat(r.rating) : '—') },
    ...extra,
  ];
}
