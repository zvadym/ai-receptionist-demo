'use client';
import { useEffect } from 'react';
import type { Language } from '@/lib/clinic';
export function DocumentLanguage({ language }: { language: Language }) {
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  return null;
}
