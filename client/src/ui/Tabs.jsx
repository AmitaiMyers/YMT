// WAI-ARIA tabs: roving focus, arrow keys (mirrored in RTL), Home/End.

import { useId, useRef } from 'react';
import { useI18n } from '../i18n/I18nProvider.jsx';

export function Tabs({ tabs, active, onChange, label, children, sticky = false }) {
  const { dir } = useI18n();
  const baseId = useId();
  const refs = useRef({});
  const index = tabs.findIndex((tab) => tab.key === active);
  if (index === -1) throw new Error(`Active tab "${active}" is not in tabs`);

  function focusTab(nextIndex) {
    const tab = tabs[(nextIndex + tabs.length) % tabs.length];
    onChange(tab.key);
    refs.current[tab.key].focus();
  }

  function onKeyDown(event) {
    const forward = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const backward = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    const moves = { [forward]: index + 1, [backward]: index - 1, Home: 0, End: tabs.length - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    focusTab(moves[event.key]);
  }

  return (
    <>
      <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className={`no-print mb-6 flex gap-1 overflow-x-auto border-b border-line ${sticky ? 'sticky top-14 z-20 bg-canvas/95 backdrop-blur md:top-0' : ''}`}>
        {tabs.map((tab) => {
          const selected = tab.key === active;
          return (
            <button
              key={tab.key}
              ref={(element) => { refs.current[tab.key] = element; }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.key}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.key)}
              className={`-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors transition-ui ${selected ? 'border-link text-fg' : 'border-transparent text-muted hover:text-fg'}`}
            >
              {tab.label}
              {tab.count > 0 && <span className="tabular rounded-full bg-sunken px-1.5 text-xs">{tab.count}</span>}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-tab-${active}`} tabIndex={0} className="animate-fade focus-visible:outline-offset-4">
        {children}
      </div>
    </>
  );
}
