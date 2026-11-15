// Document lifecycle: edit draft → finalize (freeze + hash) → sign (YMT and/or client) → share.

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../../hooks/useApi.js';
import { patch, post, del } from '../../api.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Card, Loaded, PageHeader, Button, ErrorBox, Notice, Badge } from '../../components/ui.jsx';
import { INPUT_CLASS } from '../../components/EntityForm.jsx';
import { CopyButton } from '../../components/CopyButton.jsx';
import { SignatureForm, SignatureList } from '../../components/SignatureForm.jsx';

function DraftEditor({ document, reload }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [title, setTitle] = useState(document.title);
  const [content, setContent] = useState(document.content);
  const changed = title !== document.title || content !== document.content;
  const save = useAction(async () => {
    await patch(`/documents/${document.id}`, { title, content });
    reload();
  });
  const finalize = useAction(async () => {
    await post(`/documents/${document.id}/finalize`);
    reload();
  });
  const remove = useAction(async () => {
    await del(`/documents/${document.id}`);
    navigate(`/companies/${document.company_id}`);
  });
  return (
    <Card title={t('document.editDraft')}>
      <ErrorBox message={save.error ?? finalize.error ?? remove.error} />
      <input className={`${INPUT_CLASS} mb-3`} value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea dir={document.language === 'he' ? 'rtl' : 'ltr'} rows={18} className={`${INPUT_CLASS}`} value={content} onChange={(e) => setContent(e.target.value)} />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" disabled={!changed || save.busy} onClick={save.run}>{t('common.save')}</Button>
        <Button disabled={changed || finalize.busy} onClick={() => window.confirm(t('document.confirmFinalize')) && finalize.run()}>{t('document.finalize')}</Button>
        <Button variant="danger" onClick={() => window.confirm(t('common.confirmDelete')) && remove.run()}>{t('common.delete')}</Button>
      </div>
      {changed && <p className="mt-2 text-xs text-amber-700">{t('document.saveBeforeFinalize')}</p>}
    </Card>
  );
}

function FinalizedView({ document, reload }) {
  const { t } = useI18n();
  const format = useFormat();
  const { user } = useAuth();
  const signLink = `${window.location.origin}/sign/${document.sign_token}`;
  const toggleShare = useAction(async () => {
    await patch(`/documents/${document.id}`, { shareable: !document.shareable });
    reload();
  });
  const hasYmtSignature = document.signatures.some((s) => s.signer_role === 'ymt');
  const signatureLabels = { ymt: 'YMT Group', client: t('document.client') };

  return (
    <div className="space-y-6">
      <Card title={t('document.content')} actions={<Button variant="secondary" onClick={() => window.print()}>{t('common.print')}</Button>}>
        {document.integrity_ok
          ? <Notice>{t('document.integrityOk')} <code className="break-all text-xs">{document.content_hash}</code></Notice>
          : <Notice color="amber">{t('document.integrityBroken')}</Notice>}
        <pre dir={document.language === 'he' ? 'rtl' : 'ltr'} className="prose-pre text-sm">{document.content}</pre>
        {document.signatures.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-2 text-sm font-semibold">{t('document.signatures')}</h3>
            <SignatureList signatures={document.signatures} labels={signatureLabels} formatDate={format.dateTime} />
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2 no-print">
        <Card title={t('document.clientSigning')}>
          {document.status === 'signed' ? <Notice>{t('document.signedByClient')}</Notice> : (
            <>
              <Notice color="amber">{t('document.signLinkHelp')}</Notice>
              <div className="flex flex-wrap gap-2">
                <CopyButton text={signLink} label={t('document.copySignLink')} />
              </div>
            </>
          )}
          <div className="mt-4 flex items-center gap-2 text-sm">
            <ErrorBox message={toggleShare.error} />
            <span>{t('document.shareable')}: <Badge color={document.shareable ? 'green' : 'gray'}>{document.shareable ? t('common.yes') : t('common.no')}</Badge></span>
            <Button variant="secondary" className="!px-2 !py-1 text-xs" disabled={toggleShare.busy} onClick={toggleShare.run}>{t('document.toggleShare')}</Button>
          </div>
        </Card>
        {!hasYmtSignature && (
          <Card title={t('document.signAsYmt')}>
            <SignatureForm
              defaultName={user.display_name}
              labels={{ name: t('sign.name'), email: t('sign.email'), drawHere: t('sign.drawHere'), consent: t('sign.consentYmt'), sign: t('sign.sign'), clear: t('sign.clear') }}
              onSign={async (payload) => {
                await post(`/documents/${document.id}/sign`, payload);
                reload();
              }}
            />
          </Card>
        )}
      </div>
    </div>
  );
}

export function DocumentPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const result = useLoad(`/documents/${id}`);
  return (
    <Loaded result={result}>
      {(document) => (
        <>
          <PageHeader
            title={document.title}
            subtitle={
              <span className="flex flex-wrap items-center gap-2">
                <Link className="text-brand-500 underline" to={`/companies/${document.company_id}`}>{document.company_name}</Link>
                <span>· {t(`documentKind.${document.kind}`)} · {t(`language.${document.language}`)}</span>
                <Badge color={document.status === 'signed' ? 'green' : 'amber'}>{t(`documentStatus.${document.status}`)}</Badge>
              </span>
            }
          />
          {document.status === 'draft'
            ? <DraftEditor key={document.content} document={document} reload={result.reload} />
            : <FinalizedView document={document} reload={result.reload} />}
        </>
      )}
    </Loaded>
  );
}
