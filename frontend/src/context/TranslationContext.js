import { createContext, useContext, useCallback } from 'react';
import translations from '../translations';

const TranslationContext = createContext(null);

// The platform is English-only. This provider keeps the same t()/lang API
// so existing call sites don't need individual rewrites, but there is no
// language switching left — lang is always 'en' and setLanguage is a no-op.
export function TranslationProvider({ children }) {
  const t = useCallback((key) => translations.en[key] || key, []);
  const setLanguage = useCallback(() => {}, []);

  return (
    <TranslationContext.Provider value={{ lang: 'en', t, setLanguage }}>
      {children}
    </TranslationContext.Provider>
  );
}

export function useTranslation() {
  const ctx = useContext(TranslationContext);
  if (!ctx) throw new Error('useTranslation must be used within TranslationProvider');
  return ctx;
}
