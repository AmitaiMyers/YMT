import { Link } from 'react-router-dom';
import { useI18n, useFormat } from '../i18n/I18nProvider.jsx';
import { StatusBadge, statusTone } from '../ui/index.js';

export function useDocumentColumns({ showCompany }) {
  const { t } = useI18n();
  const format = useFormat();
  return [
    { key: 'title', label: t('document.title'), render: (d) => <Link className="font-medium text-link hover:underline" to={`/documents/${d.id}`}><bdi>{d.title}</bdi></Link> },
    ...(showCompany ? [{ key: 'company_name', label: t('company.name') }] : []),
    { key: 'kind', label: t('document.kind'), render: (d) => t(`documentKind.${d.kind}`) },
    { key: 'language', label: t('contact.language'), render: (d) => t(`language.${d.language}`) },
    { key: 'status', label: t('document.status'), render: (d) => <StatusBadge tone={statusTone('document', d.status)}>{t(`documentStatus.${d.status}`)}</StatusBadge> },
    { key: 'shareable', label: t('document.shareable'), render: (d) => (d.shareable ? t('common.yes') : t('common.no')) },
    { key: 'created_at', label: t('common.created'), render: (d) => format.date(d.created_at) },
  ];
}
