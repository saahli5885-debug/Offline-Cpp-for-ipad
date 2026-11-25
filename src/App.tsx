import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignLeft,
  AlertCircle,
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
};

export default function App() {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = safeReadStorage(STORAGE_KEYS.language, 'cpp');
    return saved === 'c' ? 'c' : 'cpp';
  });

  const [standards, setStandards] = useState<Record<Language, CompilerStandard>>(() => ({
    cpp: safeReadStorage(STORAGE_KEYS.standardCpp, 'c++20') as CompilerStandard,
    c: safeReadStorage(STORAGE_KEYS.standardC, 'c17') as CompilerStandard,
  }));

  const [codes, setCodes] = useState<Record<Language, string>>(() => ({
    cpp: safeReadStorage(STORAGE_KEYS.codeCpp, DEFAULT_CODE.cpp),
    c: safeReadStorage(STORAGE_KEYS.codeC, DEFAULT_CODE.c),
  }));

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

  const codesRef = useRef(codes);
  codesRef.current = codes;
  const autosaveEnabledRef = useRef(autosaveEnabled);
  autosaveEnabledRef.current = autosaveEnabled;
  const sessionRef = useRef<BrowserCppSession | null>(null);
  const chunkCounterRef = useRef(0);
  const formatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<CodeEditorHandle | null>(null);
  const consoleRef = useRef<ConsolePanelHandle | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const activeTheme = useMemo(() => getThemeById(themeId), [themeId]);

  const effectiveLayout = useMemo(
    () => resolveEffectiveLayout(layoutPreference, viewport.width, viewport.height),
    [layoutPreference, viewport.width, viewport.height]
  );

  const effectiveWordWrap = useMemo(
    () => resolveWordWrap(wordWrapPreference, viewport.width, editorWidth),
    [wordWrapPreference, viewport.width, editorWidth]
  );

  const currentCode = codes[language];
  const currentStandard = standards[language];
  const diagSummary = useMemo(() => summarizeDiagnostics(diagnostics), [diagnostics]);
  const autosaveStatus = useMemo(
    () => getAutosaveStatusText(autosaveState, lastSavedAt),
    [autosaveState, lastSavedAt]
  );

  const getLiveCode = useCallback((): string => {
    const editorText = editorRef.current?.getValue();
    return editorText !== undefined ? editorText : codesRef.current[language];
  }, [language]);

  const flushCodeToStorage = useCallback(
    (targetCodes: Record<Language, string> = codesRef.current) => {
      const now = Date.now();
      const cppRes = safeWriteStorage(STORAGE_KEYS.codeCpp, targetCodes.cpp, undefined, now);
      const cRes = safeWriteStorage(STORAGE_KEYS.codeC, targetCodes.c, undefined, now);
      if (cppRes.ok && cRes.ok) {
        safeWriteStorage(STORAGE_KEYS.lastSavedAt, String(now), undefined, now);
        setLastSavedAt(now);
        setAutosaveState('saved');
      } else {
        setAutosaveState('error');
      }
    },
    []
  );

  const scheduleAutosave = useCallback(
    (nextCodes: Record<Language, string>) => {
      if (!autosaveEnabledRef.current) {
        setAutosaveState('disabled');
        return;
      }
      setAutosaveState('saving');
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
      autosaveTimerRef.current = setTimeout(() => {
        flushCodeToStorage(nextCodes);
      }, 400);
    },
    [flushCodeToStorage]
  );

  const handleToggleAutosave = useCallback(() => {
    setAutosaveEnabled((prev) => {
      const next = !prev;
      autosaveEnabledRef.current = next;
      safeWriteStorage(STORAGE_KEYS.autosave, String(next));
      if (next) {
        const liveCode = getLiveCode();
        const synced = { ...codesRef.current, [language]: liveCode };
        codesRef.current = synced;
        flushCodeToStorage(synced);
      } else {
        if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
        setAutosaveState('disabled');
      }
      return next;
    });
  }, [flushCodeToStorage, getLiveCode, language]);

  const appendChunk = useCallback((kind: ConsoleChunk['kind'], text: string) => {
    chunkCounterRef.current += 1;
    const id = `c-${chunkCounterRef.current}`;
    setChunks((prev) => [...prev, { id, kind, text }]);
  }, []);

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

  // Immediately flush code when page is hidden/unloaded (vital for iPad Safari / PWA suspension)
  useEffect(() => {
    const flushIfEnabled = () => {
      if (!autosaveEnabledRef.current) return;
      const live = editorRef.current?.getValue();
      const snapshot =
        live !== undefined ? { ...codesRef.current, [language]: live } : codesRef.current;
      codesRef.current = snapshot;
      const now = Date.now();
      safeWriteStorage(STORAGE_KEYS.codeCpp, snapshot.cpp, undefined, now);
      safeWriteStorage(STORAGE_KEYS.codeC, snapshot.c, undefined, now);
      safeWriteStorage(STORAGE_KEYS.lastSavedAt, String(now), undefined, now);
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
  }, [language]);

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

  const handleRun = useCallback(() => {
    stopActiveSession();

    // Synchronously read live editor buffer to eliminate stale-closure races on Cmd+Enter / Run
    const liveCode = getLiveCode();
    if (codesRef.current[language] !== liveCode) {
      const nextCodes = { ...codesRef.current, [language]: liveCode };
      codesRef.current = nextCodes;
      setCodes(nextCodes);
      if (autosaveEnabledRef.current) {
        flushCodeToStorage(nextCodes);
      }
    }

    setRunId((id) => id + 1);
    setStatus('compiling');
    setChunks([]);
    setDiagnostics([]);
    setRawCompilerOutput('');
    setCompileTimeMs(null);
    setRunDurationMs(null);
    setExitCode(null);
    setExitReason(null);

    if (effectiveLayout === 'tabs') {
      setActiveTab('console');
    }

    const compiled = compileInBrowser(liveCode, language);
    setCompileTimeMs(compiled.compileTimeMs);
    setDiagnostics(compiled.diagnostics);
    setRawCompilerOutput(compiled.rawCompilerOutput);

    if (!compiled.ok || !compiled.program) {
      setStatus('compile_error');
      return;
    }

    setStatus('running');

    let session: BrowserCppSession | null = null;
    session = new BrowserCppSession(compiled.program, {
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
  }, [appendChunk, effectiveLayout, flushCodeToStorage, getLiveCode, language, stopActiveSession]);

  const handleFormatCode = useCallback(() => {
    const liveCode = getLiveCode();
    const formatted = formatCppCode(liveCode);
    if (formatted !== codesRef.current[language]) {
      const nextCodes = { ...codesRef.current, [language]: formatted };
      codesRef.current = nextCodes;
      setCodes(nextCodes);
      if (autosaveEnabledRef.current) {
        flushCodeToStorage(nextCodes);
      }
    }
    setFormattedFeedback(true);
    if (formatTimerRef.current) clearTimeout(formatTimerRef.current);
    formatTimerRef.current = setTimeout(() => {
      setFormattedFeedback(false);
    }, 1500);
  }, [flushCodeToStorage, getLiveCode, language]);

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

  const handleJumpToDiagnostic = useCallback(
    (line: number, column?: number | null) => {
      if (effectiveLayout === 'tabs') {
        setActiveTab('editor');
        setTimeout(() => editorRef.current?.jumpToLine(line, column), 40);
      } else {
        editorRef.current?.jumpToLine(line, column);
      }
    },
    [effectiveLayout]
  );

  const handleDownloadCode = useCallback(() => {
    const filename = language === 'cpp' ? 'main.cpp' : 'main.c';
    const liveCode = getLiveCode();
    if (autosaveEnabledRef.current) {
      const nextCodes = { ...codesRef.current, [language]: liveCode };
      codesRef.current = nextCodes;
      flushCodeToStorage(nextCodes);
    }
    const blob = new Blob([liveCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [flushCodeToStorage, getLiveCode, language]);

  const handleImportCode = useCallback(
    (content: string, detectedLang?: Language) => {
      stopActiveSession();
      const targetLang = detectedLang ?? language;
      if (detectedLang) {
        setLanguage(detectedLang);
      }
      const nextCodes = { ...codesRef.current, [targetLang]: content };
      codesRef.current = nextCodes;
      setCodes(nextCodes);
      if (autosaveEnabledRef.current) {
        flushCodeToStorage(nextCodes);
      }
      setDiagnostics([]);
      setStatus('idle');
    },
    [flushCodeToStorage, language, stopActiveSession]
  );

  const handleSelectTemplate = useCallback(
    (tpl: CodeTemplate) => {
      stopActiveSession();
      setLanguage(tpl.language);
      const nextCodes = { ...codesRef.current, [tpl.language]: tpl.code };
      codesRef.current = nextCodes;
      setCodes(nextCodes);
      if (autosaveEnabledRef.current) {
        flushCodeToStorage(nextCodes);
      }
      setDiagnostics([]);
      setChunks([]);
      setStatus('idle');
      if (effectiveLayout === 'tabs') {
        setActiveTab('editor');
      }
    },
    [effectiveLayout, flushCodeToStorage, stopActiveSession]
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
        handleDownloadCode();
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
    handleDownloadCode,
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

  const currentFileName = language === 'cpp' ? 'main.cpp' : 'main.c';

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
        onChangeLanguage={(lang) => {
          stopActiveSession();
          setLanguage(lang);
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
        onDownloadCode={handleDownloadCode}
        onImportCode={handleImportCode}
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
            Код · {currentFileName}
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
          {/* Editor sub-header: file info + Autosave status toggle + Word Wrap + Format (⌘⇧F) */}
          <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-[var(--app-border)] bg-[var(--app-surface)] px-3 sm:px-3.5">
            <div className="flex min-w-0 items-center gap-2 text-xs">
              <span className="truncate font-mono font-semibold text-[var(--app-text)]">
                {currentFileName}
              </span>
              <span aria-hidden="true" className="hidden min-[520px]:inline text-[var(--app-text-muted)]">
                ·
              </span>
              <span className="hidden min-[520px]:inline truncate text-[var(--app-text-secondary)]">
                {language === 'cpp' ? 'C++' : 'C'} ({currentStandard})
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
            </div>
          </div>

          <div className="min-h-0 min-w-0 w-full flex-1 overflow-hidden">
            <CodeEditor
              ref={editorRef}
              value={currentCode}
              onChange={(next) => {
                const nextCodes = { ...codesRef.current, [language]: next };
                codesRef.current = nextCodes;
                setCodes(nextCodes);
                scheduleAutosave(nextCodes);
              }}
              theme={activeTheme}
              fontSize={fontSize}
              lineWrapping={effectiveWordWrap}
              diagnostics={diagnostics}
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
            onSendInput={(line) => void handleSendInput(line)}
            onSendEof={() => void handleSendEof()}
            onStop={() => void handleStop()}
            onClear={handleClearConsole}
            onJumpToDiagnostic={handleJumpToDiagnostic}
          />
        </div>
      </main>

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
