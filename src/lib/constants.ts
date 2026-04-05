/**
 * Application constants to avoid magic numbers throughout the codebase
 */

// Timeouts (in milliseconds)
export const CHAT_REPLY_TIMEOUT_MS = 300000; // 5 minutes
export const SSE_RECONNECT_DELAY_MS = 5000; // 5 seconds
export const SSE_KEEPALIVE_INTERVAL_MS = 30000; // 30 seconds
export const SSE_HEALTH_CHECK_INTERVAL_MS = 120000; // 2 minutes
export const DISPATCH_TIMEOUT_MS = 30000; // 30 seconds

// WebSocket timeouts
export const WS_CONNECTION_TIMEOUT_MS = 10000; // 10 seconds
export const WS_RECONNECT_DELAY_MS = 10000; // 10 seconds

// UI
export const SWIPE_BATCH_THRESHOLD = 10;

