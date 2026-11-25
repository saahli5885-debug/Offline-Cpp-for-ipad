export type AutosaveState = 'saved' | 'saving' | 'disabled' | 'error';

export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export interface SaveResult {
  ok: boolean;
  savedAt: number | null;
  error?: string;
}

export function safeReadStorage(
  key: string,
  fallback: string,
  storage?: StorageLike | null
): string {
  try {
    const target = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!target) return fallback;
    return target.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function safeWriteStorage(
  key: string,
  value: string,
  storage?: StorageLike | null,
  now: number = Date.now()
): SaveResult {
  try {
    const target = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!target) {
      return { ok: false, savedAt: null, error: 'Хранилище недоступно' };
    }
    target.setItem(key, value);
    return { ok: true, savedAt: now };
  } catch (err) {
    const message =
      err instanceof Error && err.name === 'QuotaExceededError'
        ? 'Недостаточно места в локальном хранилище'
        : 'Не удалось сохранить локально';
    return { ok: false, savedAt: null, error: message };
  }
}

export function parseAutosaveEnabled(raw: string | null | undefined): boolean {
  if (raw === 'false' || raw === '0' || raw === 'off') {
    return false;
  }
  return true;
}

export function parseSavedTimestamp(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export function formatSavedTimeLabel(timestamp: number | null): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function getAutosaveStatusText(state: AutosaveState, savedAt: number | null): {
  shortLabel: string;
  tooltip: string;
} {
  if (state === 'disabled') {
    return {
      shortLabel: 'Автосохр. выкл',
      tooltip: 'Автосохранение выключено. Нажмите, чтобы включить и сохранить текущий код.',
    };
  }
  if (state === 'saving') {
    return {
      shortLabel: 'Сохранение…',
      tooltip: 'Сохранение изменений в локальное хранилище браузера…',
    };
  }
  if (state === 'error') {
    return {
      shortLabel: 'Ошибка сохр.',
      tooltip: 'Не удалось сохранить код в localStorage. Нажмите, чтобы повторить.',
    };
  }
  const timeStr = formatSavedTimeLabel(savedAt);
  return {
    shortLabel: timeStr ? `Сохранено ${timeStr}` : 'Автосохранено',
    tooltip: timeStr
      ? `Автосохранение включено · последнее сохранение в ${timeStr}. Нажмите, чтобы выключить.`
      : 'Автосохранение включено. Нажмите, чтобы выключить.',
  };
}
