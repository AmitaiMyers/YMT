// View mode (24.11.2026). "Focus" shows only what this week's tasks need: the lead-finding pilot (research review,
// mandates, watch lists, research metrics, SHEPHA list, services), the CRM (clients, contacts, deals and pipeline),
// outreach (first approach, approvals, conversations) and the calendar with meeting scheduling.
// "Full" shows every screen. Nothing is deleted: this list is the only place that decides what Focus hides,
// and an admin switches the mode for everyone in Settings → General.

import { createContext, useContext } from 'react';
import { useLoad } from '../hooks/useApi.js';
import { put } from '../api.js';
import { Loaded, Skeleton } from '../ui/index.js';

/** Features hidden in Focus mode. Keys are used by the navigation, the routes and the screens that hold them. */
export const FOCUS_HIDDEN = new Set([
  'inbox',              // daily hub; the research queue is the home screen in Focus mode
  'leads',              // the old manual lead search and trigger log (research cards replace them)
  'documents',          // proposals, contracts and signatures
  'network',            // suppliers and experts
  'dashboard',          // the old business dashboard (Research metrics is this week's dashboard)
  'meetingPrep',        // pre-meeting sheet
  'meetingAi',          // AI meeting-summary draft (a meeting is still closed with a written summary)
  'companyGenerators',  // the old company brief and template email (first approaches start from a research card)
  'companyTab.triggers',
  'companyTab.documents',
  'companyTab.matches',
  'companyTab.sharing',
  'companyTab.discovery',
  'settings.templates',
  'settings.discovery',
]);

const ViewModeContext = createContext(null);

export function ViewModeProvider({ children }) {
  const settings = useLoad('/settings');
  return (
    <Loaded result={settings} skeleton={<div className="flex min-h-dvh items-center justify-center"><Skeleton className="h-11 w-11 rounded-[10px]" /></div>}>
      {(values) => {
        const mode = values.view_mode;
        const value = {
          mode,
          shows: (feature) => mode === 'full' || !FOCUS_HIDDEN.has(feature),
          setMode: async (next) => {
            await put('/settings/view-mode', { view_mode: next });
            settings.reload();
          },
        };
        return <ViewModeContext.Provider value={value}>{children}</ViewModeContext.Provider>;
      }}
    </Loaded>
  );
}

/** @returns {{ mode: 'focus' | 'full', shows: (feature: string) => boolean, setMode: (mode: string) => Promise<void> }} */
export function useViewMode() {
  const context = useContext(ViewModeContext);
  if (context === null) throw new Error('useViewMode must be used inside ViewModeProvider');
  return context;
}

/** Where "home" is: the inbox in Full mode, the research queue in Focus mode. */
export function useHomePath() {
  return useViewMode().shows('inbox') ? '/' : '/research';
}
