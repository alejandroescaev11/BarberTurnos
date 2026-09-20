// ==============================================================================
// WEB PUSH & EMAIL NOTIFICATIONS CLIENT HELPER
// BarberTurnos PWA
// ==============================================================================

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  return Notification.permission;
}

export function detectDeviceName(): string {
  if (typeof navigator === 'undefined') return 'Dispositivo Web';
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'Celular Android';
  if (/iPhone/i.test(ua)) return 'iPhone (Apple)';
  if (/iPad/i.test(ua)) return 'iPad (Apple)';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'PC Windows';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Navegador Web';
}

/**
 * Gets the current active push subscription if one exists on this browser
 */
export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch (err) {
    console.warn('[Push] Error al obtener suscripción activa:', err);
    return null;
  }
}

/**
 * Subscribes current browser device to Web Push notifications for the barber
 */
export async function subscribeToPush(
  barberId?: string,
  token?: string
): Promise<{ success: boolean; subscription?: any; error?: string }> {
  if (!isPushSupported()) {
    return {
      success: false,
      error: 'Tu navegador o dispositivo no es compatible con Notificaciones Push nativas.'
    };
  }

  try {
    // 1. Request permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return {
        success: false,
        error: permission === 'denied'
          ? 'Has bloqueado las notificaciones. Por favor activa los permisos en el candado de la barra del navegador.'
          : 'No se otorgó permiso para recibir notificaciones.'
      };
    }

    // 2. Fetch server public VAPID key
    const resKey = await fetch('/api/push/public-key');
    if (!resKey.ok) {
      throw new Error('No se pudo obtener la clave pública del servidor de notificaciones.');
    }
    const { publicKey } = await resKey.json();
    if (!publicKey) {
      throw new Error('Clave pública VAPID no configurada en el servidor.');
    }

    // 3. Register / wait for service worker
    const reg = await navigator.serviceWorker.ready;
    let subscription = await reg.pushManager.getSubscription();

    // If subscription doesn't exist, create it with applicationServerKey
    if (!subscription) {
      const convertedVapidKey = urlBase64ToUint8Array(publicKey);
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey
      });
    }

    // 4. Send subscription to backend
    const deviceName = detectDeviceName();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const saveRes = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        subscription: subscription.toJSON ? subscription.toJSON() : subscription,
        deviceName,
        barberId
      })
    });

    const data = await saveRes.json();
    if (!saveRes.ok) {
      throw new Error(data.error || 'Error al registrar dispositivo en el servidor.');
    }

    return {
      success: true,
      subscription
    };
  } catch (err: any) {
    console.error('[Push] Error suscribiendo a notificaciones:', err);
    return {
      success: false,
      error: err.message || 'Error inesperado al activar notificaciones.'
    };
  }
}

/**
 * Unsubscribes current browser device from Web Push
 */
export async function unsubscribeFromPush(token?: string): Promise<{ success: boolean; error?: string }> {
  if (!isPushSupported()) return { success: true };
  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();

    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers,
        body: JSON.stringify({ endpoint })
      });
    }

    return { success: true };
  } catch (err: any) {
    console.error('[Push] Error al desuscribir dispositivo:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Trigger a live push notification test to verify device reception
 */
export async function sendTestPush(token?: string): Promise<{ success: boolean; message: string; [key: string]: any }> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/push/test', {
      method: 'POST',
      headers
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Error enviando prueba de notificación');
    }
    return data;
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Error al enviar notificación de prueba'
    };
  }
}

/**
 * Get centralized email service status
 */
export async function getEmailStatus(): Promise<{
  mode: 'smtp' | 'simulation';
  autoSendEmail: boolean;
  configured: boolean;
  from: string;
  host: string;
  user: string;
  recentLogsCount: number;
}> {
  const res = await fetch('/api/email/status');
  if (!res.ok) throw new Error('Error al consultar estado de correos');
  return res.json();
}

/**
 * Send a test confirmation email from centralized application account
 */
export async function sendTestEmail(email?: string, token?: string): Promise<{ success: boolean; result: any; error?: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch('/api/email/test', {
    method: 'POST',
    headers,
    body: JSON.stringify({ email })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error al enviar correo de prueba');
  return data;
}
