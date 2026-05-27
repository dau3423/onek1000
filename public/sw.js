// 1000냥 주유소 - Service Worker (웹 푸시 수신)
self.addEventListener('push', (event) => {
  const data = (() => {
    try { return event.data ? event.data.json() : {}; }
    catch { return { title: '1000냥', body: event.data ? event.data.text() : '' }; }
  })();
  const title = data.title || '1000냥 주유소';
  const options = {
    body: data.body || '',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: data.tag || 'price-drop',
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window' });
    const exist = all.find((c) => c.url.endsWith(url));
    if (exist) return exist.focus();
    return clients.openWindow(url);
  })());
});
