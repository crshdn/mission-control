/**
 * Server-Sent Events (SSE) endpoint for real-time updates
 * Clients connect to this endpoint and receive live event broadcasts
 */

import { NextRequest } from 'next/server';
import { registerClient, unregisterClient, getActiveConnectionCount } from '@/lib/events';
import { runHealthCheckCycle } from '@/lib/agent-health';
import { sweepActiveConvoys } from '@/lib/convoy-dispatch';
import { checkAndRunDueSchedules } from '@/lib/autopilot/scheduling';
import { attachChatListener } from '@/lib/chat-listener';

export const dynamic = 'force-dynamic';

// Attach the chat listener on first SSE connection (idempotent)
attachChatListener();

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    start(controller) {
      // Register this client
      registerClient(controller);

      // Send initial connection message
      const connectMsg = encoder.encode(`: connected\n\n`);
      controller.enqueue(connectMsg);

      // Set up keep-alive ping every 30 seconds
      const keepAliveInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keep-alive\n\n`));
        } catch (error) {
          // Client disconnected
          clearInterval(keepAliveInterval);
        }
      }, 30000);

      // Agent health check + convoy dispatch sweep every 2 minutes
      const healthCheckInterval = setInterval(async () => {
        try {
          if (getActiveConnectionCount() > 0) {
            await runHealthCheckCycle();
            await sweepActiveConvoys();
          }
        } catch (error) {
          console.error('[SSE] Health check / convoy sweep error:', error);
        }
      }, 120000);

      // Product schedule tick every 60 seconds
      const schedulingInterval = setInterval(async () => {
        try {
          if (getActiveConnectionCount() > 0) {
            await checkAndRunDueSchedules();
          }
        } catch (error) {
          console.error('[SSE] Scheduling tick error:', error);
        }
      }, 60000);

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        clearInterval(keepAliveInterval);
        clearInterval(healthCheckInterval);
        clearInterval(schedulingInterval);
        unregisterClient(controller);
        try {
          controller.close();
        } catch (error) {
          // Controller may already be closed
        }
      });
    },
  });

  // Return SSE response
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
