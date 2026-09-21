import type { Language } from './clinic';
const brands = {
  salesforce: { name: 'Salesforce', asset: 'salesforce.svg', href: 'https://www.salesforce.com/healthcare-life-sciences/health-cloud/' },
  hubspot: { name: 'HubSpot', asset: 'hubspot.svg', href: 'https://www.hubspot.com/' },
  zoho: { name: 'Zoho', asset: 'zoho.png', href: 'https://www.zoho.com/crm/' },
  cgm: { name: 'CompuGroup Medical', asset: 'cgm.svg', href: 'https://www.cgm.com/aut_de' },
  samedi: { name: 'samedi', asset: 'samedi.svg', href: 'https://www.samedi.com/' },
  latido: { name: 'LATIDO', asset: 'latido.png', href: 'https://www.latido.at/' },
  helsi: { name: 'HELSI', asset: 'helsi.svg', href: 'https://helsi.me/' },
  doctorEleks: { name: 'Doctor ELEKS', asset: 'doctor-eleks.png', href: 'https://doctor.eleks.com/' },
};
const selections: Record<Language, (keyof typeof brands)[]> = {
  en: ['salesforce', 'hubspot', 'zoho', 'cgm', 'samedi'],
  de: ['cgm', 'latido', 'samedi', 'salesforce', 'hubspot'],
  uk: ['helsi', 'doctorEleks', 'salesforce', 'hubspot', 'zoho'],
};
export function integrationBrands(language: Language) { return selections[language].map(id => ({ id, ...brands[id] })); }

export const telephonyBrands = [
  { id: 'twilio', name: 'Twilio', asset: 'twilio.svg', href: 'https://www.twilio.com/en-us/voice' },
  { id: 'telnyx', name: 'Telnyx', asset: 'telnyx.svg', href: 'https://telnyx.com/products/voice-api' },
  { id: 'vonage', name: 'Vonage', asset: 'vonage.svg', href: 'https://developer.vonage.com/en/voice/voice-api/overview' },
  { id: 'plivo', name: 'Plivo', asset: 'plivo.svg', href: 'https://www.plivo.com/voice/overview/' },
  { id: 'sipgate', name: 'sipgate.io', asset: 'sipgate.svg', href: 'https://www.sipgate.io/' },
];
