// Hover/focus tooltip. The trigger references it with aria-describedby (pass `id` through).

import { useId } from 'react';

export function Tooltip({ label, children, className = '' }) {
  const id = useId();
  if (!label) return children(undefined);
  return (
    <span className={`group/tip relative inline-flex ${className}`}>
      {children(id)}
      <span
        role="tooltip"
        id={id}
        className="pointer-events-none absolute bottom-full start-1/2 z-50 mb-2 w-max max-w-64 -translate-x-1/2 rtl:translate-x-1/2 rounded-md bg-fg px-2.5 py-1.5 text-[13px] leading-snug text-canvas opacity-0 shadow-e2 transition-opacity transition-ui group-hover/tip:opacity-100 group-focus-within/tip:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}
