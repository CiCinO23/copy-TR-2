// Copy TR v2.11 — Background Execution, Autonomous Lock-Screen Polling & Notification Service Worker
let keepAliveEnabled = true;
let lockScreenEnabled = true;
let showSensitiveDetails = true;
let keepAliveTimer = null;
let lastClientAckTimestamp = Date.now();
let copiedTradersState = [];
let swKnownPositionKeys = new Set();
let isSwPollingInFlight = false;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      startBackgroundHeartbeat();
    })()
  );
});

async function fetchWithSwTimeout(url, options = {}, timeoutMs = 5500) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(id);
  }
}

async function pollCopiedTradersFromServiceWorkerIfClientSuspended() {
  if (!keepAliveEnabled || !lockScreenEnabled || isSwPollingInFlight) return;
  if (!Array.isArray(copiedTradersState) || copiedTradersState.length === 0) return;

  // Only poll from SW if main window client hasn't acknowledged a heartbeat in the last 6.5 seconds
  const sinceLastAck = Date.now() - lastClientAckTimestamp;
  if (sinceLastAck < 6500) return;

  isSwPollingInFlight = true;
  try {
    for (const ct of copiedTradersState) {
      if (!ct || !ct.traderId || ct.source !== 'COPY_TRADING') continue;
      const res = await fetchWithSwTimeout(
        `/bapi/futures/v1/friendly/future/copy-trade/lead-data/positions?portfolioId=${encodeURIComponent(
          ct.traderId
        )}`
      ).catch(() => null);

      if (!res || !res.ok) continue;
      const json = await res.json().catch(() => null);
      if (!json || !Array.isArray(json.data)) continue;

      const activePositions = json.data.filter(
        (p) => Math.abs(parseFloat(p.positionAmount || '0')) > 0
      );

      for (const p of activePositions) {
        const symbol = String(p.symbol || 'BTCUSDT').toUpperCase();
        const side =
          p.positionSide === 'SHORT' || parseFloat(p.positionAmount || '0') < 0
            ? 'SHORT'
            : 'LONG';
        const key = `${ct.traderId}_${symbol}_${side}`;

        if (!swKnownPositionKeys.has(key)) {
          swKnownPositionKeys.add(key);
          const entryPrice = parseFloat(p.entryPrice || '0');
          const lev = Number(p.leverage || 10);
          const sideAr = side === 'LONG' ? 'شراء Long 🟢' : 'بيع Short 🔴';
          const title = `🟢 فتح صفقة جديدة — ${symbol}`;
          const body = showSensitiveDetails
            ? `العملة: ${symbol} | ${sideAr} (${lev}x)\nالمتداول المصدر: ${ct.nickname || 'متداول'}\nسعر الدخول: ${entryPrice}$`
            : `العملة: ${symbol} | ${sideAr} (${lev}x)\nالمتداول المصدر: ${ct.nickname || 'متداول'}\n🔒 افتح التطبيق للاطلاع على التفاصيل الكاملة`;

          await self.registration.showNotification(title, {
            body,
            icon: '/assets/aistudio/icone_c1401ade.png',
            badge: '/assets/aistudio/icone_c1401ade.png',
            dir: 'rtl',
            lang: 'ar',
            tag: `sw_open_${key}_${Date.now()}`,
            renotify: true,
            requireInteraction: true,
            silent: false,
            timestamp: Date.now(),
            vibrate: [250, 80, 250, 80, 320],
            data: {
              url: '/',
              accountId: ct.accountId || 'acc_default',
            },
          });

          const clientsList = await self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true,
          });
          for (const client of clientsList) {
            client.postMessage({
              type: 'SW_DETECTED_TRADE_UPDATE',
              traderId: ct.traderId,
              symbol,
              side,
              timestamp: Date.now(),
            });
          }
        }
      }
    }
  } catch {
    // ignore
  } finally {
    isSwPollingInFlight = false;
  }
}

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
      await pollCopiedTradersFromServiceWorkerIfClientSuspended();
    } catch {
      // ignore
    }
  }, 3500);
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

  if (data.type === 'SW_HEARTBEAT_ACK') {
    lastClientAckTimestamp = Date.now();
  } else if (data.type === 'CONFIGURE_BACKGROUND_MODE') {
    keepAliveEnabled = Boolean(data.keepAlive);
    lockScreenEnabled = Boolean(data.lockScreenNotificationsEnabled ?? true);
    showSensitiveDetails = Boolean(data.showSensitiveDetails ?? true);
    lastClientAckTimestamp = Date.now();
    if (keepAliveEnabled) {
      startBackgroundHeartbeat();
    } else {
      stopBackgroundHeartbeat();
    }
  } else if (data.type === 'SYNC_COPIED_TRADERS_STATE') {
    lastClientAckTimestamp = Date.now();
    if (Array.isArray(data.copiedTraders)) {
      copiedTradersState = data.copiedTraders;
    }
    if (Array.isArray(data.knownPositionKeys)) {
      for (const k of data.knownPositionKeys) {
        swKnownPositionKeys.add(String(k));
      }
    }
    if (keepAliveEnabled && !keepAliveTimer) {
      startBackgroundHeartbeat();
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
      silent: Boolean(payload.silent ?? false),
      timestamp: Number(payload.timestamp || Date.now()),
      vibrate: payload.vibrate || [250, 80, 250, 80, 320],
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
