// Single navigation map shared by the sidebar, the mobile tab bar, the command palette and shortcuts.

import { Inbox, ListChecks, CalendarDays, Radar, SquareKanban, Building2, FileText, Network, LayoutDashboard, Settings, ScanSearch, Target, ChartColumn } from 'lucide-react';

export const NAV_GROUPS = [
  { key: 'today', items: [
    { to: '/', key: 'nav.inbox', icon: Inbox, end: true, hotkey: 'g i', count: 'inbox', mobile: true },
    { to: '/approvals', key: 'nav.approvals', icon: ListChecks, hotkey: 'g a', count: 'approvals', mobile: true },
    { to: '/calendar', key: 'nav.calendar', icon: CalendarDays, hotkey: 'g m' },
  ] },
  { key: 'research', items: [
    { to: '/research', key: 'nav.research', icon: ScanSearch, end: true, hotkey: 'g r', count: 'research', mobile: true },
    { to: '/research/mandates', key: 'nav.mandates', icon: Target, hotkey: 'g e' },
    { to: '/research/metrics', key: 'nav.researchMetrics', icon: ChartColumn },
  ] },
  { key: 'win', items: [
    { to: '/leads', key: 'nav.leads', icon: Radar, hotkey: 'g l' },
    { to: '/pipeline', key: 'nav.pipeline', icon: SquareKanban, hotkey: 'g p', mobile: true },
  ] },
  { key: 'clients', items: [
    { to: '/clients', key: 'nav.clients', icon: Building2, hotkey: 'g c', mobile: true },
    { to: '/documents', key: 'nav.documents', icon: FileText, hotkey: 'g o' },
    { to: '/network', key: 'nav.network', icon: Network, hotkey: 'g n' },
  ] },
  { key: 'manage', items: [
    { to: '/dashboard', key: 'nav.dashboard', icon: LayoutDashboard, hotkey: 'g d' },
    { to: '/settings', key: 'nav.settings', icon: Settings, hotkey: 'g s' },
  ] },
];

export const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);
