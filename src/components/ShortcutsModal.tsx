import { useEffect } from 'react';
import { X } from 'lucide-react';

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { keys: ['⌘', 'Enter'], label: 'Скомпилировать и запустить код' },
  { keys: ['⌘', '⇧', 'F'], label: 'Форматировать код (clang-format стиль)' },
  { keys: ['⌘', '\\'], label: 'Сменить раскладку: Рядом / Сверху / Вкладки' },
  { keys: ['⌘', '.'], label: 'Остановить выполняющуюся программу' },
  { keys: ['⌘', 'B'], label: 'Переключить фокус: Редактор ↔ Консоль' },
  { keys: ['⌘', 'K'], label: 'Очистить консоль' },
  { keys: ['⌘', '/'], label: 'Закомментировать / раскомментировать строку' },
  { keys: ['⌘', 'F'], label: 'Поиск по коду' },
  { keys: ['⌘', 'S'], label: 'Скачать текущий файл (.cpp / .c)' },
  { keys: ['⌘', '+ / -'], label: 'Увеличить или уменьшить шрифт' },
  { keys: ['Ctrl', 'D'], label: 'Отправить конец ввода (EOF) в консоль' },
  { keys: ['Tab'], label: 'Отступ 4 пробела (Shift+Tab — убрать)' },
];

export function ShortcutsModal({ open, onClose }: ShortcutsModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-xl"
      >
        <div className="flex items-center justify-between gap-4 border-b border-[var(--app-border)] pb-3">
          <h2 id="shortcuts-title" className="text-sm font-semibold text-[var(--app-text)]">
            Горячие клавиши Magic Keyboard
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть окно горячих клавиш"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="mt-3 divide-y divide-[var(--app-border)]">
          {SHORTCUTS.map((item) => (
            <li key={item.label} className="flex items-center justify-between gap-4 py-2.5 text-xs">
              <span className="text-[var(--app-text-secondary)]">{item.label}</span>
              <span className="flex shrink-0 items-center gap-1">
                {item.keys.map((k) => (
                  <kbd
                    key={k}
                    className="rounded border border-[var(--app-border-strong)] bg-[var(--app-bg)] px-1.5 py-0.5 font-mono text-[11px] font-medium text-[var(--app-text)]"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
