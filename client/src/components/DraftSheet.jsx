// Opens one approval item in a side sheet, so drafting → reviewing → approving never leaves the current page.

import { useI18n } from '../i18n/I18nProvider.jsx';
import { useLoad } from '../hooks/useApi.js';
import { Dialog, Loaded, StatusBadge, statusTone } from '../ui/index.js';
import { ApprovalEditor } from './ApprovalEditor.jsx';
import { EMAIL_KINDS } from '../../../shared/enums.js';

export function DraftSheet({ approvalId, onClose, onChanged }) {
  const { t } = useI18n();
  const result = useLoad(approvalId === null ? null : `/approvals/${approvalId}`);
  const item = result.data;
  return (
    <Dialog
      open={approvalId !== null}
      onClose={onClose}
      variant="sheet"
      title={item ? t(`approvalKind.${item.kind}`) : t('common.loading')}
      description={item ? <span className="inline-flex flex-wrap items-center gap-2"><StatusBadge tone={statusTone('approval', item.status)}>{t(`approvalStatus.${item.status}`)}</StatusBadge>{item.company_name && <bdi>{item.company_name}</bdi>}{item.contact_name && <bdi>→ {item.contact_name}</bdi>}</span> : undefined}
    >
      <Loaded result={result}>
        {(loaded) => (
          <ApprovalEditor
            item={loaded}
            onDone={(nextStatus) => {
              onChanged();
              // Approved emails stay open for the manual send step; everything else is finished.
              const continues = nextStatus === 'pending' || (nextStatus === 'approved' && EMAIL_KINDS.includes(loaded.kind));
              if (continues) result.reload();
              else onClose();
            }}
          />
        )}
      </Loaded>
    </Dialog>
  );
}
