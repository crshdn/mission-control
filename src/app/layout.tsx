import type {Metadata} from 'next';
import './globals.css'; // 全局样式导入 / Import global styles
import {JetBrains_Mono} from 'next/font/google'; // 字体导入 / Font import
import DemoBanner from '@/components/DemoBanner'; // Demo 横幅组件 / Demo banner component

// 初始化 JetBrains Mono 字体配置 / Initialize JetBrains Mono font configuration
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'], // 使用的字符子集 / Used character subsets
  variable: '--font-jetbrains-mono', // CSS 变量名称 / CSS variable name
  weight: ['400', '500', '600', '700'], // 可用字重 / Available font weights
  display: 'swap', // 字体加载策略 / Font loading strategy
});

export const metadata: Metadata = {
  title: 'Mission Control', // 默认页面标题 / Default page title
  description: 'AI Agent Orchestration Dashboard', // 应用描述 / Application description
  icons: {
    icon: '/favicon.svg', // 网站图标配置 / Site icon configuration
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 根布局负责提供全局 <html>/<body> 结构；lang 由 SetDocumentLang 按 locale 同步，此处为 SSR 默认值
  // Root layout provides <html>/<body>; lang is synced by SetDocumentLang per locale, this is SSR default
  return (
    <html lang="en" className={jetbrainsMono.variable} suppressHydrationWarning>
      <body className={`${jetbrainsMono.className} bg-mc-bg text-mc-text min-h-screen`}>
        <DemoBanner /> {/* 全局 Demo 横幅 / Global demo banner */}
        {children}
      </body>
    </html>
  );
}

