/**
 * Server-Sent Events (SSE) endpoint for real-time updates
 * Clients connect to this endpoint and receive live event broadcasts
 */

import { NextRequest } from 'next/server';
import { registerClient, unregisterClient } from '@/lib/events';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  let keepAliveInterval: NodeJS.Timeout | null = null;
  let isControllerClosed = false;

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    start(controller) {
      // Register this client
      registerClient(controller);

      // Send initial connection message
      try {
        controller.enqueue(encoder.encode(`: connected\n\n`));
      } catch (error) {
        console.error('[SSE] Failed to send initial message:', error);
        isControllerClosed = true;
        return;
      }

      // Set up keep-alive ping every 30 seconds
      keepAliveInterval = setInterval(() => {
        if (isControllerClosed) {
          if (keepAliveInterval) clearInterval(keepAliveInterval);
          return;
        }
        try {
          controller.enqueue(encoder.encode(`: keep-alive\n\n`));
        } catch (error) {
          // Client disconnected
          console.log('[SSE] Keep-alive failed, client likely disconnected');
          isControllerClosed = true;
          if (keepAliveInterval) clearInterval(keepAliveInterval);
          unregisterClient(controller);
        }
      }, 30000);

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        console.log('[SSE] Client disconnected (abort signal)');
        isControllerClosed = true;
        if (keepAliveInterval) {
          clearInterval(keepAliveInterval);
          keepAliveInterval = null;
        }
        unregisterClient(controller);
        try {
          controller.close();
        } catch (error) {
          // Controller may already be closed - this is expected
        }
      });
    },
    cancel() {
      // Called when the stream is cancelled
      console.log('[SSE] Stream cancelled');
      isControllerClosed = true;
      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
      }
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
