'use client';

import {useEffect, useState, type ReactNode} from 'react';
import {useParams} from 'next/navigation';
import {Link} from '@/i18n/navigation';
import {useTranslations} from 'next-intl';
import {ChevronLeft, ListTodo, Users, Activity, Settings as SettingsIcon, ExternalLink, Home, BarChart3} from 'lucide-react';
import {Header} from '@/components/Header';
import {AgentsSidebar} from '@/components/AgentsSidebar';
import {MissionQueue} from '@/components/MissionQueue';
import {LiveFeed} from '@/components/LiveFeed';
import {SSEDebugPanel} from '@/components/SSEDebugPanel';
import {useMissionControl} from '@/lib/store';
import {useSSE} from '@/hooks/useSSE';
import {debug} from '@/lib/debug';
import type {Task, Workspace} from '@/lib/types';

type MobileTab = 'queue' | 'agents' | 'feed' | 'settings'; // 移动端页签类型 / Mobile tab type

export default function WorkspacePage() {
  const params = useParams(); // 读取动态路由参数 / Read dynamic route params
  const slug = params.slug as string; // 工作区标识符 / Workspace identifier
  const {setAgents, setTasks, setEvents, setIsOnline, setIsLoading, isLoading} = useMissionControl(); // 全局状态操作 / Global store operations
  const tWorkspace = useTranslations('workspacePage'); // 工作区页面文案 / Workspace page copy

  const [workspace, setWorkspace] = useState<Workspace | null>(null); // 当前工作区数据 / Current workspace data
  const [notFound, setNotFound] = useState(false); // 404 状态 / Not-found state
  const [mobileTab, setMobileTab] = useState<MobileTab>('queue'); // 当前移动端页签 / Current mobile tab
  const [isPortrait, setIsPortrait] = useState(true); // 是否为竖屏布局 / Whether portrait layout is active

  useSSE(); // 启动 SSE 订阅 / Start SSE subscription

  useEffect(() => {
    const media = window.matchMedia('(orientation: portrait)'); // 监听屏幕方向 / Listen for screen orientation
    const updateOrientation = () => setIsPortrait(media.matches); // 根据媒体查询更新状态 / Update state from media query

    updateOrientation(); // 首次同步方向 / Sync initial orientation
    media.addEventListener('change', updateOrientation);
    window.addEventListener('resize', updateOrientation);

    return () => {
      media.removeEventListener('change', updateOrientation);
      window.removeEventListener('resize', updateOrientation);
    };
  }, []);

  useEffect(() => {
    async function loadWorkspace() {
      try {
        const res = await fetch(`/api/workspaces/${slug}`); // 加载工作区元信息 / Load workspace metadata
        if (res.ok) {
          const data = await res.json();
          setWorkspace(data);
        } else if (res.status === 404) {
          setNotFound(true); // 工作区不存在 / Workspace not found
          setIsLoading(false);
          return;
        }
      } catch (error) {
        console.error('Failed to load workspace:', error);
        setNotFound(true);
        setIsLoading(false);
        return;
      }
    }

    loadWorkspace(); // 触发加载 / Trigger workspace load
  }, [slug, setIsLoading]);

  useEffect(() => {
    if (!isPortrait && mobileTab === 'queue') {
      setMobileTab('agents'); // 横屏时默认展示 Agents 面板 / Default to Agents tab in landscape
    }
  }, [isPortrait, mobileTab]);

  useEffect(() => {
    if (!workspace) return; // 工作区未加载时不拉取数据 / Skip when workspace is not loaded

    const workspaceId = workspace.id; // 当前工作区 ID / Current workspace ID

    async function loadData() {
      try {
        debug.api('Loading workspace data...', {workspaceId}); // 调试日志：加载工作区数据 / Debug log: loading workspace data

        const [agentsRes, tasksRes, eventsRes] = await Promise.all([
          fetch(`/api/agents?workspace_id=${workspaceId}`),
          fetch(`/api/tasks?workspace_id=${workspaceId}`),
          fetch('/api/events'),
        ]);

        if (agentsRes.ok) setAgents(await agentsRes.json()); // 更新智能体列表 / Update agents list
        if (tasksRes.ok) {
          const tasksData = await tasksRes.json();
          debug.api('Loaded tasks', {count: tasksData.length}); // 调试日志：任务数量 / Debug log: tasks count
          setTasks(tasksData); // 更新任务列表 / Update tasks list
        }
        if (eventsRes.ok) setEvents(await eventsRes.json()); // 更新事件流 / Update events stream
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setIsLoading(false); // 数据加载完成 / Data loading finished
      }
    }

    async function checkOpenClaw() {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 超时时间 5 秒 / 5s timeout

        const openclawRes = await fetch('/api/openclaw/status', {signal: controller.signal}); // 检查网关连接状态 / Check gateway connectivity
        clearTimeout(timeoutId);

        if (openclawRes.ok) {
          const status = await openclawRes.json();
          setIsOnline(status.connected); // 设置在线状态 / Set online status
        }
      } catch {
        setIsOnline(false); // 请求失败视为离线 / Treat failure as offline
      }
    }

    loadData(); // 加载工作区相关数据 / Load workspace-related data
    checkOpenClaw(); // 检查 OpenClaw 连接 / Check OpenClaw connection

    const eventPoll = setInterval(async () => {
      try {
        const res = await fetch('/api/events?limit=20'); // 定时轮询事件 / Poll latest events
        if (res.ok) {
          setEvents(await res.json());
        }
      } catch (error) {
        console.error('Failed to poll events:', error);
      }
    }, 30000);

    const taskPoll = setInterval(async () => {
      try {
        const res = await fetch(`/api/tasks?workspace_id=${workspaceId}`); // 定时轮询任务列表 / Poll tasks list
        if (res.ok) {
          const newTasks: Task[] = await res.json();
          const currentTasks = useMissionControl.getState().tasks; // 读取当前任务状态 / Read current tasks state

          const hasChanges =
            newTasks.length !== currentTasks.length ||
            newTasks.some((t) => {
              const current = currentTasks.find((ct) => ct.id === t.id);
              return !current || current.updated_at !== t.updated_at; // 检测任务是否发生变化 / Detect if tasks have changed
            });

          if (hasChanges) {
            debug.api('[FALLBACK] Task changes detected via polling, updating store'); // 调试日志：轮询回退更新 / Debug log: polling fallback update
            setTasks(newTasks); // 用最新任务覆盖状态 / Replace tasks with latest list
          }
        }
      } catch (error) {
        console.error('Failed to poll tasks:', error);
      }
    }, 60000);

    const connectionCheck = setInterval(async () => {
      try {
        const res = await fetch('/api/openclaw/status'); // 定时检查连接状态 / Periodically check connection status
        if (res.ok) {
          const status = await res.json();
          setIsOnline(status.connected);
        }
      } catch {
        setIsOnline(false);
      }
    }, 30000);

    return () => {
      clearInterval(eventPoll);
      clearInterval(connectionCheck);
      clearInterval(taskPoll);
    }; // 清理所有轮询定时器 / Cleanup all polling timers
  }, [workspace, setAgents, setTasks, setEvents, setIsOnline, setIsLoading]);

  if (notFound) {
    // 工作区不存在时的错误界面 / Error view when workspace is not found
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🔍</div>
          <h1 className="text-2xl font-bold mb-2">{tWorkspace('notFoundTitle')}</h1>
          <p className="text-mc-text-secondary mb-6">{tWorkspace('notFoundDescription', {slug})}</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-mc-accent text-mc-bg rounded-lg font-medium hover:bg-mc-accent/90"
          >
            <ChevronLeft className="w-4 h-4" />
            {tWorkspace('backToDashboard')}
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading || !workspace) {
    // 加载中状态界面 / Loading state view
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">🦞</div>
          <p className="text-mc-text-secondary">Loading {slug}...</p>
        </div>
      </div>
    );
  }

  const showMobileBottomTabs = isPortrait; // 是否显示底部 Tab 导航 / Whether to show bottom tabs

  return (
    <div className="h-screen flex flex-col bg-mc-bg overflow-hidden">
      <Header workspace={workspace} isPortrait={isPortrait} />{/* 头部信息与状态条 / Header with workspace info and status */}

      <div className="hidden lg:flex flex-1 overflow-hidden">
        <AgentsSidebar workspaceId={workspace.id} />{/* 左侧代理列表 / Left agents list */}
        <MissionQueue workspaceId={workspace.id} />{/* 中间任务队列 / Middle mission queue */}
        <LiveFeed />{/* 右侧实时事件流 / Right live feed */}
      </div>

      <div
        className={`lg:hidden flex-1 overflow-hidden ${
          showMobileBottomTabs ? 'pb-[calc(4.5rem+env(safe-area-inset-bottom))]' : 'pb-[env(safe-area-inset-bottom)]'
        }`}
      >
        {isPortrait ? (
          <>
            {mobileTab === 'queue' && <MissionQueue workspaceId={workspace.id} mobileMode isPortrait />} {/* 竖屏任务队列视图 / Portrait mission queue */}
            {mobileTab === 'agents' && (
              <div className="h-full p-3 overflow-y-auto">
                <AgentsSidebar workspaceId={workspace.id} mobileMode isPortrait />{/* 竖屏代理列表 / Portrait agents list */}
              </div>
            )}
            {mobileTab === 'feed' && (
              <div className="h-full p-3 overflow-y-auto">
                <LiveFeed mobileMode isPortrait />{/* 竖屏事件流 / Portrait live feed */}
              </div>
            )}
            {mobileTab === 'settings' && <MobileSettingsPanel workspace={workspace} />}{/* 竖屏设置面板 / Portrait settings panel */}
          </>
        ) : (
          <div className="h-full p-3 grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-3">
            <MissionQueue workspaceId={workspace.id} mobileMode isPortrait={false} />{/* 横屏左侧任务视图 / Landscape left mission view */}
            <div className="min-w-0 h-full flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setMobileTab('agents')}
                  className={`min-h-11 rounded-lg text-xs ${
                    mobileTab === 'agents' ? 'bg-mc-accent text-mc-bg font-medium' : 'bg-mc-bg-secondary border border-mc-border text-mc-text-secondary'
                  }`}
                >
                  Agents
                </button>
                <button
                  onClick={() => setMobileTab('feed')}
                  className={`min-h-11 rounded-lg text-xs ${
                    mobileTab === 'feed' ? 'bg-mc-accent text-mc-bg font-medium' : 'bg-mc-bg-secondary border border-mc-border text-mc-text-secondary'
                  }`}
                >
                  Feed
                </button>
                <button
                  onClick={() => setMobileTab('settings')}
                  className={`min-h-11 rounded-lg text-xs ${
                    mobileTab === 'settings' ? 'bg-mc-accent text-mc-bg font-medium' : 'bg-mc-bg-secondary border border-mc-border text-mc-text-secondary'
                  }`}
                >
                  Settings
                </button>
              </div>

              <div className="min-h-0 flex-1">
                {mobileTab === 'settings' ? (
                  <MobileSettingsPanel workspace={workspace} denseLandscape /> // 横屏紧凑设置面板 / Dense settings panel in landscape
                ) : mobileTab === 'agents' ? (
                  <AgentsSidebar workspaceId={workspace.id} mobileMode isPortrait={false} /> // 横屏紧凑代理列表 / Dense agents list
                ) : (
                  <LiveFeed mobileMode isPortrait={false} /> // 横屏紧凑事件流 / Dense live feed
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {showMobileBottomTabs && (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-mc-border bg-mc-bg-secondary pb-[env(safe-area-inset-bottom)]">
          <div className="grid grid-cols-4 gap-1 p-2">
            <MobileTabButton
              label="Queue"
              active={mobileTab === 'queue'}
              icon={<ListTodo className="w-5 h-5" />}
              onClick={() => setMobileTab('queue')}
            />
            <MobileTabButton
              label="Agents"
              active={mobileTab === 'agents'}
              icon={<Users className="w-5 h-5" />}
              onClick={() => setMobileTab('agents')}
            />
            <MobileTabButton
              label="Feed"
              active={mobileTab === 'feed'}
              icon={<Activity className="w-5 h-5" />}
              onClick={() => setMobileTab('feed')}
            />
            <MobileTabButton
              label="Settings"
              active={mobileTab === 'settings'}
              icon={<SettingsIcon className="w-5 h-5" />}
              onClick={() => setMobileTab('settings')}
            />
          </div>
        </nav>
      )}

      <SSEDebugPanel />{/* SSE 调试面板 / SSE debug panel */}
    </div>
  );
}

function MobileTabButton({
  label,
  active,
  icon,
  onClick,
}: {
  label: string; // 按钮标签文案 / Button label text
  active: boolean; // 是否为当前激活标签 / Whether tab is active
  icon: ReactNode; // 按钮图标节点 / Button icon node
  onClick: () => void; // 点击回调 / Click handler
}) {
  return (
    <button
      onClick={onClick}
      className={`min-h-11 rounded-lg flex flex-col items-center justify-center text-xs ${
        active ? 'bg-mc-accent text-mc-bg font-medium' : 'text-mc-text-secondary'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function MobileSettingsPanel({workspace, denseLandscape = false}: {workspace: Workspace; denseLandscape?: boolean}) {
  const tAgentDashboard = useTranslations('agentDashboard');
  return (
    <div
      className={`h-full overflow-y-auto ${
        denseLandscape ? 'p-0 pb-[env(safe-area-inset-bottom)]' : 'p-3 pb-[calc(1rem+env(safe-area-inset-bottom))]'
      }`}
    >
      <div className="space-y-3">
        <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
          <div className="text-sm text-mc-text-secondary mb-2">Current workspace</div>
          <div className="flex items-center gap-2 text-base font-medium">
            <span>{workspace.icon}</span>
            <span>{workspace.name}</span>
          </div>
          <div className="text-xs text-mc-text-secondary mt-1">/{workspace.slug}</div>
        </div>

        {/* 跳转到工作区活动页的入口 / Entry link to workspace activity page */}
        <Link
          href={`/workspace/${workspace.slug}/activity`}
          className="w-full min-h-11 px-4 rounded-lg border border-mc-border bg-mc-bg-secondary flex items-center justify-between text-sm"
        >
          <span className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            {tAgentDashboard('title')}
          </span>
          <ExternalLink className="w-4 h-4 text-mc-text-secondary" />
        </Link>

        {/* 打开全局设置页的入口 / Entry link to global settings page */}
        <Link
          href="/settings"
          className="w-full min-h-11 px-4 rounded-lg border border-mc-border bg-mc-bg-secondary flex items-center justify-between text-sm"
        >
          <span className="flex items-center gap-2">
            <SettingsIcon className="w-4 h-4" />
            Open Mission Control Settings
          </span>
          <ExternalLink className="w-4 h-4 text-mc-text-secondary" />
        </Link>

        {/* 返回工作区列表的入口 / Entry link back to workspace list */}
        <Link
          href="/"
          className="w-full min-h-11 px-4 rounded-lg border border-mc-border bg-mc-bg-secondary flex items-center justify-between text-sm"
        >
          <span className="flex items-center gap-2">
            <Home className="w-4 h-4" />
            Back to Workspaces
          </span>
          <ExternalLink className="w-4 h-4 text-mc-text-secondary" />
        </Link>
      </div>
    </div>
  );
}

