import {defineRouting} from 'next-intl/routing'; // 路由配置工具 / Routing configuration helper

// 仅定义路由与语言配置，供 middleware 等 Edge 环境使用，不引入 createNavigation 以免打入 Edge bundle
// Define routing and locale config only; safe for middleware/Edge (no createNavigation here)
export const routing = defineRouting({
  locales: ['en', 'zh'], // 支持的语言列表 / Supported locale list
  defaultLocale: 'en', // 默认语言配置 / Default locale configuration
  localePrefix: 'as-needed', // 仅在非默认语言时添加前缀 / Only prefix paths for non-default locales
});

