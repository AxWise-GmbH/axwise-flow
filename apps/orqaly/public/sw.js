// Orqaly service worker — minimal Web Push handler.
// Registered from src/main.jsx on app load. Receives the push payload from
// lib/notifications/dispatch.js (sendWebPush) and surfaces a native
// notification. Clicking the notification opens the app at the relevant
// goal when a goalId is present in the payload.

self.addEventListener('install', (event) => {
  // Activate immediately on first install so push notifications start
  // working without requiring a refresh.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = { title: 'Orqaly', body: 'You have a new update', payload: {} };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // payload wasn't JSON — fall back to text
    if (event.data) data.body = event.data.text();
  }
  const opts = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: data.payload || {},
    requireInteraction: data.priority === 'high',
  };
  event.waitUntil(self.registration.showNotification(data.title || 'Orqaly', opts));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const payload = event.notification.data || {};
  const goalId = payload.continuation_goal_id || payload.goalId || payload.parent_goal_id;
  const url = goalId ? `/goals?openGoal=${encodeURIComponent(goalId)}` : '/goals';
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      if (client.url.includes('/goals')) {
        await client.focus();
        try { client.postMessage({ type: 'open-goal', goalId }); } catch { /* ignore */ }
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
