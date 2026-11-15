// Unified interaction timeline (phone / email / LinkedIn / meeting / note).

import { insert, update, findById } from './db.js';
import { badRequest } from './http.js';

/** Insert an interaction and keep the deal's "last activity" in sync. Returns the interaction id. */
export function recordInteraction(db, interaction) {
  if (interaction.deal_id) {
    const deal = findById(db, 'deals', interaction.deal_id);
    if (deal.company_id !== interaction.company_id) throw badRequest('Deal does not belong to this company');
    if (interaction.occurred_at > deal.last_activity_at) {
      update(db, 'deals', deal.id, { last_activity_at: interaction.occurred_at });
    }
  }
  if (interaction.contact_id) {
    const contact = findById(db, 'contacts', interaction.contact_id);
    if (contact.company_id !== interaction.company_id) throw badRequest('Contact does not belong to this company');
  }
  return insert(db, 'interactions', interaction);
}
