/**
 * Daemon logger with [DAEMON] prefix and ISO timestamps
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function format(level: LogLevel, message: string): string {
  const ts = new Date().toISOString();
  return `[DAEMON] ${ts} [${level.toUpperCase()}] ${message}`;
}

export const log = {
  debug(message: string, ...args: unknown[]): void {
    if (process.env.DAEMON_DEBUG === 'true') {
      console.log(format('debug', message), ...args);
    }
  },

  info(message: string, ...args: unknown[]): void {
    console.log(format('info', message), ...args);
  },

  warn(message: string, ...args: unknown[]): void {
    console.warn(format('warn', message), ...args);
  },

  error(message: string, ...args: unknown[]): void {
    console.error(format('error', message), ...args);
  },
};
