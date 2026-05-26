import { Capacitor } from '@capacitor/core';

async function clearExistingServiceWorkers() {
  if (!('serviceWorker' in navigator)) {
    return;
  }
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  } catch (error) {
    console.warn('[SW] Failed to clear existing registrations:', error);
  }
}

export function registerServiceWorker() {
  const isNative = (() => {
    try {
      return Capacitor.isNativePlatform();
    } catch {
      return false;
    }
  })();

  if (!('serviceWorker' in navigator) || import.meta.env.DEV || isNative) {
    if (isNative) {
      clearExistingServiceWorkers();
    }
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.warn('[SW] Registration failed:', error);
    });
  });
}
