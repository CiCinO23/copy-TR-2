// Copy TR — Background Execution & Lock Screen Notification Service Worker
let keepAliveEnabled = true;
let lockScreenEnabled = true;
let keepAliveTimer = null;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function startBackgroundHeartbeat() {
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  if (!keepAliveEnabled) return;
  keepAliveTimer = setInterval(async () => {
    try {
      const clientsList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of clientsList) {
        client.postMessage({
          type: 'SW_BACKGROUND_HEARTBEAT',
          timestamp: Date.now(),
        });
      }
    } catch {
      // ignore
    }
  }, 4000);
}

function stopBackgroundHeartbeat() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'CONFIGURE_BACKGROUND_MODE') {
    keepAliveEnabled = Boolean(data.keepAlive);
    lockScreenEnabled = Boolean(data.lockScreenNotificationsEnabled);
    if (keepAliveEnabled) {
      startBackgroundHeartbeat();
    } else {
      stopBackgroundHeartbeat();
    }
  } else if (data.type === 'STOP_ALL_BACKGROUND') {
    keepAliveEnabled = false;
    stopBackgroundHeartbeat();
  } else if (data.type === 'DISPATCH_LOCKSCREEN_NOTIFICATION') {
    const payload = data.payload || {};
    const title = payload.title || 'تنبيه Copy TR';
    const options = {
      body: payload.body || '',
      icon: payload.icon || '/assets/aistudio/icone_c1401ade.png',
      badge: payload.badge || '/assets/aistudio/icone_c1401ade.png',
      dir: 'rtl',
      lang: 'ar',
      tag: payload.tag || 'copytr_notif_' + Date.now(),
      renotify: true,
      requireInteraction: Boolean(payload.requireInteraction ?? lockScreenEnabled),
      silent: false,
      vibrate: payload.vibrate || [220, 80, 220, 80, 300],
      data: {
        url: payload.url || '/',
        accountId: payload.accountId || null,
      },
    };
    event.waitUntil(self.registration.showNotification(title, options));
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.postMessage({
              type: 'NOTIFICATION_CLICKED_FROM_LOCKSCREEN',
              data: event.notification.data || {},
            });
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow('/');
        }
      })
  );
});
