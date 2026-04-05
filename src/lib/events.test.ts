import test from 'node:test';
import assert from 'node:assert/strict';

test('broadcast stops the health-check timer when the last client is pruned', async () => {
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;

  let clearCalls = 0;

  globalThis.setInterval = ((fn: TimerHandler, delay?: number, ...args: unknown[]) => {
    return originalSetInterval(fn, delay, ...args);
  }) as typeof setInterval;

  globalThis.clearInterval = ((handle: ReturnType<typeof setInterval>) => {
    clearCalls += 1;
    return originalClearInterval(handle);
  }) as typeof clearInterval;

  try {
    const events = await import('./events');

    const controller = {
      enqueue() {
        throw new Error('client disconnected');
      },
    } as unknown as ReadableStreamDefaultController;

    events.registerClient(controller);
    assert.equal(events.getActiveConnectionCount(), 1);

    events.broadcast({
      type: 'task_created',
      payload: {
        id: 'task-1',
        title: 'Test task',
        status: 'inbox',
        priority: 'normal',
        assigned_agent_id: null,
        created_by_agent_id: null,
        workspace_id: 'default',
        business_id: 'default',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    } as never);

    assert.equal(events.getActiveConnectionCount(), 0);
    assert.equal(clearCalls > 0, true, 'expected the health-check timer to be cleared');
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});