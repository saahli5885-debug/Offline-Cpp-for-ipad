import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignLeft,
  AlertCircle,
  ArrowLeft,
  Check,
  CloudCheck,
  CloudOff,
  Loader2,
  WrapText,
} from 'lucide-react';
import { CodeEditor, type CodeEditorHandle } from './components/CodeEditor';
import { ConsolePanel, type ConsolePanelHandle } from './components/ConsolePanel';
import { OfflineIndicator } from './components/OfflineIndicator';
import { ShortcutsModal } from './components/ShortcutsModal';
import { TopBar } from './components/TopBar';
import { WorkspaceSidebar } from './components/WorkspaceSidebar';
import { CODE_TEMPLATES, DEFAULT_CODE } from './data/templates';
import { useOnlineStatus, useServiceWorkerStatus } from './hooks/usePWA';
import { BrowserCppSession, compileInBrowser } from './runtime/cppEngine';
import {
  applyThemeToDocument,
  getThemeById,
  normalizeThemeId,
  type ThemeId,
} from './themes/themes';
import type {
  CodeTemplate,
  CompilerDiagnostic,
  CompilerStandard,
  ConsoleChunk,
  Language,
  LayoutPreference,
  RunStatus,
} from './types/compiler';
import {
  getAutosaveStatusText,
  parseAutosaveEnabled,
  parseSavedTimestamp,
  safeReadStorage,
  safeWriteStorage,
  type AutosaveState,
} from './utils/autosave';
import { summarizeDiagnostics } from './utils/diagnostics';
import { formatCppCode } from './utils/formatCpp';
import {
  clampSplitRatio,
  getDefaultSplitRatio,
  resolveEffectiveLayout,
  resolveWordWrap,
  type WordWrapPreference,
} from './utils/layout';
import {
  applyVfsDeltaToIdb,
  applyWorkspaceMutationToIdb,
  deleteFileFromIdb,
  loadAllFilesFromIdb,
  loadAllFoldersFromIdb,
  putFilesBatchToIdb,
  putFileToIdb,
  putFoldersBatchToIdb,
  renameFileInIdb,
} from './vfs/idbStorage';
import type { HexDumpPayload, VfsChangeKind, VirtualFile, VirtualFolder } from './vfs/types';
import {
  cloneBytes,
  computeVfsDelta,
  createVirtualFile,
  createVirtualFolder,
  deleteFolderPaths,
  detectLanguageFromFileName,
  formatCanonicalHexDumpText,
  getParentFolderPaths,
  isBinaryFileName,
  isCppSyntaxFile,
  isDirectoryPath,
  normalizePath,
  renameFolderPaths,
  sortVirtualFiles,
  validateFileName,
  validateFolderName,
} from './vfs/vfsHelpers';
import { exportSingleFileToDevice, exportWorkspaceZipToDevice } from './vfs/zipExport';

const STORAGE_KEYS = {
  language: 'cppstudio.language',
  standardCpp: 'cppstudio.standard.cpp',
  standardC: 'cppstudio.standard.c',
  codeCpp: 'cppstudio.code.cpp',
  codeC: 'cppstudio.code.c',
  theme: 'cppstudio.theme',
  fontSize: 'cppstudio.fontSize',
  layout: 'cppstudio.layout',
  wordWrap: 'cppstudio.wordWrap',
  splitRatio: 'cppstudio.splitRatio',
  autosave: 'cppstudio.autosave',
  lastSavedAt: 'cppstudio.lastSavedAt',
  activeFile: 'cppstudio.activeFile',
  sidebarOpen: 'cppstudio.sidebarOpen',
};

const DEFAULT_INPUT_TXT = '10 20 30\nПривет из виртуальной рабочей области!\n';

function createInitialFilesMap(): Record<string, VirtualFile> {
  const now = Date.now();
  const cppCode = safeReadStorage(STORAGE_KEYS.codeCpp, DEFAULT_CODE.cpp);
  const cCode = safeReadStorage(STORAGE_KEYS.codeC, DEFAULT_CODE.c);
  return {
    'main.cpp': createVirtualFile('main.cpp', cppCode, now),
    'main.c': createVirtualFile('main.c', cCode, now),
    'input.txt': createVirtualFile('input.txt', DEFAULT_INPUT_TXT, now),
  };
}

function filesMapToRecord(map: Record<string, VirtualFile>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, file] of Object.entries(map)) {
    out[name] = file.content;
  }
  return out;
}

function filesMapToBytesRecord(map: Record<string, VirtualFile>): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  for (const [name, file] of Object.entries(map)) {
    out[name] = cloneBytes(file.bytes);
  }
  return out;
}

async function readBrowserFileBytes(file: File): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}

export default function App() {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = safeReadStorage(STORAGE_KEYS.language, 'cpp');
    return saved === 'c' ? 'c' : 'cpp';
  });

  const [standards, setStandards] = useState<Record<Language, CompilerStandard>>(() => ({
    cpp: safeReadStorage(STORAGE_KEYS.standardCpp, 'c++20') as CompilerStandard,
    c: safeReadStorage(STORAGE_KEYS.standardC, 'c17') as CompilerStandard,
  }));

  const [filesMap, setFilesMap] = useState<Record<string, VirtualFile>>(() =>
    createInitialFilesMap()
  );
  const [foldersMap, setFoldersMap] = useState<Record<string, VirtualFolder>>({});

  const [activeFileName, setActiveFileName] = useState<string>(() => {
    const savedLang = safeReadStorage(STORAGE_KEYS.language, 'cpp') === 'c' ? 'c' : 'cpp';
    const fallback = savedLang === 'c' ? 'main.c' : 'main.cpp';
    const savedActive = normalizePath(safeReadStorage(STORAGE_KEYS.activeFile, fallback));
    return savedActive || fallback;
  });

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    const saved = safeReadStorage(STORAGE_KEYS.sidebarOpen, '');
    if (saved === 'true') return true;
    if (saved === 'false') return false;
    return typeof window !== 'undefined' ? window.innerWidth >= 1024 : true;
  });

  const [recentVfsChanges, setRecentVfsChanges] = useState<Record<string, VfsChangeKind>>({});
  const [storageError, setStorageError] = useState<string | null>(null);
  const [vfsStatusMessage, setVfsStatusMessage] = useState<string | null>(null);

  const [themeId, setThemeId] = useState<ThemeId>(() =>
    normalizeThemeId(safeReadStorage(STORAGE_KEYS.theme, 'github-dark'))
  );

  const [autosaveEnabled, setAutosaveEnabled] = useState<boolean>(() =>
    parseAutosaveEnabled(safeReadStorage(STORAGE_KEYS.autosave, 'true'))
  );

  const [lastSavedAt, setLastSavedAt] = useState<number | null>(() =>
    parseSavedTimestamp(safeReadStorage(STORAGE_KEYS.lastSavedAt, ''))
  );

  const [autosaveState, setAutosaveState] = useState<AutosaveState>(() =>
    parseAutosaveEnabled(safeReadStorage(STORAGE_KEYS.autosave, 'true')) ? 'saved' : 'disabled'
  );

  const [fontSize, setFontSize] = useState<number>(() => {
    const parsed = Number.parseInt(safeReadStorage(STORAGE_KEYS.fontSize, '14'), 10);
    return Number.isFinite(parsed) && parsed >= 12 && parsed <= 22 ? parsed : 14;
  });

  const [layoutPreference, setLayoutPreference] = useState<LayoutPreference>(() => {
    const saved = safeReadStorage(STORAGE_KEYS.layout, 'auto');
    if (saved === 'side-by-side' || saved === 'stacked' || saved === 'tabs') return saved;
    return 'auto';
  });

  const [wordWrapPreference, setWordWrapPreference] = useState<WordWrapPreference>(() => {
    const saved = safeReadStorage(STORAGE_KEYS.wordWrap, 'auto');
    if (saved === 'on' || saved === 'off') return saved;
    return 'auto';
  });

  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1440,
    height: typeof window !== 'undefined' ? window.innerHeight : 900,
  }));

  const [editorWidth, setEditorWidth] = useState<number | undefined>(undefined);

  const [splitRatio, setSplitRatio] = useState<number>(() => {
    const saved = Number.parseFloat(safeReadStorage(STORAGE_KEYS.splitRatio, ''));
    if (Number.isFinite(saved)) {
      return clampSplitRatio(saved);
    }
    return getDefaultSplitRatio(typeof window !== 'undefined' ? window.innerWidth : 1440);
  });
  const [activeTab, setActiveTab] = useState<'editor' | 'console'>('editor');
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [formattedFeedback, setFormattedFeedback] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const isOnline = useOnlineStatus();
  const {
    offlineReady,
    justCachedOffline,
    needRefresh,
    applyUpdate,
    dismissOfflineToast,
  } = useServiceWorkerStatus();

  // Compiler & execution session state
  const [runId, setRunId] = useState(0);
  const [status, setStatus] = useState<RunStatus>('idle');
  const [chunks, setChunks] = useState<ConsoleChunk[]>([]);
  const [diagnostics, setDiagnostics] = useState<CompilerDiagnostic[]>([]);
  const [rawCompilerOutput, setRawCompilerOutput] = useState('');
  const [compileTimeMs, setCompileTimeMs] = useState<number | null>(null);
  const [runDurationMs, setRunDurationMs] = useState<number | null>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [exitReason, setExitReason] = useState<string | null>(null);

  const filesRef = useRef(filesMap);
  filesRef.current = filesMap;
  const foldersRef = useRef(foldersMap);
  foldersRef.current = foldersMap;
  const activeFileRef = useRef(activeFileName);
  activeFileRef.current = activeFileName;
  const autosaveEnabledRef = useRef(autosaveEnabled);
  autosaveEnabledRef.current = autosaveEnabled;
  const userEditedBeforeHydrationRef = useRef(false);
  const sessionRef = useRef<BrowserCppSession | null>(null);
  const chunkCounterRef = useRef(0);
  const formatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vfsToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<CodeEditorHandle | null>(null);
  const consoleRef = useRef<ConsolePanelHandle | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const primaryEntryFile = language === 'cpp' ? 'main.cpp' : 'main.c';
  const activeTheme = useMemo(() => getThemeById(themeId), [themeId]);

  const effectiveLayout = useMemo(
    () => resolveEffectiveLayout(layoutPreference, viewport.width, viewport.height),
    [layoutPreference, viewport.width, viewport.height]
  );

  const effectiveWordWrap = useMemo(
    () => resolveWordWrap(wordWrapPreference, viewport.width, editorWidth),
    [wordWrapPreference, viewport.width, editorWidth]
  );

  const sortedFiles = useMemo(
    () => sortVirtualFiles(Object.values(filesMap), primaryEntryFile),
    [filesMap, primaryEntryFile]
  );

  const folderList = useMemo(() => Object.values(foldersMap), [foldersMap]);

  const currentFile = filesMap[activeFileName] ?? filesMap[primaryEntryFile];
  const currentContent = currentFile?.content ?? '';
  const currentStandard = standards[language];
  const currentSyntaxMode: 'cpp' | 'plain' = isCppSyntaxFile(activeFileName) ? 'cpp' : 'plain';
  const visibleEditorDiagnostics = useMemo(
    () => diagnostics.filter((d) => !d.file || d.file === activeFileName),
    [diagnostics, activeFileName]
  );
  const diagSummary = useMemo(() => summarizeDiagnostics(diagnostics), [diagnostics]);
  const autosaveStatus = useMemo(
    () => getAutosaveStatusText(autosaveState, lastSavedAt),
    [autosaveState, lastSavedAt]
  );
  const recentChangeCount = useMemo(
    () => Object.keys(recentVfsChanges).length,
    [recentVfsChanges]
  );

  const showVfsStatus = useCallback((message: string) => {
    setVfsStatusMessage(message);
    if (vfsToastTimerRef.current) clearTimeout(vfsToastTimerRef.current);
    vfsToastTimerRef.current = setTimeout(() => {
      setVfsStatusMessage(null);
    }, 3200);
  }, []);

  const reportStorageError = useCallback((context: string, err: unknown) => {
    const detail = err instanceof Error ? err.message : String(err);
    setStorageError(`${context}: ${detail}`);
    setAutosaveState('error');
  }, []);

  const getLiveActiveContent = useCallback((): string => {
    const editorText = editorRef.current?.getValue();
    if (editorText !== undefined) return editorText;
    return filesRef.current[activeFileRef.current]?.content ?? '';
  }, []);

  const syncEntryLocalStorage = useCallback((map: Record<string, VirtualFile>, now = Date.now()) => {
    const cppFile = map['main.cpp'];
    const cFile = map['main.c'];
    const cppRes = cppFile
      ? safeWriteStorage(STORAGE_KEYS.codeCpp, cppFile.content, undefined, now)
      : { ok: true };
    const cRes = cFile
      ? safeWriteStorage(STORAGE_KEYS.codeC, cFile.content, undefined, now)
      : { ok: true };
    return cppRes.ok && cRes.ok;
  }, []);

  const persistFile = useCallback(
    async (file: VirtualFile, allFiles: Record<string, VirtualFile> = filesRef.current) => {
      const now = Date.now();
      const localOk = syncEntryLocalStorage(allFiles, now);
      try {
        await putFileToIdb(file);
        setStorageError(null);
        if (localOk) {
          safeWriteStorage(STORAGE_KEYS.lastSavedAt, String(now), undefined, now);
          setLastSavedAt(now);
          setAutosaveState(autosaveEnabledRef.current ? 'saved' : 'disabled');
        } else {
          setAutosaveState('error');
        }
      } catch (err) {
        reportStorageError(`Не удалось сохранить «${file.name}» в IndexedDB`, err);
      }
    },
    [reportStorageError, syncEntryLocalStorage]
  );

  const scheduleAutosave = useCallback(
    (file: VirtualFile, nextMap: Record<string, VirtualFile>) => {
      if (!autosaveEnabledRef.current) {
        setAutosaveState('disabled');
        return;
      }
      setAutosaveState('saving');
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
      autosaveTimerRef.current = setTimeout(() => {
        void persistFile(file, nextMap);
      }, 400);
    },
    [persistFile]
  );

  // Hydrate persistent Virtual Workspace (files + folders) from IndexedDB on startup
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [storedFiles, storedFolders] = await Promise.all([
          loadAllFilesFromIdb(),
          loadAllFoldersFromIdb(),
        ]);
        if (cancelled) return;

        const nextFolders: Record<string, VirtualFolder> = {};
        for (const folder of storedFolders) {
          if (folder.path) {
            nextFolders[folder.path] = folder;
          }
        }

        if (storedFiles.length === 0) {
          // First visit: seed IndexedDB with default main.cpp, main.c, and sample input.txt
          await putFilesBatchToIdb(Object.values(filesRef.current));
          if (Object.keys(nextFolders).length > 0) {
            foldersRef.current = nextFolders;
            setFoldersMap(nextFolders);
          }
          return;
        }

        const nextMap: Record<string, VirtualFile> = {};
        const now = Date.now();
        for (const f of storedFiles) {
          nextMap[f.name] = f;
          for (const parent of getParentFolderPaths(f.name)) {
            if (!nextFolders[parent]) {
              nextFolders[parent] = createVirtualFolder(parent, now);
            }
          }
        }
        // Ensure entry source files always exist
        if (!nextMap['main.cpp']) {
          nextMap['main.cpp'] =
            filesRef.current['main.cpp'] ?? createVirtualFile('main.cpp', DEFAULT_CODE.cpp);
        }
        if (!nextMap['main.c']) {
          nextMap['main.c'] =
            filesRef.current['main.c'] ?? createVirtualFile('main.c', DEFAULT_CODE.c);
        }

        // Preserve any immediate keystroke made before IDB finished loading
        if (userEditedBeforeHydrationRef.current) {
          const active = activeFileRef.current;
          if (filesRef.current[active]) {
            nextMap[active] = filesRef.current[active];
          }
        }

        filesRef.current = nextMap;
        setFilesMap(nextMap);
        foldersRef.current = nextFolders;
        setFoldersMap(nextFolders);
        syncEntryLocalStorage(nextMap);

        if (!nextMap[activeFileRef.current]) {
          const fallback = language === 'c' ? 'main.c' : 'main.cpp';
          activeFileRef.current = fallback;
          setActiveFileName(fallback);
        }
      } catch (err) {
        if (!cancelled) {
          reportStorageError('Ошибка загрузки виртуальной ФС (IndexedDB)', err);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // Run once on initial mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleAutosave = useCallback(() => {
    setAutosaveEnabled((prev) => {
      const next = !prev;
      autosaveEnabledRef.current = next;
      safeWriteStorage(STORAGE_KEYS.autosave, String(next));
      if (next) {
        const active = activeFileRef.current;
        const existing = filesRef.current[active];
        if (existing?.isBinary) {
          void persistFile(existing, filesRef.current);
        } else {
          const liveContent = getLiveActiveContent();
          const updatedFile = createVirtualFile(active, liveContent);
          const nextMap = { ...filesRef.current, [active]: updatedFile };
          filesRef.current = nextMap;
          setFilesMap(nextMap);
          void persistFile(updatedFile, nextMap);
        }
      } else {
        if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
        setAutosaveState('disabled');
      }
      return next;
    });
  }, [getLiveActiveContent, persistFile]);

  const appendChunk = useCallback(
    (kind: ConsoleChunk['kind'], text: string, hexDump?: HexDumpPayload) => {
      chunkCounterRef.current += 1;
      const id = `c-${chunkCounterRef.current}`;
      setChunks((prev) => [...prev, hexDump ? { id, kind, text, hexDump } : { id, kind, text }]);
    },
    []
  );

  // Apply selected IDE theme CSS variables, dark class, and PWA theme-color meta
  useEffect(() => {
    applyThemeToDocument(activeTheme);
    safeWriteStorage(STORAGE_KEYS.theme, themeId);
  }, [activeTheme, themeId]);

  // Persist workspace preferences
  useEffect(() => {
    safeWriteStorage(STORAGE_KEYS.language, language);
  }, [language]);

  useEffect(() => {
    safeWriteStorage(STORAGE_KEYS.activeFile, activeFileName);
  }, [activeFileName]);

  useEffect(() => {
    safeWriteStorage(STORAGE_KEYS.sidebarOpen, String(sidebarOpen));
  }, [sidebarOpen]);

  useEffect(() => {
    safeWriteStorage(STORAGE_KEYS.standardCpp, standards.cpp);
    safeWriteStorage(STORAGE_KEYS.standardC, standards.c);
  }, [standards]);

  useEffect(() => {
    safeWriteStorage(STORAGE_KEYS.fontSize, String(fontSize));
  }, [fontSize]);

  useEffect(() => {
    safeWriteStorage(STORAGE_KEYS.layout, layoutPreference);
  }, [layoutPreference]);

  useEffect(() => {
    safeWriteStorage(STORAGE_KEYS.wordWrap, wordWrapPreference);
  }, [wordWrapPreference]);

  useEffect(() => {
    safeWriteStorage(STORAGE_KEYS.splitRatio, splitRatio.toFixed(4));
  }, [splitRatio]);

  // Immediately flush active file when page is hidden/unloaded (vital for iPad Safari / PWA suspension)
  useEffect(() => {
    const flushIfEnabled = () => {
      if (!autosaveEnabledRef.current) return;
      const active = activeFileRef.current;
      const existing = filesRef.current[active];
      const live = editorRef.current?.getValue();
      const updatedFile = existing?.isBinary
        ? existing
        : live !== undefined
          ? createVirtualFile(active, live)
          : existing;
      if (!updatedFile) return;

      const snapshot = { ...filesRef.current, [active]: updatedFile };
      filesRef.current = snapshot;
      const now = Date.now();
      syncEntryLocalStorage(snapshot, now);
      safeWriteStorage(STORAGE_KEYS.lastSavedAt, String(now), undefined, now);
      void putFileToIdb(updatedFile).catch((err) => {
        reportStorageError(`Не удалось сохранить «${updatedFile.name}» при закрытии`, err);
      });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushIfEnabled();
      }
    };

    window.addEventListener('pagehide', flushIfEnabled);
    window.addEventListener('beforeunload', flushIfEnabled);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flushIfEnabled);
      window.removeEventListener('beforeunload', flushIfEnabled);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [reportStorageError, syncEntryLocalStorage]);

  // Track viewport resize (iPad Split View transitions & external Full HD monitor attach/detach)
  useEffect(() => {
    const onResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const stopActiveSession = useCallback(() => {
    const active = sessionRef.current;
    sessionRef.current = null;
    if (active) {
      active.stop();
    }
  }, []);

  const handleStop = useCallback(() => {
    stopActiveSession();
    setStatus('stopped');
    setExitReason('Остановлено пользователем');
    appendChunk('system', 'Программа остановлена пользователем.');
  }, [appendChunk, stopActiveSession]);

  const flushActiveEditorBuffer = useCallback((): Record<string, VirtualFile> => {
    const active = activeFileRef.current;
    const existing = filesRef.current[active];
    if (existing?.isBinary) {
      return filesRef.current;
    }
    const live = getLiveActiveContent();
    if (!existing || existing.content !== live) {
      const updatedFile = createVirtualFile(active, live);
      const nextMap = { ...filesRef.current, [active]: updatedFile };
      filesRef.current = nextMap;
      setFilesMap(nextMap);
      if (autosaveEnabledRef.current) {
        void persistFile(updatedFile, nextMap);
      }
      return nextMap;
    }
    return filesRef.current;
  }, [getLiveActiveContent, persistFile]);

  const handleRun = useCallback(() => {
    stopActiveSession();

    // Synchronously flush live CodeMirror edits into Virtual Workspace before mounting VFS
    const latestFilesMap = flushActiveEditorBuffer();
    const entryName = language === 'cpp' ? 'main.cpp' : 'main.c';
    const entryCode = latestFilesMap[entryName]?.content ?? '';
    const vfsTextRecord = filesMapToRecord(latestFilesMap);
    const vfsBytesRecord = filesMapToBytesRecord(latestFilesMap);

    setRunId((id) => id + 1);
    setStatus('compiling');
    setChunks([]);
    setDiagnostics([]);
    setRawCompilerOutput('');
    setCompileTimeMs(null);
    setRunDurationMs(null);
    setExitCode(null);
    setExitReason(null);
    setRecentVfsChanges({});

    if (effectiveLayout === 'tabs') {
      setActiveTab('console');
    }

    const compiled = compileInBrowser(entryCode, language, vfsTextRecord, entryName);
    setCompileTimeMs(compiled.compileTimeMs);
    setDiagnostics(compiled.diagnostics);
    setRawCompilerOutput(compiled.rawCompilerOutput);

    if (!compiled.ok || !compiled.program) {
      setStatus('compile_error');
      return;
    }

    setStatus('running');

    const beforeRunMap = new Map<string, Uint8Array>(Object.entries(vfsBytesRecord));
    let lastSyncedMap = new Map<string, Uint8Array>(beforeRunMap);
    const runChangeBadges: Record<string, VfsChangeKind> = {};
    let finalSynced = false;

    const applyRuntimeVfsSnapshot = (
      snapshotObj: Record<string, Uint8Array>,
      isFinal: boolean
    ) => {
      if (isFinal && finalSynced) return;
      if (isFinal) finalSynced = true;

      const afterMap = new Map<string, Uint8Array>();
      for (const [path, bytes] of Object.entries(snapshotObj)) {
        afterMap.set(path, cloneBytes(bytes));
      }
      const stepDelta = computeVfsDelta(lastSyncedMap, afterMap);
      lastSyncedMap = afterMap;

      const hasStepChanges =
        stepDelta.created.length > 0 ||
        stepDelta.modified.length > 0 ||
        stepDelta.deleted.length > 0;

      if (hasStepChanges) {
        const now = Date.now();
        const nextMap: Record<string, VirtualFile> = { ...filesRef.current };
        const nextFolders: Record<string, VirtualFolder> = { ...foldersRef.current };
        const upserts: VirtualFile[] = [];
        const folderUpserts: VirtualFolder[] = [];

        const ensureParentFolders = (filePath: string) => {
          for (const parent of getParentFolderPaths(filePath)) {
            if (!nextFolders[parent]) {
              const folder = createVirtualFolder(parent, now);
              nextFolders[parent] = folder;
              folderUpserts.push(folder);
            }
          }
        };

        for (const createdPath of stepDelta.created) {
          const vf = createVirtualFile(
            createdPath,
            afterMap.get(createdPath) ?? new Uint8Array(0),
            now
          );
          nextMap[createdPath] = vf;
          upserts.push(vf);
          ensureParentFolders(createdPath);
          runChangeBadges[createdPath] = 'created';
        }
        for (const modifiedPath of stepDelta.modified) {
          const vf = createVirtualFile(
            modifiedPath,
            afterMap.get(modifiedPath) ?? new Uint8Array(0),
            now
          );
          nextMap[modifiedPath] = vf;
          upserts.push(vf);
          ensureParentFolders(modifiedPath);
          if (runChangeBadges[modifiedPath] !== 'created') {
            runChangeBadges[modifiedPath] = 'modified';
          }
        }
        for (const deletedPath of stepDelta.deleted) {
          delete nextMap[deletedPath];
          delete runChangeBadges[deletedPath];
        }

        filesRef.current = nextMap;
        setFilesMap(nextMap);
        if (folderUpserts.length > 0) {
          foldersRef.current = nextFolders;
          setFoldersMap(nextFolders);
        }
        setRecentVfsChanges({ ...runChangeBadges });
        syncEntryLocalStorage(nextMap, now);

        if (!nextMap[activeFileRef.current]) {
          activeFileRef.current = entryName;
          setActiveFileName(entryName);
        }

        void applyVfsDeltaToIdb(upserts, stepDelta.deleted, folderUpserts)
          .then(() => {
            setStorageError(null);
            safeWriteStorage(STORAGE_KEYS.lastSavedAt, String(now), undefined, now);
            setLastSavedAt(now);
          })
          .catch((err) => {
            reportStorageError('Ошибка синхронизации файлов после выполнения C++', err);
          });
      }

      if (isFinal) {
        const totalDelta = computeVfsDelta(beforeRunMap, afterMap);
        const summaryParts: string[] = [
          ...totalDelta.created.map((p) => `+${p}`),
          ...totalDelta.modified.map((p) => `~${p}`),
          ...totalDelta.deleted.map((p) => `-${p}`),
        ];
        if (summaryParts.length > 0) {
          appendChunk('system', `Файлы рабочей области: ${summaryParts.join(', ')}`);
        }
      }
    };

    let session: BrowserCppSession | null = null;
    session = new BrowserCppSession(compiled.program, {
      initialFiles: vfsBytesRecord,
      initialFolders: Object.keys(foldersRef.current),
      onStdout: (data) => {
        if (sessionRef.current !== session) return;
        appendChunk('stdout', data);
      },
      onStderr: (data) => {
        if (sessionRef.current !== session) return;
        appendChunk('stderr', data);
      },
      onWaitingForInput: () => {
        if (sessionRef.current !== session) return;
        setTimeout(() => {
          consoleRef.current?.focusInput();
        }, 0);
      },
      onVfsChange: (event) => {
        if (sessionRef.current !== session) return;
        applyRuntimeVfsSnapshot(event.snapshot, false);
      },
      onVfsFinalSync: (snapshot) => {
        applyRuntimeVfsSnapshot(snapshot, true);
      },
      onExit: (msg) => {
        if (sessionRef.current !== session) return;
        sessionRef.current = null;
        setRunDurationMs(msg.durationMs);
        setExitCode(msg.code ?? 0);
        if (msg.reason) {
          setExitReason(msg.reason);
          setStatus('stopped');
          appendChunk('system', `Процесс завершён: ${msg.reason}`);
        } else {
          setStatus('completed');
          const codeNum = msg.code ?? 0;
          const timeSuffix = msg.durationMs !== undefined ? ` за ${msg.durationMs} мс` : '';
          appendChunk('system', `Процесс завершён с кодом ${codeNum}${timeSuffix}`);
        }
      },
    });
    sessionRef.current = session;
  }, [
    appendChunk,
    effectiveLayout,
    flushActiveEditorBuffer,
    language,
    reportStorageError,
    stopActiveSession,
    syncEntryLocalStorage,
  ]);

  const handleFormatCode = useCallback(() => {
    const active = activeFileRef.current;
    if (!isCppSyntaxFile(active)) return;

    const liveCode = getLiveActiveContent();
    const formatted = formatCppCode(liveCode);
    if (formatted !== filesRef.current[active]?.content) {
      const updatedFile = createVirtualFile(active, formatted);
      const nextMap = { ...filesRef.current, [active]: updatedFile };
      filesRef.current = nextMap;
      setFilesMap(nextMap);
      if (autosaveEnabledRef.current) {
        void persistFile(updatedFile, nextMap);
      }
    }
    setFormattedFeedback(true);
    if (formatTimerRef.current) clearTimeout(formatTimerRef.current);
    formatTimerRef.current = setTimeout(() => {
      setFormattedFeedback(false);
    }, 1500);
  }, [getLiveActiveContent, persistFile]);

  const handleToggleWordWrap = useCallback(() => {
    setWordWrapPreference(effectiveWordWrap ? 'off' : 'on');
  }, [effectiveWordWrap]);

  const handleCycleLayoutAllThree = useCallback(() => {
    setLayoutPreference(() => {
      if (effectiveLayout === 'side-by-side') return 'stacked';
      if (effectiveLayout === 'stacked') return 'tabs';
      return 'side-by-side';
    });
  }, [effectiveLayout]);

  const handleSendInput = useCallback(
    (line: string) => {
      const active = sessionRef.current;
      if (!active) return;
      appendChunk('stdin', `${line}\n`);
      active.writeStdin(`${line}\n`);
    },
    [appendChunk]
  );

  const handleSendEof = useCallback(() => {
    const active = sessionRef.current;
    if (!active) return;
    appendChunk('system', '^D (конец ввода)');
    active.sendEof();
  }, [appendChunk]);

  const handleClearConsole = useCallback(() => {
    setChunks([]);
    if (status !== 'running' && status !== 'compiling') {
      setStatus('idle');
      setDiagnostics([]);
      setRawCompilerOutput('');
      setExitCode(null);
      setExitReason(null);
      setRunDurationMs(null);
    }
  }, [status]);

  const handleSelectFile = useCallback(
    (name: string) => {
      if (!filesRef.current[name]) return;
      flushActiveEditorBuffer();
      activeFileRef.current = name;
      setActiveFileName(name);
      if (name === 'main.cpp') setLanguage('cpp');
      else if (name === 'main.c') setLanguage('c');

      if (effectiveLayout === 'tabs') {
        setActiveTab('editor');
      }
      if (viewport.width < 1024) {
        setSidebarOpen(false);
      }
    },
    [effectiveLayout, flushActiveEditorBuffer, viewport.width]
  );

  const handleCreateFile = useCallback(
    (rawName: string): { ok: boolean; error?: string } => {
      const check = validateFileName(
        rawName,
        Object.keys(filesRef.current),
        undefined,
        Object.keys(foldersRef.current)
      );
      if (!check.ok) {
        return { ok: false, error: check.error };
      }
      flushActiveEditorBuffer();
      const now = Date.now();
      const newFile = createVirtualFile(check.normalized, '', now);
      const nextMap = { ...filesRef.current, [newFile.name]: newFile };
      filesRef.current = nextMap;
      setFilesMap(nextMap);

      const newFolders: VirtualFolder[] = [];
      const nextFolders = { ...foldersRef.current };
      for (const parent of getParentFolderPaths(newFile.name)) {
        if (!nextFolders[parent]) {
          const folder = createVirtualFolder(parent, now);
          nextFolders[parent] = folder;
          newFolders.push(folder);
        }
      }
      if (newFolders.length > 0) {
        foldersRef.current = nextFolders;
        setFoldersMap(nextFolders);
      }

      activeFileRef.current = newFile.name;
      setActiveFileName(newFile.name);

      if (newFolders.length > 0) {
        syncEntryLocalStorage(nextMap, now);
        void applyWorkspaceMutationToIdb([newFile], [], newFolders, [])
          .then(() => {
            setStorageError(null);
            safeWriteStorage(STORAGE_KEYS.lastSavedAt, String(now), undefined, now);
            setLastSavedAt(now);
          })
          .catch((err) => reportStorageError(`Не удалось сохранить «${newFile.name}» в IndexedDB`, err));
      } else {
        void persistFile(newFile, nextMap);
      }
      showVfsStatus(`Создан файл: ${newFile.name}`);

      if (effectiveLayout === 'tabs') {
        setActiveTab('editor');
      }
      if (viewport.width < 1024) {
        setSidebarOpen(false);
      }
      return { ok: true };
    },
    [
      effectiveLayout,
      flushActiveEditorBuffer,
      persistFile,
      reportStorageError,
      showVfsStatus,
      syncEntryLocalStorage,
      viewport.width,
    ]
  );

  const handleRenameFile = useCallback(
    (oldName: string, rawNewName: string): { ok: boolean; error?: string } => {
      const current = filesRef.current[oldName];
      if (!current) {
        return { ok: false, error: 'Файл не найден.' };
      }
      const check = validateFileName(
        rawNewName,
        Object.keys(filesRef.current),
        oldName,
        Object.keys(foldersRef.current)
      );
      if (!check.ok) {
        return { ok: false, error: check.error };
      }
      const nextName = check.normalized;
      if (nextName === oldName) return { ok: true };

      const syncedMap = flushActiveEditorBuffer();
      const now = Date.now();
      const latestOld = syncedMap[oldName] ?? current;
      const renamedFile = createVirtualFile(nextName, latestOld.bytes, now);

      const nextMap: Record<string, VirtualFile> = { ...syncedMap };
      delete nextMap[oldName];
      nextMap[nextName] = renamedFile;
      filesRef.current = nextMap;
      setFilesMap(nextMap);

      const folderUpserts: VirtualFolder[] = [];
      const nextFolders = { ...foldersRef.current };
      for (const parent of getParentFolderPaths(nextName)) {
        if (!nextFolders[parent]) {
          const folder = createVirtualFolder(parent, now);
          nextFolders[parent] = folder;
          folderUpserts.push(folder);
        }
      }
      if (folderUpserts.length > 0) {
        foldersRef.current = nextFolders;
        setFoldersMap(nextFolders);
      }

      setRecentVfsChanges((prev) => {
        if (!prev[oldName]) return prev;
        const copy = { ...prev };
        copy[nextName] = copy[oldName];
        delete copy[oldName];
        return copy;
      });

      if (activeFileRef.current === oldName) {
        activeFileRef.current = nextName;
        setActiveFileName(nextName);
      }

      syncEntryLocalStorage(nextMap, now);
      void renameFileInIdb(oldName, renamedFile, folderUpserts)
        .then(() => setStorageError(null))
        .catch((err) => reportStorageError(`Не удалось переименовать «${oldName}»`, err));
      showVfsStatus(`Переименовано: ${nextName}`);
      return { ok: true };
    },
    [flushActiveEditorBuffer, reportStorageError, showVfsStatus, syncEntryLocalStorage]
  );

  const handleDeleteFile = useCallback(
    (name: string) => {
      if (name === primaryEntryFile) return;
      if (!filesRef.current[name]) return;

      const syncedMap = flushActiveEditorBuffer();
      const nextMap: Record<string, VirtualFile> = { ...syncedMap };
      delete nextMap[name];
      filesRef.current = nextMap;
      setFilesMap(nextMap);

      setRecentVfsChanges((prev) => {
        if (!prev[name]) return prev;
        const copy = { ...prev };
        delete copy[name];
        return copy;
      });

      if (activeFileRef.current === name) {
        activeFileRef.current = primaryEntryFile;
        setActiveFileName(primaryEntryFile);
      }

      void deleteFileFromIdb(name)
        .then(() => setStorageError(null))
        .catch((err) => reportStorageError(`Не удалось удалить «${name}» из IndexedDB`, err));
      showVfsStatus(`Удалён файл: ${name}`);
    },
    [flushActiveEditorBuffer, primaryEntryFile, reportStorageError, showVfsStatus]
  );

  const handleCreateFolder = useCallback(
    (rawPath: string): { ok: boolean; error?: string } => {
      const check = validateFolderName(
        rawPath,
        Object.keys(foldersRef.current),
        Object.keys(filesRef.current)
      );
      if (!check.ok) {
        return { ok: false, error: check.error };
      }
      const now = Date.now();
      const nextFolders: Record<string, VirtualFolder> = { ...foldersRef.current };
      const created: VirtualFolder[] = [];
      for (const path of [...getParentFolderPaths(check.normalized), check.normalized]) {
        if (path && !nextFolders[path]) {
          const folder = createVirtualFolder(path, now);
          nextFolders[path] = folder;
          created.push(folder);
        }
      }
      foldersRef.current = nextFolders;
      setFoldersMap(nextFolders);

      void putFoldersBatchToIdb(created)
        .then(() => {
          setStorageError(null);
          safeWriteStorage(STORAGE_KEYS.lastSavedAt, String(now), undefined, now);
          setLastSavedAt(now);
        })
        .catch((err) => reportStorageError(`Не удалось создать папку «${check.normalized}»`, err));
      showVfsStatus(`Создана папка: ${check.normalized}`);
      return { ok: true };
    },
    [reportStorageError, showVfsStatus]
  );

  const handleRenameFolder = useCallback(
    (oldPath: string, rawNewPath: string): { ok: boolean; error?: string } => {
      const check = validateFolderName(
        rawNewPath,
        Object.keys(foldersRef.current),
        Object.keys(filesRef.current),
        oldPath
      );
      if (!check.ok) {
        return { ok: false, error: check.error };
      }
      if (check.normalized === oldPath) return { ok: true };

      const syncedMap = flushActiveEditorBuffer();
      const now = Date.now();
      const result = renameFolderPaths(
        syncedMap,
        foldersRef.current,
        oldPath,
        check.normalized,
        now
      );

      filesRef.current = result.nextFilesMap;
      setFilesMap(result.nextFilesMap);
      foldersRef.current = result.nextFoldersMap;
      setFoldersMap(result.nextFoldersMap);

      const remappedActive = result.pathRemap.get(activeFileRef.current);
      if (remappedActive) {
        activeFileRef.current = remappedActive;
        setActiveFileName(remappedActive);
      }

      setRecentVfsChanges((prev) => {
        let changed = false;
        const next: Record<string, VfsChangeKind> = {};
        for (const [k, v] of Object.entries(prev)) {
          const mapped = result.pathRemap.get(k);
          if (mapped) {
            next[mapped] = v;
            changed = true;
          } else {
            next[k] = v;
          }
        }
        return changed ? next : prev;
      });

      syncEntryLocalStorage(result.nextFilesMap, now);
      void applyWorkspaceMutationToIdb(
        result.fileUpserts,
        result.fileDeletes,
        result.folderUpserts,
        result.folderDeletes
      )
        .then(() => {
          setStorageError(null);
          safeWriteStorage(STORAGE_KEYS.lastSavedAt, String(now), undefined, now);
          setLastSavedAt(now);
        })
        .catch((err) => reportStorageError(`Не удалось переименовать папку «${oldPath}»`, err));
      showVfsStatus(`Папка переименована: ${check.normalized}`);
      return { ok: true };
    },
    [flushActiveEditorBuffer, reportStorageError, showVfsStatus, syncEntryLocalStorage]
  );

  const handleDeleteFolder = useCallback(
    (folderPath: string) => {
      const syncedMap = flushActiveEditorBuffer();
      const result = deleteFolderPaths(
        syncedMap,
        foldersRef.current,
        folderPath,
        primaryEntryFile
      );

      filesRef.current = result.nextFilesMap;
      setFilesMap(result.nextFilesMap);
      foldersRef.current = result.nextFoldersMap;
      setFoldersMap(result.nextFoldersMap);

      if (!result.nextFilesMap[activeFileRef.current]) {
        activeFileRef.current = primaryEntryFile;
        setActiveFileName(primaryEntryFile);
      }

      if (result.fileDeletes.length > 0) {
        const deletedSet = new Set(result.fileDeletes);
        setRecentVfsChanges((prev) => {
          const copy = { ...prev };
          for (const d of deletedSet) delete copy[d];
          return copy;
        });
      }

      void applyWorkspaceMutationToIdb([], result.fileDeletes, [], result.folderDeletes)
        .then(() => setStorageError(null))
        .catch((err) => reportStorageError(`Не удалось удалить папку «${folderPath}»`, err));
      showVfsStatus(`Удалена папка: ${folderPath}`);
    },
    [flushActiveEditorBuffer, primaryEntryFile, reportStorageError, showVfsStatus]
  );

  const handleHexDumpFile = useCallback(
    (rawPath: string) => {
      const syncedMap = flushActiveEditorBuffer();
      const normalized = normalizePath(rawPath);

      if (status === 'compile_error') {
        setStatus('idle');
      }

      if (!normalized) {
        appendChunk('stderr', 'Hex-дамп: укажите путь к файлу.\n');
        if (effectiveLayout === 'tabs') setActiveTab('console');
        return;
      }

      const target = syncedMap[normalized];
      if (!target) {
        if (isDirectoryPath(normalized, Object.keys(syncedMap), Object.keys(foldersRef.current))) {
          appendChunk('stderr', `Hex-дамп: «${normalized}» является папкой, а не файлом.\n`);
        } else {
          appendChunk('stderr', `Hex-дамп: файл «${normalized}» не найден.\n`);
        }
        if (effectiveLayout === 'tabs') setActiveTab('console');
        return;
      }

      // Read raw Uint8Array bytes directly without UTF-8 decoding
      const rawBytes = cloneBytes(target.bytes);
      const plainText = formatCanonicalHexDumpText(target.name, rawBytes);
      appendChunk('hexdump', plainText, {
        path: target.name,
        totalBytes: rawBytes.byteLength,
        bytes: rawBytes,
      });

      if (effectiveLayout === 'tabs') {
        setActiveTab('console');
      }
      if (viewport.width < 1024) {
        setSidebarOpen(false);
      }
    },
    [appendChunk, effectiveLayout, flushActiveEditorBuffer, status, viewport.width]
  );

  const handleRunConsoleCommand = useCallback(
    (rawCommand: string) => {
      const trimmed = rawCommand.trim();
      if (!trimmed) return;

      if (status === 'compile_error') {
        setStatus('idle');
      }

      const lower = trimmed.toLowerCase();
      if (lower === 'clear' || lower === 'cls') {
        handleClearConsole();
        return;
      }

      appendChunk('stdin', `$ ${trimmed}\n`);

      if (lower === 'hexdump' || lower.startsWith('hexdump ')) {
        let arg = trimmed.slice(7).trim();
        if (
          (arg.startsWith('"') && arg.endsWith('"')) ||
          (arg.startsWith("'") && arg.endsWith("'"))
        ) {
          arg = arg.slice(1, -1).trim();
        }
        if (!arg) {
          appendChunk('stderr', 'Использование: hexdump <путь к файлу>\n');
          return;
        }
        handleHexDumpFile(arg);
        return;
      }

      appendChunk(
        'stderr',
        `Неизвестная команда: «${trimmed}». Доступно: hexdump <путь к файлу>, clear\n`
      );
    },
    [appendChunk, handleClearConsole, handleHexDumpFile, status]
  );

  const handleImportFiles = useCallback(
    (fileList: FileList) => {
      const picked = Array.from(fileList);
      if (picked.length === 0) return;

      void (async () => {
        try {
          const syncedMap = flushActiveEditorBuffer();
          const nextMap: Record<string, VirtualFile> = { ...syncedMap };
          const nextFolders: Record<string, VirtualFolder> = { ...foldersRef.current };
          const importedFiles: VirtualFile[] = [];
          const createdFolders: VirtualFolder[] = [];
          const now = Date.now();

          for (const browserFile of picked) {
            const normName = normalizePath(browserFile.name);
            if (!normName) continue;
            const rawBytes = await readBrowserFileBytes(browserFile);
            const vf = createVirtualFile(normName, rawBytes, now);
            nextMap[vf.name] = vf;
            importedFiles.push(vf);
            for (const parent of getParentFolderPaths(vf.name)) {
              if (!nextFolders[parent]) {
                const folder = createVirtualFolder(parent, now);
                nextFolders[parent] = folder;
                createdFolders.push(folder);
              }
            }
          }

          if (importedFiles.length === 0) return;

          filesRef.current = nextMap;
          setFilesMap(nextMap);
          if (createdFolders.length > 0) {
            foldersRef.current = nextFolders;
            setFoldersMap(nextFolders);
          }
          syncEntryLocalStorage(nextMap, now);

          const first = importedFiles[0];
          const detectedLang = detectLanguageFromFileName(first.name);
          if (first.name === 'main.cpp' || first.name === 'main.c') {
            stopActiveSession();
            if (detectedLang) setLanguage(detectedLang);
          }

          activeFileRef.current = first.name;
          setActiveFileName(first.name);

          await applyWorkspaceMutationToIdb(importedFiles, [], createdFolders, []);
          setStorageError(null);
          safeWriteStorage(STORAGE_KEYS.lastSavedAt, String(now), undefined, now);
          setLastSavedAt(now);

          showVfsStatus(
            importedFiles.length === 1
              ? `Импортирован: ${first.name}`
              : `Импортировано файлов: ${importedFiles.length}`
          );
          if (effectiveLayout === 'tabs') {
            setActiveTab('editor');
          }
          if (viewport.width < 1024) {
            setSidebarOpen(false);
          }
        } catch (err) {
          reportStorageError('Ошибка импорта файлов в рабочую область', err);
        }
      })();
    },
    [
      effectiveLayout,
      flushActiveEditorBuffer,
      reportStorageError,
      showVfsStatus,
      stopActiveSession,
      syncEntryLocalStorage,
      viewport.width,
    ]
  );

  const handleExportSingleFile = useCallback(
    (fileName: string) => {
      const syncedMap = flushActiveEditorBuffer();
      const target = syncedMap[fileName];
      if (!target) return;

      void exportSingleFileToDevice(target.name, target.bytes)
        .then((mode) => {
          if (mode !== 'cancelled') {
            showVfsStatus(`Сохранено: ${target.name}`);
          }
        })
        .catch((err) => {
          reportStorageError(`Не удалось экспортировать «${target.name}»`, err);
        });
    },
    [flushActiveEditorBuffer, reportStorageError, showVfsStatus]
  );

  const handleDownloadActiveFile = useCallback(() => {
    handleExportSingleFile(activeFileRef.current);
  }, [handleExportSingleFile]);

  const handleExportAllZip = useCallback(() => {
    const syncedMap = flushActiveEditorBuffer();
    const filesArr = Object.values(syncedMap);
    const entries = filesArr.map((f) => ({
      name: f.name,
      content: f.bytes,
      updatedAt: f.updatedAt,
    }));

    // Preserve explicit empty folders in ZIP archive using trailing "/" directory entries
    const foldersWithFiles = new Set<string>();
    for (const f of filesArr) {
      for (const parent of getParentFolderPaths(f.name)) {
        foldersWithFiles.add(parent);
      }
    }
    for (const folder of Object.values(foldersRef.current)) {
      if (folder.path && !foldersWithFiles.has(folder.path)) {
        entries.push({
          name: `${folder.path}/`,
          content: new Uint8Array(0),
          updatedAt: folder.updatedAt,
        });
      }
    }

    if (entries.length === 0) return;

    void exportWorkspaceZipToDevice(entries, 'cpp-workspace.zip')
      .then((mode) => {
        if (mode !== 'cancelled') {
          showVfsStatus(`Экспортирован архив (${filesArr.length} ф.)`);
        }
      })
      .catch((err) => {
        reportStorageError('Не удалось создать ZIP-архив проекта', err);
      });
  }, [flushActiveEditorBuffer, reportStorageError, showVfsStatus]);

  const handleJumpToDiagnostic = useCallback(
    (line: number, column?: number | null) => {
      const diagFile = diagnostics.find((d) => d.line === line)?.file ?? primaryEntryFile;
      if (diagFile && filesRef.current[diagFile] && activeFileRef.current !== diagFile) {
        flushActiveEditorBuffer();
        activeFileRef.current = diagFile;
        setActiveFileName(diagFile);
        setTimeout(() => editorRef.current?.jumpToLine(line, column), 50);
      } else if (effectiveLayout === 'tabs') {
        setActiveTab('editor');
        setTimeout(() => editorRef.current?.jumpToLine(line, column), 40);
      } else {
        editorRef.current?.jumpToLine(line, column);
      }
    },
    [diagnostics, effectiveLayout, flushActiveEditorBuffer, primaryEntryFile]
  );

  const handleSelectTemplate = useCallback(
    (tpl: CodeTemplate) => {
      stopActiveSession();
      const targetEntry = tpl.language === 'cpp' ? 'main.cpp' : 'main.c';
      setLanguage(tpl.language);

      const now = Date.now();
      const updatedEntry = createVirtualFile(targetEntry, tpl.code, now);
      const nextMap: Record<string, VirtualFile> = {
        ...filesRef.current,
        [targetEntry]: updatedEntry,
      };
      const toPersist: VirtualFile[] = [updatedEntry];

      if (tpl.id === 'cpp-fstream' && !nextMap['input.txt']) {
        const sampleInput = createVirtualFile('input.txt', DEFAULT_INPUT_TXT, now);
        nextMap['input.txt'] = sampleInput;
        toPersist.push(sampleInput);
      }

      filesRef.current = nextMap;
      setFilesMap(nextMap);
      activeFileRef.current = targetEntry;
      setActiveFileName(targetEntry);
      setRecentVfsChanges({});

      if (autosaveEnabledRef.current) {
        syncEntryLocalStorage(nextMap, now);
        void putFilesBatchToIdb(toPersist)
          .then(() => {
            setStorageError(null);
            safeWriteStorage(STORAGE_KEYS.lastSavedAt, String(now), undefined, now);
            setLastSavedAt(now);
            setAutosaveState('saved');
          })
          .catch((err) => reportStorageError('Не удалось сохранить шаблон в IndexedDB', err));
      }

      setDiagnostics([]);
      setChunks([]);
      setStatus('idle');
      if (effectiveLayout === 'tabs') {
        setActiveTab('editor');
      }
    },
    [effectiveLayout, reportStorageError, stopActiveSession, syncEntryLocalStorage]
  );

  const handleChangeFontSize = useCallback((delta: number) => {
    setFontSize((prev) => Math.max(12, Math.min(22, prev + delta)));
  }, []);

  // Global Magic Keyboard shortcuts (Cmd on iPadOS/macOS, Ctrl on Windows/Linux)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      const key = e.key.toLowerCase();
      if (e.key === 'Enter') {
        e.preventDefault();
        void handleRun();
        return;
      }
      if (e.shiftKey && key === 'f') {
        e.preventDefault();
        handleFormatCode();
        return;
      }
      if (e.key === '\\') {
        e.preventDefault();
        handleCycleLayoutAllThree();
        return;
      }
      if (key === '.' && status === 'running') {
        e.preventDefault();
        void handleStop();
        return;
      }
      if (key === 'k') {
        e.preventDefault();
        handleClearConsole();
        return;
      }
      if (key === 's') {
        e.preventDefault();
        handleDownloadActiveFile();
        return;
      }
      if (key === 'b') {
        e.preventDefault();
        const activeEl = document.activeElement;
        const inConsole = activeEl?.closest('[data-testid="console-panel"]');
        if (inConsole) {
          if (effectiveLayout === 'tabs') setActiveTab('editor');
          setTimeout(() => editorRef.current?.focus(), 20);
        } else {
          if (effectiveLayout === 'tabs') setActiveTab('console');
          setTimeout(() => consoleRef.current?.focusInput(), 20);
        }
        return;
      }
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        handleChangeFontSize(1);
        return;
      }
      if (e.key === '-') {
        e.preventDefault();
        handleChangeFontSize(-1);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    effectiveLayout,
    handleChangeFontSize,
    handleClearConsole,
    handleCycleLayoutAllThree,
    handleDownloadActiveFile,
    handleFormatCode,
    handleRun,
    handleStop,
    status,
  ]);

  // Cleanup active browser session and timers on unmount
  useEffect(() => {
    return () => {
      stopActiveSession();
      if (formatTimerRef.current) clearTimeout(formatTimerRef.current);
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      if (vfsToastTimerRef.current) clearTimeout(vfsToastTimerRef.current);
    };
  }, [stopActiveSession]);

  // Pointer drag resizing for both side-by-side and stacked split dividers (Magic Keyboard trackpad + iPad touch/stylus)
  const handleDividerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!workspaceRef.current) return;
    e.preventDefault();
    draggingRef.current = true;
    setIsDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic events without active pointer id
    }
  };

  const handleDividerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || !workspaceRef.current) return;
    e.preventDefault();
    const rect = workspaceRef.current.getBoundingClientRect();
    if (effectiveLayout === 'side-by-side' && rect.width > 0) {
      const ratio = (e.clientX - rect.left) / rect.width;
      setSplitRatio(clampSplitRatio(ratio));
    } else if (effectiveLayout === 'stacked' && rect.height > 0) {
      const ratio = (e.clientY - rect.top) / rect.height;
      setSplitRatio(clampSplitRatio(ratio));
    }
  };

  const finishDividerDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setIsDragging(false);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
    }
  };

  const fileModeLabel = useMemo(() => {
    if (activeFileName === 'main.cpp') return `C++ (${currentStandard})`;
    if (activeFileName === 'main.c') return `C (${currentStandard})`;
    if (isCppSyntaxFile(activeFileName)) return 'C/C++';
    if (currentFile?.isBinary || isBinaryFileName(activeFileName)) return 'Бинарный · только чтение';
    return 'Текст';
  }, [activeFileName, currentFile?.isBinary, currentStandard]);

  return (
    <div
      className={`flex h-dvh w-full flex-col overflow-hidden bg-[var(--app-bg)] text-[var(--app-text)] ${
        isDragging
          ? effectiveLayout === 'side-by-side'
            ? 'select-none cursor-col-resize'
            : 'select-none cursor-row-resize'
          : ''
      }`}
    >
      <TopBar
        language={language}
        standard={currentStandard}
        status={status}
        themeId={themeId}
        fontSize={fontSize}
        layoutPreference={layoutPreference}
        effectiveLayout={effectiveLayout}
        templates={CODE_TEMPLATES}
        sidebarOpen={sidebarOpen}
        fileCount={sortedFiles.length}
        recentChangeCount={recentChangeCount}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onChangeLanguage={(lang) => {
          stopActiveSession();
          flushActiveEditorBuffer();
          setLanguage(lang);
          const nextEntry = lang === 'cpp' ? 'main.cpp' : 'main.c';
          if (activeFileRef.current === 'main.cpp' || activeFileRef.current === 'main.c') {
            activeFileRef.current = nextEntry;
            setActiveFileName(nextEntry);
          }
          setDiagnostics([]);
          if (status === 'running' || status === 'compiling') {
            setStatus('idle');
          }
        }}
        onChangeStandard={(std) => setStandards((prev) => ({ ...prev, [language]: std }))}
        onSelectTemplate={handleSelectTemplate}
        onRun={() => void handleRun()}
        onStop={() => void handleStop()}
        onFormat={handleFormatCode}
        onSelectTheme={(nextTheme) => setThemeId(nextTheme)}
        onChangeFontSize={handleChangeFontSize}
        onSelectLayout={(nextLayout) => setLayoutPreference(nextLayout)}
        onDownloadCode={handleDownloadActiveFile}
        onImportFiles={handleImportFiles}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        offlineReady={offlineReady}
        isOnline={isOnline}
      />

      {/* Dedicated tab bar when in Tabs mode (reachable anytime via Layout picker or narrow screens) */}
      {effectiveLayout === 'tabs' && (
        <div
          role="tablist"
          aria-label="Переключение между редактором и консолью"
          className="flex h-11 shrink-0 items-center border-b border-[var(--app-border)] bg-[var(--app-surface)] px-3"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'editor'}
            onClick={() => setActiveTab('editor')}
            className={`flex h-full flex-1 items-center justify-center border-b-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'editor'
                ? 'border-[var(--app-accent)] text-[var(--app-text)]'
                : 'border-transparent text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
            }`}
          >
            Код · {activeFileName}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'console'}
            onClick={() => setActiveTab('console')}
            className={`flex h-full flex-1 items-center justify-center border-b-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'console'
                ? 'border-[var(--app-accent)] text-[var(--app-text)]'
                : 'border-transparent text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
            }`}
          >
            Консоль
            {diagSummary.errors > 0 ? ` (${diagSummary.errors})` : status === 'running' ? ' · ввод' : ''}
          </button>
        </div>
      )}

      {/* Workspace Body: Collapsible Virtual Files Sidebar + Adaptive Editor/Console Split */}
      <div className="flex min-h-0 min-w-0 w-full flex-1 overflow-hidden">
        <WorkspaceSidebar
          open={sidebarOpen}
          isOverlayDrawer={viewport.width < 1024}
          files={sortedFiles}
          folders={folderList}
          activeFileName={activeFileName}
          primaryEntryFile={primaryEntryFile}
          recentChanges={recentVfsChanges}
          storageError={storageError}
          statusMessage={vfsStatusMessage}
          onClose={() => setSidebarOpen(false)}
          onSelectFile={handleSelectFile}
          onCreateFile={handleCreateFile}
          onRenameFile={handleRenameFile}
          onDeleteFile={handleDeleteFile}
          onCreateFolder={handleCreateFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
          onHexDumpFile={handleHexDumpFile}
          onImportFiles={handleImportFiles}
          onExportFile={handleExportSingleFile}
          onExportAllZip={handleExportAllZip}
          onDismissStorageError={() => setStorageError(null)}
        />

        {/* Main Adaptive Split Workspace */}
        <main
          ref={workspaceRef}
          data-layout={effectiveLayout}
          className={`flex min-h-0 min-w-0 w-full flex-1 overflow-hidden ${
            effectiveLayout === 'side-by-side' ? 'flex-row' : 'flex-col'
          }`}
        >
          {/* Editor Pane: strictly flex-constrained with min-w-0 + overflow-hidden so code never goes under Console */}
          <section
            aria-label="Панель редактора кода"
            data-testid="editor-pane"
            className={`flex min-h-0 min-w-0 flex-col overflow-hidden ${
              effectiveLayout === 'tabs' && activeTab !== 'editor' ? 'hidden' : 'flex'
            } ${isDragging ? 'pointer-events-none select-none' : ''}`}
            style={
              effectiveLayout === 'side-by-side'
                ? {
                    flex: `0 0 ${splitRatio * 100}%`,
                    width: `${splitRatio * 100}%`,
                    maxWidth: `${splitRatio * 100}%`,
                  }
                : effectiveLayout === 'stacked'
                  ? {
                      flex: `0 0 ${splitRatio * 100}%`,
                      height: `${splitRatio * 100}%`,
                      maxHeight: `${splitRatio * 100}%`,
                    }
                  : { flex: '1 1 0%' }
            }
          >
            {/* Editor sub-header: active file info + back to entry + Autosave toggle + Word Wrap + Format */}
            <div className="flex min-h-[44px] shrink-0 items-center justify-between gap-2 border-b border-[var(--app-border)] bg-[var(--app-surface)] px-3 sm:px-3.5">
              <div className="flex min-w-0 items-center gap-2 text-xs">
                {activeFileName !== primaryEntryFile && (
                  <button
                    type="button"
                    onClick={() => handleSelectFile(primaryEntryFile)}
                    aria-label={`Вернуться к ${primaryEntryFile}`}
                    title={`Перейти к ${primaryEntryFile}`}
                    className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-[var(--app-border)] bg-[var(--app-elevated)] px-2 font-mono text-[11px] font-medium text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    <span className="hidden sm:inline">{primaryEntryFile}</span>
                  </button>
                )}
                <span
                  data-testid="active-file-label"
                  className="truncate font-mono font-semibold text-[var(--app-text)]"
                >
                  {activeFileName}
                </span>
                <span aria-hidden="true" className="hidden min-[520px]:inline text-[var(--app-text-muted)]">
                  ·
                </span>
                <span className="hidden min-[520px]:inline truncate text-[var(--app-text-secondary)]">
                  {fileModeLabel}
                </span>
                {diagSummary.errors > 0 && (
                  <>
                    <span aria-hidden="true" className="text-[var(--app-text-muted)]">
                      ·
                    </span>
                    <span className="font-medium text-rose-600 tabular-nums whitespace-nowrap dark:text-rose-400">
                      Ошибок: {diagSummary.errors}
                    </span>
                  </>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-pressed={autosaveEnabled}
                  onClick={handleToggleAutosave}
                  data-testid="autosave-toggle"
                  title={autosaveStatus.tooltip}
                  className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors whitespace-nowrap ${
                    autosaveState === 'error'
                      ? 'text-rose-600 hover:bg-rose-500/10 dark:text-rose-400'
                      : autosaveState === 'disabled'
                        ? 'text-[var(--app-text-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]'
                        : 'text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]'
                  }`}
                >
                  {autosaveState === 'saving' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--app-accent)]" />
                  ) : autosaveState === 'disabled' ? (
                    <CloudOff className="h-3.5 w-3.5" />
                  ) : autosaveState === 'error' ? (
                    <AlertCircle className="h-3.5 w-3.5" />
                  ) : (
                    <CloudCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  )}
                  <span className="hidden min-[400px]:inline tabular-nums">
                    {autosaveStatus.shortLabel}
                  </span>
                </button>

                <button
                  type="button"
                  aria-pressed={effectiveWordWrap}
                  onClick={handleToggleWordWrap}
                  title={
                    effectiveWordWrap
                      ? 'Перенос строк включён (нажмите, чтобы выключить)'
                      : 'Перенос строк выключен (включается автоматически при узком экране)'
                  }
                  className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors whitespace-nowrap ${
                    effectiveWordWrap
                      ? 'bg-[var(--app-accent-soft)] text-[var(--app-text)]'
                      : 'text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]'
                  }`}
                >
                  <WrapText className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Перенос</span>
                </button>

                {currentSyntaxMode === 'cpp' && (
                  <button
                    type="button"
                    onClick={handleFormatCode}
                    aria-label="Форматировать код"
                    title="Форматировать код (⌘⇧F)"
                    className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] whitespace-nowrap"
                  >
                    {formattedFeedback ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <AlignLeft className="h-3.5 w-3.5" />
                    )}
                    <span>{formattedFeedback ? 'Готово' : 'Формат'}</span>
                    <span className="hidden xl:inline font-mono text-[10px] text-[var(--app-text-muted)]">
                      ⌘⇧F
                    </span>
                  </button>
                )}
              </div>
            </div>

            <div className="min-h-0 min-w-0 w-full flex-1 overflow-hidden">
              <CodeEditor
                ref={editorRef}
                value={currentContent}
                onChange={(next) => {
                  const active = activeFileRef.current;
                  if (filesRef.current[active]?.isBinary) return;
                  userEditedBeforeHydrationRef.current = true;
                  const updatedFile = createVirtualFile(active, next);
                  const nextMap = { ...filesRef.current, [active]: updatedFile };
                  filesRef.current = nextMap;
                  setFilesMap(nextMap);
                  scheduleAutosave(updatedFile, nextMap);
                }}
                theme={activeTheme}
                fontSize={fontSize}
                lineWrapping={currentFile?.isBinary ? false : effectiveWordWrap}
                syntaxMode={currentSyntaxMode}
                readOnly={Boolean(currentFile?.isBinary)}
                diagnostics={visibleEditorDiagnostics}
                onRun={() => void handleRun()}
                onFormat={handleFormatCode}
                onWidthChange={setEditorWidth}
              />
            </div>
          </section>

          {/* Draggable Split Handle (Magic Keyboard trackpad + iPad touch/stylus) */}
          {effectiveLayout !== 'tabs' && (
            <div
              role="separator"
              aria-orientation={effectiveLayout === 'side-by-side' ? 'vertical' : 'horizontal'}
              aria-label="Изменить размер панелей"
              data-testid="split-divider"
              onPointerDown={handleDividerPointerDown}
              onPointerMove={handleDividerPointerMove}
              onPointerUp={finishDividerDrag}
              onPointerCancel={finishDividerDrag}
              onDoubleClick={() => setSplitRatio(0.5)}
              className={`group relative z-10 flex shrink-0 touch-none select-none items-center justify-center transition-colors ${
                isDragging
                  ? 'bg-[var(--app-accent)]'
                  : 'bg-[var(--app-border)] hover:bg-[var(--app-accent)]'
              } ${
                effectiveLayout === 'side-by-side'
                  ? 'w-1.5 cursor-col-resize'
                  : 'h-1.5 cursor-row-resize'
              }`}
            >
              {/* Subtle tactile grip bar for iPad trackpad & touch */}
              <div
                aria-hidden="true"
                className={`rounded-full transition-colors ${
                  isDragging
                    ? 'bg-white/90'
                    : 'bg-[var(--app-text-muted)]/60 group-hover:bg-white/90'
                } ${effectiveLayout === 'side-by-side' ? 'h-8 w-0.5' : 'h-0.5 w-8'}`}
              />
              {/* Expanded invisible hit target for effortless iPad touch & stylus grabbing */}
              <div
                className={
                  effectiveLayout === 'side-by-side'
                    ? 'absolute inset-y-0 -left-2.5 -right-2.5'
                    : 'absolute inset-x-0 -top-2.5 -bottom-2.5'
                }
              />
            </div>
          )}

          {/* Console Pane: strictly flex-1 with min-w-0 + overflow-hidden */}
          <div
            data-testid="console-pane"
            className={`min-h-0 min-w-0 flex-1 overflow-hidden ${
              effectiveLayout === 'tabs' && activeTab !== 'console' ? 'hidden' : 'flex'
            } ${isDragging ? 'pointer-events-none select-none' : ''}`}
          >
            <ConsolePanel
              ref={consoleRef}
              runId={runId}
              status={status}
              chunks={chunks}
              diagnostics={diagnostics}
              rawCompilerOutput={rawCompilerOutput}
              compileTimeMs={compileTimeMs}
              runDurationMs={runDurationMs}
              exitCode={exitCode}
              exitReason={exitReason}
              fontSize={fontSize}
              files={sortedFiles}
              onSendInput={(line) => void handleSendInput(line)}
              onSendEof={() => void handleSendEof()}
              onStop={() => void handleStop()}
              onClear={handleClearConsole}
              onJumpToDiagnostic={handleJumpToDiagnostic}
              onHexDumpFile={handleHexDumpFile}
              onRunConsoleCommand={handleRunConsoleCommand}
            />
          </div>
        </main>
      </div>

      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      <OfflineIndicator
        isOnline={isOnline}
        justCachedOffline={justCachedOffline}
        needRefresh={needRefresh}
        onApplyUpdate={applyUpdate}
        onDismissOfflineToast={dismissOfflineToast}
      />
    </div>
  );
}
