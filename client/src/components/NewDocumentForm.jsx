// Create a draft document (quote / agreement / meeting summary) from an editable template.

import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useLoad } from '../hooks/useApi.js';
import { post } from '../api.js';
import { Loaded } from './ui.jsx';
import { EntityForm } from './EntityForm.jsx';
import { withIds } from '../fields.js';
import { DOCUMENT_KINDS } from '../../../shared/enums.js';

const toOptions = (rows, labelOf) => rows.map((row) => ({ value: String(row.id), label: labelOf(row) }));

export function NewDocumentForm({ companyId, deals, meetings }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const templates = useLoad('/templates');
  return (
    <Loaded result={templates}>
      {(rows) => {
        const documentTemplates = rows.filter((row) => DOCUMENT_KINDS.includes(row.kind));
        const fields = [
          { name: 'template_id', label: t('document.template'), type: 'select', required: true,
            options: toOptions(documentTemplates, (tpl) => `${tpl.name} (${t(`language.${tpl.language}`)})`) },
          { name: 'title', label: t('document.title'), type: 'text', required: true },
          { name: 'deal_id', label: t('meeting.deal'), type: 'select', options: toOptions(deals, (d) => d.title), help: t('document.dealHelp') },
          { name: 'meeting_id', label: t('document.meeting'), type: 'select', options: toOptions(meetings, (m) => m.title), help: t('document.meetingHelp') },
        ];
        return (
          <EntityForm
            fields={fields}
            submitLabel={t('document.createDraft')}
            onSubmit={async (values) => {
              const { id } = await post('/documents', withIds({ ...values, company_id: companyId }, ['template_id', 'deal_id', 'meeting_id']));
              navigate(`/documents/${id}`);
              return id;
            }}
          />
        );
      }}
    </Loaded>
  );
}
