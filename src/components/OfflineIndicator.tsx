import { useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, WifiOff, X } from 'lucide-react';

interface OfflineIndicatorProps {
  isOnline: boolean;
  justCachedOffline: boolean;
  needRefresh: boolean;
  onApplyUpdate: () => void;
  onDismissOfflineToast: () => void;
}

export function OfflineIndicator({
  isOnline,
  justCachedOffline,
  needRefresh,
  onApplyUpdate,
  onDismissOfflineToast,
}: OfflineIndicatorProps) {
  const [offlineBannerDismissed, setOfflineBannerDismissed] = useState(false);

  // Re-show banner if connectivity transitions back to offline later
  useEffect(() => {
    if (isOnline) {
      setOfflineBannerDismissed(false);
    }
  }, [isOnline]);

  if (!isOnline && !offlineBannerDismissed) {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="offline-indicator"
        className="fixed bottom-3 left-3 z-40 flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-xl border border-amber-500/40 bg-[#141922]/95 px-3 py-2 text-xs font-medium text-amber-200 shadow-lg backdrop-blur-sm dark:border-amber-400/35"
      >
        <WifiOff className="h-3.5 w-3.5 shrink-0 text-amber-400" />
        <span className="truncate">Офлайн-режим — компилятор работает локально</span>
        <button
          type="button"
          onClick={() => setOfflineBannerDismissed(true)}
          aria-label="Скрыть уведомление об офлайн-режиме"
          className="ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-amber-300/80 transition-colors hover:bg-white/10 hover:text-amber-100"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  if (needRefresh) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-3 left-3 z-40 flex max-w-[calc(100vw-1.5rem)] items-center gap-2.5 rounded-xl border border-blue-500/35 bg-[#141922]/95 px-3 py-2 text-xs font-medium text-[#E6EDF3] shadow-lg backdrop-blur-sm"
      >
        <RefreshCw className="h-3.5 w-3.5 shrink-0 text-blue-400" />
        <span>Доступна новая офлайн-версия</span>
        <button
          type="button"
          onClick={onApplyUpdate}
          className="rounded-md bg-[#2563EB] px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-[#1D4ED8]"
        >
          Обновить
        </button>
      </div>
    );
  }

  if (justCachedOffline) {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="offline-ready-toast"
        className="fixed bottom-3 left-3 z-40 flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-xl border border-emerald-500/35 bg-[#141922]/95 px-3 py-2 text-xs font-medium text-emerald-200 shadow-lg backdrop-blur-sm"
      >
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
        <span>Готово к работе без интернета</span>
        <button
          type="button"
          onClick={onDismissOfflineToast}
          aria-label="Закрыть уведомление"
          className="ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-emerald-300/80 transition-colors hover:bg-white/10 hover:text-emerald-100"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return null;
}
