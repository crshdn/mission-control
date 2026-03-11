'use client';

import {useState, useEffect} from 'react';
import {Link, usePathname, useRouter} from '@/i18n/navigation'; // 使用共享导航工具 / Shared navigation helpers
import {Zap, Settings, ChevronLeft, LayoutGrid} from 'lucide-react';
import {useMissionControl} from '@/lib/store';
import {format} from 'date-fns';
import {useLocale, useTranslations} from 'next-intl'; // 国际化文案与当前语言 hook / Hooks for messages and current locale
import type {Workspace} from '@/lib/types';

interface HeaderProps {
  workspace?: Workspace;
  isPortrait?: boolean;
}

export function Header({workspace, isPortrait = true}: HeaderProps) {
  const router = useRouter(); // 路由实例，用于页面跳转 / Router instance for navigation
  const pathname = usePathname(); // 当前路径（不含语言前缀）/ Current pathname without locale prefix
  const currentLocale = useLocale(); // 当前语言，从 next-intl 上下文读取 / Current locale from next-intl context
  const t = useTranslations('header'); // 头部区域文案命名空间 / Translations namespace for header area
  const {agents, tasks, isOnline} = useMissionControl();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeSubAgents, setActiveSubAgents] = useState(0);
  const [isLocaleMenuOpen, setIsLocaleMenuOpen] = useState(false); // 语言下拉菜单开关状态 / Toggle state for locale dropdown menu

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const loadSubAgentCount = async () => {
      try {
        const res = await fetch('/api/openclaw/sessions?session_type=subagent&status=active');
        if (res.ok) {
          const sessions = await res.json();
          setActiveSubAgents(sessions.length);
        }
      } catch (error) {
        console.error('Failed to load sub-agent count:', error);
      }
    };

    loadSubAgentCount();
    const interval = setInterval(loadSubAgentCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const workingAgents = agents.filter((a) => a.status === 'working').length;
  const activeAgents = workingAgents + activeSubAgents;
  const tasksInQueue = tasks.filter((t) => t.status !== 'done' && t.status !== 'review').length;

  const portraitWorkspaceHeader = !!workspace && isPortrait;

  // 切换语言时构造新路径并跳转（交给 next-intl 路由处理 locale 前缀）
  // Build new path and navigate when switching locale, delegating locale prefix handling to next-intl router
  const switchLocale = (targetLocale: string) => {
    if (targetLocale === currentLocale) return; // 若目标语言与当前相同则不处理 / No-op when target equals current
    router.push(pathname, {locale: targetLocale}); // 让 next-intl 根据 routing 自动处理语言前缀 / Let next-intl handle locale prefix based on routing
    setIsLocaleMenuOpen(false); // 切换语言后关闭下拉菜单 / Close dropdown after switching locale
  };

  return (
    <header
      className={`bg-mc-bg-secondary border-b border-mc-border px-3 md:px-4 ${
        portraitWorkspaceHeader ? 'py-2.5 space-y-2.5' : 'h-14 flex items-center justify-between gap-2'
      }`}
    >
      {portraitWorkspaceHeader ? (
        <>
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <Link href="/" className="flex items-center gap-1 text-mc-text-secondary hover:text-mc-accent transition-colors shrink-0">
                <ChevronLeft className="w-4 h-4" />
                <LayoutGrid className="w-4 h-4" />
              </Link>
              <div className="flex items-center gap-2 px-2.5 py-1.5 bg-mc-bg-tertiary rounded min-w-0">
                <span className="text-base">{workspace.icon}</span>
                <span className="font-medium truncate text-sm">{workspace.name}</span>
              </div>
            </div>

            <button onClick={() => router.push('/settings')} className="min-h-11 min-w-11 p-2 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary shrink-0" title="Settings">
              <Settings className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <div
              className={`flex items-center gap-2 px-3 min-h-11 rounded border text-xs font-medium ${
                isOnline
                  ? 'bg-mc-accent-green/20 border-mc-accent-green text-mc-accent-green'
                  : 'bg-mc-accent-red/20 border-mc-accent-red text-mc-accent-red'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-mc-accent-green animate-pulse' : 'bg-mc-accent-red'}`} />
              {isOnline ? t('online') : t('offline')}
            </div>

            <div className="flex-1 grid grid-cols-2 gap-2">
              <div className="min-h-11 rounded border border-mc-border bg-mc-bg-tertiary px-2 flex items-center justify-center gap-1.5 text-xs">
                <span className="text-mc-accent-cyan font-semibold">{activeAgents}</span>
                <span className="text-mc-text-secondary">{t('active')}</span>
              </div>
              <div className="min-h-11 rounded border border-mc-border bg-mc-bg-tertiary px-2 flex items-center justify-center gap-1.5 text-xs">
                <span className="text-mc-accent-purple font-semibold">{tasksInQueue}</span>
                <span className="text-mc-text-secondary">{t('queued')}</span>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 md:gap-4 min-w-0">
            <div className="hidden sm:flex items-center gap-2">
              <Zap className="w-5 h-5 text-mc-accent-cyan" />
              <span className="font-semibold text-mc-text uppercase tracking-wider text-sm">
                {t('title') /* 应用标题文案 / Application title copy */}
              </span>
            </div>

            {workspace ? (
              <div className="flex items-center gap-2 min-w-0">
                <Link href="/" className="hidden sm:flex items-center gap-1 text-mc-text-secondary hover:text-mc-accent transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                  <LayoutGrid className="w-4 h-4" />
                </Link>
                <span className="hidden sm:block text-mc-text-secondary">/</span>
                <div className="flex items-center gap-2 px-2 md:px-3 py-1 bg-mc-bg-tertiary rounded min-w-0">
                  <span className="text-base md:text-lg">{workspace.icon}</span>
                  <span className="font-medium truncate text-sm md:text-base">{workspace.name}</span>
                </div>
              </div>
            ) : (
              <Link
                href="/"
                className="flex items-center gap-2 px-3 py-1 bg-mc-bg-tertiary rounded hover:bg-mc-bg transition-colors"
              >
                <LayoutGrid className="w-4 h-4" />
                <span className="text-sm">
                  {t('allWorkspaces') /* “所有工作区”按钮文案 / "All Workspaces" button label */}
                </span>
              </Link>
            )}
          </div>

          {workspace && (
            <div className="hidden lg:flex items-center gap-8">
              <div className="text-center">
                <div className="text-2xl font-bold text-mc-accent-cyan">{activeAgents}</div>
                <div className="text-xs text-mc-text-secondary uppercase">{t('agentsActive')}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-mc-accent-purple">{tasksInQueue}</div>
                <div className="text-xs text-mc-text-secondary uppercase">{t('tasksInQueue')}</div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 md:gap-4">
            <span className="hidden md:block text-mc-text-secondary text-sm font-mono">
              {format(currentTime, 'HH:mm:ss') /* 当前时间显示 / Current time display */}
            </span>
            <div
              className={`flex items-center gap-2 px-2 md:px-3 py-1 rounded border text-xs md:text-sm font-medium ${
                isOnline
                  ? 'bg-mc-accent-green/20 border-mc-accent-green text-mc-accent-green'
                  : 'bg-mc-accent-red/20 border-mc-accent-red text-mc-accent-red'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isOnline ? 'bg-mc-accent-green animate-pulse' : 'bg-mc-accent-red'
                }`}
              />
              {isOnline
                ? t('online') // 在线状态文案 / Online status copy
                : t('offline') // 离线状态文案 / Offline status copy
              }
            </div>
            {/* 语言切换器：在当前页面内切换中英文 / Language switcher: toggle between English and Chinese on current page */}
            <div className="relative">
              {/* 语言切换主按钮 / Language switch main button */}
              <button
                type="button"
                onClick={() => setIsLocaleMenuOpen((open) => !open)}
                className="min-h-9 px-3 rounded border border-mc-border bg-mc-bg-tertiary text-xs md:text-sm flex items-center gap-1 text-mc-text-secondary hover:bg-mc-bg"
                title={currentLocale === 'en' ? t('language.en') : t('language.zh')}
              >
                <span>{currentLocale === 'en' ? t('language.en') : t('language.zh')}</span>
                <span className="text-[10px] opacity-70">▼</span>
              </button>
              {/* 下拉菜单：提供具体语言选项 / Dropdown menu with concrete language options */}
              {isLocaleMenuOpen && (
                <div className="absolute right-0 mt-1 w-28 rounded border border-mc-border bg-mc-bg-secondary shadow-lg z-10">
                  <button
                    type="button"
                    onClick={() => switchLocale('en')}
                    className={`w-full px-3 py-2 text-left text-xs md:text-sm hover:bg-mc-bg-tertiary ${
                      currentLocale === 'en' ? 'text-mc-accent font-medium' : 'text-mc-text-secondary'
                    }`}
                  >
                    {t('language.en') /* 英文显示名称 / English option label */}
                  </button>
                  <button
                    type="button"
                    onClick={() => switchLocale('zh')}
                    className={`w-full px-3 py-2 text-left text-xs md:text-sm hover:bg-mc-bg-tertiary ${
                      currentLocale === 'zh' ? 'text-mc-accent font-medium' : 'text-mc-text-secondary'
                    }`}
                  >
                    {t('language.zh') /* 中文显示名称 / Chinese option label */}
                  </button>
                </div>
              )}
            </div>
            <button onClick={() => router.push('/settings')} className="min-h-11 min-w-11 p-2 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary" title="Settings">
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </>
      )}
    </header>
  );
}
