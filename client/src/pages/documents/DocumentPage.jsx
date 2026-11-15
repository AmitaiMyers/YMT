// Document lifecycle with a stepper: Draft → Final → YMT signed → Client signed.
// Finalize freezes the text (SHA-256 seal); signing and finalizing are confirmed explicitly.

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Printer, Save, Lock, Trash2, ShieldCheck, ShieldAlert, Link2, Eye, EyeOff } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../../hooks/useApi.js';
import { patch, post, del } from '../../api.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { Card, Loaded, PageHeader, Button, ErrorBox, Notice, StatusBadge, statusTone, Stepper, GeneratedText, Skeleton, useConfirm, useToast } from '../../ui/index.js';
import { INPUT_CLASS } from '../../components/EntityForm.jsx';
import { CopyButton } from '../../components/CopyButton.jsx';
import { SignatureForm, SignatureList } from '../../components/SignatureForm.jsx';

const FIELD_CLASS = `${INPUT_CLASS} border-line-strong`;

// Lifecycle steps. The YMT signature is optional in the signing model, so it is shown on the page, not as a step.
const LIFECYCLE = ['draft', 'final', 'clientSigned'];
const STEP_BY_STATUS = { draft: 0, finalized: 1, signed: LIFECYCLE.length };

export function useSignatureLabels() {
  const { t } = useI18n();
  return {
    name: t('sign.name'), email: t('sign.email'), drawHere: t('sign.drawHere'), sign: t('sign.sign'), signing: t('sign.signing'),
    clear: t('sign.clear'), confirmTitle: t('sign.confirmTitle'), confirmBody: t('sign.confirmBody'),
  };
}

function DraftEditor({ document, reload }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const [title, setTitle] = useState(document.title);
  const [content, setContent] = useState(document.content);
  const changed = title !== document.title || content !== document.content;
  const save = useAction(async () => {
    await patch(`/documents/${document.id}`, { title, content });
    toast({ title: t('toast.saved') });
    reload();
  });
  const finalize = useAction(async () => {
    const ok = await confirm({ title: t('document.finalize'), body: t('document.confirmFinalize'), confirmLabel: t('document.finalize'), tone: 'primary' });
    if (!ok) return;
    await post(`/documents/${document.id}/finalize`);
    toast({ title: t('toast.finalized') });
    reload();
  });
  const remove = useAction(async () => {
    const ok = await confirm({ title: t('document.deleteTitle'), body: t('document.deleteBody', { title: document.title }), confirmLabel: t('common.delete'), tone: 'danger' });
    if (!ok) return;
    await del(`/documents/${document.id}`);
    toast({ title: t('toast.deleted') });
    navigate(`/companies/${document.company_id}`);
  });
  return (
    <Card title={t('document.editDraft')}>
      <ErrorBox message={save.error ?? finalize.error ?? remove.error} />
      <label className="mb-4 block text-sm font-medium">{t('document.title')}
        <input dir="auto" className={`${FIELD_CLASS} mt-1.5`} value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="block text-sm font-medium">{t('document.content')}
        <textarea dir={document.language === 'he' ? 'rtl' : 'ltr'} lang={document.language} rows={18} className={`${FIELD_CLASS} mt-1.5 leading-relaxed ${changed ? 'border-signal' : ''}`} value={content} onChange={(e) => setContent(e.target.value)} />
      </label>
      {changed && <p className="mt-1.5 text-[13px] font-medium text-signal-fg">{t('approval.unsaved')}</p>}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
        <Button icon={Lock} loading={finalize.busy} disabled={changed || !content.trim()} disabledReason={changed ? t('document.saveBeforeFinalize') : t('document.emptyContent')} onClick={finalize.run}>{t('document.finalize')}</Button>
        <Button variant="secondary" icon={Save} loading={save.busy} disabled={!changed} disabledReason={t('approval.nothingToSave')} onClick={save.run}>{t('common.save')}</Button>
        <Button variant="ghost" icon={Trash2} className="ms-auto text-danger-fg" loading={remove.busy} onClick={remove.run}>{t('common.delete')}</Button>
      </div>
    </Card>
  );
}

function FinalizedView({ document, reload }) {
  const { t } = useI18n();
  const format = useFormat();
  const toast = useToast();
  const { user } = useAuth();
  const signatureLabels = useSignatureLabels();
  const signLink = `${window.location.origin}/sign/${document.sign_token}`;
  const toggleShare = useAction(async () => {
    await patch(`/documents/${document.id}`, { shareable: !document.shareable });
    toast({ title: document.shareable ? t('document.sharingOff') : t('document.sharingOn') });
    reload();
  });
  const hasYmtSignature = document.signatures.some((s) => s.signer_role === 'ymt');

  return (
    <div className="space-y-6">
      <Card title={t('document.content')} actions={<Button variant="secondary" size="sm" icon={Printer} offlineOk onClick={() => window.print()}>{t('common.print')}</Button>}>
        <div className={`mb-5 flex items-start gap-2 rounded-[6px] px-3 py-2 text-sm ${document.integrity_ok ? 'bg-success-soft text-success-fg' : 'bg-danger-soft text-danger-fg'}`} role={document.integrity_ok ? undefined : 'alert'}>
          {document.integrity_ok ? <ShieldCheck aria-hidden="true" size={18} className="animate-pop mt-0.5 shrink-0" /> : <ShieldAlert aria-hidden="true" size={18} className="mt-0.5 shrink-0" />}
          <div className="min-w-0">
            <div className="font-medium">{document.integrity_ok ? t('document.integrityOk') : t('document.integrityBroken')}</div>
            <code dir="ltr" className="block break-all text-xs opacity-80">SHA-256 {document.content_hash}</code>
          </div>
        </div>
        <div className="rounded-[6px] border border-line bg-white p-6 text-slate-900 shadow-e1">
          <GeneratedText text={document.content} language={document.language} className="!text-slate-900" />
          {document.signatures.length > 0 && (
            <div className="mt-8 border-t border-slate-200 pt-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-700">{t('document.signatures')}</h3>
              <SignatureList signatures={document.signatures} labels={{ ymt: 'YMT Group', client: t('document.client') }} formatDate={format.dateTime} />
            </div>
          )}
        </div>
      </Card>

      <div className="no-print grid gap-6 lg:grid-cols-2">
        <Card title={t('document.clientSigning')}>
          {document.status === 'signed' ? <Notice icon={ShieldCheck}>{t('document.signedByClient')}</Notice> : (
            <>
              <Notice tone="signal" icon={Link2}>{t('document.signLinkHelp')}</Notice>
              <CopyButton text={signLink} label={t('document.copySignLink')} />
            </>
          )}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm">
            <div>
              <div className="font-medium">{t('document.shareable')}</div>
              <div className="text-[13px] text-subtle">{t('document.shareableHelp')}</div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon={document.shareable ? EyeOff : Eye}
              role="switch"
              aria-checked={Boolean(document.shareable)}
              loading={toggleShare.busy}
              onClick={toggleShare.run}
            >
              {document.shareable ? t('document.stopSharing') : t('document.allowSharing')}
            </Button>
          </div>
          <ErrorBox message={toggleShare.error} />
        </Card>
        {!hasYmtSignature && (
          <Card title={t('document.signAsYmt')}>
            <SignatureForm
              defaultName={user.display_name}
              labels={{ ...signatureLabels, consent: t('sign.consentYmt') }}
              onSign={async (payload) => {
                await post(`/documents/${document.id}/sign`, payload);
                toast({ title: t('toast.signed') });
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
  const steps = LIFECYCLE.map((key) => ({ key, label: t(`document.step.${key}`) }));
  return (
    <Loaded result={result} skeleton={<div className="space-y-4"><Skeleton className="h-9 w-80" /><Skeleton className="h-96 rounded-[10px]" /></div>}>
      {(document) => (
        <>
          <PageHeader
            eyebrow={<Link className="text-link underline" to={`/companies/${document.company_id}`}><bdi>{document.company_name}</bdi></Link>}
            title={document.title}
            subtitle={
              <span className="flex flex-wrap items-center gap-2">
                <span>{t(`documentKind.${document.kind}`)} · {t(`language.${document.language}`)}</span>
                <StatusBadge tone={statusTone('document', document.status)}>{t(`documentStatus.${document.status}`)}</StatusBadge>
              </span>
            }
          />
          <Stepper label={t('document.lifecycle')} current={STEP_BY_STATUS[document.status]} steps={steps} />
          {document.status === 'draft'
            ? <DraftEditor key={document.content} document={document} reload={result.reload} />
            : <FinalizedView document={document} reload={result.reload} />}
        </>
      )}
    </Loaded>
  );
}
