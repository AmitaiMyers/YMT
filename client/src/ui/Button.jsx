// Buttons: variants, sizes, loading, explained-disabled (focusable + tooltip) and offline awareness.

import { Link } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import { Tooltip } from './Tooltip.jsx';
import { useOnline } from './online.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';

const VARIANTS = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover shadow-e1',
  secondary: 'bg-surface text-fg border border-line-strong hover:bg-hover',
  ghost: 'text-muted hover:bg-hover hover:text-fg',
  success: 'bg-success text-white hover:brightness-110 shadow-e1',
  danger: 'bg-danger text-white hover:brightness-110 shadow-e1',
};
// Variants that commit something to the server; they are blocked while offline.
const NETWORK_VARIANTS = ['primary', 'success', 'danger'];
const SIZES = {
  sm: 'min-h-9 sm:min-h-8 px-2.5 text-[13px] gap-1.5',
  md: 'min-h-11 sm:min-h-10 px-4 text-sm gap-2',
};
const BASE = 'inline-flex select-none items-center justify-center rounded-[6px] font-medium transition-[background-color,color,box-shadow,transform,filter] transition-ui active:scale-[.98]';
const BLOCKED = 'opacity-45 cursor-not-allowed active:scale-100';

export function buttonClasses({ variant = 'secondary', size = 'md', className = '' } = {}) {
  if (!VARIANTS[variant]) throw new Error(`Unknown button variant: ${variant}`);
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`;
}

/**
 * @param {object} props
 * @param {'primary'|'secondary'|'ghost'|'success'|'danger'} [props.variant]
 * @param {import('react').ComponentType} [props.icon]
 * @param {boolean} [props.loading] shows a spinner and `loadingLabel`, keeps the width
 * @param {string} [props.disabledReason] keeps the button focusable and explains why it is unavailable
 */
export function Button({
  variant = 'primary', size = 'md', icon: Icon, loading = false, loadingLabel, disabled = false, disabledReason,
  offlineOk = false, className = '', type = 'button', onClick, children, ...rest
}) {
  const { t } = useI18n();
  const online = useOnline();
  const offlineBlocked = !online && !offlineOk && NETWORK_VARIANTS.includes(variant);
  const reason = offlineBlocked ? t('app.offlineAction') : (disabled ? disabledReason : undefined);
  const blocked = disabled || loading || offlineBlocked;

  return (
    <Tooltip label={reason}>
      {(tooltipId) => (
        <button
          type={type}
          // With a reason the button stays focusable (aria-disabled) so keyboard users can read why.
          disabled={blocked && !reason}
          aria-disabled={blocked ? 'true' : undefined}
          aria-describedby={tooltipId}
          aria-busy={loading ? 'true' : undefined}
          onClick={(event) => {
            if (blocked) {
              event.preventDefault();
              return;
            }
            if (onClick) onClick(event);
          }}
          className={`${buttonClasses({ variant, size, className })} ${blocked ? BLOCKED : ''}`}
          {...rest}
        >
          {loading ? <LoaderCircle aria-hidden="true" size={16} className="animate-spin-ui" /> : Icon && <Icon aria-hidden="true" size={16} />}
          <span className="inline-flex items-center gap-2">{loading && loadingLabel ? loadingLabel : children}</span>
        </button>
      )}
    </Tooltip>
  );
}

export function IconButton({ icon: Icon, label, variant = 'ghost', className = '', ...rest }) {
  if (!label) throw new Error('IconButton requires an accessible label');
  return (
    <Tooltip label={label}>
      {(tooltipId) => (
        <button type="button" aria-label={label} aria-describedby={tooltipId} className={`${buttonClasses({ variant, size: 'md', className })} !px-0 w-11 sm:w-10`} {...rest}>
          <Icon aria-hidden="true" size={18} />
        </button>
      )}
    </Tooltip>
  );
}

export function ButtonLink({ to, variant = 'secondary', size = 'md', icon: Icon, className = '', children }) {
  return (
    <Link to={to} className={buttonClasses({ variant, size, className })}>
      {Icon && <Icon aria-hidden="true" size={16} />}
      <span>{children}</span>
    </Link>
  );
}
