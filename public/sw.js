/* Service worker: toont pushberichten en opent de juiste pagina bij een tik. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Koffie-alarm', body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Koffie-alarm', {
      body: data.body || '',
      icon: data.icon || '/icon.svg',
      badge: '/icon.svg',
      tag: data.tag,
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(self.clients.openWindow(url));
});
