// Tasks & client commitments. Toggling "done" is optimistic with an Undo toast.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ListChecks } from 'lucide-react';
import { useI18n, useFormat } from '../i18n/I18nProvider.jsx';
import { patch } from '../api.js';
import { Badge, EmptyState, useToast } from '../ui/index.js';

export function TaskList({ tasks, onChanged, showCompany = false }) {
  const { t } = useI18n();
  const format = useFormat();
  const toast = useToast();
  const [overrides, setOverrides] = useState({});
  const today = new Date().toISOString().slice(0, 10);

  async function setDone(task, done, { undoable }) {
    setOverrides((current) => ({ ...current, [task.id]: done }));
    const saved = await patch(`/tasks/${task.id}`, { done }).then(() => true, (error) => {
      setOverrides(({ [task.id]: rolledBack, ...rest }) => rest);
      toast({ tone: 'error', title: t('toast.failed'), body: error.message });
      return false;
    });
    if (!saved) return;
    if (undoable) {
      toast({
        title: done ? t('task.markedDone') : t('task.markedOpen'),
        action: { label: t('common.undo'), onClick: () => setDone(task, !done, { undoable: false }) },
        duration: 6000,
      });
    }
    onChanged();
  }

  if (tasks.length === 0) return <EmptyState icon={ListChecks} title={t('task.none')} />;
  return (
    <ul className="divide-y divide-line">
      {tasks.map((task) => {
        const done = task.id in overrides ? overrides[task.id] : Boolean(task.done);
        const overdue = !done && task.due_date && task.due_date < today;
        return (
          <li key={task.id} className="flex items-start gap-3 py-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[var(--success)]"
              checked={done}
              onChange={() => setDone(task, !done, { undoable: true })}
              aria-label={`${t('task.done')}: ${task.description}`}
            />
            <div className={`min-w-0 flex-1 transition-opacity transition-ui ${done ? 'opacity-55' : ''}`}>
              <div dir="auto" className={done ? 'line-through' : ''}>{task.description}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-subtle">
                <span>{t('task.assignee')}: <bdi>{task.assignee}</bdi></span>
                {task.due_date && <span className={overdue ? 'font-semibold text-danger-fg' : ''}>{t('task.due')}: {format.date(task.due_date)}</span>}
                {task.is_client_commitment ? <Badge tone="signal">{t('task.commitment')}</Badge> : null}
                {showCompany && task.company_id && <Link className="text-link underline" to={`/companies/${task.company_id}`}><bdi>{task.company_name}</bdi></Link>}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function useTaskFields() {
  const { t } = useI18n();
  return [
    { name: 'description', label: t('task.description'), type: 'text', required: true, wide: true },
    { name: 'assignee', label: t('task.assignee'), type: 'text', required: true },
    { name: 'due_date', label: t('task.due'), type: 'date' },
    { name: 'is_client_commitment', label: t('task.commitment'), type: 'checkbox' },
  ];
}
