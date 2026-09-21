import type { Language } from './clinic';

export function resolveLanguage(value?: string | string[]): Language {
  const language = Array.isArray(value) ? value[0] : value;
  return language === 'de' ? 'de' : language === 'uk' || language === 'ua' ? 'uk' : 'en';
}
