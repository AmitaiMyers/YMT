// "Run agent" from the lead-flow board: pick one of YMT's agents, then how many companies and from which source.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot } from 'lucide-react';
import { useI18n, useFormat } from '../../i18n/I18nProvider.jsx';
import { useLoad } from '../../hooks/useApi.js';
import { Dialog, Loaded, SkeletonRows, Notice } from '../../ui/index.js';
import { RunForm } from '../research/MandatesPage.jsx';

export function AgentChoice({ agents, selectedId, onSelect }) {
  const { t } = useI18n();
  const format = useFormat();
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-fg">{t('flow.chooseAgent')}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {agents.map((agent) => {
          const ready = agent.status === 'active' && agent.owner_id !== null;
          const id = `agent-${agent.id}`;
          return (
            <label
              key={agent.id}
              htmlFor={id}
              className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-[10px] border p-3 text-sm transition-colors transition-ui ${
                selectedId === agent.id ? 'border-link bg-info-soft shadow-e1' : 'border-line-strong hover:bg-hover'
              } ${ready ? '' : 'cursor-not-allowed opacity-60'}`}
            >
              <input id={id} type="radio" name="agent" className="mt-1" checked={selectedId === agent.id} disabled={!ready} onChange={() => onSelect(agent.id)} />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 font-semibold text-fg"><Bot aria-hidden="true" size={15} className="text-link" />{agent.code}</span>
                <span className="block text-[13px] leading-snug text-muted"><bdi>{agent.name}</bdi></span>
                <span className="mt-0.5 block text-[12px] text-subtle">
                  {ready
                    ? `${agent.owner_name} · ${agent.last_run ? t('flow.lastRun', { date: format.date(agent.last_run.created_at), count: agent.last_run.cards_created }) : t('flow.neverRun')}`
                    : t('flow.agentNotReady')}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function RunAgentDialog({ onClose, onQueued }) {
  const { t } = useI18n();
  const agents = useLoad('/mandates');
  const [selectedId, setSelectedId] = useState(null);
  return (
    <Dialog open onClose={onClose} title={t('flow.runAgent')} description={t('flow.runAgentHint')} width="max-w-2xl">
      <Loaded result={agents} skeleton={<SkeletonRows rows={4} />}>
        {(list) => {
          const ready = list.filter((agent) => agent.status === 'active' && agent.owner_id !== null);
          const selected = list.find((agent) => agent.id === (selectedId ?? (ready.length === 1 ? ready[0].id : null))) ?? null;
          return (
            <div className="space-y-5">
              {ready.length === 0 && <Notice tone="signal">{t('flow.noAgentReady')} <Link className="text-link underline" to="/research/mandates">{t('nav.mandates')}</Link></Notice>}
              <AgentChoice agents={list} selectedId={selected ? selected.id : null} onSelect={setSelectedId} />
              {selected && (
                <div key={selected.id} className="animate-rise border-t border-line pt-4">
                  <RunForm mandate={selected} onCancel={onClose} onQueued={(run) => onQueued({ ...run, mandate_code: selected.code })} />
                </div>
              )}
            </div>
          );
        }}
      </Loaded>
    </Dialog>
  );
}
