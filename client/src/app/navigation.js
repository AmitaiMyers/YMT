// Single navigation map shared by the sidebar, the mobile tab bar, the command palette and shortcuts.

import { Route as RouteIcon, Inbox, ListChecks, CalendarDays, Radar, SquareKanban, Building2, FileText, Network, LayoutDashboard, Settings, ScanSearch, Target, ChartColumn, ClipboardList, MessagesSquare, Ban } from 'lucide-react';

export const NAV_GROUPS = [
  { key: 'today', items: [
    { to: '/', key: 'nav.inbox', feature: 'inbox', icon: Inbox, end: true, hotkey: 'g i', count: 'inbox', mobile: true },
    { to: '/approvals', key: 'nav.approvals', icon: ListChecks, hotkey: 'g a', count: 'approvals', mobile: true },
    { to: '/calendar', key: 'nav.calendar', icon: CalendarDays, hotkey: 'g m' },
  ] },
  { key: 'research', items: [
    { to: '/flow', key: 'nav.flow', icon: RouteIcon, hotkey: 'g f', mobile: true },
    { to: '/research', key: 'nav.research', icon: ScanSearch, end: true, hotkey: 'g r', count: 'research', mobile: true },
    { to: '/conversations', key: 'nav.conversations', icon: MessagesSquare, hotkey: 'g v', count: 'conversations' },
    { to: '/research/mandates', key: 'nav.mandates', icon: Target, hotkey: 'g e' },
    { to: '/research/watch-lists', key: 'nav.watchLists', icon: ClipboardList },
    { to: '/research/blocked', key: 'nav.blocked', icon: Ban },
    { to: '/research/metrics', key: 'nav.researchMetrics', icon: ChartColumn },
  ] },
  { key: 'win', items: [
    { to: '/leads', key: 'nav.leads', feature: 'leads', icon: Radar, hotkey: 'g l' },
    { to: '/pipeline', key: 'nav.pipeline', feature: 'pipeline', icon: SquareKanban, hotkey: 'g p', mobile: true },
  ] },
  { key: 'clients', items: [
    { to: '/clients', key: 'nav.clients', icon: Building2, hotkey: 'g c', mobile: true },
    { to: '/documents', key: 'nav.documents', feature: 'documents', icon: FileText, hotkey: 'g o' },
    { to: '/network', key: 'nav.network', feature: 'network', icon: Network, hotkey: 'g n' },
  ] },
  { key: 'manage', items: [
    { to: '/dashboard', key: 'nav.dashboard', feature: 'dashboard', icon: LayoutDashboard, hotkey: 'g d' },
    { to: '/settings', key: 'nav.settings', icon: Settings, hotkey: 'g s' },
  ] },
];

/** The groups and items the current view mode shows (an item with a `feature` is hidden when that feature is). */
export function visibleNavGroups(shows) {
  return NAV_GROUPS
    .map((group) => ({ ...group, items: group.items.filter((item) => item.feature === undefined || shows(item.feature)) }))
    .filter((group) => group.items.length > 0);
}

export function visibleNavItems(shows) {
  return visibleNavGroups(shows).flatMap((group) => group.items);
}
