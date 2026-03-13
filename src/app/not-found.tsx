// 全局 404 页面：根据 NEXT_LOCALE 选择中英文，并用普通 Link 返回对应语言首页
// Global 404 page: pick zh/en from NEXT_LOCALE and use a plain Next.js Link.

import Link from 'next/link';
import {cookies} from 'next/headers';

const MESSAGES = {
  en: {
    title: 'Page Not Found',
    description: "The page you’re looking for doesn’t exist or has moved.",
    back: 'Back to Home',
  },
  zh: {
    title: '页面不存在',
    description: '你访问的页面不存在或已被移动。',
    back: '返回首页',
  },
} as const;

export default function GlobalNotFound() {
  const cookieLocale = cookies().get('NEXT_LOCALE')?.value;
  const locale = cookieLocale === 'zh' ? 'zh' : 'en';
  const t = MESSAGES[locale];
  const href = locale === 'zh' ? '/zh' : '/';

  return (
    <div className="min-h-screen bg-mc-bg flex items-center justify-center">
      <div className="text-center px-4">
        <div className="text-6xl font-bold mb-4">404</div>
        <h1 className="text-2xl font-semibold mb-2">{t.title}</h1>
        <p className="text-mc-text-secondary mb-6">{t.description}</p>
        <Link href={href} className="inline-flex items-center gap-2 px-6 py-3 bg-mc-accent text-mc-bg rounded-lg font-medium hover:bg-mc-accent/90">
          {t.back}
        </Link>
      </div>
    </div>
  );
}

