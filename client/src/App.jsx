import { Navigate, Route, Routes } from 'react-router-dom';
import { I18nProvider } from './i18n/I18nProvider.jsx';
import { useAuth } from './auth/AuthProvider.jsx';
import { Layout } from './components/Layout.jsx';
import { Loading } from './components/ui.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { LeadsPage } from './pages/LeadsPage.jsx';
import { CompanyPage } from './pages/company/CompanyPage.jsx';
import { ApprovalsPage } from './pages/ApprovalsPage.jsx';
import { PipelinePage } from './pages/PipelinePage.jsx';
import { DealPage } from './pages/DealPage.jsx';
import { RemindersPage } from './pages/RemindersPage.jsx';
import { MeetingsPage } from './pages/meetings/MeetingsPage.jsx';
import { MeetingPrepPage } from './pages/meetings/MeetingPrepPage.jsx';
import { MeetingCompletePage } from './pages/meetings/MeetingCompletePage.jsx';
import { DocumentsPage } from './pages/documents/DocumentsPage.jsx';
import { DocumentPage } from './pages/documents/DocumentPage.jsx';
import { DirectoryPage } from './pages/DirectoryPage.jsx';
import { SettingsPage } from './pages/settings/SettingsPage.jsx';
import { PublicSignPage } from './pages/public/PublicSignPage.jsx';
import { PublicSharePage } from './pages/public/PublicSharePage.jsx';

function StaffApp() {
  const { user, checked } = useAuth();
  if (!checked) return <Loading />;
  if (!user) return <LoginPage />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="leads" element={<LeadsPage />} />
        <Route path="companies/:id" element={<CompanyPage />} />
        <Route path="approvals" element={<ApprovalsPage />} />
        <Route path="pipeline" element={<PipelinePage />} />
        <Route path="deals/:id" element={<DealPage />} />
        <Route path="reminders" element={<RemindersPage />} />
        <Route path="meetings" element={<MeetingsPage />} />
        <Route path="meetings/:id/prep" element={<MeetingPrepPage />} />
        <Route path="meetings/:id/complete" element={<MeetingCompletePage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="documents/:id" element={<DocumentPage />} />
        <Route path="directory" element={<DirectoryPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

// Exactly one I18nProvider is mounted per route branch, because each one controls <html dir/lang>.
export function App() {
  return (
    <Routes>
      {/* External pages: no login. Foreign partners default to English; signers keep their last choice. */}
      <Route path="/share/:token" element={<I18nProvider initialLanguage="en" persist={false}><PublicSharePage /></I18nProvider>} />
      <Route path="/sign/:token" element={<I18nProvider><PublicSignPage /></I18nProvider>} />
      <Route path="/*" element={<I18nProvider><StaffApp /></I18nProvider>} />
    </Routes>
  );
}
