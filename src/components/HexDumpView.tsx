import { useMemo, useState } from 'react';
import { Binary } from 'lucide-react';
import type { HexDumpPayload } from '../vfs/types';
import { buildHexDumpRows } from '../vfs/vfsHelpers';

const DEFAULT_HEX_PREVIEW_BYTES = 4096;

interface HexDumpViewProps {
  payload: HexDumpPayload;
}

function formatByteHex(value: number): string {
  return value.toString(16).padStart(2, '0').toUpperCase();
}

export function HexDumpView({ payload }: HexDumpViewProps) {
  const [showAll, setShowAll] = useState(false);

  const isTruncated = !showAll && payload.totalBytes > DEFAULT_HEX_PREVIEW_BYTES;
  const displayLimit = isTruncated ? DEFAULT_HEX_PREVIEW_BYTES : payload.totalBytes;

  const rows = useMemo(
    () => buildHexDumpRows(payload.bytes, displayLimit),
    [payload.bytes, displayLimit]
  );

  return (
    <div
      data-testid="console-hexdump"
      data-hexdump-path={payload.path}
      className="my-2 overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-inset)] text-[var(--app-text)]"
    >
      {/* Header showing path and exact raw byte size */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 font-mono text-xs font-semibold tabular-nums">
          <Binary className="h-3.5 w-3.5 shrink-0 text-[var(--app-accent)]" />
          <span className="truncate">
            Hex-дамп: {payload.path} ({payload.totalBytes} Б)
          </span>
        </div>
        {isTruncated && (
          <span className="font-sans text-[11px] text-[var(--app-text-muted)] tabular-nums">
            Первые {DEFAULT_HEX_PREVIEW_BYTES} из {payload.totalBytes} Б
          </span>
        )}
      </div>

      {payload.totalBytes === 0 ? (
        <div className="px-3 py-2.5 font-mono text-xs text-[var(--app-text-muted)]">
          (пустой файл — 0 Б)
        </div>
      ) : (
        <div className="overflow-x-auto px-2.5 py-2.5 sm:px-3">
          <div className="inline-block min-w-full font-mono text-[11px] leading-[1.65] tabular-nums">
            {/* Canonical column ruler matching exact byte cell geometry */}
            <div
              aria-hidden="true"
              className="mb-1 flex select-none items-center gap-2 border-b border-[var(--app-border)]/70 pb-1 text-[var(--app-text-muted)] whitespace-pre"
            >
              <span className="w-[8ch] shrink-0">СМЕЩЕНИЕ</span>
              <span className="inline-flex shrink-0 items-center gap-[0.65ch]">
                {['00', '01', '02', '03', '04', '05', '06', '07'].map((h) => (
                  <span key={h} className="inline-block w-[2ch]">
                    {h}
                  </span>
                ))}
              </span>
              <span className="inline-flex shrink-0 items-center gap-[0.65ch]">
                {['08', '09', '0A', '0B', '0C', '0D', '0E', '0F'].map((h) => (
                  <span key={h} className="inline-block w-[2ch]">
                    {h}
                  </span>
                ))}
              </span>
              <span className="shrink-0 pl-0.5">ASCII</span>
            </div>

            {rows.map((row) => (
              <div
                key={row.offset}
                className="flex items-center gap-2 whitespace-pre hover:bg-[var(--app-hover)]/45"
              >
                <span className="w-[8ch] shrink-0 text-[var(--app-accent)]">
                  {row.offsetHex}
                </span>

                <span className="inline-flex shrink-0 items-center gap-[0.65ch]">
                  {row.leftBytes.map((b, idx) =>
                    b === null ? (
                      <span key={idx} className="inline-block w-[2ch] select-none">
                        {'  '}
                      </span>
                    ) : (
                      <span
                        key={idx}
                        data-zero-byte={b === 0 ? 'true' : undefined}
                        className={
                          b === 0
                            ? 'inline-block w-[2ch] text-[var(--app-text-muted)] opacity-45'
                            : 'inline-block w-[2ch] text-[var(--app-text)]'
                        }
                      >
                        {formatByteHex(b)}
                      </span>
                    )
                  )}
                </span>

                <span className="inline-flex shrink-0 items-center gap-[0.65ch]">
                  {row.rightBytes.map((b, idx) =>
                    b === null ? (
                      <span key={idx} className="inline-block w-[2ch] select-none">
                        {'  '}
                      </span>
                    ) : (
                      <span
                        key={idx}
                        data-zero-byte={b === 0 ? 'true' : undefined}
                        className={
                          b === 0
                            ? 'inline-block w-[2ch] text-[var(--app-text-muted)] opacity-45'
                            : 'inline-block w-[2ch] text-[var(--app-text)]'
                        }
                      >
                        {formatByteHex(b)}
                      </span>
                    )
                  )}
                </span>

                <span className="shrink-0 pl-0.5 text-[var(--app-text-secondary)]">
                  <span className="text-[var(--app-text-muted)] opacity-60">|</span>
                  <span>{row.ascii}</span>
                  <span className="text-[var(--app-text-muted)] opacity-60">|</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isTruncated && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-1.5">
          <span className="font-sans text-xs text-[var(--app-text-secondary)] tabular-nums">
            Скрыто ещё {payload.totalBytes - DEFAULT_HEX_PREVIEW_BYTES} Б
          </span>
          <button
            type="button"
            data-testid="hexdump-show-all"
            onClick={() => setShowAll(true)}
            className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-[var(--app-border-strong)] bg-[var(--app-elevated)] px-3 font-sans text-xs font-semibold text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)]"
          >
            Показать все байты
          </button>
        </div>
      )}
    </div>
  );
}
