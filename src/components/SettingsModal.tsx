import { useEffect } from 'react';
import { Settings, Smartphone, X } from 'lucide-react';
import { MAX_TOP_EDGE_OFFSET, MIN_TOP_EDGE_OFFSET } from '../utils/layout';

interface SettingsModalProps {
  open: boolean;
  topEdgeOffset: number;
  onChangeTopEdgeOffset: (offsetPx: number) => void;
  onClose: () => void;
}

const TOP_OFFSET_PRESETS: Array<{ value: number; label: string }> = [
  { value: 0, label: '0 px — Как было' },
  { value: 24, label: '24 px' },
  { value: 36, label: '36 px' },
  { value: 48, label: '48 px' },
];

export function SettingsModal({
  open,
  topEdgeOffset,
  onChangeTopEdgeOffset,
  onClose,
}: SettingsModalProps) {
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
      aria-labelledby="settings-modal-title"
      data-testid="settings-modal"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 text-[var(--app-text)] shadow-xl"
      >
        <div className="flex items-center justify-between gap-4 border-b border-[var(--app-border)] pb-3">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 shrink-0 text-[var(--app-accent)]" />
            <h2 id="settings-modal-title" className="text-sm font-semibold text-[var(--app-text)]">
              Настройки
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть настройки"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 shrink-0 text-[var(--app-text-secondary)]" />
              <span className="text-xs font-semibold text-[var(--app-text)]">
                Верхний отступ (iPadOS)
              </span>
            </div>
            <span
              data-testid="top-offset-value"
              className="rounded-md border border-[var(--app-border)] bg-[var(--app-inset)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--app-text)] tabular-nums"
            >
              {topEdgeOffset} px
            </span>
          </div>

          <p className="text-xs leading-relaxed text-[var(--app-text-secondary)]">
            Сдвигает верхнюю панель вниз, чтобы строка состояния и системное размытие iPadOS не
            перекрывали кнопки в режиме приложения на экране «Домой».
          </p>

          {/* Quick preset buttons (>= 44px touch targets) */}
          <div className="grid grid-cols-2 gap-1.5 pt-1">
            {TOP_OFFSET_PRESETS.map((preset) => {
              const isSelected = topEdgeOffset === preset.value;
              return (
                <button
                  key={preset.value}
                  type="button"
                  data-testid={`top-offset-preset-${preset.value}`}
                  aria-pressed={isSelected}
                  onClick={() => onChangeTopEdgeOffset(preset.value)}
                  className={`flex min-h-[44px] items-center justify-center rounded-lg border px-2.5 text-xs font-medium transition-colors tabular-nums ${
                    isSelected
                      ? 'border-[var(--app-accent)] bg-[var(--app-accent-soft)] font-semibold text-[var(--app-text)]'
                      : 'border-[var(--app-border-strong)] bg-[var(--app-elevated)] text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Fine-tune range slider (0 to 64 px) */}
          <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-inset)] px-3 py-2.5">
            <label
              htmlFor="top-edge-offset-slider"
              className="flex items-center justify-between text-[11px] font-medium text-[var(--app-text-secondary)]"
            >
              <span>Точная настройка</span>
              <span className="font-mono tabular-nums text-[var(--app-text)]">
                {topEdgeOffset} px
              </span>
            </label>
            <input
              id="top-edge-offset-slider"
              data-testid="top-offset-slider"
              type="range"
              min={MIN_TOP_EDGE_OFFSET}
              max={MAX_TOP_EDGE_OFFSET}
              step={1}
              value={topEdgeOffset}
              onChange={(e) => onChangeTopEdgeOffset(Number(e.target.value))}
              aria-label="Верхний отступ (iPadOS) в пикселях"
              className="mt-2 h-8 w-full cursor-pointer accent-[var(--app-accent)]"
            />
            <div className="flex items-center justify-between font-mono text-[10px] text-[var(--app-text-muted)] tabular-nums">
              <span>0 px</span>
              <span>32 px</span>
              <span>64 px</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
