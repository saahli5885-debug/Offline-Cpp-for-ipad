import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Archive,
  Check,
  Download,
  FileBox,
  FileCode2,
  FilePlus2,
  FileText,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { VfsChangeKind, VirtualFile } from '../vfs/types';
import {
  formatFileSize,
  isBinaryFileName,
  isCppSyntaxFile,
  validateFileName,
} from '../vfs/vfsHelpers';

interface WorkspaceSidebarProps {
  open: boolean;
  isOverlayDrawer: boolean;
  files: VirtualFile[];
  activeFileName: string;
  primaryEntryFile: string;
  recentChanges: Record<string, VfsChangeKind>;
  storageError: string | null;
  statusMessage: string | null;
  onClose: () => void;
  onSelectFile: (name: string) => void;
  onCreateFile: (name: string) => { ok: boolean; error?: string };
  onRenameFile: (oldName: string, newName: string) => { ok: boolean; error?: string };
  onDeleteFile: (name: string) => void;
  onImportFiles: (fileList: FileList) => void;
  onExportFile: (name: string) => void;
  onExportAllZip: () => void;
  onDismissStorageError: () => void;
}

function FileTypeIcon({ name }: { name: string }) {
  if (isCppSyntaxFile(name)) {
    return <FileCode2 className="h-4 w-4 shrink-0 text-[var(--app-accent)]" />;
  }
  if (isBinaryFileName(name)) {
    return <FileBox className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />;
  }
  return <FileText className="h-4 w-4 shrink-0 text-[var(--app-text-secondary)]" />;
}

export function WorkspaceSidebar({
  open,
  isOverlayDrawer,
  files,
  activeFileName,
  primaryEntryFile,
  recentChanges,
  storageError,
  statusMessage,
  onClose,
  onSelectFile,
  onCreateFile,
  onRenameFile,
  onDeleteFile,
  onImportFiles,
  onExportFile,
  onExportAllZip,
  onDismissStorageError,
}: WorkspaceSidebarProps) {
  const [creating, setCreating] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);

  const [confirmDeleteFile, setConfirmDeleteFile] = useState<string | null>(null);
  const [expandedActionsFile, setExpandedActionsFile] = useState<string | null>(null);

  const newFileInputRef = useRef<HTMLInputElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (creating) {
      setTimeout(() => newFileInputRef.current?.focus(), 20);
    }
  }, [creating]);

  useEffect(() => {
    if (renamingFile) {
      setTimeout(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      }, 20);
    }
  }, [renamingFile]);

  // Escape closes inline create/rename/delete forms first, or drawer on narrow screens
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (creating) {
        setCreating(false);
        setCreateError(null);
        return;
      }
      if (renamingFile) {
        setRenamingFile(null);
        setRenameError(null);
        return;
      }
      if (confirmDeleteFile) {
        setConfirmDeleteFile(null);
        return;
      }
      if (expandedActionsFile) {
        setExpandedActionsFile(null);
        return;
      }
      if (isOverlayDrawer) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    open,
    isOverlayDrawer,
    onClose,
    creating,
    renamingFile,
    confirmDeleteFile,
    expandedActionsFile,
  ]);

  if (!open) return null;

  const existingNames = files.map((f) => f.name);

  const handleSubmitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateFileName(newFileName, existingNames);
    if (!check.ok) {
      setCreateError(check.error);
      return;
    }
    const res = onCreateFile(check.normalized);
    if (!res.ok) {
      setCreateError(res.error ?? 'Не удалось создать файл.');
      return;
    }
    setCreating(false);
    setNewFileName('');
    setCreateError(null);
  };

  const handleSubmitRename = (e: React.FormEvent, oldName: string) => {
    e.preventDefault();
    const check = validateFileName(renameDraft, existingNames, oldName);
    if (!check.ok) {
      setRenameError(check.error);
      return;
    }
    if (check.normalized === oldName) {
      setRenamingFile(null);
      setRenameError(null);
      return;
    }
    const res = onRenameFile(oldName, check.normalized);
    if (!res.ok) {
      setRenameError(res.error ?? 'Не удалось переименовать файл.');
      return;
    }
    setRenamingFile(null);
    setRenameError(null);
    setExpandedActionsFile(null);
  };

  const handleImportInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onImportFiles(e.target.files);
    }
    e.target.value = '';
  };

  const sidebarBody = (
    <aside
      id="workspace-sidebar"
      data-testid="workspace-sidebar"
      aria-label="Файлы виртуальной рабочей области"
      className="flex h-full w-full flex-col border-r border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)]"
    >
      {/* Header */}
      <div className="flex min-h-[44px] shrink-0 items-center justify-between gap-2 border-b border-[var(--app-border)] px-3">
        <div className="flex min-w-0 items-center gap-2">
          <FolderOpen className="h-4 w-4 shrink-0 text-[var(--app-accent)]" />
          <span className="truncate text-xs font-semibold uppercase tracking-wide text-[var(--app-text)]">
            Файлы
          </span>
          <span className="rounded bg-[var(--app-elevated)] px-1.5 py-0.5 font-mono text-[11px] font-medium text-[var(--app-text-secondary)] tabular-nums">
            {files.length}
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Скрыть панель файлов"
          title="Скрыть панель файлов"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Primary Workspace Actions (touch targets >= 44px) */}
      <div className="shrink-0 space-y-1.5 border-b border-[var(--app-border)] p-2">
        <button
          type="button"
          data-testid="new-file-button"
          onClick={() => {
            setCreating(true);
            setCreateError(null);
            setConfirmDeleteFile(null);
            setRenamingFile(null);
          }}
          className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-[var(--app-border-strong)] bg-[var(--app-elevated)] px-3 text-xs font-semibold text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)]"
        >
          <FilePlus2 className="h-4 w-4 text-[var(--app-accent)]" />
          <span>Новый файл</span>
        </button>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            data-testid="import-files-button"
            onClick={() => importInputRef.current?.click()}
            aria-label="Импорт из Файлов (Import from Files)"
            title="Импорт из приложения «Файлы» iPadOS"
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-inset)] px-2 text-xs font-medium text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
          >
            <Upload className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Импорт</span>
          </button>

          <button
            type="button"
            data-testid="export-zip-button"
            onClick={onExportAllZip}
            aria-label="Сохранить всё в Файлы (.zip)"
            title="Сохранить все файлы рабочей области в .zip"
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-inset)] px-2 text-xs font-medium text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
          >
            <Archive className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">В .zip</span>
          </button>
        </div>

        <input
          ref={importInputRef}
          data-testid="vfs-import-input"
          type="file"
          multiple
          accept=".txt,.cpp,.cc,.cxx,.c,.h,.hpp,.hh,.csv,.dat,.bin,.json,.md"
          onChange={handleImportInputChange}
          className="hidden"
          aria-hidden="true"
        />
      </div>

      {/* Explicit IndexedDB Storage Error Banner (Zero Silent Failures) */}
      {storageError && (
        <div
          role="alert"
          className="mx-2 mt-2 flex items-start gap-2 rounded-lg border border-rose-500/35 bg-rose-500/10 p-2.5 text-xs text-rose-600 dark:text-rose-300"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1 leading-snug">{storageError}</div>
          <button
            type="button"
            onClick={onDismissStorageError}
            aria-label="Закрыть предупреждение хранилища"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-rose-500/15"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Inline New File Creation Form */}
      {creating && (
        <form
          onSubmit={handleSubmitCreate}
          data-testid="new-file-form"
          className="mx-2 mt-2 rounded-lg border border-[var(--app-accent)] bg-[var(--app-inset)] p-2"
        >
          <label className="block text-[11px] font-medium text-[var(--app-text-secondary)]">
            Имя файла (например, input.txt, header.h)
          </label>
          <input
            ref={newFileInputRef}
            type="text"
            value={newFileName}
            onChange={(e) => {
              setNewFileName(e.target.value);
              if (createError) setCreateError(null);
            }}
            placeholder="input.txt"
            aria-label="Имя нового файла"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            className="mt-1.5 h-10 w-full rounded-md border border-[var(--app-border-strong)] bg-[var(--app-bg)] px-2.5 font-mono text-xs text-[var(--app-text)] outline-none focus:border-[var(--app-accent)]"
          />
          {createError && (
            <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">{createError}</p>
          )}
          <div className="mt-2 flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setNewFileName('');
                setCreateError(null);
              }}
              className="inline-flex min-h-[44px] items-center rounded-md px-3 text-xs font-medium text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="inline-flex min-h-[44px] items-center gap-1 rounded-md bg-[var(--app-accent)] px-3 text-xs font-semibold text-white hover:bg-[var(--app-accent-hover)]"
            >
              <Check className="h-3.5 w-3.5" />
              <span>Создать</span>
            </button>
          </div>
        </form>
      )}

      {/* Virtual Files List */}
      <div
        data-testid="workspace-file-list"
        className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2"
      >
        <ul className="space-y-1">
          {files.map((file) => {
            const isActive = file.name === activeFileName;
            const isProtectedEntry = file.name === primaryEntryFile;
            const changeBadge = recentChanges[file.name];
            const isRenaming = renamingFile === file.name;
            const isConfirmingDelete = confirmDeleteFile === file.name;
            const isActionsOpen = expandedActionsFile === file.name;

            if (isRenaming) {
              return (
                <li
                  key={file.name}
                  className="rounded-lg border border-[var(--app-accent)] bg-[var(--app-inset)] p-2"
                >
                  <form onSubmit={(e) => handleSubmitRename(e, file.name)}>
                    <input
                      ref={renameInputRef}
                      type="text"
                      value={renameDraft}
                      onChange={(e) => {
                        setRenameDraft(e.target.value);
                        if (renameError) setRenameError(null);
                      }}
                      aria-label={`Новое имя для ${file.name}`}
                      spellCheck={false}
                      autoCorrect="off"
                      autoCapitalize="off"
                      className="h-10 w-full rounded-md border border-[var(--app-border-strong)] bg-[var(--app-bg)] px-2 font-mono text-xs text-[var(--app-text)] outline-none focus:border-[var(--app-accent)]"
                    />
                    {renameError && (
                      <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">
                        {renameError}
                      </p>
                    )}
                    <div className="mt-1.5 flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingFile(null);
                          setRenameError(null);
                        }}
                        className="inline-flex min-h-[44px] items-center rounded-md px-2.5 text-xs text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)]"
                      >
                        Отмена
                      </button>
                      <button
                        type="submit"
                        className="inline-flex min-h-[44px] items-center rounded-md bg-[var(--app-accent)] px-3 text-xs font-semibold text-white hover:bg-[var(--app-accent-hover)]"
                      >
                        Сохранить
                      </button>
                    </div>
                  </form>
                </li>
              );
            }

            return (
              <li
                key={file.name}
                data-testid={`vfs-file-${file.name}`}
                data-vfs-change={changeBadge ?? ''}
                className={`rounded-lg border transition-colors ${
                  isActive
                    ? 'border-[var(--app-accent)]/50 bg-[var(--app-accent-soft)]'
                    : changeBadge === 'created'
                      ? 'border-emerald-500/40 bg-emerald-500/10'
                      : changeBadge === 'modified'
                        ? 'border-blue-500/40 bg-blue-500/10'
                        : 'border-transparent hover:bg-[var(--app-hover)]/70'
                }`}
              >
                <div className="flex min-h-[44px] items-center gap-1 pr-1">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectFile(file.name);
                      setConfirmDeleteFile(null);
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-lg pl-2.5 pr-1 text-left"
                  >
                    <FileTypeIcon name={file.name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`truncate font-mono text-xs ${
                            isActive
                              ? 'font-semibold text-[var(--app-text)]'
                              : 'font-medium text-[var(--app-text)]'
                          }`}
                        >
                          {file.name}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[var(--app-text-muted)] tabular-nums">
                        <span>{formatFileSize(file.size)}</span>
                        {isProtectedEntry && (
                          <span className="font-sans font-medium text-[var(--app-accent)]">
                            · запуск
                          </span>
                        )}
                        {changeBadge === 'created' && (
                          <span className="font-sans font-semibold text-emerald-600 dark:text-emerald-400">
                            · создан
                          </span>
                        )}
                        {changeBadge === 'modified' && (
                          <span className="font-sans font-semibold text-blue-600 dark:text-blue-400">
                            · обновлён
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setExpandedActionsFile((prev) => (prev === file.name ? null : file.name));
                      setConfirmDeleteFile(null);
                    }}
                    aria-label={`Действия для файла ${file.name}`}
                    aria-expanded={isActionsOpen}
                    title={`Действия: ${file.name}`}
                    className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors ${
                      isActionsOpen
                        ? 'bg-[var(--app-elevated)] text-[var(--app-text)]'
                        : 'text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]'
                    }`}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </div>

                {/* Touch-friendly per-file action tray (>= 44px targets) */}
                {isActionsOpen && !isConfirmingDelete && (
                  <div className="flex items-center justify-end gap-1 border-t border-[var(--app-border)]/70 px-1.5 py-1">
                    <button
                      type="button"
                      onClick={() => {
                        onExportFile(file.name);
                        setExpandedActionsFile(null);
                      }}
                      aria-label={`Сохранить ${file.name} в Файлы`}
                      title="Сохранить в Файлы"
                      className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1 rounded-md px-2 text-[11px] font-medium text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Сохранить</span>
                    </button>

                    {!isProtectedEntry && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingFile(file.name);
                            setRenameDraft(file.name);
                            setRenameError(null);
                            setConfirmDeleteFile(null);
                          }}
                          aria-label={`Переименовать ${file.name}`}
                          title="Переименовать"
                          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setConfirmDeleteFile(file.name)}
                          aria-label={`Удалить ${file.name}`}
                          title="Удалить файл"
                          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Inline 2-tap delete confirmation (no window.confirm) */}
                {isConfirmingDelete && (
                  <div className="flex items-center justify-between gap-2 border-t border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5">
                    <span className="truncate text-xs font-medium text-rose-700 dark:text-rose-300">
                      Удалить файл?
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteFile(null)}
                        className="inline-flex min-h-[44px] items-center rounded-md px-2.5 text-xs text-[var(--app-text)] hover:bg-[var(--app-hover)]"
                      >
                        Нет
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteFile(file.name);
                          setConfirmDeleteFile(null);
                          setExpandedActionsFile(null);
                        }}
                        aria-label={`Подтвердить удаление ${file.name}`}
                        className="inline-flex min-h-[44px] items-center rounded-md bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-700"
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Subtle status / fstream tip footer */}
      <div className="shrink-0 border-t border-[var(--app-border)] px-3 py-2 text-[11px] leading-snug text-[var(--app-text-muted)]">
        {statusMessage ? (
          <span data-testid="vfs-status-message" className="font-medium text-[var(--app-text)]">
            {statusMessage}
          </span>
        ) : (
          <span>
            Файлы сохраняются офлайн в IndexedDB и доступны в{' '}
            <code className="font-mono text-[var(--app-text-secondary)]">&lt;fstream&gt;</code> и{' '}
            <code className="font-mono text-[var(--app-text-secondary)]">&lt;cstdio&gt;</code>.
          </span>
        )}
      </div>
    </aside>
  );

  if (isOverlayDrawer) {
    return (
      <div className="fixed inset-0 z-40 flex">
        <button
          type="button"
          aria-label="Закрыть панель файлов"
          onClick={onClose}
          className="fixed inset-0 bg-black/45 backdrop-blur-[1px]"
        />
        <div className="relative z-10 h-full w-[290px] max-w-[85vw] shadow-2xl">
          {sidebarBody}
        </div>
      </div>
    );
  }

  return <div className="h-full w-64 shrink-0">{sidebarBody}</div>;
}
