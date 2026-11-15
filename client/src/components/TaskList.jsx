// Tasks & client commitments with a done checkbox.

import { Link } from 'react-router-dom';
import { useI18n, useFormat } from '../i18n/I18nProvider.jsx';
import { useAction } from '../hooks/useApi.js';
import { patch } from '../api.js';
import { Badge, Empty, ErrorBox } from './ui.jsx';

export function TaskList({ tasks, onChanged, showCompany = false }) {
  const { t } = useI18n();
  const format = useFormat();
  const toggle = useAction(async (task) => {
    await patch(`/tasks/${task.id}`, { done: !task.done });
    onChanged();
  });
  if (tasks.length === 0) return <Empty>{t('task.none')}</Empty>;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <ErrorBox message={toggle.error} />
      <ul className="divide-y divide-slate-100">
        {tasks.map((task) => (
          <li key={task.id} className="flex items-start gap-3 py-2 text-sm">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={Boolean(task.done)} disabled={toggle.busy} onChange={() => toggle.run(task)} aria-label={t('task.done')} />
            <div className={task.done ? 'text-slate-400 line-through' : ''}>
              <div>{task.description}</div>
              <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                <span>{t('task.assignee')}: {task.assignee}</span>
                {task.due_date && <span className={!task.done && task.due_date < today ? 'font-semibold text-red-600' : ''}>{t('task.due')}: {format.date(task.due_date)}</span>}
                {task.is_client_commitment ? <Badge color="amber">{t('task.commitment')}</Badge> : null}
                {showCompany && <Link className="text-brand-500" to={`/companies/${task.company_id}`}>{task.company_name}</Link>}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
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
