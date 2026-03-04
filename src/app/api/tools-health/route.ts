import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface ToolHealth {
  id: string;
  name: string;
  url: string;
  status: 'online' | 'offline' | 'degraded' | 'maintenance';
  responseTime: number;
  uptime: number;
  errorCount: number;
  lastError?: {
    timestamp: string;
    message: string;
    statusCode?: number;
  };
  lastChecked: string;
  category: 'conversion' | 'generation' | 'analysis' | 'utility';
}

const ATELIER_TOOLS = [
  { name: 'Word Counter', url: 'https://ateliertools.com/tools/word-counter/', category: 'analysis' as const },
  { name: 'QR Code Generator', url: 'https://ateliertools.com/tools/qr-code-generator/', category: 'generation' as const },
  { name: 'Lorem Ipsum Generator', url: 'https://ateliertools.com/tools/lorem-ipsum/', category: 'generation' as const },
  { name: 'UUID Generator', url: 'https://ateliertools.com/tools/uuid-generator/', category: 'utility' as const },
  { name: 'Password Generator', url: 'https://ateliertools.com/tools/password-generator/', category: 'utility' as const },
  { name: 'Markdown Editor', url: 'https://ateliertools.com/tools/markdown-editor/', category: 'utility' as const },
  { name: 'Color Palette Generator', url: 'https://ateliertools.com/tools/color-palette/', category: 'generation' as const },
  { name: 'PDF Page Orientation', url: 'https://ateliertools.com/tools/pdf-page-orientation/', category: 'analysis' as const },
  { name: 'PDF Security Checker', url: 'https://ateliertools.com/tools/pdf-security-checker/', category: 'analysis' as const },
  { name: 'PDF Version Checker', url: 'https://ateliertools.com/tools/pdf-version-checker/', category: 'analysis' as const },
  { name: 'PDF Accessibility Checker', url: 'https://ateliertools.com/tools/pdf-accessibility-checker/', category: 'analysis' as const },
  { name: 'PDF Reading Time', url: 'https://ateliertools.com/tools/pdf-reading-time/', category: 'analysis' as const }
];

async function checkToolHealth(tool: typeof ATELIER_TOOLS[0]): Promise<ToolHealth> {
  const startTime = Date.now();
  let status: ToolHealth['status'] = 'online';
  let responseTime = 0;
  let lastError: ToolHealth['lastError'] | undefined;

  try {
    const response = await fetch(tool.url, {
      method: 'HEAD',
      timeout: 10000 // 10 second timeout
    } as any);
    
    responseTime = Date.now() - startTime;
    
    if (!response.ok) {
      status = 'degraded';
      lastError = {
        timestamp: new Date().toISOString(),
        message: `HTTP ${response.status}: ${response.statusText}`,
        statusCode: response.status
      };
    }
  } catch (error) {
    responseTime = Date.now() - startTime;
    status = 'offline';
    lastError = {
      timestamp: new Date().toISOString(),
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }

  // Calculate mock uptime (in real implementation, this would come from persistent storage/monitoring)
  const uptime = status === 'online' ? 99.5 + Math.random() * 0.5 : 95.0 + Math.random() * 4.0;
  
  // Mock error count (in real implementation, this would come from error tracking)
  const errorCount = status === 'offline' ? Math.floor(Math.random() * 10) + 1 : 
                    status === 'degraded' ? Math.floor(Math.random() * 3) : 0;

  return {
    id: `tool-${tool.name.toLowerCase().replace(/\s+/g, '-')}`,
    name: tool.name,
    url: tool.url,
    status,
    responseTime,
    uptime,
    errorCount,
    lastError,
    lastChecked: new Date().toISOString(),
    category: tool.category
  };
}

async function fetchToolsHealth(): Promise<ToolHealth[]> {
  // In development, return mock data to avoid hitting real endpoints repeatedly
  if (process.env.NODE_ENV === 'development') {
    return ATELIER_TOOLS.map((tool, index) => {
      const statusOptions: ToolHealth['status'][] = ['online', 'online', 'online', 'online', 'degraded', 'offline'];
      const status = statusOptions[Math.floor(Math.random() * statusOptions.length)];
      
      return {
        id: `tool-${tool.name.toLowerCase().replace(/\s+/g, '-')}`,
        name: tool.name,
        url: tool.url,
        status,
        responseTime: status === 'online' ? 150 + Math.random() * 300 : 
                     status === 'degraded' ? 800 + Math.random() * 1200 : 
                     5000 + Math.random() * 5000,
        uptime: status === 'online' ? 99.0 + Math.random() * 1.0 : 
                status === 'degraded' ? 95.0 + Math.random() * 4.0 : 
                80.0 + Math.random() * 15.0,
        errorCount: status === 'offline' ? Math.floor(Math.random() * 10) + 1 : 
                   status === 'degraded' ? Math.floor(Math.random() * 3) : 0,
        lastError: status !== 'online' ? {
          timestamp: new Date(Date.now() - Math.random() * 1000 * 60 * 60 * 24).toISOString(),
          message: status === 'offline' ? 'Connection timeout' : 'Slow response time detected',
          statusCode: status === 'offline' ? undefined : 500
        } : undefined,
        lastChecked: new Date().toISOString(),
        category: tool.category
      };
    });
  }

  // In production, actually check each tool
  const healthChecks = await Promise.allSettled(
    ATELIER_TOOLS.map(tool => checkToolHealth(tool))
  );

  return healthChecks.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      // Fallback for failed health checks
      const tool = ATELIER_TOOLS[index];
      return {
        id: `tool-${tool.name.toLowerCase().replace(/\s+/g, '-')}`,
        name: tool.name,
        url: tool.url,
        status: 'offline' as const,
        responseTime: 0,
        uptime: 0,
        errorCount: 1,
        lastError: {
          timestamp: new Date().toISOString(),
          message: 'Health check failed'
        },
        lastChecked: new Date().toISOString(),
        category: tool.category
      };
    }
  });
}

export async function GET() {
  try {
    const toolsHealth = await fetchToolsHealth();
    
    // Sort by status (online first), then by name
    const sortedTools = toolsHealth.sort((a, b) => {
      const statusOrder = { online: 0, degraded: 1, maintenance: 2, offline: 3 };
      const statusDiff = statusOrder[a.status] - statusOrder[b.status];
      if (statusDiff !== 0) return statusDiff;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json(sortedTools);
  } catch (error) {
    console.error('Failed to fetch tools health:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tools health' },
      { status: 500 }
    );
  }
}