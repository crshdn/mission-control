/**
 * Next.js Instrumentation - Runs on server startup
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on server
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Start the completion listener
    const { startCompletionListener } = await import('./lib/completion-listener');
    startCompletionListener();
    
    console.log('[INSTRUMENTATION] Mission Control server initialized');
  }
}
