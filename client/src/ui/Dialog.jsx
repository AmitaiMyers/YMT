// Native <dialog> modal and side sheet: built-in focus trap + Esc; focus returns to the opener on close.
// Also provides promise-based confirm()/prompt() that replace window.confirm/window.prompt.

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button, IconButton } from './Button.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';

export function Dialog({ open, onClose, title, description, children, footer, variant = 'modal', width = 'max-w-lg' }) {
  const { t } = useI18n();
  const ref = useRef(null);
  const opener = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) {
      opener.current = document.activeElement;
      dialog.showModal();
      // React's autoFocus runs before the dialog is open, so the target is marked with data-autofocus instead.
      const target = dialog.querySelector('[data-autofocus]');
      if (target) target.focus();
    }
    if (!open && dialog.open) {
      dialog.close();
      if (opener.current && opener.current.isConnected) opener.current.focus();
    }
  }, [open]);

  const isSheet = variant === 'sheet';
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={`ui-dialog ${isSheet ? 'ui-sheet' : ''}`}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === ref.current) onClose(); }}
    >
      {open && (
        <div className={`flex flex-col bg-surface text-fg shadow-e3 animate-rise ${isSheet ? 'h-full' : `w-[calc(100vw-2rem)] ${width} max-h-[85dvh] rounded-[16px]`}`}>
          <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 id={titleId} className="text-[18px] font-semibold">{title}</h2>
              {description && <p id={descriptionId} className="mt-1 text-sm text-muted">{description}</p>}
            </div>
            <IconButton icon={X} label={t('common.close')} onClick={onClose} />
          </header>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

// ------------------------------------------------------------------ confirm / prompt

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const { t } = useI18n();
  const [request, setRequest] = useState(null);
  const [value, setValue] = useState('');

  const ask = useCallback((options) => new Promise((resolve) => {
    setValue('');
    setRequest({ ...options, resolve });
  }), []);

  function finish(result) {
    request.resolve(result);
    setRequest(null);
  }

  const isPrompt = request?.kind === 'prompt';
  const promptInvalid = isPrompt && value.length < (request.minLength ?? 1);

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <Dialog
        open={request !== null}
        onClose={() => finish(isPrompt ? null : false)}
        title={request?.title ?? ''}
        description={request?.body}
        footer={request && (
          <>
            <Button variant="secondary" offlineOk onClick={() => finish(isPrompt ? null : false)}>{t('common.cancel')}</Button>
            <Button
              variant={request.tone ?? 'primary'}
              disabled={promptInvalid}
              disabledReason={promptInvalid ? request.invalidReason : undefined}
              onClick={() => finish(isPrompt ? value : true)}
              data-autofocus={isPrompt ? undefined : 'true'}
            >
              {request.confirmLabel}
            </Button>
          </>
        )}
      >
        {isPrompt && (
          <label className="block text-sm font-medium">
            {request.label}
            <input
              data-autofocus="true"
              type={request.inputType ?? 'text'}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="mt-1 w-full rounded-[6px] border border-line-strong bg-surface px-3 py-2"
            />
          </label>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

function useAsk() {
  const ask = useContext(ConfirmContext);
  if (!ask) throw new Error('useConfirm/usePrompt must be used inside ConfirmProvider');
  return ask;
}

/** confirm({ title, body, confirmLabel, tone }) → Promise<boolean>. The body states the consequence. */
export function useConfirm() {
  const ask = useAsk();
  return useCallback((options) => ask({ ...options, kind: 'confirm' }), [ask]);
}

/** prompt({ title, label, confirmLabel, inputType, minLength, invalidReason }) → Promise<string | null>. */
export function usePrompt() {
  const ask = useAsk();
  return useCallback((options) => ask({ ...options, kind: 'prompt' }), [ask]);
}
