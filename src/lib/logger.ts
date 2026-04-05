import pino from 'pino';

const pinoLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(process.env.NODE_ENV !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
      },
    },
  }),
});

function formatArgs(args: unknown[]): unknown[] {
  if (args.length === 0) return [''];
  if (typeof args[0] === 'string') {
    if (args.length === 1) return [args[0]];
    const msg = args[0];
    const rest = args.slice(1);
    return [{ data: rest.length === 1 ? rest[0] : rest }, msg];
  }
  return [args[0], ...args.slice(1)];
}

function formatErrorArgs(args: unknown[]): unknown[] {
  if (args.length === 0) return [''];
  if (typeof args[0] === 'string') {
    if (args.length === 1) return [args[0]];
    const msg = args[0];
    const rest = args.slice(1);
    if (rest.length === 1 && rest[0] instanceof Error) {
        return [{ err: rest[0] }, msg];
    }
    return [{ err: rest.length === 1 ? rest[0] : rest }, msg];
  }
  if (args[0] instanceof Error) {
      return [{ err: args[0] }, ...args.slice(1)];
  }
  return [args[0], ...args.slice(1)];
}

export const logger = {
  info: (...args: unknown[]) => pinoLogger.info(...(formatArgs(args) as Parameters<typeof pinoLogger.info>)),
  error: (...args: unknown[]) => pinoLogger.error(...(formatErrorArgs(args) as Parameters<typeof pinoLogger.error>)),
  warn: (...args: unknown[]) => pinoLogger.warn(...(formatArgs(args) as Parameters<typeof pinoLogger.warn>)),
  debug: (...args: unknown[]) => pinoLogger.debug(...(formatArgs(args) as Parameters<typeof pinoLogger.debug>)),
};