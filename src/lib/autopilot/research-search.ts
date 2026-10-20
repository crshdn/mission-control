import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Product } from '@/lib/types';

const SEARCH_MCP_URL = 'https://search.parallel.ai/mcp';
const USER_AGENT = 'Autensa-Research/1.0 (+https://github.com/crshdn/mission-control)';
const SEARCH_TIMEOUT_MS = 20_000;
const MAX_EXCERPT_CHARS = 20_000;

export interface ResearchEvidence {
  provider: 'parallel';
  retrieved_at: string;
  excerpts: string;
}

export interface ResearchSearchOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

function searchEnabled(product: Product): boolean {
  const deployment = process.env.AUTOPILOT_RESEARCH_SEARCH;
  // A deployment-wide off switch also covers products with saved settings.
  if (deployment === 'none') return false;
  if (deployment !== undefined && deployment !== '' && deployment !== 'parallel') {
    throw new Error('AUTOPILOT_RESEARCH_SEARCH must be parallel or none');
  }

  // Fail closed on malformed settings rather than unexpectedly sending a query.
  const settings = product.settings ? JSON.parse(product.settings) : {};
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('Product settings must be a JSON object');
  }
  const provider = settings.research_search;
  if (provider === 'none') return false;
  if (provider !== undefined && provider !== 'parallel') {
    throw new Error('Product research_search must be parallel or none');
  }
  return true;
}

/**
 * Retrieve one shared set of web evidence for a research cycle, including A/B
 * variants. Only the product name is sent, never its program or learned preferences.
 * The persisted opaque cycle ID owns session_id, so recovery keeps the same ID.
 */
export async function gatherResearchEvidence(
  product: Product,
  cycleId: string,
  { signal, timeoutMs = SEARCH_TIMEOUT_MS }: ResearchSearchOptions = {},
): Promise<ResearchEvidence | null> {
  if (!searchEnabled(product)) return null;
  signal?.throwIfAborted();

  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(new Error('Research web search timed out')), timeoutMs);
  const requestSignal = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
  const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
  // Explicit credentials are used as configured, with no anonymous fallback.
  const apiKey = process.env.PARALLEL_API_KEY;
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const client = new Client({ name: 'autensa-research', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(SEARCH_MCP_URL), {
    requestInit: { headers, redirect: 'error' },
    // Include the overall deadline on HTTP reads as well as MCP requests.
    fetch: (input, init) => fetch(input, {
      ...init,
      signal: init?.signal ? AbortSignal.any([init.signal, requestSignal]) : requestSignal,
    }),
    reconnectionOptions: {
      maxRetries: 0,
      initialReconnectionDelay: 1000,
      maxReconnectionDelay: 1000,
      reconnectionDelayGrowFactor: 1,
    },
  });
  const requestOptions = { signal: requestSignal, timeout: timeoutMs, maxTotalTimeout: timeoutMs };

  try {
    await client.connect(transport, requestOptions);
    const { tools } = await client.listTools({}, requestOptions);
    if (!tools.some(tool => tool.name === 'web_search')) {
      throw new Error('Parallel Search MCP did not offer web_search');
    }
    const result = CallToolResultSchema.parse(await client.callTool({
      name: 'web_search',
      arguments: {
        objective: `Find current competitors, market trends and technology opportunities for ${product.name}. Include source URLs.`,
        search_queries: [`${product.name} competitors alternatives`, `${product.name} technology trends`],
        session_id: cycleId,
      },
    }, undefined, requestOptions));
    if (result.isError) throw new Error('Parallel web search failed: ' + result.content
      .filter(content => content.type === 'text').map(content => content.text).join('\n'));

    const excerpts = result.content
      .filter(content => content.type === 'text').map(content => content.text).join('\n')
      .slice(0, MAX_EXCERPT_CHARS);
    if (!excerpts.trim()) throw new Error('Parallel web search returned no text evidence');
    return { provider: 'parallel', retrieved_at: new Date().toISOString(), excerpts };
  } finally {
    clearTimeout(timer);
    await client.close();
  }
}
