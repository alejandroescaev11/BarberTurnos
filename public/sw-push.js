// ==============================================================================
// SERVICE WORKER: WEB PUSH NOTIFICATIONS & INTERACTION HANDLER
// BarberTurnos PWA
// ==============================================================================

self.addEventListener('push', function(event) {
  if (!event.data) {
    console.warn('[SW Push] Push recibido sin datos.');
    return;
  }

  try {
    let payload;
    try {
      payload = event.data.json();
    } catch {
      payload = { title: '💈 BarberTurnos', body: event.data.text() };
    }

    const title = payload.title || '💈 ¡Nueva Cita en BarberTurnos!';
    const options = {
      body: payload.body || 'Has recibido una nueva cita en tu agenda.',
      icon: payload.icon || '/pwa-192x192.png',
      badge: payload.badge || '/pwa-192x192.png',
      vibrate: [200, 100, 200, 100, 300], // Patrón vibración barbero
      tag: payload.tag || `booking-push-${Date.now()}`,
      data: payload.data || { url: '/?view=dashboard' },
      actions: [
        { action: 'open_dashboard', title: '📅 Ver Agenda' },
        { action: 'close', title: '✕ Cerrar' }
      ],
      requireInteraction: true
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error('[SW Push] Error procesando notificación push:', err);
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // Si ya hay una ventana abierta de BarberTurnos, enfocarla y navegar
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url && client.url.includes(self.location.origin) && 'focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      // Si no hay ventana abierta, abrir una nueva
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
