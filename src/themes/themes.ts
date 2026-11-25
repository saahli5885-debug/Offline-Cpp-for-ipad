export type ThemeId =
  | 'github-dark'
  | 'dracula'
  | 'nord'
  | 'monokai'
  | 'github-light'
  | 'solarized-light';

export interface ThemeUIPalette {
  bgApp: string;
  bgSurface: string;
  bgElevated: string;
  bgConsole: string;
  bgInset: string;
  bgHover: string;
  border: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentHover: string;
  accentSoft: string;
  themeColorMeta: string;
}

export interface ThemeSyntaxPalette {
  keyword: string;
  type: string;
  fn: string;
  string: string;
  number: string;
  comment: string;
  meta: string;
  operator: string;
  variable: string;
  gutterBg: string;
  gutterText: string;
  gutterBorder: string;
  activeLine: string;
  activeGutter: string;
  activeGutterText: string;
  cursor: string;
  selection: string;
  bracketBg: string;
  bracketOutline: string;
  searchMatch: string;
}

export interface AppTheme {
  id: ThemeId;
  name: string;
  description: string;
  mode: 'dark' | 'light';
  swatches: [string, string, string];
  ui: ThemeUIPalette;
  syntax: ThemeSyntaxPalette;
}

export const APP_THEMES: AppTheme[] = [
  {
    id: 'github-dark',
    name: 'GitHub Dark',
    description: 'Классическая тёмная',
    mode: 'dark',
    swatches: ['#0D1117', '#3B82F6', '#FF7B72'],
    ui: {
      bgApp: '#0D1117',
      bgSurface: '#141922',
      bgElevated: '#181F2B',
      bgConsole: '#0D1117',
      bgInset: '#0D1117',
      bgHover: '#202938',
      border: '#232B38',
      borderStrong: '#2D3748',
      textPrimary: '#E6EDF3',
      textSecondary: '#8B95A5',
      textMuted: '#6E7A8A',
      accent: '#2563EB',
      accentHover: '#1D4ED8',
      accentSoft: 'rgba(59, 130, 246, 0.16)',
      themeColorMeta: '#0D1117',
    },
    syntax: {
      keyword: '#FF7B72',
      type: '#FFA657',
      fn: '#D2A8FF',
      string: '#A5D6FF',
      number: '#79C0FF',
      comment: '#7D8590',
      meta: '#79C0FF',
      operator: '#C9D1D9',
      variable: '#E6EDF3',
      gutterBg: '#0D1117',
      gutterText: '#4B5565',
      gutterBorder: '#1E2530',
      activeLine: 'rgba(56, 139, 253, 0.07)',
      activeGutter: 'rgba(56, 139, 253, 0.09)',
      activeGutterText: '#C9D1D9',
      cursor: '#60A5FA',
      selection: 'rgba(59, 130, 246, 0.28)',
      bracketBg: 'rgba(59, 130, 246, 0.24)',
      bracketOutline: 'rgba(96, 165, 250, 0.5)',
      searchMatch: 'rgba(245, 158, 11, 0.28)',
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    description: 'Насыщенная фиолетовая',
    mode: 'dark',
    swatches: ['#282A36', '#BD93F9', '#FF79C6'],
    ui: {
      bgApp: '#282A36',
      bgSurface: '#21222C',
      bgElevated: '#2D303E',
      bgConsole: '#242632',
      bgInset: '#1E1F29',
      bgHover: '#383B4D',
      border: '#383B4E',
      borderStrong: '#4A4E69',
      textPrimary: '#F8F8F2',
      textSecondary: '#A8B0C8',
      textMuted: '#7E87A3',
      accent: '#8B5CF6',
      accentHover: '#7C3AED',
      accentSoft: 'rgba(189, 147, 249, 0.18)',
      themeColorMeta: '#21222C',
    },
    syntax: {
      keyword: '#FF79C6',
      type: '#8BE9FD',
      fn: '#50FA7B',
      string: '#F1FA8C',
      number: '#BD93F9',
      comment: '#6272A4',
      meta: '#FF79C6',
      operator: '#FF79C6',
      variable: '#F8F8F2',
      gutterBg: '#282A36',
      gutterText: '#6272A4',
      gutterBorder: '#343746',
      activeLine: 'rgba(68, 71, 90, 0.45)',
      activeGutter: 'rgba(68, 71, 90, 0.55)',
      activeGutterText: '#F8F8F2',
      cursor: '#F8F8F2',
      selection: 'rgba(189, 147, 249, 0.28)',
      bracketBg: 'rgba(139, 233, 253, 0.2)',
      bracketOutline: 'rgba(139, 233, 253, 0.55)',
      searchMatch: 'rgba(255, 184, 108, 0.3)',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    description: 'Спокойная арктическая',
    mode: 'dark',
    swatches: ['#2E3440', '#88C0D0', '#81A1C1'],
    ui: {
      bgApp: '#2E3440',
      bgSurface: '#272C36',
      bgElevated: '#353C4A',
      bgConsole: '#2A303B',
      bgInset: '#242933',
      bgHover: '#3E4757',
      border: '#3B4252',
      borderStrong: '#4C566A',
      textPrimary: '#ECEFF4',
      textSecondary: '#B0BACB',
      textMuted: '#818C9E',
      accent: '#5E81AC',
      accentHover: '#4F7098',
      accentSoft: 'rgba(136, 192, 208, 0.16)',
      themeColorMeta: '#272C36',
    },
    syntax: {
      keyword: '#81A1C1',
      type: '#8FBCBB',
      fn: '#88C0D0',
      string: '#A3BE8C',
      number: '#B48EAD',
      comment: '#616E88',
      meta: '#5E81AC',
      operator: '#81A1C1',
      variable: '#D8DEE9',
      gutterBg: '#2E3440',
      gutterText: '#616E88',
      gutterBorder: '#3B4252',
      activeLine: 'rgba(67, 76, 94, 0.42)',
      activeGutter: 'rgba(67, 76, 94, 0.55)',
      activeGutterText: '#D8DEE9',
      cursor: '#88C0D0',
      selection: 'rgba(136, 192, 208, 0.25)',
      bracketBg: 'rgba(136, 192, 208, 0.22)',
      bracketOutline: 'rgba(136, 192, 208, 0.5)',
      searchMatch: 'rgba(235, 203, 139, 0.3)',
    },
  },
  {
    id: 'monokai',
    name: 'Monokai',
    description: 'Тёплая контрастная',
    mode: 'dark',
    swatches: ['#272822', '#A6E22E', '#F92672'],
    ui: {
      bgApp: '#272822',
      bgSurface: '#1F201B',
      bgElevated: '#2E2F28',
      bgConsole: '#23241E',
      bgInset: '#1B1C17',
      bgHover: '#3A3B32',
      border: '#3B3C32',
      borderStrong: '#4D4E42',
      textPrimary: '#F8F8F2',
      textSecondary: '#B3B1A1',
      textMuted: '#888676',
      accent: '#E07A1F',
      accentHover: '#C86814',
      accentSoft: 'rgba(253, 151, 31, 0.18)',
      themeColorMeta: '#1F201B',
    },
    syntax: {
      keyword: '#F92672',
      type: '#66D9EF',
      fn: '#A6E22E',
      string: '#E6DB74',
      number: '#AE81FF',
      comment: '#75715E',
      meta: '#F92672',
      operator: '#F92672',
      variable: '#F8F8F2',
      gutterBg: '#272822',
      gutterText: '#75715E',
      gutterBorder: '#383930',
      activeLine: 'rgba(73, 72, 62, 0.45)',
      activeGutter: 'rgba(73, 72, 62, 0.55)',
      activeGutterText: '#E6E6DF',
      cursor: '#F8F8F0',
      selection: 'rgba(253, 151, 31, 0.26)',
      bracketBg: 'rgba(166, 226, 46, 0.2)',
      bracketOutline: 'rgba(166, 226, 46, 0.5)',
      searchMatch: 'rgba(230, 219, 116, 0.3)',
    },
  },
  {
    id: 'github-light',
    name: 'GitHub Light',
    description: 'Чистая светлая',
    mode: 'light',
    swatches: ['#FFFFFF', '#2563EB', '#CF222E'],
    ui: {
      bgApp: '#FFFFFF',
      bgSurface: '#F3F5F8',
      bgElevated: '#FFFFFF',
      bgConsole: '#FAFBFD',
      bgInset: '#E8ECF2',
      bgHover: '#EEF2F7',
      border: '#DFE4EC',
      borderStrong: '#CBD5E1',
      textPrimary: '#111827',
      textSecondary: '#5B6576',
      textMuted: '#64748B',
      accent: '#2563EB',
      accentHover: '#1D4ED8',
      accentSoft: 'rgba(37, 99, 235, 0.12)',
      themeColorMeta: '#F3F5F8',
    },
    syntax: {
      keyword: '#CF222E',
      type: '#953800',
      fn: '#8250DF',
      string: '#0A3069',
      number: '#0550AE',
      comment: '#6E7781',
      meta: '#0550AE',
      operator: '#24292F',
      variable: '#1F2328',
      gutterBg: '#FFFFFF',
      gutterText: '#94A3B8',
      gutterBorder: '#E5E7EB',
      activeLine: 'rgba(37, 99, 235, 0.05)',
      activeGutter: 'rgba(37, 99, 235, 0.06)',
      activeGutterText: '#334155',
      cursor: '#2563EB',
      selection: 'rgba(37, 99, 235, 0.18)',
      bracketBg: 'rgba(37, 99, 235, 0.16)',
      bracketOutline: 'rgba(37, 99, 235, 0.4)',
      searchMatch: 'rgba(245, 158, 11, 0.3)',
    },
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    description: 'Тёплая бумага для глаз',
    mode: 'light',
    swatches: ['#FDF6E3', '#268BD2', '#859900'],
    ui: {
      bgApp: '#FDF6E3',
      bgSurface: '#EEE8D5',
      bgElevated: '#FBF3DF',
      bgConsole: '#F8F1DD',
      bgInset: '#E5DEC9',
      bgHover: '#E7E0CC',
      border: '#DCD4BE',
      borderStrong: '#C9C0A8',
      textPrimary: '#073642',
      textSecondary: '#586E75',
      textMuted: '#657B83',
      accent: '#268BD2',
      accentHover: '#1E73B0',
      accentSoft: 'rgba(38, 139, 210, 0.15)',
      themeColorMeta: '#EEE8D5',
    },
    syntax: {
      keyword: '#859900',
      type: '#B58900',
      fn: '#268BD2',
      string: '#2AA198',
      number: '#D33682',
      comment: '#93A1A1',
      meta: '#CB4B16',
      operator: '#586E75',
      variable: '#073642',
      gutterBg: '#FDF6E3',
      gutterText: '#93A1A1',
      gutterBorder: '#E5DEC9',
      activeLine: 'rgba(238, 232, 213, 0.7)',
      activeGutter: 'rgba(238, 232, 213, 0.9)',
      activeGutterText: '#586E75',
      cursor: '#268BD2',
      selection: 'rgba(38, 139, 210, 0.2)',
      bracketBg: 'rgba(38, 139, 210, 0.18)',
      bracketOutline: 'rgba(38, 139, 210, 0.45)',
      searchMatch: 'rgba(181, 137, 0, 0.28)',
    },
  },
];

const THEME_MAP = new Map<ThemeId, AppTheme>(APP_THEMES.map((t) => [t.id, t]));

export function normalizeThemeId(raw: string | null | undefined): ThemeId {
  if (!raw) return 'github-dark';
  if (raw === 'dark') return 'github-dark';
  if (raw === 'light') return 'github-light';
  if (THEME_MAP.has(raw as ThemeId)) {
    return raw as ThemeId;
  }
  return 'github-dark';
}

export function getThemeById(id: ThemeId): AppTheme {
  return THEME_MAP.get(id) ?? APP_THEMES[0];
}

export function applyThemeToDocument(theme: AppTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', theme.mode === 'dark');
  root.setAttribute('data-theme', theme.id);

  const vars: Record<string, string> = {
    '--app-bg': theme.ui.bgApp,
    '--app-surface': theme.ui.bgSurface,
    '--app-elevated': theme.ui.bgElevated,
    '--app-console': theme.ui.bgConsole,
    '--app-inset': theme.ui.bgInset,
    '--app-hover': theme.ui.bgHover,
    '--app-border': theme.ui.border,
    '--app-border-strong': theme.ui.borderStrong,
    '--app-text': theme.ui.textPrimary,
    '--app-text-secondary': theme.ui.textSecondary,
    '--app-text-muted': theme.ui.textMuted,
    '--app-accent': theme.ui.accent,
    '--app-accent-hover': theme.ui.accentHover,
    '--app-accent-soft': theme.ui.accentSoft,
  };

  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }

  const metaTheme = document.getElementById('theme-color-meta');
  if (metaTheme) {
    metaTheme.setAttribute('content', theme.ui.themeColorMeta);
  }
}
