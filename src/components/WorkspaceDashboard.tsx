'use client';

import {useState, useEffect} from 'react';
import {Plus, ArrowRight, Folder, Users, CheckSquare, Trash2, AlertTriangle, Activity} from 'lucide-react';
import {useLocale, useTranslations} from 'next-intl';
import {Link, usePathname, useRouter} from '@/i18n/navigation'; // 带语言前缀的导航，保证活动看板等页与当前语言一致 / Locale-aware nav so activity dashboard respects current locale
import type {WorkspaceStats} from '@/lib/types';

export function WorkspaceDashboard() {
  const t = useTranslations('dashboard');
  const tHeader = useTranslations('header');
  const currentLocale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<WorkspaceStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isLocaleMenuOpen, setIsLocaleMenuOpen] = useState(false);

  const switchLocale = (targetLocale: string) => {
    if (targetLocale === currentLocale) return;
    router.push(pathname, {locale: targetLocale});
    setIsLocaleMenuOpen(false);
  };

  useEffect(() => {
    loadWorkspaces();
  }, []);

  const loadWorkspaces = async () => {
    try {
      const res = await fetch('/api/workspaces?stats=true');
      if (res.ok) {
        const data = await res.json();
        setWorkspaces(data);
      }
    } catch (error) {
      console.error('Failed to load workspaces:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">🦞</div>
          <p className="text-mc-text-secondary">
            {t('loading') /* 加载工作区提示文案 / Loading workspaces hint */}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mc-bg">
      {/* Header */}
      <header className="border-b border-mc-border bg-mc-bg-secondary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🦞</span>
              <h1 className="text-xl font-bold">
                {t('title') /* 仪表盘标题 / Dashboard title */}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsLocaleMenuOpen((open) => !open)}
                  className="min-h-11 px-3 rounded-lg border border-mc-border bg-mc-bg text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary flex items-center gap-1 text-sm"
                  title={currentLocale === 'en' ? tHeader('language.en') : tHeader('language.zh')}
                >
                  <span>{currentLocale === 'en' ? tHeader('language.en') : tHeader('language.zh')}</span>
                  <span className="text-[10px] opacity-70">▼</span>
                </button>
                {isLocaleMenuOpen && (
                  <div className="absolute right-0 mt-1 w-28 rounded-lg border border-mc-border bg-mc-bg-secondary shadow-lg z-10">
                    <button
                      type="button"
                      onClick={() => switchLocale('en')}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-mc-bg-tertiary rounded-t-lg ${
                        currentLocale === 'en' ? 'text-mc-accent font-medium' : 'text-mc-text-secondary'
                      }`}
                    >
                      {tHeader('language.en')}
                    </button>
                    <button
                      type="button"
                      onClick={() => switchLocale('zh')}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-mc-bg-tertiary rounded-b-lg ${
                        currentLocale === 'zh' ? 'text-mc-accent font-medium' : 'text-mc-text-secondary'
                      }`}
                    >
                      {tHeader('language.zh')}
                    </button>
                  </div>
                )}
              </div>
              <Link
                href={workspaces.length > 0 ? `/workspace/${workspaces[0].slug}/activity` : '/workspace/default/activity'}
                className="min-h-11 px-4 rounded-lg border border-mc-border bg-mc-bg text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary flex items-center gap-2 text-sm"
              >
                <Activity className="w-4 h-4" />
                {t('activityButton')}
              </Link>
              <button
                onClick={() => setShowCreateModal(true)}
                className="min-h-11 flex items-center gap-2 px-4 bg-mc-accent text-mc-bg rounded-lg font-medium hover:bg-mc-accent/90"
              >
                <Plus className="w-4 h-4" />
                {t('newWorkspace')}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-2">
            {t('allWorkspacesTitle') /* 所有工作区标题 / All workspaces title */}
          </h2>
          <p className="text-mc-text-secondary">
            {t('allWorkspacesSubtitle') /* 所有工作区副标题 / All workspaces subtitle */}
          </p>
        </div>

        {workspaces.length === 0 ? (
          <div className="text-center py-16">
            <Folder className="w-16 h-16 mx-auto text-mc-text-secondary mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {t('emptyTitle') /* 空状态标题 / Empty state title */}
            </h3>
            <p className="text-mc-text-secondary mb-6">
              {t('emptySubtitle') /* 空状态说明 / Empty state description */}
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-3 bg-mc-accent text-mc-bg rounded-lg font-medium hover:bg-mc-accent/90"
            >
              {t('emptyCreateButton') /* 空状态创建按钮文案 / Empty state create button */}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {workspaces.map((workspace) => (
              <WorkspaceCard 
                key={workspace.id} 
                workspace={workspace} 
                onDelete={(id) => setWorkspaces(workspaces.filter(w => w.id !== id))}
              />
            ))}
            
            {/* Add workspace card */}
            <button
              onClick={() => setShowCreateModal(true)}
              className="border-2 border-dashed border-mc-border rounded-xl p-6 hover:border-mc-accent/50 transition-colors flex flex-col items-center justify-center gap-3 min-h-[200px] min-w-0"
            >
              <div className="w-12 h-12 rounded-full bg-mc-bg-tertiary flex items-center justify-center">
                <Plus className="w-6 h-6 text-mc-text-secondary" />
              </div>
              <span className="text-mc-text-secondary font-medium">
                {t('addWorkspaceCard') /* 添加工作区卡片文案 / Add workspace card label */}
              </span>
            </button>
          </div>
        )}
      </main>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateWorkspaceModal 
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            loadWorkspaces();
          }}
        />
      )}
    </div>
  );
}

function WorkspaceCard({workspace, onDelete}: {workspace: WorkspaceStats; onDelete: (id: string) => void}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const t = useTranslations('dashboard'); // 工作区卡片文案国际化 / i18n for workspace card copy

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleting(true);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}`, { method: 'DELETE' });
      if (res.ok) {
        onDelete(workspace.id);
      } else {
        const data = await res.json();
        alert(data.error || t('deleteFailed') /* 删除失败提示 / Delete failure alert */);
      }
    } catch {
      alert(t('deleteFailed') /* 删除失败提示 / Delete failure alert */);
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };
  
  return (
    <>
    <Link href={`/workspace/${workspace.slug}`}>
      <div className="bg-mc-bg-secondary border border-mc-border rounded-xl p-4 sm:p-6 hover:border-mc-accent/50 transition-all hover:shadow-lg cursor-pointer group relative min-h-[172px]">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{workspace.icon}</span>
            <div>
              <h3 className="font-semibold text-lg group-hover:text-mc-accent transition-colors">
                {workspace.name}
              </h3>
              <p className="text-sm text-mc-text-secondary">/{workspace.slug}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {workspace.id !== 'default' && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowDeleteConfirm(true);
                }}
                className="p-1.5 rounded hover:bg-mc-accent-red/20 text-mc-text-secondary hover:text-mc-accent-red transition-colors opacity-0 group-hover:opacity-100"
                title="Delete workspace"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <ArrowRight className="w-5 h-5 text-mc-text-secondary group-hover:text-mc-accent transition-colors" />
          </div>
        </div>

        {/* Simple task/agent counts */}
        <div className="flex items-center gap-4 text-sm text-mc-text-secondary mt-4">
          <div className="flex items-center gap-1">
            <CheckSquare className="w-4 h-4" />
            <span>{workspace.taskCounts.total} {t('cardTasksLabel')}</span>
          </div>
          <div className="flex items-center gap-1">
            <Users className="w-4 h-4" />
            <span>{workspace.agentCount} {t('cardAgentsLabel')}</span>
          </div>
        </div>
      </div>
    </Link>

    {/* Delete Confirmation Modal */}
    {showDeleteConfirm && (
      <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-3 sm:p-4" onClick={() => setShowDeleteConfirm(false)}>
        <div className="bg-mc-bg-secondary border border-mc-border rounded-t-xl sm:rounded-xl w-full max-w-md p-5 sm:p-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-6" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-mc-accent-red/20 rounded-full">
              <AlertTriangle className="w-6 h-6 text-mc-accent-red" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">
                {t('deleteTitle') /* 删除弹窗标题 / Delete modal title */}
              </h3>
              <p className="text-sm text-mc-text-secondary">
                {t('deleteDescription') /* 删除不可撤销说明 / Irreversible action description */}
              </p>
            </div>
          </div>
          
          <p className="text-mc-text-secondary mb-6">
            {t('deleteConfirmPrefix') /* 删除确认前缀 / Delete confirm prefix */}{' '}
            <strong>{workspace.name}</strong>?
            {workspace.taskCounts.total > 0 && (
              <span className="block mt-2 text-mc-accent-red">
                {t('deleteHasTasks', {count: workspace.taskCounts.total}) /* 仍有任务提示 / Has tasks warning */}
              </span>
            )}
          </p>
          
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-4 py-2 text-mc-text-secondary hover:text-mc-text"
            >
              {t('deleteCancel') /* 取消按钮文案 / Cancel button label */}
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting || workspace.taskCounts.total > 0 || workspace.agentCount > 0}
              className="px-4 py-2 bg-mc-accent-red text-white rounded-lg font-medium hover:bg-mc-accent-red/90 disabled:opacity-50"
            >
              {deleting ? t('deleteSubmitting') : t('deleteConfirmButton')}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

function CreateWorkspaceModal({onClose, onCreated}: {onClose: () => void; onCreated: () => void}) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📁');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations('dashboard'); // 创建工作区弹窗文案 / Create workspace modal copy

  const icons = ['📁', '💼', '🏢', '🚀', '💡', '🎯', '📊', '🔧', '🌟', '🏠'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), icon }),
      });

      if (res.ok) {
        onCreated();
      } else {
        const data = await res.json();
        setError(data.error || t('createFailed') /* 创建失败提示 / Create failure message */);
      }
    } catch {
      setError(t('createFailed') /* 创建失败提示 / Create failure message */);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-3 sm:p-4">
      <div className="bg-mc-bg-secondary border border-mc-border rounded-t-xl sm:rounded-xl w-full max-w-md pb-[env(safe-area-inset-bottom)] sm:pb-0">
        <div className="p-6 border-b border-mc-border">
          <h2 className="text-lg font-semibold">
            {t('createModalTitle') /* 创建工作区标题 / Create workspace title */}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Icon selector */}
          <div>
            <label className="block text-sm font-medium mb-2">
              {t('createIconLabel') /* 图标标签 / Icon label */}
            </label>
            <div className="flex flex-wrap gap-2">
              {icons.map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIcon(i)}
                  className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-colors ${
                    icon === i 
                      ? 'bg-mc-accent/20 border-2 border-mc-accent' 
                      : 'bg-mc-bg border border-mc-border hover:border-mc-accent/50'
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          {/* Name input */}
          <div>
            <label className="block text-sm font-medium mb-2">
              {t('createNameLabel') /* 名称标签 / Name label */}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('createNamePlaceholder') /* 名称占位符 / Name placeholder */}
              className="w-full bg-mc-bg border border-mc-border rounded-lg px-4 py-2 focus:outline-none focus:border-mc-accent"
              autoFocus
            />
          </div>

          {error && (
            <div className="text-mc-accent-red text-sm">{error}</div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-mc-text-secondary hover:text-mc-text"
            >
              {t('createCancel') /* 取消按钮文案 / Cancel button label */}
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isSubmitting}
              className="px-6 py-2 bg-mc-accent text-mc-bg rounded-lg font-medium hover:bg-mc-accent/90 disabled:opacity-50"
            >
              {isSubmitting
                ? t('createSubmitting') /* 创建中按钮文案 / Creating state label */
                : t('createSubmit') /* 创建按钮文案 / Create button label */}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
