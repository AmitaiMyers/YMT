// Client-facing e-signature page reached through a link a YMT staff member shared manually.

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ShieldCheck, ShieldAlert, PartyPopper } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useLoad } from '../../hooks/useApi.js';
import { api } from '../../api.js';
import { Card, Loaded, Notice, GeneratedText, EmptyState, usePageTitle } from '../../ui/index.js';
import { SignatureForm, SignatureList } from '../../components/SignatureForm.jsx';
import { useSignatureLabels } from '../documents/DocumentPage.jsx';
import { PublicLayout } from './PublicLayout.jsx';

export function PublicSignPage() {
  const { token } = useParams();
  const { t } = useI18n();
  const format = useFormat();
  const labels = useSignatureLabels();
  const result = useLoad(`/public/sign/${token}`);
  const [signed, setSigned] = useState(false);
  usePageTitle(t('sign.title'));

  return (
    <PublicLayout>
      <Loaded result={result}>
        {(document) => (
          <div className="space-y-6">
            <div>
              <bdi className="text-[13px] text-subtle">{document.company_name}</bdi>
              <h1 className="text-2xl font-bold"><bdi>{document.title}</bdi></h1>
            </div>
            {document.integrity_ok
              ? <Notice icon={ShieldCheck}>{t('sign.integrityNote')}</Notice>
              : <Notice tone="signal" icon={ShieldAlert}>{t('document.integrityBroken')}</Notice>}
            <div className="rounded-[10px] border border-line bg-white p-6 text-slate-900 shadow-e1">
              <GeneratedText text={document.content} language={document.language} className="!text-slate-900" />
              <p dir="ltr" className="mt-6 break-all text-xs text-slate-500">SHA-256 {document.content_hash}</p>
              {document.signatures.length > 0 && (
                <div className="mt-6 border-t border-slate-200 pt-4">
                  <SignatureList signatures={document.signatures} labels={{ ymt: 'YMT Group', client: t('document.client') }} formatDate={format.dateTime} />
                </div>
              )}
            </div>
            {signed || document.status === 'signed' ? (
              <Card><EmptyState icon={PartyPopper} title={t('sign.thankYou')}>{t('sign.thankYouHint')}</EmptyState></Card>
            ) : (
              <Card title={t('sign.title')}>
                <SignatureForm
                  askEmail
                  labels={{ ...labels, consent: t('sign.consentClient') }}
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
