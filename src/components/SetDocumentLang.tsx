'use client';

import {useLocale} from 'next-intl';
import {useEffect} from 'react';

/**
 * Syncs document.documentElement.lang with current locale for SEO and a11y.
 * 将当前语言同步到 <html lang>，便于 SEO 与读屏
 */
export default function SetDocumentLang() {
  const locale = useLocale();
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }
  }, [locale]);
  return null;
}
