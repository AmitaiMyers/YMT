import { ShieldCheck, ShieldAlert, Star } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { Badge, ExternalLink } from '../ui/index.js';

function Rating({ value }) {
  const { t } = useI18n();
  if (!value) return '—';
  return (
    <span role="img" className="inline-flex items-center gap-0.5 text-signal-fg" aria-label={t('resource.ratingValue', { value })}>
      {Array.from({ length: 5 }, (_, index) => <Star key={index} aria-hidden="true" size={14} fill={index < value ? 'currentColor' : 'none'} />)}
    </span>
  );
}

export function useResourceColumns(extra = []) {
  const { t } = useI18n();
  return [
    { key: 'name', label: t('resource.name'), render: (r) => (
      <div>
        <bdi className="font-medium">{r.name}</bdi>
        <div className="text-[13px] text-subtle"><bdi>{[r.city, r.country].filter(Boolean).join(', ')}</bdi></div>
      </div>
    ) },
    { key: 'type', label: t('resource.type'), render: (r) => <Badge tone="info">{t(`resourceType.${r.type}`)}</Badge> },
    { key: 'industries', label: t('resource.industries') },
    { key: 'capabilities', label: t('resource.capabilities'), render: (r) => <span dir="auto" className="text-[13px]">{r.capabilities}{r.certifications ? ` · ${r.certifications}` : ''}</span> },
    { key: 'contact', label: t('contact.details'), render: (r) => (
      <div className="space-y-0.5 text-[13px]">
        {r.contact_name && <bdi className="block">{r.contact_name}</bdi>}
        {r.email && <a className="block text-link" dir="ltr" href={`mailto:${r.email}`}>{r.email}</a>}
        {r.phone && <bdi dir="ltr" className="block">{r.phone}</bdi>}
        {r.website && <ExternalLink href={r.website}>{t('common.website')}</ExternalLink>}
      </div>
    ) },
    { key: 'nda', label: t('resource.ndaSigned'), render: (r) => (r.nda_signed
      ? <Badge tone="success"><ShieldCheck aria-hidden="true" size={13} />NDA</Badge>
      : <Badge tone="signal"><ShieldAlert aria-hidden="true" size={13} />{t('resource.noNda')}</Badge>) },
    { key: 'rating', label: t('resource.rating'), render: (r) => <Rating value={r.rating} /> },
    ...extra,
  ];
}
