// Who may see and act on a research card: its owner, or an admin.

import { forbidden } from '../http.js';

export const isAdmin = (user) => user.role === 'admin';

export function assertCanSee(user, opportunity) {
  if (!isAdmin(user) && opportunity.owner_id !== user.id) throw forbidden('This card belongs to another owner');
}
