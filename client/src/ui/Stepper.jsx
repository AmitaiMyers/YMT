// Horizontal progress stepper (document lifecycle, post-meeting wizard).

import { Check } from 'lucide-react';

export function Stepper({ steps, current, label }) {
  return (
    <ol aria-label={label} className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-3">
      {steps.map((step, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'todo';
        return (
          <li key={step.key} aria-current={state === 'current' ? 'step' : undefined} className="flex items-center gap-2">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold transition-colors transition-ui ${
                state === 'done' ? 'bg-success text-white' : state === 'current' ? 'bg-primary text-on-primary' : 'bg-sunken text-subtle'
              }`}
            >
              {state === 'done' ? <Check aria-hidden="true" size={15} strokeWidth={3} className="animate-pop" /> : index + 1}
            </span>
            <span className={`text-sm ${state === 'todo' ? 'text-subtle' : 'font-medium text-fg'}`}>{step.label}</span>
            {index < steps.length - 1 && <span aria-hidden="true" className={`mx-1 h-px w-6 sm:w-10 ${state === 'done' ? 'bg-success' : 'bg-line-strong'}`} />}
          </li>
        );
      })}
    </ol>
  );
}
