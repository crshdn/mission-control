import {NextRequest, NextResponse} from 'next/server';
import createMiddleware from 'next-intl/middleware'; // 引入 next-intl 中间件工厂 / Import next-intl middleware factory
import {routing} from '@/i18n/routing'; // 引入语言路由配置 / Import locale routing configuration

// 使用 next-intl 创建页面路由中间件 / Create page routing middleware using next-intl
const handleI18n = createMiddleware(routing); // 负责非 API 路由的语言检测与重写 / Handles locale detection & rewrites for non-API routes

// Log warning at startup if auth is disabled / 启动时在未配置鉴权时输出警告
const MC_API_TOKEN = process.env.MC_API_TOKEN;
if (!MC_API_TOKEN) {
  console.warn('[SECURITY WARNING] MC_API_TOKEN not set - API authentication is DISABLED (local dev mode)');
}

/**
 * Check if a request originates from the same host (browser UI).
 * Same-origin browser requests include a Referer or Origin header
 * pointing to the MC server itself. Server-side render fetches
 * (Next.js RSC) come from the same process and have no Origin.
 *
 * 检查请求是否来自同源浏览器 UI，用于放行前端自身调用 /api 的场景。
 * This checks if the request comes from the same-origin browser UI to allow
 * the frontend to call /api endpoints without extra tokens.
 */
function isSameOriginRequest(request: NextRequest): boolean {
  const host = request.headers.get('host');
  if (!host) return false;

  // Server-side fetches from Next.js (no origin/referer) — same process / 无 Origin/Referer 的请求视为非浏览器同源
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  // If neither origin nor referer is set, this is likely a server-side
  // fetch or a direct curl. Require auth for these (external API calls).
  // 如果两者都不存在，则视为服务端或外部调用，需要令牌鉴权 / When both are missing, treat as server or external call, require token auth
  if (!origin && !referer) return false;

  // Check if Origin matches the host / 检查 Origin 是否与 host 匹配
  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.host === host) return true;
    } catch {
      // Invalid origin header / 非法 Origin 头
    }
  }

  // Check if Referer matches the host / 检查 Referer 是否与 host 匹配
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (refererUrl.host === host) return true;
    } catch {
      // Invalid referer header / 非法 Referer 头
    }
  }

  return false;
}

// Demo mode — read-only, blocks all mutations / Demo 模式：只读，阻止所有写操作
const DEMO_MODE = process.env.DEMO_MODE === 'true';
if (DEMO_MODE) {
  console.log('[DEMO] Running in demo mode — all write operations are blocked');
}

export function middleware(request: NextRequest) {
  const {pathname} = request.nextUrl; // 获取请求路径名 / Read request pathname

  // ===== 分支 1：API 路由（完全跳过 next-intl） / Branch 1: API routes (skip next-intl entirely) =====
  if (pathname.startsWith('/api/')) {
    // Demo mode: block all write operations / Demo 模式：阻止所有写操作请求
    if (DEMO_MODE) {
      const method = request.method.toUpperCase();
      if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
        return NextResponse.json(
          {error: 'Demo mode — this is a read-only instance. Visit github.com/crshdn/mission-control to run your own!'},
          {status: 403}
        );
      }
      return NextResponse.next();
    }

    // If MC_API_TOKEN is not set, auth is disabled (dev mode) / 如果未设置 MC_API_TOKEN，则禁用鉴权（开发模式）
    if (!MC_API_TOKEN) {
      return NextResponse.next();
    }

    // Allow same-origin browser requests (UI fetching its own API) / 允许同源浏览器请求直接访问 API
    if (isSameOriginRequest(request)) {
      return NextResponse.next();
    }

    // Special case: /api/events/stream (SSE) - allow token as query param
    // 特殊情况：/api/events/stream（SSE），允许使用 query 参数传 token
    if (pathname === '/api/events/stream') {
      const queryToken = request.nextUrl.searchParams.get('token');
      if (queryToken && queryToken === MC_API_TOKEN) {
        return NextResponse.next();
      }
      // Fall through to header check below / 继续走头部鉴权逻辑
    }

    // Check Authorization header for bearer token / 校验 Authorization 头中的 Bearer 令牌
    const authHeader = request.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix / 去掉 'Bearer ' 前缀

    if (token !== MC_API_TOKEN) {
      return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    return NextResponse.next(); // API 分支结束，返回放行响应 / End of API branch, allow request
  }

  // ===== 分支 2：页面路由（交给 next-intl） / Branch 2: Page routes (handled by next-intl) =====
  // 对非 /api 路由使用 next-intl 中间件执行语言检测与路由重写
  // Use next-intl middleware for non-API routes to handle locale detection & rewrites
  const response = handleI18n(request);

  // 如处于 Demo 模式，为 UI 页面添加 Demo 头，便于前端感知
  // When in demo mode, add demo header to UI responses for frontend detection
  if (DEMO_MODE && response instanceof NextResponse) {
    response.headers.set('X-Demo-Mode', 'true');
  }

  return response; // 返回经过 i18n 处理的响应 / Return i18n-processed response
}

export const config = {
  matcher: [
    // 页面路由匹配：排除 /api、/_next、/_vercel 以及带点号的静态资源
    // Page routes: match all except /api, /_next, /_vercel and dot-files (static assets)
    '/((?!api|_next|_vercel|.*\\..*).*)',

    // API 路由匹配：确保 API 中间件逻辑仍然生效
    // API routes: ensure API middleware logic continues to run
    '/api/:path*'
  ]
}; // 导出 matcher 配置 / Export matcher configuration

