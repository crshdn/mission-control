import { logger } from '@/lib/logger';
import {
  disableDebugInStorage,
  enableDebugInStorage,
  isDebugEnabledInStorage,
} from './runtime-compat';
/**
 * Debug Logging Utility
 * Enable with localStorage.setItem('MC_DEBUG', 'true')
 * Or run mcDebug.enable() in browser console
 */

const isDebugEnabled = (): boolean => {
  if (typeof window === 'undefined') return true; // Always log server-side
  return isDebugEnabledInStorage(localStorage);
};

export const debug = {
  sse: (message: string, data?: unknown) => {
    if (isDebugEnabled()) {
      logger.info(`[SSE] ${message}`, data !== undefined ? data : '');
    }
  },
  store: (message: string, data?: unknown) => {
    if (isDebugEnabled()) {
      logger.info(`[STORE] ${message}`, data !== undefined ? data : '');
    }
  },
  api: (message: string, data?: unknown) => {
    if (isDebugEnabled()) {
      logger.info(`[API] ${message}`, data !== undefined ? data : '');
    }
  },
  config: (message: string, data?: unknown) => {
    if (isDebugEnabled()) {
      logger.info(`[CONFIG] ${message}`, data !== undefined ? data : '');
    }
  },
  file: (message: string, data?: unknown) => {
    if (isDebugEnabled()) {
      logger.info(`[FILE] ${message}`, data !== undefined ? data : '');
    }
  }
};

// Enable debug mode helper
export const enableDebug = () => {
  if (typeof window !== 'undefined') {
    enableDebugInStorage(localStorage);
    logger.info('[DEBUG] Debug mode enabled. Refresh to see all logs.');
  }
};

export const disableDebug = () => {
  if (typeof window !== 'undefined') {
    disableDebugInStorage(localStorage);
    logger.info('[DEBUG] Debug mode disabled.');
  }
};

// Expose to window for easy access in browser console
if (typeof window !== 'undefined') {
  (window as unknown as { mcDebug: { enable: () => void; disable: () => void } }).mcDebug = {
    enable: enableDebug,
    disable: disableDebug
  };
}
