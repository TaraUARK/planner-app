import { useRegisterSW } from 'virtual:pwa-register/react';

const HOUR = 60 * 60 * 1000;

/**
 * The installed app keeps a copy of itself on the device. This checks for a
 * newer version (on open, when the app comes back to the screen, and hourly)
 * and offers a Reload button. It never reloads on its own, so nothing being
 * typed is lost.
 */
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => {
        if (navigator.onLine) void registration.update();
      };
      setInterval(check, HOUR);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });

  if (!needRefresh) return null;
  return (
    <div className="banner" role="status">
      <span className="grow">A new version is available.</span>
      <button className="plain" onClick={() => setNeedRefresh(false)}>
        Later
      </button>
      <button className="primary" onClick={() => void updateServiceWorker(true)}>
        Reload
      </button>
    </div>
  );
}
