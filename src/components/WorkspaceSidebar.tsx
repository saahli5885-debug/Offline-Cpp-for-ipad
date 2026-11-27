import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Archive,
  Binary,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  FileBox,
  FileCode2,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  VfsChangeKind,
  VirtualFile,
  VirtualFolder,
  WorkspaceTreeFileNode,
  WorkspaceTreeFolderNode,
  WorkspaceTreeNode,
} from '../vfs/types';
import {
  buildWorkspaceTree,
  formatFileSize,
  getParentFolderPaths,
  isBinaryFileName,
  isCppSyntaxFile,
  validateFileName,
  validateFolderName,
} from '../vfs/vfsHelpers';

interface WorkspaceSidebarProps {
  open: boolean;
  isOverlayDrawer: boolean;
  files: VirtualFile[];
  folders: VirtualFolder[];
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
  onCreateFolder: (path: string) => { ok: boolean; error?: string };
  onRenameFolder: (oldPath: string, newPath: string) => { ok: boolean; error?: string };
  onDeleteFolder: (path: string) => void;
  onHexDumpFile: (name: string) => void;
  onImportFiles: (fileList: FileList) => void;
  onExportFile: (name: string) => void;
  onExportAllZip: () => void;
  onDismissStorageError: () => void;
}

type CreateTarget = { kind: 'file' | 'folder'; parentDir: string };
type RenameTarget = { kind: 'file' | 'folder'; path: string };
type ActionMenuTarget = { kind: 'file' | 'folder'; path: string };
type DeleteTarget = { kind: 'file' | 'folder'; path: string };

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
  folders,
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
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onHexDumpFile,
  onImportFiles,
  onExportFile,
  onExportAllZip,
  onDismissStorageError,
}: WorkspaceSidebarProps) {
  const [createTarget, setCreateTarget] = useState<CreateTarget | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<DeleteTarget | null>(null);
  const [expandedActions, setExpandedActions] = useState<ActionMenuTarget | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});

  const newItemInputRef = useRef<HTMLInputElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const treeNodes = useMemo(
    () => buildWorkspaceTree(files, folders, primaryEntryFile),
    [files, folders, primaryEntryFile]
  );

  // Auto-expand ancestor folders when a nested file becomes active or is created/updated at runtime
  useEffect(() => {
    const pathsToReveal: string[] = [
      ...getParentFolderPaths(activeFileName),
      ...Object.keys(recentChanges).flatMap((p) => getParentFolderPaths(p)),
    ];
    if (pathsToReveal.length === 0) return;
    setCollapsedFolders((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const dir of pathsToReveal) {
        if (next[dir]) {
          delete next[dir];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [activeFileName, recentChanges]);

  useEffect(() => {
    if (createTarget) {
      setTimeout(() => newItemInputRef.current?.focus(), 20);
    }
  }, [createTarget]);

  useEffect(() => {
    if (renameTarget) {
      setTimeout(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      }, 20);
    }
  }, [renameTarget]);

  // Escape closes inline create/rename/delete forms first, or drawer on narrow screens
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (createTarget) {
        setCreateTarget(null);
        setCreateError(null);
        return;
      }
      if (renameTarget) {
        setRenameTarget(null);
        setRenameError(null);
        return;
      }
      if (confirmDelete) {
        setConfirmDelete(null);
        return;
      }
      if (expandedActions) {
        setExpandedActions(null);
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
    createTarget,
    renameTarget,
    confirmDelete,
    expandedActions,
  ]);

  if (!open) return null;

  const existingFileNames = files.map((f) => f.name);
  const existingFolderPaths = folders.map((f) => f.path);

  const revealAncestors = (path: string) => {
    const parents = getParentFolderPaths(path);
    if (parents.length === 0) return;
    setCollapsedFolders((prev) => {
      const next = { ...prev };
      for (const p of parents) delete next[p];
      return next;
    });
  };

  const openCreateForm = (kind: 'file' | 'folder', parentDir = '') => {
    setCreateTarget({ kind, parentDir });
    setNewItemName('');
    setCreateError(null);
    setConfirmDelete(null);
    setRenameTarget(null);
    setExpandedActions(null);
    if (parentDir) {
      setCollapsedFolders((prev) => {
        const next = { ...prev };
        delete next[parentDir];
        for (const p of getParentFolderPaths(parentDir)) delete next[p];
        return next;
      });
    }
  };

  const handleSubmitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createTarget) return;

    const trimmedDraft = newItemName.trim();
    const combinedRaw = createTarget.parentDir
      ? `${createTarget.parentDir}/${trimmedDraft}`
      : trimmedDraft;

    if (createTarget.kind === 'file') {
      const check = validateFileName(
        combinedRaw,
        existingFileNames,
        undefined,
        existingFolderPaths
      );
      if (!check.ok) {
        setCreateError(check.error);
        return;
      }
      const res = onCreateFile(check.normalized);
      if (!res.ok) {
        setCreateError(res.error ?? 'Не удалось создать файл.');
        return;
      }
      revealAncestors(check.normalized);
    } else {
      const check = validateFolderName(combinedRaw, existingFolderPaths, existingFileNames);
      if (!check.ok) {
        setCreateError(check.error);
        return;
      }
      const res = onCreateFolder(check.normalized);
      if (!res.ok) {
        setCreateError(res.error ?? 'Не удалось создать папку.');
        return;
      }
      revealAncestors(check.normalized);
    }

    setCreateTarget(null);
    setNewItemName('');
    setCreateError(null);
  };

  const handleSubmitRenameFile = (e: React.FormEvent, oldName: string) => {
    e.preventDefault();
    const check = validateFileName(
      renameDraft,
      existingFileNames,
      oldName,
      existingFolderPaths
    );
    if (!check.ok) {
      setRenameError(check.error);
      return;
    }
    if (check.normalized === oldName) {
      setRenameTarget(null);
      setRenameError(null);
      return;
    }
    const res = onRenameFile(oldName, check.normalized);
    if (!res.ok) {
      setRenameError(res.error ?? 'Не удалось переименовать файл.');
      return;
    }
    revealAncestors(check.normalized);
    setRenameTarget(null);
    setRenameError(null);
    setExpandedActions(null);
  };

  const handleSubmitRenameFolder = (e: React.FormEvent, oldPath: string) => {
    e.preventDefault();
    const check = validateFolderName(
      renameDraft,
      existingFolderPaths,
      existingFileNames,
      oldPath
    );
    if (!check.ok) {
      setRenameError(check.error);
      return;
    }
    if (check.normalized === oldPath) {
      setRenameTarget(null);
      setRenameError(null);
      return;
    }
    const res = onRenameFolder(oldPath, check.normalized);
    if (!res.ok) {
      setRenameError(res.error ?? 'Не удалось переименовать папку.');
      return;
    }
    revealAncestors(check.normalized);
    setRenameTarget(null);
    setRenameError(null);
    setExpandedActions(null);
  };

  const handleImportInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onImportFiles(e.target.files);
    }
    e.target.value = '';
  };

  const renderFileNode = (node: WorkspaceTreeFileNode) => {
    const file = node.file;
    const isActive = file.name === activeFileName;
    const isProtectedEntry = file.name === primaryEntryFile;
    const changeBadge = recentChanges[file.name];
    const isRenaming = renameTarget?.kind === 'file' && renameTarget.path === file.name;
    const isConfirmingDelete = confirmDelete?.kind === 'file' && confirmDelete.path === file.name;
    const isActionsOpen = expandedActions?.kind === 'file' && expandedActions.path === file.name;
    const indentPx = Math.min(node.depth, 6) * 14;

    if (isRenaming) {
      return (
        <li
          key={`file:${file.name}`}
          style={{ marginLeft: `${indentPx}px` }}
          className="rounded-lg border border-[var(--app-accent)] bg-[var(--app-inset)] p-2"
        >
          <form onSubmit={(e) => handleSubmitRenameFile(e, file.name)}>
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
              <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">{renameError}</p>
            )}
            <div className="mt-1.5 flex items-center justify-end gap-1">
              <button
                type="button"
                onClick={() => {
                  setRenameTarget(null);
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
        key={`file:${file.name}`}
        data-testid={`vfs-file-${file.name}`}
        data-vfs-change={changeBadge ?? ''}
        style={{ marginLeft: `${indentPx}px` }}
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
              setConfirmDelete(null);
            }}
            title={file.name}
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
                  {node.name}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[var(--app-text-muted)] tabular-nums">
                <span>{formatFileSize(file.size)}</span>
                {isProtectedEntry && (
                  <span className="font-sans font-medium text-[var(--app-accent)]">· запуск</span>
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
              setExpandedActions((prev) =>
                prev?.kind === 'file' && prev.path === file.name
                  ? null
                  : { kind: 'file', path: file.name }
              );
              setConfirmDelete(null);
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
          <div className="grid grid-cols-2 gap-1 border-t border-[var(--app-border)]/70 p-1.5">
            <button
              type="button"
              onClick={() => {
                onHexDumpFile(file.name);
                setExpandedActions(null);
              }}
              aria-label={`Hex-дамп ${file.name}`}
              title="Показать Hex-дамп в консоли"
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md bg-[var(--app-inset)] px-2 text-[11px] font-medium text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)]"
            >
              <Binary className="h-3.5 w-3.5 shrink-0 text-[var(--app-accent)]" />
              <span className="truncate">Hex-дамп</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onExportFile(file.name);
                setExpandedActions(null);
              }}
              aria-label={`Сохранить ${file.name} в Файлы`}
              title="Сохранить в Файлы"
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md bg-[var(--app-inset)] px-2 text-[11px] font-medium text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
            >
              <Download className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Сохранить</span>
            </button>

            {!isProtectedEntry && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setRenameTarget({ kind: 'file', path: file.name });
                    setRenameDraft(file.name);
                    setRenameError(null);
                    setConfirmDelete(null);
                  }}
                  aria-label={`Переименовать ${file.name}`}
                  title="Переименовать файл"
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md bg-[var(--app-inset)] px-2 text-[11px] font-medium text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
                >
                  <Pencil className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Переименовать</span>
                </button>

                <button
                  type="button"
                  onClick={() => setConfirmDelete({ kind: 'file', path: file.name })}
                  aria-label={`Удалить ${file.name}`}
                  title="Удалить файл"
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md bg-[var(--app-inset)] px-2 text-[11px] font-medium text-rose-600 transition-colors hover:bg-rose-500/10 dark:text-rose-400"
                >
                  <Trash2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Удалить</span>
                </button>
              </>
            )}
          </div>
        )}

        {/* Inline 2-tap file delete confirmation (no window.confirm) */}
        {isConfirmingDelete && (
          <div className="flex items-center justify-between gap-2 border-t border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5">
            <span className="truncate text-xs font-medium text-rose-700 dark:text-rose-300">
              Удалить файл?
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="inline-flex min-h-[44px] items-center rounded-md px-2.5 text-xs text-[var(--app-text)] hover:bg-[var(--app-hover)]"
              >
                Нет
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteFile(file.name);
                  setConfirmDelete(null);
                  setExpandedActions(null);
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
  };

  const renderFolderNode = (node: WorkspaceTreeFolderNode) => {
    const isExpanded = !collapsedFolders[node.path];
    const isRenaming = renameTarget?.kind === 'folder' && renameTarget.path === node.path;
    const isConfirmingDelete = confirmDelete?.kind === 'folder' && confirmDelete.path === node.path;
    const isActionsOpen = expandedActions?.kind === 'folder' && expandedActions.path === node.path;
    const indentPx = Math.min(node.depth, 6) * 14;

    if (isRenaming) {
      return (
        <li
          key={`folder:${node.path}`}
          style={{ marginLeft: `${indentPx}px` }}
          className="rounded-lg border border-[var(--app-accent)] bg-[var(--app-inset)] p-2"
        >
          <form onSubmit={(e) => handleSubmitRenameFolder(e, node.path)}>
            <label className="block text-[11px] font-medium text-[var(--app-text-secondary)]">
              Переименовать папку
            </label>
            <input
              ref={renameInputRef}
              type="text"
              value={renameDraft}
              onChange={(e) => {
                setRenameDraft(e.target.value);
                if (renameError) setRenameError(null);
              }}
              aria-label={`Новое имя папки ${node.path}`}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              className="mt-1 h-10 w-full rounded-md border border-[var(--app-border-strong)] bg-[var(--app-bg)] px-2 font-mono text-xs text-[var(--app-text)] outline-none focus:border-[var(--app-accent)]"
            />
            {renameError && (
              <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">{renameError}</p>
            )}
            <div className="mt-1.5 flex items-center justify-end gap-1">
              <button
                type="button"
                onClick={() => {
                  setRenameTarget(null);
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
      <li key={`folder:${node.path}`} className="space-y-0.5">
        <div
          data-testid={`vfs-folder-${node.path}`}
          style={{ marginLeft: `${indentPx}px` }}
          className="rounded-lg border border-transparent transition-colors hover:bg-[var(--app-hover)]/65"
        >
          <div className="flex min-h-[44px] items-center gap-0.5 pr-1">
            <button
              type="button"
              onClick={() =>
                setCollapsedFolders((prev) => ({
                  ...prev,
                  [node.path]: !prev[node.path],
                }))
              }
              aria-expanded={isExpanded}
              aria-label={`Папка ${node.path}`}
              title={node.path}
              className="flex min-h-[44px] min-w-0 flex-1 items-center gap-1.5 rounded-lg pl-2 pr-1 text-left"
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--app-text-muted)]" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--app-text-muted)]" />
              )}
              {isExpanded ? (
                <FolderOpen className="h-4 w-4 shrink-0 text-[var(--app-accent)]" />
              ) : (
                <Folder className="h-4 w-4 shrink-0 text-[var(--app-accent)]" />
              )}
              <span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold text-[var(--app-text)]">
                {node.name}
              </span>
              <span className="shrink-0 rounded bg-[var(--app-elevated)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--app-text-muted)] tabular-nums">
                {node.fileCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setExpandedActions((prev) =>
                  prev?.kind === 'folder' && prev.path === node.path
                    ? null
                    : { kind: 'folder', path: node.path }
                );
                setConfirmDelete(null);
              }}
              aria-label={`Действия для папки ${node.path}`}
              aria-expanded={isActionsOpen}
              title={`Действия: ${node.path}`}
              className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors ${
                isActionsOpen
                  ? 'bg-[var(--app-elevated)] text-[var(--app-text)]'
                  : 'text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]'
              }`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>

          {/* Touch-friendly per-folder action tray (>= 44px targets) */}
          {isActionsOpen && !isConfirmingDelete && (
            <div className="grid grid-cols-1 gap-1 border-t border-[var(--app-border)]/70 p-1.5">
              <button
                type="button"
                onClick={() => openCreateForm('file', node.path)}
                aria-label={`Новый файл в папке ${node.path}`}
                className="flex min-h-[44px] w-full items-center gap-2 rounded-md bg-[var(--app-inset)] px-2.5 text-left text-xs font-medium text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)]"
              >
                <FilePlus2 className="h-3.5 w-3.5 shrink-0 text-[var(--app-accent)]" />
                <span className="truncate">Новый файл в папке</span>
              </button>

              <button
                type="button"
                onClick={() => openCreateForm('folder', node.path)}
                aria-label={`Новая подпапка в ${node.path}`}
                className="flex min-h-[44px] w-full items-center gap-2 rounded-md bg-[var(--app-inset)] px-2.5 text-left text-xs font-medium text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)]"
              >
                <FolderPlus className="h-3.5 w-3.5 shrink-0 text-[var(--app-accent)]" />
                <span className="truncate">Новая подпапка</span>
              </button>

              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setRenameTarget({ kind: 'folder', path: node.path });
                    setRenameDraft(node.path);
                    setRenameError(null);
                    setConfirmDelete(null);
                  }}
                  aria-label={`Переименовать папку ${node.path}`}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-md bg-[var(--app-inset)] px-2 text-[11px] font-medium text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
                >
                  <Pencil className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Переименовать</span>
                </button>

                <button
                  type="button"
                  onClick={() => setConfirmDelete({ kind: 'folder', path: node.path })}
                  aria-label={`Удалить папку ${node.path}`}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-md bg-[var(--app-inset)] px-2 text-[11px] font-medium text-rose-600 transition-colors hover:bg-rose-500/10 dark:text-rose-400"
                >
                  <Trash2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Удалить</span>
                </button>
              </div>
            </div>
          )}

          {/* Inline 2-tap folder delete confirmation */}
          {isConfirmingDelete && (
            <div className="space-y-1.5 border-t border-rose-500/30 bg-rose-500/10 px-2.5 py-2">
              <div className="text-xs font-medium text-rose-700 dark:text-rose-300">
                Удалить папку и всё содержимое?
              </div>
              <div className="flex items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(null)}
                  className="inline-flex min-h-[44px] items-center rounded-md px-3 text-xs text-[var(--app-text)] hover:bg-[var(--app-hover)]"
                >
                  Нет
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteFolder(node.path);
                    setConfirmDelete(null);
                    setExpandedActions(null);
                  }}
                  aria-label={`Подтвердить удаление папки ${node.path}`}
                  className="inline-flex min-h-[44px] items-center rounded-md bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-700"
                >
                  Удалить
                </button>
              </div>
            </div>
          )}
        </div>

        {isExpanded && (
          <ul className="space-y-0.5">
            {node.children.length === 0 ? (
              <li
                style={{ marginLeft: `${Math.min(node.depth + 1, 6) * 14}px` }}
                className="px-3 py-1.5 text-[11px] italic text-[var(--app-text-muted)]"
              >
                Пустая папка
              </li>
            ) : (
              node.children.map((child) => renderTreeNode(child))
            )}
          </ul>
        )}
      </li>
    );
  };

  const renderTreeNode = (node: WorkspaceTreeNode) =>
    node.kind === 'folder' ? renderFolderNode(node) : renderFileNode(node);

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
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            data-testid="new-file-button"
            onClick={() => openCreateForm('file', '')}
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-[var(--app-border-strong)] bg-[var(--app-elevated)] px-2 text-xs font-semibold text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)]"
          >
            <FilePlus2 className="h-4 w-4 shrink-0 text-[var(--app-accent)]" />
            <span className="truncate">Новый файл</span>
          </button>

          <button
            type="button"
            data-testid="new-folder-button"
            onClick={() => openCreateForm('folder', '')}
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-[var(--app-border-strong)] bg-[var(--app-elevated)] px-2 text-xs font-semibold text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)]"
          >
            <FolderPlus className="h-4 w-4 shrink-0 text-[var(--app-accent)]" />
            <span className="truncate">Новая папка</span>
          </button>
        </div>

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
            title="Сохранить все файлы и папки рабочей области в .zip"
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
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded hover:bg-rose-500/15"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Inline New File / New Folder Creation Form */}
      {createTarget && (
        <form
          onSubmit={handleSubmitCreate}
          data-testid={createTarget.kind === 'file' ? 'new-file-form' : 'new-folder-form'}
          className="mx-2 mt-2 rounded-lg border border-[var(--app-accent)] bg-[var(--app-inset)] p-2"
        >
          <label className="block text-[11px] font-medium text-[var(--app-text-secondary)]">
            {createTarget.kind === 'file'
              ? createTarget.parentDir
                ? `Новый файл в «${createTarget.parentDir}»`
                : 'Имя файла (например, input.txt или lab7/data.txt)'
              : createTarget.parentDir
                ? `Новая подпапка в «${createTarget.parentDir}»`
                : 'Имя папки (например, lab7)'}
          </label>
          <input
            ref={newItemInputRef}
            type="text"
            value={newItemName}
            onChange={(e) => {
              setNewItemName(e.target.value);
              if (createError) setCreateError(null);
            }}
            placeholder={createTarget.kind === 'file' ? 'input.txt' : 'lab7'}
            aria-label={createTarget.kind === 'file' ? 'Имя нового файла' : 'Имя новой папки'}
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
                setCreateTarget(null);
                setNewItemName('');
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

      {/* Hierarchical Virtual Files & Folders Tree */}
      <div
        data-testid="workspace-file-list"
        className="min-h-0 flex-1 overflow-x-auto overflow-y-auto px-1.5 py-2"
      >
        <ul className="space-y-0.5">{treeNodes.map((node) => renderTreeNode(node))}</ul>
      </div>

      {/* Subtle status / fstream tip footer */}
      <div className="shrink-0 border-t border-[var(--app-border)] px-3 py-2 text-[11px] leading-snug text-[var(--app-text-muted)]">
        {statusMessage ? (
          <span data-testid="vfs-status-message" className="font-medium text-[var(--app-text)]">
            {statusMessage}
          </span>
        ) : (
          <span>
            Файлы и папки сохраняются офлайн в IndexedDB и доступны в{' '}
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
