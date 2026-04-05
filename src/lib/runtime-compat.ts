export const PRIMARY_API_TOKEN_ENV = 'MC_API_TOKEN';
export const LEGACY_API_TOKEN_ENV = 'AUTENSA_API_TOKEN';

export const PRIMARY_DEBUG_STORAGE_KEY = 'MC_DEBUG';
export const LEGACY_DEBUG_STORAGE_KEY = 'AUTENSA_DEBUG';

export const PRIMARY_TASK_READS_STORAGE_KEY = 'mc-task-reads';
export const LEGACY_TASK_READS_STORAGE_KEY = 'autensa-task-reads';

export const PRIMARY_BOARD_OVERRIDE_HEADER = 'x-mc-board-override';
export const LEGACY_BOARD_OVERRIDE_HEADER = 'x-autensa-board-override';

type EnvSource = Record<string, string | undefined>;

export function getApiToken(env: EnvSource = process.env): string | undefined {
  const primary = env[PRIMARY_API_TOKEN_ENV]?.trim();
  if (primary) return primary;

  const legacy = env[LEGACY_API_TOKEN_ENV]?.trim();
  if (legacy) return legacy;

  return undefined;
}

type StorageReader = Pick<Storage, 'getItem'>;
type StorageWriter = Pick<Storage, 'setItem' | 'removeItem'>;

export function isDebugEnabledInStorage(storage: StorageReader): boolean {
  return (
    storage.getItem(PRIMARY_DEBUG_STORAGE_KEY) === 'true' ||
    storage.getItem(LEGACY_DEBUG_STORAGE_KEY) === 'true'
  );
}

export function enableDebugInStorage(storage: StorageWriter): void {
  storage.setItem(PRIMARY_DEBUG_STORAGE_KEY, 'true');
  storage.removeItem(LEGACY_DEBUG_STORAGE_KEY);
}

export function disableDebugInStorage(storage: StorageWriter): void {
  storage.removeItem(PRIMARY_DEBUG_STORAGE_KEY);
  storage.removeItem(LEGACY_DEBUG_STORAGE_KEY);
}