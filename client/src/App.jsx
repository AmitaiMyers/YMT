import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { I18nProvider } from './i18n/I18nProvider.jsx';
import { useAuth } from './auth/AuthProvider.jsx';
import { ConfirmProvider, ToastProvider, Skeleton } from './ui/index.js';
import { AppShell } from './app/AppShell.jsx';
import { CountsProvider } from './app/CountsProvider.jsx';
import { LoginPage } from './pages/LoginPage.jsx';

// Route-level code splitting: each screen downloads on first visit (fast first load on phones).
const InboxPage = lazy(() => import('./pages/inbox/InboxPage.jsx').then((module) => ({ default: module.InboxPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx').then((module) => ({ default: module.DashboardPage })));
const LeadsPage = lazy(() => import('./pages/LeadsPage.jsx').then((module) => ({ default: module.LeadsPage })));
const ClientsPage = lazy(() => import('./pages/clients/ClientsPage.jsx').then((module) => ({ default: module.ClientsPage })));
const CompanyPage = lazy(() => import('./pages/company/CompanyPage.jsx').then((module) => ({ default: module.CompanyPage })));
const ApprovalsPage = lazy(() => import('./pages/ApprovalsPage.jsx').then((module) => ({ default: module.ApprovalsPage })));
const PipelinePage = lazy(() => import('./pages/PipelinePage.jsx').then((module) => ({ default: module.PipelinePage })));
const DealPage = lazy(() => import('./pages/DealPage.jsx').then((module) => ({ default: module.DealPage })));
const CalendarPage = lazy(() => import('./pages/calendar/CalendarPage.jsx').then((module) => ({ default: module.CalendarPage })));
const MeetingPrepPage = lazy(() => import('./pages/calendar/MeetingPrepPage.jsx').then((module) => ({ default: module.MeetingPrepPage })));
const MeetingCompletePage = lazy(() => import('./pages/calendar/MeetingCompletePage.jsx').then((module) => ({ default: module.MeetingCompletePage })));
const DocumentsPage = lazy(() => import('./pages/documents/DocumentsPage.jsx').then((module) => ({ default: module.DocumentsPage })));
const DocumentPage = lazy(() => import('./pages/documents/DocumentPage.jsx').then((module) => ({ default: module.DocumentPage })));
const NetworkPage = lazy(() => import('./pages/NetworkPage.jsx').then((module) => ({ default: module.NetworkPage })));
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage.jsx').then((module) => ({ default: module.SettingsPage })));
const PublicSignPage = lazy(() => import('./pages/public/PublicSignPage.jsx').then((module) => ({ default: module.PublicSignPage })));
const PublicSharePage = lazy(() => import('./pages/public/PublicSharePage.jsx').then((module) => ({ default: module.PublicSharePage })));

function Splash() {
  return <div className="flex min-h-dvh items-center justify-center bg-sidebar"><Skeleton className="h-11 w-11 rounded-[10px] opacity-40" /></div>;
}

function StaffApp() {
  const { user, checked } = useAuth();
  if (!checked) return <Splash />;
  if (!user) return <LoginPage />;
  return (
    <CountsProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<InboxPage />} />
          <Route path="approvals" element={<ApprovalsPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="meetings/:id/prep" element={<MeetingPrepPage />} />
          <Route path="meetings/:id/complete" element={<MeetingCompletePage />} />
          <Route path="leads" element={<LeadsPage />} />
          <Route path="pipeline" element={<PipelinePage />} />
          <Route path="deals/:id" element={<DealPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="companies/:id" element={<CompanyPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="documents/:id" element={<DocumentPage />} />
          <Route path="network" element={<NetworkPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="settings" element={<SettingsPage />} />
          {/* Old addresses from the first release keep working. */}
          <Route path="reminders" element={<Navigate to="/" replace />} />
          <Route path="meetings" element={<Navigate to="/calendar" replace />} />
          <Route path="directory" element={<Navigate to="/network" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </CountsProvider>
  );
}

/** Feedback layers (toasts, confirm dialogs) need the language, so they live inside each I18nProvider. */
function WithLanguage({ children, ...props }) {
  return (
    <I18nProvider {...props}>
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </I18nProvider>
  );
}

// Exactly one I18nProvider is mounted per route branch, because each one controls <html dir/lang>.
export function App() {
  return (
    <Routes>
      {/* External pages: no login. Foreign partners default to English; signers keep their last choice. */}
      <Route path="/share/:token" element={<WithLanguage initialLanguage="en" persist={false}><Suspense fallback={<Splash />}><PublicSharePage /></Suspense></WithLanguage>} />
      <Route path="/sign/:token" element={<WithLanguage><Suspense fallback={<Splash />}><PublicSignPage /></Suspense></WithLanguage>} />
      <Route path="/*" element={<WithLanguage><StaffApp /></WithLanguage>} />
    </Routes>
  );
}
