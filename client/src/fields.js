// Form field definitions, shared by create and edit screens.

import { useI18n } from './i18n/I18nProvider.jsx';
import { useEnumOptions } from './enumOptions.js';
import {
  INDIA_ACTIVITY, TRIGGER_TYPES, DEPARTMENTS, LANGUAGES, DEAL_MODELS, RESOURCE_TYPES, CHANNELS, DIRECTIONS,
} from '../../shared/enums.js';

export function useCompanyFields() {
  const { t } = useI18n();
  const options = useEnumOptions();
  return [
    { name: 'name', label: t('company.name'), type: 'text', required: true },
    { name: 'industry', label: t('company.industry'), type: 'text', required: true },
    { name: 'country', label: t('company.country'), type: 'text', required: true },
    { name: 'website', label: t('company.website'), type: 'url', advanced: true },
    { name: 'employee_count', label: t('company.employees'), type: 'number', advanced: true },
    { name: 'annual_revenue_usd', label: t('company.revenue'), type: 'number', advanced: true },
    { name: 'india_activity', label: t('company.indiaActivity'), type: 'select', required: true, options: options('indiaActivity', INDIA_ACTIVITY) },
    { name: 'export_markets', label: t('company.exportMarkets'), type: 'text', advanced: true },
    { name: 'exports', label: t('company.exports'), type: 'checkbox' },
    { name: 'is_client', label: t('company.isClient'), type: 'checkbox' },
    { name: 'notes', label: t('company.notes'), type: 'textarea', wide: true, advanced: true },
  ];
}

export const COMPANY_DEFAULTS = { country: 'Israel', india_activity: 'none', exports: false, is_client: false };

export function useTriggerFields() {
  const { t } = useI18n();
  const options = useEnumOptions();
  return [
    { name: 'type', label: t('trigger.type'), type: 'select', required: true, options: options('triggerType', TRIGGER_TYPES) },
    { name: 'detected_on', label: t('trigger.detectedOn'), type: 'date', required: true },
    { name: 'description', label: t('trigger.description'), type: 'text', required: true, wide: true },
    { name: 'source_url', label: t('trigger.sourceUrl'), type: 'url', required: true, wide: true, help: t('trigger.sourceHelp') },
  ];
}

export function useContactFields() {
  const { t } = useI18n();
  const options = useEnumOptions();
  return [
    { name: 'full_name', label: t('contact.fullName'), type: 'text', required: true },
    { name: 'job_title', label: t('contact.jobTitle'), type: 'text' },
    { name: 'department', label: t('contact.department'), type: 'select', required: true, options: options('department', DEPARTMENTS) },
    { name: 'preferred_language', label: t('contact.language'), type: 'select', required: true, options: options('language', LANGUAGES) },
    { name: 'email', label: t('contact.email'), type: 'email' },
    { name: 'phone', label: t('contact.phone'), type: 'text', help: t('contact.phoneHelp') },
    { name: 'country', label: t('contact.country'), type: 'text', help: t('contact.countryHelp') },
    { name: 'linkedin_url', label: t('contact.linkedin'), type: 'url', wide: true, advanced: true },
    { name: 'whatsapp_consent', label: t('contact.whatsappConsent'), type: 'checkbox', help: t('contact.whatsappConsentHelp') },
    { name: 'verified', label: t('contact.verified'), type: 'checkbox' },
    { name: 'verified_source', label: t('contact.verifiedSource'), type: 'text', help: t('contact.verifiedHelp') },
  ];
}

export const CONTACT_DEFAULTS = { department: 'sales', preferred_language: 'he', verified: false, whatsapp_consent: false };

export function useDealFields({ workflows, companies }) {
  const { t, language } = useI18n();
  const options = useEnumOptions();
  const fields = [
    { name: 'title', label: t('deal.title'), type: 'text', required: true },
    { name: 'workflow_id', label: t('deal.workflow'), type: 'select', required: true,
      options: workflows.filter((w) => w.active).map((w) => ({ value: String(w.id), label: language === 'he' ? w.name_he : w.name_en })) },
    { name: 'deal_model', label: t('deal.model'), type: 'select', required: true, options: options('dealModel', DEAL_MODELS) },
    { name: 'expected_value_usd', label: t('deal.expectedValue'), type: 'number' },
  ];
  if (!companies) return fields;
  return [{ name: 'company_id', label: t('company.name'), type: 'select', required: true,
    options: companies.map((c) => ({ value: String(c.id), label: c.name })) }, ...fields];
}

export function useInteractionFields(contacts) {
  const { t } = useI18n();
  const options = useEnumOptions();
  return [
    { name: 'channel', label: t('interaction.channel'), type: 'select', required: true, options: options('channel', CHANNELS) },
    { name: 'direction', label: t('interaction.direction'), type: 'select', required: true, options: options('direction', DIRECTIONS) },
    { name: 'occurred_at', label: t('interaction.occurredAt'), type: 'datetime', required: true },
    { name: 'contact_id', label: t('interaction.contact'), type: 'select', options: contacts.map((c) => ({ value: String(c.id), label: c.full_name })) },
    { name: 'summary', label: t('interaction.summary'), type: 'textarea', required: true, wide: true, rows: 3 },
  ];
}

export function useResourceFields() {
  const { t } = useI18n();
  const options = useEnumOptions();
  return [
    { name: 'type', label: t('resource.type'), type: 'select', required: true, options: options('resourceType', RESOURCE_TYPES) },
    { name: 'name', label: t('resource.name'), type: 'text', required: true },
    { name: 'country', label: t('company.country'), type: 'text', required: true },
    { name: 'city', label: t('resource.city'), type: 'text' },
    { name: 'industries', label: t('resource.industries'), type: 'text', required: true, help: t('resource.industriesHelp') },
    { name: 'certifications', label: t('resource.certifications'), type: 'text' },
    { name: 'capabilities', label: t('resource.capabilities'), type: 'textarea', wide: true, rows: 3 },
    { name: 'contact_name', label: t('resource.contactName'), type: 'text' },
    { name: 'email', label: t('contact.email'), type: 'email' },
    { name: 'phone', label: t('contact.phone'), type: 'text' },
    { name: 'website', label: t('company.website'), type: 'url', advanced: true },
    { name: 'rating', label: t('resource.rating'), type: 'number', min: 1 },
    { name: 'nda_signed', label: t('resource.ndaSigned'), type: 'checkbox' },
    { name: 'notes', label: t('company.notes'), type: 'textarea', wide: true, rows: 2 },
  ];
}

export const RESOURCE_DEFAULTS = { type: 'supplier', country: 'India', nda_signed: false };

/** Select values arrive as strings; convert listed id fields to integers before sending. */
export function withIds(values, idFields) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, idFields.includes(key) && value !== null ? Number(value) : value]));
}
