'use client';

import { useState, useEffect } from 'react';
import { 
  Rocket, 
  CheckCircle2, 
  Circle, 
  ExternalLink, 
  Calendar, 
  BarChart3,
  Package,
  Search,
  MessageSquare,
  Zap,
  Clock,
  AlertTriangle,
  Target,
  Palette,
  FileText,
  Link as LinkIcon,
  TrendingUp,
  Globe,
  Users,
  Play
} from 'lucide-react';

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  status: 'completed' | 'in_progress' | 'pending';
  category: 'pre_launch' | 'launch' | 'post_launch';
  priority: 'high' | 'medium' | 'low';
}

interface Milestone {
  id: string;
  title: string;
  date: string;
  status: 'completed' | 'current' | 'upcoming';
  dependencies?: string[];
}

interface ResourceLink {
  id: string;
  title: string;
  url: string;
  category: 'marketing' | 'assets' | 'social' | 'product_hunt';
  icon: React.ComponentType<{ className?: string }>;
}

interface QuickStat {
  label: string;
  value: string;
  trend: 'up' | 'down' | 'neutral';
  icon: React.ComponentType<{ className?: string }>;
}

export default function AtelierLaunchPage() {
  const [activeTab, setActiveTab] = useState('overview');
  
  const stats: QuickStat[] = [
    { label: 'Tools Deployed', value: '12/15', trend: 'up', icon: Package },
    { label: 'Pages Indexed', value: '127', trend: 'up', icon: Globe },
    { label: 'Launch Completion', value: '78%', trend: 'up', icon: Target },
    { label: 'Marketing Assets', value: '24/30', trend: 'neutral', icon: Palette },
  ];

  const checklistItems: ChecklistItem[] = [
    {
      id: 'site-audit',
      title: 'Complete Site SEO Audit',
      description: 'Review all pages for SEO optimization',
      status: 'completed',
      category: 'pre_launch',
      priority: 'high'
    },
    {
      id: 'product-hunt',
      title: 'Submit to Product Hunt',
      description: 'Prepare and submit launch page',
      status: 'in_progress',
      category: 'launch',
      priority: 'high'
    },
    {
      id: 'social-media',
      title: 'Prepare Social Media Content',
      description: 'Create posts for Twitter, LinkedIn, etc.',
      status: 'in_progress',
      category: 'pre_launch',
      priority: 'medium'
    },
    {
      id: 'press-kit',
      title: 'Finalize Press Kit',
      description: 'Complete media assets and brand guidelines',
      status: 'pending',
      category: 'pre_launch',
      priority: 'medium'
    },
    {
      id: 'beta-feedback',
      title: 'Collect Beta User Feedback',
      description: 'Gather and implement user feedback',
      status: 'completed',
      category: 'pre_launch',
      priority: 'high'
    },
    {
      id: 'launch-email',
      title: 'Send Launch Announcement',
      description: 'Email announcement to subscriber list',
      status: 'pending',
      category: 'launch',
      priority: 'high'
    },
    {
      id: 'analytics',
      title: 'Set Up Launch Analytics',
      description: 'Configure tracking for launch metrics',
      status: 'pending',
      category: 'post_launch',
      priority: 'medium'
    }
  ];

  const milestones: Milestone[] = [
    {
      id: 'beta',
      title: 'Beta Testing Complete',
      date: '2025-03-01',
      status: 'completed'
    },
    {
      id: 'content',
      title: 'Marketing Content Ready',
      date: '2025-03-06',
      status: 'current'
    },
    {
      id: 'ph-submit',
      title: 'Product Hunt Submission',
      date: '2025-03-08',
      status: 'upcoming',
      dependencies: ['content']
    },
    {
      id: 'launch',
      title: 'Official Launch',
      date: '2025-03-10',
      status: 'upcoming',
      dependencies: ['ph-submit']
    },
    {
      id: 'follow-up',
      title: 'Launch Follow-up',
      date: '2025-03-15',
      status: 'upcoming',
      dependencies: ['launch']
    }
  ];

  const resourceLinks: ResourceLink[] = [
    {
      id: 'marketing-plan',
      title: 'Marketing Strategy Doc',
      url: '#',
      category: 'marketing',
      icon: FileText
    },
    {
      id: 'brand-assets',
      title: 'Brand Assets & Guidelines',
      url: '#',
      category: 'assets',
      icon: Palette
    },
    {
      id: 'social-copy',
      title: 'Social Media Copy Bank',
      url: '#',
      category: 'social',
      icon: MessageSquare
    },
    {
      id: 'product-hunt',
      title: 'Product Hunt Page',
      url: 'https://www.producthunt.com/posts/atelier-tools',
      category: 'product_hunt',
      icon: Rocket
    },
    {
      id: 'landing-page',
      title: 'Atelier Tools Website',
      url: 'https://ateliertools.com',
      category: 'marketing',
      icon: Globe
    },
    {
      id: 'press-kit',
      title: 'Media Press Kit',
      url: '#',
      category: 'assets',
      icon: Package
    }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'in_progress':
      case 'current':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'pending':
      case 'upcoming':
        return 'text-gray-600 bg-gray-50 border-gray-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'text-red-600 bg-red-50';
      case 'medium':
        return 'text-yellow-600 bg-yellow-50';
      case 'low':
        return 'text-green-600 bg-green-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <div className="min-h-screen bg-mc-bg">
      {/* Header */}
      <header className="bg-mc-bg-secondary/50 bg-mc-bg-secondary/80 backdrop-blur border-b border-mc-border sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-apple-6 py-apple-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-apple-3">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-600 rounded-apple-md flex items-center justify-center">
                <Rocket className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-apple-title-2 text-mc-text font-semibold">Atelier Tools Launch</h1>
                <p className="text-apple-footnote mc-text-secondary">Mission Control Dashboard</p>
              </div>
            </div>
            <div className="flex items-center gap-apple-3">
              <div className="px-apple-3 py-apple-1 bg-green-100 text-green-800 rounded-apple-full text-apple-caption2 font-medium">
                78% Complete
              </div>
              <button className="apple-button-primary flex items-center gap-apple-2">
                <Play className="w-4 h-4" />
                Launch Now
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-apple-6 py-apple-8">
        
        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-apple-4 mb-apple-10">
          {stats.map((stat, index) => (
            <div key={stat.label} className="apple-card p-apple-6 animate-apple-slide-up" style={{ animationDelay: `${index * 0.1}s` }}>
              <div className="flex items-center justify-between mb-apple-2">
                <div className="w-10 h-10 bg-mc-bg-tertiary rounded-apple-lg flex items-center justify-center">
                  <stat.icon className="w-5 h-5 text-apple-accent" />
                </div>
                <div className={`flex items-center gap-1 ${
                  stat.trend === 'up' ? 'text-green-600' : 
                  stat.trend === 'down' ? 'text-red-600' : 'text-gray-600'
                }`}>
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="text-apple-title-1 font-bold text-mc-text mb-apple-1">{stat.value}</div>
              <div className="text-apple-footnote mc-text-secondary">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="border-b border-mc-border mb-apple-8">
          <div className="flex space-x-8">
            {[
              { id: 'overview', label: 'Overview', icon: BarChart3 },
              { id: 'checklist', label: 'Launch Checklist', icon: CheckCircle2 },
              { id: 'timeline', label: 'Timeline', icon: Calendar },
              { id: 'resources', label: 'Resources', icon: LinkIcon },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-apple-3 py-apple-4 border-b-2 font-medium text-apple-subhead transition-colors ${
                  activeTab === tab.id
                    ? 'border-apple-accent text-apple-accent'
                    : 'border-transparent text-mc-text-secondary hover:text-mc-text'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="animate-apple-fade-in">
          
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-apple-8">
              {/* Recent Activity */}
              <div className="apple-card p-apple-6">
                <h3 className="text-apple-headline font-semibold mb-apple-4 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-apple-accent" />
                  Recent Activity
                </h3>
                <div className="space-y-apple-4">
                  {[
                    { action: 'SEO audit completed', time: '2 hours ago', status: 'success' },
                    { action: 'Product Hunt submission in progress', time: '4 hours ago', status: 'progress' },
                    { action: 'Social media assets uploaded', time: '1 day ago', status: 'success' },
                    { action: 'Beta feedback collected', time: '2 days ago', status: 'success' },
                  ].map((activity, index) => (
                    <div key={index} className="flex items-center gap-apple-3 py-apple-2">
                      <div className={`w-2 h-2 rounded-full ${
                        activity.status === 'success' ? 'bg-green-500' :
                        activity.status === 'progress' ? 'bg-blue-500' : 'bg-gray-300'
                      }`} />
                      <div className="flex-1">
                        <div className="text-apple-body text-mc-text">{activity.action}</div>
                        <div className="text-apple-caption1 mc-text-secondary">{activity.time}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Next Steps */}
              <div className="apple-card p-apple-6">
                <h3 className="text-apple-headline font-semibold mb-apple-4 flex items-center gap-2">
                  <Target className="w-5 h-5 text-apple-accent" />
                  Next Steps
                </h3>
                <div className="space-y-apple-4">
                  {checklistItems
                    .filter(item => item.status === 'in_progress' || item.status === 'pending')
                    .slice(0, 4)
                    .map((item) => (
                      <div key={item.id} className="flex items-center gap-apple-3 py-apple-2">
                        <div className={`w-6 h-6 rounded-apple-xs border-2 flex items-center justify-center ${
                          item.status === 'in_progress' ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                        }`}>
                          {item.status === 'in_progress' && (
                            <div className="w-3 h-3 bg-blue-500 rounded-apple-xs" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="text-apple-body text-mc-text">{item.title}</div>
                          <div className="text-apple-caption1 mc-text-secondary">{item.description}</div>
                        </div>
                        <div className={`px-2 py-1 rounded-apple-xs text-apple-caption2 font-medium ${getPriorityColor(item.priority)}`}>
                          {item.priority}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'checklist' && (
            <div className="space-y-apple-8">
              {/* Kanban Board */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-apple-6">
                {['pre_launch', 'launch', 'post_launch'].map((category) => (
                  <div key={category} className="apple-card p-apple-6">
                    <h3 className="text-apple-headline font-semibold mb-apple-4 capitalize">
                      {category.replace('_', ' ')} 
                      <span className="ml-2 text-apple-caption1 mc-text-secondary">
                        ({checklistItems.filter(item => item.category === category).length})
                      </span>
                    </h3>
                    <div className="space-y-apple-3">
                      {checklistItems
                        .filter(item => item.category === category)
                        .map((item) => (
                          <div key={item.id} className="border border-mc-border rounded-apple-lg p-apple-4 bg-mc-bg hover:shadow-apple-sm transition-shadow">
                            <div className="flex items-start gap-apple-3">
                              <div className="flex-shrink-0 mt-1">
                                {item.status === 'completed' ? (
                                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                                ) : (
                                  <Circle className="w-5 h-5 text-gray-400" />
                                )}
                              </div>
                              <div className="flex-1">
                                <div className={`text-apple-subhead font-medium ${
                                  item.status === 'completed' ? 'text-gray-500 line-through' : 'text-mc-text'
                                }`}>
                                  {item.title}
                                </div>
                                <div className="text-apple-caption1 mc-text-secondary mt-1">
                                  {item.description}
                                </div>
                                <div className="flex items-center gap-apple-2 mt-apple-3">
                                  <span className={`px-2 py-1 rounded-apple-full text-apple-caption2 font-medium border ${getStatusColor(item.status)}`}>
                                    {item.status.replace('_', ' ')}
                                  </span>
                                  <span className={`px-2 py-1 rounded-apple-full text-apple-caption2 font-medium ${getPriorityColor(item.priority)}`}>
                                    {item.priority}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'timeline' && (
            <div className="apple-card p-apple-6">
              <h3 className="text-apple-headline font-semibold mb-apple-6 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-apple-accent" />
                Launch Timeline
              </h3>
              <div className="relative">
                <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-mc-border"></div>
                <div className="space-y-apple-6">
                  {milestones.map((milestone, index) => (
                    <div key={milestone.id} className="relative flex items-center gap-apple-4">
                      <div className={`relative z-10 w-12 h-12 rounded-full border-4 flex items-center justify-center ${
                        milestone.status === 'completed' 
                          ? 'bg-green-500 border-green-200' 
                          : milestone.status === 'current'
                          ? 'bg-blue-500 border-blue-200'
                          : 'bg-gray-200 border-gray-100'
                      }`}>
                        {milestone.status === 'completed' ? (
                          <CheckCircle2 className="w-6 h-6 text-white" />
                        ) : milestone.status === 'current' ? (
                          <Clock className="w-6 h-6 text-white" />
                        ) : (
                          <Circle className="w-6 h-6 text-gray-400" />
                        )}
                      </div>
                      <div className="flex-1 bg-mc-bg-secondary rounded-apple-lg p-apple-4">
                        <div className="flex items-center justify-between mb-apple-2">
                          <h4 className="text-apple-subhead font-semibold text-mc-text">{milestone.title}</h4>
                          <span className="text-apple-caption1 mc-text-secondary">
                            {new Date(milestone.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        <div className={`inline-block px-2 py-1 rounded-apple-full text-apple-caption2 font-medium border ${getStatusColor(milestone.status)}`}>
                          {milestone.status}
                        </div>
                        {milestone.dependencies && milestone.dependencies.length > 0 && (
                          <div className="mt-apple-2">
                            <span className="text-apple-caption1 mc-text-secondary">
                              Depends on: {milestone.dependencies.join(', ')}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'resources' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-apple-6">
              {resourceLinks.map((link, index) => (
                <a
                  key={link.id}
                  href={link.url}
                  className="apple-card p-apple-6 hover:shadow-apple-md transition-shadow group animate-apple-slide-up"
                  style={{ animationDelay: `${index * 0.1}s` }}
                  target={link.url.startsWith('http') ? '_blank' : '_self'}
                  rel="noopener noreferrer"
                >
                  <div className="flex items-center justify-between mb-apple-4">
                    <div className="w-12 h-12 bg-mc-bg-tertiary rounded-apple-lg flex items-center justify-center group-hover:bg-apple-accent/10 transition-colors">
                      <link.icon className="w-6 h-6 text-mc-text-secondary group-hover:text-apple-accent transition-colors" />
                    </div>
                    <ExternalLink className="w-4 h-4 text-mc-text-secondary group-hover:text-apple-accent transition-colors" />
                  </div>
                  <h3 className="text-apple-subhead font-semibold text-mc-text group-hover:text-apple-accent transition-colors">
                    {link.title}
                  </h3>
                  <div className="mt-apple-2">
                    <span className="px-2 py-1 bg-mc-bg-tertiary rounded-apple-full text-apple-caption2 font-medium mc-text-secondary capitalize">
                      {link.category.replace('_', ' ')}
                    </span>
                  </div>
                </a>
              ))}
            </div>
          )}
          
        </div>
      </main>
    </div>
  );
}