import { useEffect, useState } from 'react';

const imageRuntimeState = {
  driver: null,
  fallbackActive: false,
};

export function setServerImageState({ driver = null, fallbackActive = false } = {}) {
  const changed =
    imageRuntimeState.driver !== driver ||
    imageRuntimeState.fallbackActive !== Boolean(fallbackActive);
  imageRuntimeState.driver = driver;
  imageRuntimeState.fallbackActive = Boolean(fallbackActive);
  if (changed && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('zeedat-image-mode'));
  }
}

export function isOfflineAppEnvironment() {
  if (typeof window === 'undefined') return false;
  if (window.electronAPI?.isElectron) return true;
  if (!navigator.onLine) return true;
  if (imageRuntimeState.driver === 'sqlite') return true;
  if (imageRuntimeState.fallbackActive) return true;
  return false;
}

export function shouldShowProductImages() {
  return !isOfflineAppEnvironment();
}

export function useProductImagesEnabled() {
  const [enabled, setEnabled] = useState(shouldShowProductImages);

  useEffect(() => {
    const sync = () => setEnabled(shouldShowProductImages());
    sync();
    window.addEventListener('zeedat-image-mode', sync);
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('zeedat-image-mode', sync);
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  return enabled;
}
