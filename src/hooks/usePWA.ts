import { useCallback, useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { detectIOSPlatform, detectStandaloneMode, resolveInstallAction } from '../utils/pwa';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const standaloneMedia = window.matchMedia('(display-mode: standalone)');
    const updateStandalone = () => {
      const navStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone;
      setIsInstalled(detectStandaloneMode(standaloneMedia.matches, navStandalone));
    };

    updateStandalone();
    setIsIOS(
      detectIOSPlatform(
        window.navigator.userAgent,
        window.navigator.platform,
        window.navigator.maxTouchPoints
      )
    );

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    standaloneMedia.addEventListener?.('change', updateStandalone);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      standaloneMedia.removeEventListener?.('change', updateStandalone);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  }, [deferredPrompt]);

  const actionMode = resolveInstallAction({
    isInstalled,
    hasDeferredPrompt: Boolean(deferredPrompt),
    isIOS,
  });

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    actionMode,
    install,
  };
}

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export function useServiceWorkerStatus() {
  const [offlineReady, setOfflineReady] = useState<boolean>(() =>
    typeof navigator !== 'undefined' && Boolean(navigator.serviceWorker?.controller)
  );
  const [justCachedOffline, setJustCachedOffline] = useState(false);
  const [needRefresh, setNeedRefresh] = useState(false);
  const updateSWRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    let toastTimer: ReturnType<typeof setTimeout> | null = null;

    const updateSW = registerSW({
      immediate: true,
      onOfflineReady() {
        setOfflineReady(true);
        setJustCachedOffline(true);
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => setJustCachedOffline(false), 4500);
      },
      onNeedRefresh() {
        setNeedRefresh(true);
      },
      onRegisteredSW(_swUrl, registration) {
        if (registration?.active) {
          setOfflineReady(true);
        }
      },
    });

    updateSWRef.current = updateSW;

    const handleControllerChange = () => {
      if (navigator.serviceWorker.controller) {
        setOfflineReady(true);
      }
    };
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    return () => {
      if (toastTimer) clearTimeout(toastTimer);
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    void updateSWRef.current?.(true);
  }, []);

  const dismissOfflineToast = useCallback(() => {
    setJustCachedOffline(false);
  }, []);

  return {
    offlineReady,
    justCachedOffline,
    needRefresh,
    applyUpdate,
    dismissOfflineToast,
  };
}
