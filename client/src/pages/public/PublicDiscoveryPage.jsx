// Release 5: the client discovery form, opened from a personal link (no login). The client sees only YMT's questions
// and their own company name, answers in Hebrew or English, and can send once.

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PartyPopper, Send } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useLoad, useAction } from '../../hooks/useApi.js';
import { api } from '../../api.js';
import { Card, Loaded, Button, ErrorBox, EmptyState, Notice, usePageTitle } from '../../ui/index.js';
import { INPUT_CLASS } from '../../components/EntityForm.jsx';
import { PublicLayout } from './PublicLayout.jsx';

const FIELD_CLASS = `${INPUT_CLASS} border-line-strong mt-1.5`;

function DiscoveryForm({ token, form, onSent }) {
  const { t, language, setLanguage } = useI18n();
  const [name, setName] = useState('');
  const [answers, setAnswers] = useState({});
  // The link was made in the client's language; they can still switch with the button at the top.
  useEffect(() => setLanguage(form.language), []); // eslint-disable-line react-hooks/exhaustive-deps
  const send = useAction(async () => {
    await api('POST', `/public/discovery/${token}`, { name, language, answers });
    onSent();
  });
  const missing = form.questions.filter((question) => question.required && !(answers[question.id] ?? '').trim());
  const reason = !name.trim() ? t('discovery.public.needName') : missing.length > 0 ? t('discovery.public.needRequired') : undefined;
  return (
    <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); send.run(); }}>
      {form.questions.map((question, index) => {
        const id = `question-${question.id}`;
        const Input = question.answer_kind === 'long' ? 'textarea' : 'input';
        return (
          <label key={question.id} htmlFor={id} className="block text-sm font-medium">
            {index + 1}. {language === 'he' ? question.question_he : question.question_en}
            {question.required ? <span className="text-danger-fg" aria-hidden="true"> *</span> : null}
            <Input id={id} dir="auto" required={Boolean(question.required)} rows={question.answer_kind === 'long' ? 4 : undefined}
              className={FIELD_CLASS} value={answers[question.id] ?? ''} onChange={(event) => setAnswers({ ...answers, [question.id]: event.target.value })} />
          </label>
        );
      })}
      <label htmlFor="discovery-name" className="block text-sm font-medium">
        {t('discovery.public.name')}<span className="text-danger-fg" aria-hidden="true"> *</span>
        <input id="discovery-name" dir="auto" required autoComplete="name" className={FIELD_CLASS} value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <ErrorBox message={send.error} />
      <Button type="submit" icon={Send} loading={send.busy} disabled={reason !== undefined} disabledReason={reason}>{t('discovery.public.send')}</Button>
    </form>
  );
}

export function PublicDiscoveryPage() {
  const { token } = useParams();
  const { t } = useI18n();
  const result = useLoad(`/public/discovery/${token}`);
  const [sent, setSent] = useState(false);
  usePageTitle(t('discovery.public.title'));
  return (
    <PublicLayout>
      <Loaded result={result}>
        {(form) => (
          <div className="space-y-6">
            <div>
              <bdi className="text-[13px] text-subtle">{form.company_name}</bdi>
              <h1 className="text-2xl font-bold">{t('discovery.public.title')}</h1>
            </div>
            {sent || form.submitted ? (
              <Card><EmptyState icon={PartyPopper} title={t('discovery.public.thankYou')}>{t('discovery.public.thankYouHint')}</EmptyState></Card>
            ) : (
              <>
                <Notice>{t('discovery.public.intro')}</Notice>
                <Card><DiscoveryForm token={token} form={form} onSent={() => setSent(true)} /></Card>
              </>
            )}
          </div>
        )}
      </Loaded>
    </PublicLayout>
  );
}
