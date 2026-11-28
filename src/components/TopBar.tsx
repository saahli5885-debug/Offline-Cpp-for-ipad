import { useEffect, useRef, useState } from 'react';
import {
  AlignLeft,
  BookOpen,
  Check,
  ChevronDown,
  Columns2,
  Download,
  FolderOpen,
  Keyboard,
  Loader2,
  Minus,
  Monitor,
  MoreHorizontal,
  Palette,
  PanelTop,
  Play,
  Plus,
  Rows2,
  Settings,
  Square,
  Upload,
} from 'lucide-react';
import { APP_THEMES, getThemeById, type ThemeId } from '../themes/themes';
import type {
  CodeTemplate,
  CompilerStandard,
  EffectiveLayout,
  Language,
  LayoutPreference,
  RunStatus,
} from '../types/compiler';
import { PWAInstallButton } from './PWAInstallButton';

const STANDARDS_BY_LANG: Record<Language, { value: CompilerStandard; label: string }[]> = {
  cpp: [
    { value: 'c++23', label: 'C++23' },
    { value: 'c++20', label: 'C++20' },
    { value: 'c++17', label: 'C++17' },
    { value: 'c++14', label: 'C++14' },
  ],
  c: [
    { value: 'c17', label: 'C17' },
    { value: 'c11', label: 'C11' },
    { value: 'c99', label: 'C99' },
  ],
};

interface LayoutOption {
  value: LayoutPreference;
  label: string;
  hint: string;
}

const LAYOUT_OPTIONS: LayoutOption[] = [
  { value: 'auto', label: 'Авто', hint: 'Подстраивается под экран' },
  { value: 'side-by-side', label: 'Рядом', hint: 'Код слева, консоль справа' },
  { value: 'stacked', label: 'Сверху и снизу', hint: 'Код сверху, консоль снизу' },
  { value: 'tabs', label: 'Вкладки', hint: 'Переключение Код / Консоль' },
];

const DARK_THEMES = APP_THEMES.filter((t) => t.mode === 'dark');
const LIGHT_THEMES = APP_THEMES.filter((t) => t.mode === 'light');

interface TopBarProps {
  language: Language;
  standard: CompilerStandard;
  status: RunStatus;
  themeId: ThemeId;
  fontSize: number;
  layoutPreference: LayoutPreference;
  effectiveLayout: EffectiveLayout;
  templates: CodeTemplate[];
  sidebarOpen: boolean;
  fileCount: number;
  recentChangeCount: number;
  onToggleSidebar: () => void;
  onChangeLanguage: (lang: Language) => void;
  onChangeStandard: (std: CompilerStandard) => void;
  onSelectTemplate: (template: CodeTemplate) => void;
  onRun: () => void;
  onStop: () => void;
  onFormat: () => void;
  onSelectTheme: (themeId: ThemeId) => void;
  onChangeFontSize: (delta: number) => void;
  onSelectLayout: (layout: LayoutPreference) => void;
  onDownloadCode: () => void;
  onImportFiles: (files: FileList) => void;
  onOpenShortcuts: () => void;
  onOpenSettings: () => void;
  offlineReady: boolean;
  isOnline: boolean;
}

function LayoutIcon({ layout, className }: { layout: EffectiveLayout | LayoutPreference; className?: string }) {
  if (layout === 'side-by-side') return <Columns2 className={className} />;
  if (layout === 'stacked') return <Rows2 className={className} />;
  if (layout === 'tabs') return <PanelTop className={className} />;
  return <Monitor className={className} />;
}

export function TopBar({
  language,
  standard,
  status,
  themeId,
  fontSize,
  layoutPreference,
  effectiveLayout,
  templates,
  sidebarOpen,
  fileCount,
  recentChangeCount,
  onToggleSidebar,
  onChangeLanguage,
  onChangeStandard,
  onSelectTemplate,
  onRun,
  onStop,
  onFormat,
  onSelectTheme,
  onChangeFontSize,
  onSelectLayout,
  onDownloadCode,
  onImportFiles,
  onOpenShortcuts,
  onOpenSettings,
  offlineReady,
  isOnline,
}: TopBarProps) {
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const templatesMenuRef = useRef<HTMLDivElement | null>(null);
  const layoutMenuRef = useRef<HTMLDivElement | null>(null);
  const themeMenuRef = useRef<HTMLDivElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeTheme = getThemeById(themeId);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (templatesMenuRef.current && !templatesMenuRef.current.contains(e.target as Node)) {
        setTemplatesOpen(false);
      }
      if (layoutMenuRef.current && !layoutMenuRef.current.contains(e.target as Node)) {
        setLayoutOpen(false);
      }
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setThemeOpen(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setTemplatesOpen(false);
        setLayoutOpen(false);
        setThemeOpen(false);
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const isBusy = status === 'compiling' || status === 'running';
  const filteredTemplates = templates.filter((t) => t.language === language);

  const activeLayoutLabel =
    layoutPreference === 'auto'
      ? `Раскладка: Авто (${
          effectiveLayout === 'side-by-side'
            ? 'рядом'
            : effectiveLayout === 'stacked'
              ? 'сверху/снизу'
              : 'вкладки'
        })`
      : layoutPreference === 'side-by-side'
        ? 'Раскладка: Рядом'
        : layoutPreference === 'stacked'
          ? 'Раскладка: Сверху и снизу'
          : 'Раскладка: Вкладки (Код / Консоль)';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onImportFiles(e.target.files);
    }
    e.target.value = '';
  };

  return (
    <header className="flex h-13 shrink-0 items-center justify-between gap-2 sm:gap-3 border-b border-[var(--app-border)] bg-[var(--app-surface)] px-2 sm:px-3.5">
      {/* Left zone: Files drawer toggle + Brand + Language switch + Standard */}
      <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
        <button
          type="button"
          data-testid="toggle-files-button"
          onClick={onToggleSidebar}
          aria-expanded={sidebarOpen}
          aria-controls="workspace-sidebar"
          aria-label={sidebarOpen ? 'Скрыть файлы рабочей области' : 'Открыть файлы рабочей области'}
          title="Файлы рабочей области"
          className={`relative inline-flex h-11 min-w-[44px] shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2 sm:px-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
            sidebarOpen
              ? 'border-[var(--app-accent)]/60 bg-[var(--app-accent-soft)] text-[var(--app-text)]'
              : 'border-[var(--app-border-strong)] bg-[var(--app-elevated)] text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]'
          }`}
        >
          <FolderOpen className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">Файлы</span>
          <span className="hidden min-[560px]:inline font-mono text-[11px] opacity-75 tabular-nums">
            {fileCount}
          </span>
          {recentChangeCount > 0 && (
            <span
              aria-label={`Изменено файлов: ${recentChangeCount}`}
              className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-emerald-500 px-1 font-mono text-[10px] font-bold text-white tabular-nums shadow-xs"
            >
              {recentChangeCount}
            </span>
          )}
        </button>

        <span className="hidden min-[430px]:inline text-sm font-bold tracking-tight text-[var(--app-text)] whitespace-nowrap shrink-0">
          C++ Studio
        </span>

        <div
          role="group"
          aria-label="Выбор языка программирования"
          className="flex shrink-0 items-center rounded-lg border border-[var(--app-border-strong)] bg-[var(--app-inset)] p-0.5"
        >
          <button
            type="button"
            aria-pressed={language === 'cpp'}
            onClick={() => onChangeLanguage('cpp')}
            className={`rounded-md px-2 sm:px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              language === 'cpp'
                ? 'bg-[var(--app-elevated)] text-[var(--app-text)] shadow-xs'
                : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
            }`}
          >
            C++
          </button>
          <button
            type="button"
            aria-pressed={language === 'c'}
            onClick={() => onChangeLanguage('c')}
            className={`rounded-md px-2 sm:px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              language === 'c'
                ? 'bg-[var(--app-elevated)] text-[var(--app-text)] shadow-xs'
                : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)]'
            }`}
          >
            C
          </button>
        </div>

        <label className="hidden sm:block shrink-0">
          <span className="sr-only">Стандарт компилятора</span>
          <select
            aria-label="Стандарт компилятора"
            value={standard}
            onChange={(e) => onChangeStandard(e.target.value as CompilerStandard)}
            className="h-8 rounded-lg border border-[var(--app-border-strong)] bg-[var(--app-elevated)] px-2 text-xs font-medium text-[var(--app-text)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
          >
            {STANDARDS_BY_LANG[language].map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Right zone: Utilities + Primary CTA */}
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {/* Examples dropdown (visible on >= md, also inside More menu on narrow screens) */}
        <div ref={templatesMenuRef} className="relative hidden md:block">
          <button
            type="button"
            aria-expanded={templatesOpen}
            aria-haspopup="menu"
            onClick={() => setTemplatesOpen((v) => !v)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--app-border-strong)] bg-[var(--app-elevated)] px-2.5 text-xs font-medium text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)] whitespace-nowrap shrink-0"
          >
            <BookOpen className="h-3.5 w-3.5 text-[var(--app-text-secondary)]" />
            <span>Примеры</span>
            <ChevronDown className="h-3.5 w-3.5 text-[var(--app-text-secondary)]" />
          </button>

          {templatesOpen && (
            <div
              role="menu"
              className="absolute right-0 z-30 mt-1.5 w-72 rounded-xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] p-1.5 shadow-lg"
            >
              {filteredTemplates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onSelectTemplate(tpl);
                    setTemplatesOpen(false);
                  }}
                  className="block w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--app-hover)]"
                >
                  <div className="text-xs font-semibold text-[var(--app-text)]">
                    {tpl.title}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--app-text-secondary)]">
                    {tpl.description}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Font size controls on >= lg */}
        <div className="hidden lg:flex items-center rounded-lg border border-[var(--app-border-strong)] bg-[var(--app-elevated)]">
          <button
            type="button"
            onClick={() => onChangeFontSize(-1)}
            aria-label="Уменьшить шрифт"
            title="Уменьшить шрифт (⌘-)"
            className="inline-flex h-8 w-7 items-center justify-center text-[var(--app-text-secondary)] transition-colors hover:text-[var(--app-text)]"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="px-1 font-mono text-[11px] text-[var(--app-text-secondary)] tabular-nums">
            {fontSize}
          </span>
          <button
            type="button"
            onClick={() => onChangeFontSize(1)}
            aria-label="Увеличить шрифт"
            title="Увеличить шрифт (⌘+)"
            className="inline-flex h-8 w-7 items-center justify-center text-[var(--app-text-secondary)] transition-colors hover:text-[var(--app-text)]"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* 3-mode Layout Picker (Рядом / Сверху и снизу / Вкладки / Авто) */}
        <div ref={layoutMenuRef} className="relative">
          <button
            type="button"
            aria-label={activeLayoutLabel}
            aria-expanded={layoutOpen}
            aria-haspopup="menu"
            title={`${activeLayoutLabel} (⌘\\)`}
            onClick={() => setLayoutOpen((v) => !v)}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--app-border-strong)] bg-[var(--app-elevated)] px-2 text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] shrink-0"
          >
            <LayoutIcon layout={effectiveLayout} className="h-4 w-4" />
            <ChevronDown className="h-3 w-3 opacity-70" />
          </button>

          {layoutOpen && (
            <div
              role="menu"
              aria-label="Выбор раскладки панелей"
              className="absolute right-0 z-30 mt-1.5 w-60 rounded-xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] p-1.5 shadow-lg"
            >
              <div className="px-2.5 py-1 text-[11px] font-semibold text-[var(--app-text-secondary)]">
                Раскладка (⌘\)
              </div>
              {LAYOUT_OPTIONS.map((option) => {
                const isSelected = layoutPreference === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isSelected}
                    onClick={() => {
                      onSelectLayout(option.value);
                      setLayoutOpen(false);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                      isSelected
                        ? 'bg-[var(--app-accent-soft)] text-[var(--app-text)]'
                        : 'text-[var(--app-text)] hover:bg-[var(--app-hover)]'
                    }`}
                  >
                    <LayoutIcon layout={option.value} className="h-4 w-4 shrink-0 opacity-85" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold">{option.label}</div>
                      <div className="truncate text-[11px] text-[var(--app-text-secondary)]">
                        {option.hint}
                      </div>
                    </div>
                    {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-[var(--app-accent)]" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Magic Keyboard shortcuts button on >= lg */}
        <button
          type="button"
          onClick={onOpenShortcuts}
          aria-label="Горячие клавиши Magic Keyboard"
          title="Горячие клавиши Magic Keyboard"
          className="hidden lg:inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--app-border-strong)] bg-[var(--app-elevated)] text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] shrink-0"
        >
          <Keyboard className="h-4 w-4" />
        </button>

        {/* Open / import files button on >= xl */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Импорт файлов в рабочую область"
          title="Импорт из Файлов (.cpp, .h, .txt, .csv, .dat)"
          className="hidden xl:inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--app-border-strong)] bg-[var(--app-elevated)] text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] shrink-0"
        >
          <Upload className="h-4 w-4" />
        </button>

        {/* Download active file button on >= xl */}
        <button
          type="button"
          onClick={onDownloadCode}
          aria-label="Сохранить текущий файл"
          title="Сохранить файл (⌘S)"
          className="hidden xl:inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--app-border-strong)] bg-[var(--app-elevated)] text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] shrink-0"
        >
          <Download className="h-4 w-4" />
        </button>

        {/* PWA Install / Offline guide (auto-hides in standalone mode; inside More menu on < sm) */}
        <PWAInstallButton
          offlineReady={offlineReady}
          isOnline={isOnline}
          className="hidden sm:inline-flex"
        />

        {/* Multi-Theme Selector (6 curated IDE themes; also in More menu on <430px) */}
        <div ref={themeMenuRef} className="relative hidden min-[430px]:block">
          <button
            type="button"
            aria-label={`Выбрать тему оформления (текущая: ${activeTheme.name})`}
            aria-expanded={themeOpen}
            aria-haspopup="menu"
            title={`Тема: ${activeTheme.name}`}
            onClick={() => setThemeOpen((v) => !v)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--app-border-strong)] bg-[var(--app-elevated)] px-2 text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] shrink-0"
          >
            <Palette className="h-3.5 w-3.5 shrink-0" />
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-full border border-black/20 dark:border-white/25"
              style={{ backgroundColor: activeTheme.swatches[1] }}
            />
            <ChevronDown className="h-3 w-3 opacity-70" />
          </button>

          {themeOpen && (
            <div
              role="menu"
              aria-label="Выбор темы оформления"
              className="absolute right-0 z-30 mt-1.5 w-64 rounded-xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] p-1.5 shadow-lg"
            >
              <div className="px-2.5 py-1 text-[11px] font-semibold text-[var(--app-text-secondary)]">
                Тёмные темы
              </div>
              {DARK_THEMES.map((item) => {
                const isSelected = item.id === themeId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isSelected}
                    onClick={() => {
                      onSelectTheme(item.id);
                      setThemeOpen(false);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                      isSelected
                        ? 'bg-[var(--app-accent-soft)] text-[var(--app-text)]'
                        : 'text-[var(--app-text)] hover:bg-[var(--app-hover)]'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-6 w-8 shrink-0 items-center justify-center gap-0.5 rounded-md border border-white/15 px-1"
                      style={{ backgroundColor: item.swatches[0] }}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: item.swatches[1] }}
                      />
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: item.swatches[2] }}
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold leading-tight">{item.name}</div>
                      <div className="truncate text-[11px] text-[var(--app-text-secondary)]">
                        {item.description}
                      </div>
                    </div>
                    {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-[var(--app-accent)]" />}
                  </button>
                );
              })}

              <div className="my-1 border-t border-[var(--app-border)]" />
              <div className="px-2.5 py-1 text-[11px] font-semibold text-[var(--app-text-secondary)]">
                Светлые темы
              </div>
              {LIGHT_THEMES.map((item) => {
                const isSelected = item.id === themeId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isSelected}
                    onClick={() => {
                      onSelectTheme(item.id);
                      setThemeOpen(false);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                      isSelected
                        ? 'bg-[var(--app-accent-soft)] text-[var(--app-text)]'
                        : 'text-[var(--app-text)] hover:bg-[var(--app-hover)]'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-6 w-8 shrink-0 items-center justify-center gap-0.5 rounded-md border border-black/15 px-1"
                      style={{ backgroundColor: item.swatches[0] }}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: item.swatches[1] }}
                      />
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: item.swatches[2] }}
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold leading-tight">{item.name}</div>
                      <div className="truncate text-[11px] text-[var(--app-text-secondary)]">
                        {item.description}
                      </div>
                    </div>
                    {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-[var(--app-accent)]" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Settings modal trigger (>= 44px touch target, always reachable from TopBar) */}
        <button
          type="button"
          data-testid="open-settings-button"
          onClick={onOpenSettings}
          aria-label="Настройки"
          title="Настройки (Верхний отступ iPadOS)"
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--app-border-strong)] bg-[var(--app-elevated)] text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] shrink-0"
        >
          <Settings className="h-4 w-4" />
        </button>

        {/* Overflow menu ONLY when secondary actions are collapsed (< xl) */}
        <div ref={moreMenuRef} className="relative xl:hidden">
          <button
            type="button"
            aria-label="Дополнительные действия"
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            onClick={() => setMoreOpen((v) => !v)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--app-border-strong)] bg-[var(--app-elevated)] text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] shrink-0"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {moreOpen && (
            <div
              role="menu"
              className="absolute right-0 z-30 mt-1.5 max-h-[75dvh] w-64 overflow-y-auto rounded-xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] p-1.5 shadow-lg"
            >
              {/* Standard selector on narrow screens (< sm) */}
              <div className="flex items-center justify-between px-2.5 py-2 sm:hidden">
                <span className="text-xs text-[var(--app-text-secondary)]">Стандарт</span>
                <select
                  aria-label="Стандарт компилятора в меню"
                  value={standard}
                  onChange={(e) => onChangeStandard(e.target.value as CompilerStandard)}
                  className="h-7 rounded border border-[var(--app-border-strong)] bg-[var(--app-elevated)] px-2 text-xs font-medium text-[var(--app-text)]"
                >
                  {STANDARDS_BY_LANG[language].map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Font size controls (< lg) */}
              <div className="flex items-center justify-between px-2.5 py-2 lg:hidden">
                <span className="text-xs text-[var(--app-text-secondary)]">Размер шрифта</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onChangeFontSize(-1)}
                    aria-label="Уменьшить шрифт в меню"
                    className="inline-flex h-7 w-7 items-center justify-center rounded border border-[var(--app-border-strong)] text-[var(--app-text)] hover:bg-[var(--app-hover)]"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-7 text-center font-mono text-xs tabular-nums text-[var(--app-text)]">
                    {fontSize}
                  </span>
                  <button
                    type="button"
                    onClick={() => onChangeFontSize(1)}
                    aria-label="Увеличить шрифт в меню"
                    className="inline-flex h-7 w-7 items-center justify-center rounded border border-[var(--app-border-strong)] text-[var(--app-text)] hover:bg-[var(--app-hover)]"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>

              <div className="my-1 border-t border-[var(--app-border)] lg:hidden" />

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onFormat();
                  setMoreOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-[var(--app-text)] hover:bg-[var(--app-hover)]"
              >
                <AlignLeft className="h-3.5 w-3.5 text-[var(--app-text-secondary)]" />
                <span>Форматировать код (⌘⇧F)</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  fileInputRef.current?.click();
                  setMoreOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-[var(--app-text)] hover:bg-[var(--app-hover)]"
              >
                <Upload className="h-3.5 w-3.5 text-[var(--app-text-secondary)]" />
                <span>Импорт из Файлов</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onDownloadCode();
                  setMoreOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-[var(--app-text)] hover:bg-[var(--app-hover)]"
              >
                <Download className="h-3.5 w-3.5 text-[var(--app-text-secondary)]" />
                <span>Сохранить файл (⌘S)</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onOpenSettings();
                  setMoreOpen(false);
                }}
                className="flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-[var(--app-text)] hover:bg-[var(--app-hover)]"
              >
                <Settings className="h-3.5 w-3.5 text-[var(--app-text-secondary)]" />
                <span>Настройки (Верхний отступ iPadOS)</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onOpenShortcuts();
                  setMoreOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-[var(--app-text)] hover:bg-[var(--app-hover)] lg:hidden"
              >
                <Keyboard className="h-3.5 w-3.5 text-[var(--app-text-secondary)]" />
                <span>Клавиши Magic Keyboard</span>
              </button>

              <PWAInstallButton
                offlineReady={offlineReady}
                isOnline={isOnline}
                variant="menuitem"
                className="flex sm:hidden"
                onActionComplete={() => setMoreOpen(false)}
              />

              {/* Theme Picker inside More menu on narrow phones (< 430px) */}
              <div className="min-[430px]:hidden">
                <div className="my-1 border-t border-[var(--app-border)]" />
                <div className="px-2.5 py-1 text-[11px] font-semibold text-[var(--app-text-secondary)]">
                  Тема оформления
                </div>
                <div className="grid grid-cols-2 gap-1 px-1 py-0.5">
                  {APP_THEMES.map((item) => {
                    const isSelected = item.id === themeId;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={isSelected}
                        onClick={() => {
                          onSelectTheme(item.id);
                          setMoreOpen(false);
                        }}
                        className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-[11px] font-medium transition-colors ${
                          isSelected
                            ? 'border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-text)]'
                            : 'border-[var(--app-border)] text-[var(--app-text)] hover:bg-[var(--app-hover)]'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/15"
                          style={{ backgroundColor: item.swatches[0] }}
                        />
                        <span className="truncate">{item.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Examples list inside More menu for narrow screens (< md) */}
              <div className="md:hidden">
                <div className="my-1 border-t border-[var(--app-border)]" />
                <div className="px-2.5 py-1 text-[11px] font-semibold text-[var(--app-text-secondary)]">
                  Примеры ({language === 'cpp' ? 'C++' : 'C'})
                </div>
                {filteredTemplates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onSelectTemplate(tpl);
                      setMoreOpen(false);
                    }}
                    className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-[var(--app-text)] hover:bg-[var(--app-hover)]"
                  >
                    {tpl.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".txt,.cpp,.cc,.cxx,.c,.h,.hpp,.hh,.csv,.dat,.bin,.json,.md"
          onChange={handleFileChange}
          className="hidden"
          aria-hidden="true"
        />

        {/* Single primary CTA: Запустить / Остановить (>= 44px touch height for iPadOS) */}
        {status === 'running' ? (
          <button
            type="button"
            onClick={onStop}
            className="inline-flex h-11 min-w-[44px] items-center gap-1.5 rounded-lg bg-rose-600 px-3 sm:px-3.5 text-xs font-semibold text-white transition-colors hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 whitespace-nowrap shrink-0"
          >
            <Square className="h-3 w-3 fill-current" />
            <span>Остановить</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onRun}
            disabled={isBusy}
            className="inline-flex h-11 min-w-[44px] items-center gap-1.5 rounded-lg bg-[var(--app-accent)] px-3 sm:px-3.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--app-accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-accent)] disabled:opacity-65 whitespace-nowrap shrink-0"
          >
            {status === 'compiling' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current" />
            )}
            <span>{status === 'compiling' ? 'Сборка...' : 'Запустить'}</span>
            <span className="hidden md:inline font-mono text-[11px] font-normal text-white/80">
              ⌘↵
            </span>
          </button>
        )}
      </div>
    </header>
  );
}
