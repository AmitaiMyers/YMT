// Minimal branded frame for pages opened by external clients/partners (no login, no navigation).

import { LanguageSwitch } from '../../components/Layout.jsx';

export function PublicLayout({ children }) {
  return (
    <div className="min-h-full">
      <header className="no-print bg-brand-900 px-4 py-3 text-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <span className="text-lg font-bold">YMT Group</span>
          <LanguageSwitch />
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-4 md:p-8">{children}</main>
    </div>
  );
}
