// Copy TR v2.25 — Autonomous Background & Sleep-Resilient Trade Polling (Copy Trading + Smart Money)
let keepAliveEnabled = true;
let lockScreenEnabled = true;
let showSensitiveDetails = true;
let keepAliveTimer = null;
let lastClientAckTimestamp = Date.now();
let clientVisibilityState = 'visible';
let copiedTradersState = [];
let swKnownPositionKeys = new Set();
let isSwPollingInFlight = false;
let swHasPendingDeltaForClient = false;

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

function appendSwCacheBuster(url) {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}_t=${Date.now()}`;
}

async function fetchWithSwTimeout(url, options = {}, timeoutMs = 5500) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  const method = (options.method || 'GET').toUpperCase();
  const finalUrl = method === 'GET' ? appendSwCacheBuster(url) : url;
  try {
    return await fetch(finalUrl, {
      ...options,
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store',
        Pragma: 'no-cache',
        ...(options.headers || {}),
      },
    });
  } finally {
    clearTimeout(id);
  }
}

/**
 * Fetches active positions for either COPY_TRADING or SMART_MONEY traders
 * with cache-busting and cross-checks recent position-history so already-closed trades
 * never trigger false lock-screen alerts.
 */
async function fetchActivePositionsWithClosureCheck(ct) {
  if (!ct || !ct.traderId) return null;

  let portfolioId = ct.traderId;
  if (ct.source === 'SMART_MONEY') {
    try {
      const profRes = await fetchWithSwTimeout(
        `/bapi/futures/v1/friendly/future/smart-money/profile?topTraderId=${encodeURIComponent(ct.traderId)}`
      ).catch(() => null);
      if (profRes && profRes.ok) {
        const profJson = await profRes.json().catch(() => null);
        const leadId =
          profJson?.data?.leadPortfolioId ||
          profJson?.data?.futuresCopyTradePortfolioId ||
          null;
        if (leadId) {
          portfolioId = String(leadId);
        } else {
          const smPosRes = await fetchWithSwTimeout(
            `/bapi/futures/v1/friendly/future/smart-money/position?topTraderId=${encodeURIComponent(ct.traderId)}`
          ).catch(() => null);
          if (smPosRes && smPosRes.ok) {
            const smJson = await smPosRes.json().catch(() => null);
            const list = Array.isArray(smJson?.data?.rows || smJson?.data)
              ? smJson?.data?.rows || smJson?.data
              : null;
            if (!list) return null;
            return list.filter((p) => Math.abs(parseFloat(p.positionAmount || p.positionAmt || p.amount || '0')) > 0);
          }
          return null;
        }
      } else {
        return null;
      }
    } catch {
      return null;
    }
  }

  const [posRes, histRes] = await Promise.all([
    fetchWithSwTimeout(
      `/bapi/futures/v1/friendly/future/copy-trade/lead-data/positions?portfolioId=${encodeURIComponent(portfolioId)}`
    ).catch(() => null),
    fetchWithSwTimeout(
      `/bapi/futures/v1/friendly/future/copy-trade/lead-portfolio/position-history`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolioId, pageNumber: 1, pageSize: 10 }),
      }
    ).catch(() => null),
  ]);

  if (!posRes || !posRes.ok) return null;
  const posJson = await posRes.json().catch(() => null);
  if (!posJson || !Array.isArray(posJson.data)) return null;

  // Build recently-closed map (symbol_side -> latest closed timestamp) to guard against stale cached positions
  const recentClosedMap = new Map();
  if (histRes && histRes.ok) {
    const histJson = await histRes.json().catch(() => null);
    const histList = Array.isArray(histJson?.data?.list) ? histJson.data.list : [];
    for (const h of histList) {
      const sym = String(h.symbol || '').toUpperCase();
      const side = String(h.side || h.positionSide || '').toUpperCase().includes('SHORT') ? 'SHORT' : 'LONG';
      const closedTs = Number(h.closed || h.updateTime || 0);
      const k = `${sym}_${side}`;
      if (closedTs > (recentClosedMap.get(k) || 0)) {
        recentClosedMap.set(k, closedTs);
      }
    }
  }

  return posJson.data.filter((p) => {
    const amt = Math.abs(parseFloat(p.positionAmount || '0'));
    if (amt <= 0) return false;
    const sym = String(p.symbol || '').toUpperCase();
    const side =
      p.positionSide === 'SHORT' || parseFloat(p.positionAmount || '0') < 0 ? 'SHORT' : 'LONG';
    const updateTs = Number(p.updateTime || p.entryTime || 0);
    const closedTs = recentClosedMap.get(`${sym}_${side}`) || 0;
    if (closedTs > 0 && updateTs > 0 && closedTs >= updateTs) {
      return false;
    }
    return true;
  });
}

async function notifyClientsOfTradeUpdate(payload) {
  const clientsList = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });
  for (const client of clientsList) {
    client.postMessage({
      type: 'SW_DETECTED_TRADE_UPDATE',
      ...payload,
      timestamp: Date.now(),
    });
  }
}

async function pollCopiedTradersFromServiceWorkerIfClientSuspended(forceFromOsWake = false) {
  if (!keepAliveEnabled || isSwPollingInFlight) return;
  if (!Array.isArray(copiedTradersState) || copiedTradersState.length === 0) return;

  // When the app is hidden/backgrounded, step in faster (3.5s) if client timers are throttled by mobile OS.
  // When visible, wait 6.5s so main thread handles normal foreground polling.
  const takeoverMs = clientVisibilityState === 'hidden' ? 3500 : 6500;
  const sinceLastAck = Date.now() - lastClientAckTimestamp;
  if (!forceFromOsWake && sinceLastAck < takeoverMs) return;

  isSwPollingInFlight = true;
  try {
    await Promise.allSettled(
      copiedTradersState.map(async (ct) => {
        if (!ct || !ct.traderId) return;
        const activePositions = await fetchActivePositionsWithClosureCheck(ct);
        if (!Array.isArray(activePositions)) return;

        const currentTraderKeys = new Set();

        for (const p of activePositions) {
          const symbol = String(p.symbol || 'BTCUSDT').toUpperCase();
          const side =
            p.positionSide === 'SHORT' || parseFloat(p.positionAmount || p.positionAmt || p.amount || '0') < 0
              ? 'SHORT'
              : 'LONG';
          const key = `${ct.traderId}_${symbol}_${side}`;
          currentTraderKeys.add(key);

          if (!swKnownPositionKeys.has(key)) {
            swKnownPositionKeys.add(key);
            swHasPendingDeltaForClient = true;

            if (lockScreenEnabled) {
              const entryPrice = parseFloat(p.entryPrice || '0');
              const lev = Number(p.leverage || 10);
              const sideAr = side === 'LONG' ? 'شراء Long 🟢' : 'بيع Short 🔴';
              const sourceBadge = ct.source === 'SMART_MONEY' ? 'حوت (Smart Money)' : 'متداول منسوخ';
              const title = `🟢 فتح صفقة جديدة — ${symbol}`;
              const body = showSensitiveDetails
                ? `العملة: ${symbol} | ${sideAr} (${lev}x)\n${sourceBadge}: ${ct.nickname || 'متداول'}\nسعر الدخول: ${entryPrice}$`
                : `العملة: ${symbol} | ${sideAr} (${lev}x)\n${sourceBadge}: ${ct.nickname || 'متداول'}\n🔒 افتح التطبيق للاطلاع على التفاصيل الكاملة`;

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
            }

            await notifyClientsOfTradeUpdate({
              action: 'OPEN',
              traderId: ct.traderId,
              source: ct.source,
              symbol,
              side,
            });
          }
        }

        // Detect closures while in sleep/background so keys are cleared and clients wake immediately
        const prefix = `${ct.traderId}_`;
        for (const knownKey of Array.from(swKnownPositionKeys)) {
          if (knownKey.startsWith(prefix) && !currentTraderKeys.has(knownKey)) {
            swKnownPositionKeys.delete(knownKey);
            swHasPendingDeltaForClient = true;
            const parts = knownKey.slice(prefix.length).split('_');
            const symbol = parts[0] || '';
            const side = parts[1] || 'LONG';
            await notifyClientsOfTradeUpdate({
              action: 'CLOSE',
              traderId: ct.traderId,
              source: ct.source,
              symbol,
              side,
            });
          }
        }
      })
    );
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
          type: swHasPendingDeltaForClient ? 'SW_FORCE_SYNC_NOW' : 'SW_BACKGROUND_HEARTBEAT',
          timestamp: Date.now(),
        });
      }
      await pollCopiedTradersFromServiceWorkerIfClientSuspended(false);
    } catch {
      // ignore
    }
  }, 3000);
}

function stopBackgroundHeartbeat() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

// OS-driven Periodic Background Sync & Background Sync hooks for deep mobile sleep/Doze recovery
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'copytr-bg-sync') {
    event.waitUntil(pollCopiedTradersFromServiceWorkerIfClientSuspended(true));
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'copytr-bg-sync') {
    event.waitUntil(pollCopiedTradersFromServiceWorkerIfClientSuspended(true));
  }
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'SW_HEARTBEAT_ACK') {
    lastClientAckTimestamp = Date.now();
    if (data.visibilityState === 'visible' || data.visibilityState === 'hidden') {
      clientVisibilityState = data.visibilityState;
    }
    if (swHasPendingDeltaForClient && event.source && 'postMessage' in event.source) {
      swHasPendingDeltaForClient = false;
      event.source.postMessage({ type: 'SW_FORCE_SYNC_NOW', timestamp: Date.now() });
    }
  } else if (data.type === 'CLIENT_VISIBILITY_CHANGED') {
    clientVisibilityState = data.visibilityState === 'hidden' ? 'hidden' : 'visible';
    if (clientVisibilityState === 'visible' && swHasPendingDeltaForClient) {
      swHasPendingDeltaForClient = false;
      if (event.source && 'postMessage' in event.source) {
        event.source.postMessage({ type: 'SW_FORCE_SYNC_NOW', timestamp: Date.now() });
      }
    }
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
    swHasPendingDeltaForClient = false;
    if (Array.isArray(data.copiedTraders)) {
      copiedTradersState = data.copiedTraders;
    }
    if (Array.isArray(data.knownPositionKeys)) {
      swKnownPositionKeys = new Set(data.knownPositionKeys.map((k) => String(k)));
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
