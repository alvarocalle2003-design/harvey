// Service worker de Harvey: solo muestra los avisos push y abre la app al tocarlos (no guarda nada en caché).
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data?.json() ?? {}; } catch { d = { body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Harvey', { body: d.body || '', icon: 'icono.png', badge: 'icono.png', tag: d.tag, data: { url: d.url || '/' } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    const w = ws[0];
    if (!w) return self.clients.openWindow(url);
    return w.focus().then(() => (url !== '/' ? w.navigate(url) : w));
  }));
});
