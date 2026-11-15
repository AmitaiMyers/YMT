// Client-facing e-signature page reached through a link a YMT staff member shared manually.

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useLoad } from '../../hooks/useApi.js';
import { api } from '../../api.js';
import { Card, Loaded, Notice } from '../../components/ui.jsx';
import { SignatureForm, SignatureList } from '../../components/SignatureForm.jsx';
import { PublicLayout } from './PublicLayout.jsx';

export function PublicSignPage() {
  const { token } = useParams();
  const { t } = useI18n();
  const format = useFormat();
  const result = useLoad(`/public/sign/${token}`);
  const [signed, setSigned] = useState(false);

  return (
    <PublicLayout>
      <Loaded result={result}>
        {(document) => (
          <div className="space-y-6">
            <h1 className="text-2xl font-bold text-brand-900">{document.title}</h1>
            <p className="text-sm text-slate-500">{document.company_name}</p>
            {!document.integrity_ok && <Notice color="amber">{t('document.integrityBroken')}</Notice>}
            <Card>
              <pre dir={document.language === 'he' ? 'rtl' : 'ltr'} className="prose-pre text-sm">{document.content}</pre>
              <p className="mt-4 break-all text-xs text-slate-400">SHA-256: {document.content_hash}</p>
            </Card>
            {document.signatures.length > 0 && (
              <Card title={t('document.signatures')}>
                <SignatureList signatures={document.signatures} labels={{ ymt: 'YMT Group', client: t('document.client') }} formatDate={format.dateTime} />
              </Card>
            )}
            {signed || document.status === 'signed' ? <Notice>{t('sign.thankYou')}</Notice> : (
              <Card title={t('sign.title')}>
                <SignatureForm
                  askEmail
                  labels={{ name: t('sign.name'), email: t('sign.email'), drawHere: t('sign.drawHere'), consent: t('sign.consentClient'), sign: t('sign.sign'), clear: t('sign.clear') }}
                  onSign={async (payload) => {
                    await api('POST', `/public/sign/${token}`, payload);
                    setSigned(true);
                    result.reload();
                  }}
                />
              </Card>
            )}
          </div>
        )}
      </Loaded>
    </PublicLayout>
  );
}
