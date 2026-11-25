import { useEffect, useState } from 'react';
import { CheckCircle2, Download, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWA';

interface PWAInstallButtonProps {
  offlineReady: boolean;
  isOnline: boolean;
  variant?: 'topbar' | 'menuitem';
  className?: string;
  onActionComplete?: () => void;
}

export function PWAInstallButton({
  offlineReady,
  isOnline,
  variant = 'topbar',
  className = '',
  onActionComplete,
}: PWAInstallButtonProps) {
  const { isInstalled, isIOS, actionMode, install } = usePWAInstall();
  const [guideOpen, setGuideOpen] = useState(false);

  const closeGuide = () => {
    setGuideOpen(false);
    onActionComplete?.();
  };

  useEffect(() => {
    if (!guideOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setGuideOpen(false);
        onActionComplete?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [guideOpen, onActionComplete]);

  // Hide automatically when running as an installed standalone PWA
  if (isInstalled || actionMode === 'hidden') {
    return null;
  }

  const handleClick = async () => {
    if (actionMode === 'native-prompt') {
      await install();
      onActionComplete?.();
      return;
    }
    setGuideOpen(true);
  };

  const buttonLabel =
    actionMode === 'native-prompt'
      ? 'Установить'
      : actionMode === 'ios-guide'
        ? 'На экран'
        : 'Офлайн';

  const buttonAriaLabel =
    actionMode === 'native-prompt'
      ? 'Установить приложение для работы без интернета'
      : actionMode === 'ios-guide'
        ? 'Установить на iPad или iPhone для работы без интернета'
        : 'Офлайн-режим и установка приложения';

  return (
    <>
      {variant === 'menuitem' ? (
        <button
          type="button"
          role="menuitem"
          onClick={() => void handleClick()}
          className={`${className || 'flex'} w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-[var(--app-text)] hover:bg-[var(--app-hover)]`}
        >
          {isIOS ? (
            <Smartphone className="h-3.5 w-3.5 text-[var(--app-text-secondary)]" />
          ) : (
            <Download className="h-3.5 w-3.5 text-[var(--app-text-secondary)]" />
          )}
          <span>
            {actionMode === 'native-prompt'
              ? 'Установить приложение (PWA)'
              : 'Офлайн и установка'}
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void handleClick()}
          aria-label={buttonAriaLabel}
          title={buttonAriaLabel}
          className={`${className || 'inline-flex'} h-8 items-center gap-1.5 rounded-lg border px-2 sm:px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
            actionMode === 'native-prompt'
              ? 'border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-text)]'
              : 'border-[var(--app-border-strong)] bg-[var(--app-elevated)] text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]'
          }`}
        >
          {isIOS ? (
            <Smartphone className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <Download className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="hidden md:inline">{buttonLabel}</span>
        </button>
      )}

      {guideOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
          onClick={closeGuide}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pwa-install-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="pwa-install-title"
                  className="text-base font-semibold text-[var(--app-text)]"
                >
                  Работа без интернета и установка
                </h2>
                <p className="mt-1 text-xs text-[var(--app-text-secondary)]">
                  Компилятор C++ и C работает полностью локально прямо в браузере.
                </p>
              </div>
              <button
                type="button"
                onClick={closeGuide}
                aria-label="Закрыть окно установки"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2.5 text-xs">
              <CheckCircle2
                className={`h-4 w-4 shrink-0 ${
                  offlineReady
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-blue-600 dark:text-blue-400'
                }`}
              />
              <span className="text-[var(--app-text)]">
                {!isOnline
                  ? 'Сейчас активен офлайн-режим — приложение работает из локального кэша.'
                  : offlineReady
                    ? 'Кэш сохранён: приложение готово к запуску и компиляции без интернета.'
                    : 'Сохранение файлов в локальный кэш браузера…'}
              </span>
            </div>

            <div className="mt-4 space-y-3 text-xs leading-relaxed text-[var(--app-text-secondary)]">
              <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)]/50 p-3">
                <div className="flex items-center gap-1.5 font-semibold text-[var(--app-text)]">
                  <Share className="h-3.5 w-3.5 text-[var(--app-accent)]" />
                  <span>На iPad и iPhone (Safari)</span>
                </div>
                <ol className="mt-2 list-decimal space-y-1 pl-4">
                  <li>
                    Нажмите кнопку <strong className="text-[var(--app-text)]">«Поделиться»</strong> в панели Safari.
                  </li>
                  <li>
                    Выберите пункт <strong className="text-[var(--app-text)]">«На экран „Домой“»</strong> и нажмите <strong className="text-[var(--app-text)]">«Добавить»</strong>.
                  </li>
                  <li>
                    Открывайте C++ Studio с рабочего стола даже в авиарежиме.
                  </li>
                </ol>
              </div>

              {!isIOS && (
                <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)]/50 p-3">
                  <div className="flex items-center gap-1.5 font-semibold text-[var(--app-text)]">
                    <Download className="h-3.5 w-3.5 text-[var(--app-accent)]" />
                    <span>На компьютере и Android (Chrome / Edge)</span>
                  </div>
                  <p className="mt-1.5">
                    Нажмите значок установки в адресной строке браузера или пункт{' '}
                    <strong className="text-[var(--app-text)]">«Установить приложение»</strong> в меню браузера.
                  </p>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={closeGuide}
              className="mt-4 w-full rounded-xl bg-[var(--app-accent)] py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--app-accent-hover)]"
            >
              Понятно
            </button>
          </div>
        </div>
      )}
    </>
  );
}
