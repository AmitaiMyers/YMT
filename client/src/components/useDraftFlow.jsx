// One hook for the "draft → review in side sheet" flow, shared by Inbox, Company, Deal and Approvals.

import { useState } from 'react';
import { DraftSheet } from './DraftSheet.jsx';
import { FollowupDialog } from './FollowupDialog.jsx';

export function useDraftFlow(onChanged) {
  const [approvalId, setApprovalId] = useState(null);
  const [followupDealId, setFollowupDealId] = useState(null);
  const elements = (
    <>
      <FollowupDialog
        dealId={followupDealId}
        onClose={() => setFollowupDealId(null)}
        onDrafted={(id) => {
          setFollowupDealId(null);
          setApprovalId(id);
          onChanged();
        }}
      />
      <DraftSheet approvalId={approvalId} onClose={() => setApprovalId(null)} onChanged={onChanged} />
    </>
  );
  return { openDraft: setApprovalId, openFollowup: setFollowupDealId, elements };
}
