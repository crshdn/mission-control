import {createNavigation} from 'next-intl/navigation'; // 导航辅助工厂方法 / Navigation helpers factory
import {routing} from '@/i18n/routing'; // 仅引用配置对象，不把 createNavigation 打入 middleware / Config only; middleware does not import this file

// 基于 routing 创建多语言导航工具，供页面与组件使用（勿在 middleware 中引用此文件）
// Locale-aware navigation helpers for pages/components; do not import from middleware
export const {Link, redirect, usePathname, useRouter, getPathname} = createNavigation(routing);
