export type Language = 'uk' | 'de' | 'en';
export const languages = { uk: 'Українська', de: 'Deutsch', en: 'English' };
export const assistantNames = { uk: 'Софія', de: 'Sophie', en: 'Sophia' };
export const timezone = 'Europe/Vienna';
export const services = [
  { id: 'checkup', minutes: 30, price: 65, name: { uk: 'Огляд і консультація', de: 'Kontrolle & Beratung', en: 'Check-up & consultation' }, description: { uk: 'Знайомство з лікарем і план догляду.', de: 'Eine Untersuchung und Ihr persönlicher Behandlungsplan.', en: 'Meet your dentist and plan your care.' } },
  { id: 'cleaning', minutes: 60, price: 120, name: { uk: 'Професійна гігієна', de: 'Professionelle Zahnreinigung', en: 'Professional cleaning' }, description: { uk: 'Делікатне очищення та полірування зубів.', de: 'Schonende Reinigung und Politur Ihrer Zähne.', en: 'A gentle clean and polish for a fresh smile.' } },
  { id: 'filling', minutes: 60, price: 160, name: { uk: 'Лікування карієсу', de: 'Kariesbehandlung', en: 'Dental filling' }, description: { uk: 'Огляд і відновлення зуба. Ціна від €160.', de: 'Untersuchung und Versorgung. Ab 160 €.', en: 'Examination and restoration. From €160.' } },
] as const;
export const clinic = {
  name: 'Linden Dental', fictional: true, timezone, currency: 'EUR',
  city: 'Vienna',
  address: 'Lindengasse 12, 1070 Wien (fictional demo address)',
  hours: 'Monday–Friday 09:00–17:00, closed 12:00–13:00. Weekends closed.',
  policies: 'Demo appointments only. Free cancellation or rescheduling. No medical diagnosis. For acute emergencies contact a real local emergency dental service.',
  services,
};
export const doctors = [
  { id: 'anna-weber', name: 'Dr. Anna Weber', fictional: true,
    specialty: { uk: 'Огляд і консультація', de: 'Kontrolle und Beratung', en: 'Examination and consultation' }, service_ids: ['checkup'] },
  { id: 'max-hoffmann', name: 'Dr. Max Hoffmann', fictional: true,
    specialty: { uk: 'Профілактична стоматологія та гігієна', de: 'Prävention und Zahnhygiene', en: 'Preventive dentistry and hygiene' }, service_ids: ['cleaning'] },
  { id: 'lara-fischer', name: 'Dr. Lara Fischer', fictional: true,
    specialty: { uk: 'Лікування карієсу та відновлення зубів', de: 'Kariesbehandlung und Zahnerhaltung', en: 'Caries treatment and restoration' }, service_ids: ['filling'] },
];
export function doctorForService(serviceId: string) {
  const doctor = doctors.find(d => d.service_ids.includes(serviceId));
  if (!doctor) throw new Error('invalid_service');
  return doctor;
}
