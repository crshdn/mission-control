import {NextIntlClientProvider} from 'next-intl'; // 客户端国际化提供器 / Client i18n provider
import {notFound} from 'next/navigation'; // 404 辅助方法 / 404 helper
import {routing} from '@/i18n/routing'; // 语言路由配置 / Locale routing configuration
import SetDocumentLang from '@/components/SetDocumentLang'; // 按 locale 同步 <html lang> / Sync <html lang> with locale

type Props = {
  children: React.ReactNode; // 子节点内容 / Children content
  params: {
    locale: string; // 当前路由语言参数 / Current route locale param
  };
};

export default async function LocaleLayout({children, params}: Props) {
  const {locale} = params; // 从参数中读取当前语言 / Read current locale from params

  // 校验 locale 是否在受支持列表中 / Validate that locale is supported
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound(); // 不支持的语言直接返回 404 / Return 404 for unsupported locales
  }

  // 根据语言动态加载对应消息字典 / Dynamically load messages dictionary based on locale
  let messages;
  try {
    messages = (await import(`../../../messages/${locale}.json`)).default; // 加载 JSON 消息文件 / Load JSON message file
  } catch {
    notFound(); // 若加载失败则视为该语言不存在 / Treat missing file as not found
  }

  // 使用 NextIntlClientProvider 包裹应用，提供多语言上下文；SetDocumentLang 同步 <html lang> 以利 SEO/读屏
  // Wrap with NextIntlClientProvider; SetDocumentLang syncs <html lang> for SEO and screen readers
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <SetDocumentLang />
      {children}
    </NextIntlClientProvider>
  );
}

