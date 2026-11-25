export type InstallActionMode = 'hidden' | 'native-prompt' | 'ios-guide' | 'manual-guide';

export interface InstallDetectionInput {
  isInstalled: boolean;
  hasDeferredPrompt: boolean;
  isIOS: boolean;
}

export function detectStandaloneMode(
  matchMediaStandalone: boolean,
  navigatorStandalone?: boolean
): boolean {
  return Boolean(matchMediaStandalone || navigatorStandalone === true);
}

/**
 * Detects iPhone, iPod, iPad, including modern iPadOS 13+ Safari which reports
 * a macOS desktop userAgent ("Macintosh") alongside multi-touch points.
 */
export function detectIOSPlatform(
  userAgent: string,
  platform = '',
  maxTouchPoints = 0
): boolean {
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) {
    return true;
  }
  const looksLikeMac = platform === 'MacIntel' || ua.includes('macintosh');
  return looksLikeMac && maxTouchPoints > 1;
}

export function resolveInstallAction(input: InstallDetectionInput): InstallActionMode {
  if (input.isInstalled) {
    return 'hidden';
  }
  if (input.hasDeferredPrompt) {
    return 'native-prompt';
  }
  if (input.isIOS) {
    return 'ios-guide';
  }
  return 'manual-guide';
}

export function getThemeColorHex(theme: 'dark' | 'light'): string {
  return theme === 'dark' ? '#0D1117' : '#F3F5F8';
}
