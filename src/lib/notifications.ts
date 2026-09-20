// Notification system for barber when new bookings arrive

let audioContext: AudioContext | null = null;

export function playBookingChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    
    if (!audioContext || audioContext.state === 'suspended') {
      audioContext = new AudioCtx();
    }

    const ctx = audioContext;
    const now = ctx.currentTime;

    // Pleasant barber bell chime (2 harmonic tones)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(880, now + 0.1); // A5
    osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.3); // D6

    gainNode.gain.setValueAtTime(0.01, now);
    gainNode.gain.linearRampToValueAtTime(0.3, now + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now + 0.1);
    osc1.stop(now + 1.2);
    osc2.stop(now + 1.2);
  } catch (err) {
    console.warn('Audio chime could not play:', err);
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.warn('Error requesting notification permission:', err);
    return 'denied';
  }
}

export function notifyNewBooking(details: {
  clientName: string;
  date: string;
  time: string;
  phone?: string;
}) {
  // 1. Play audio chime
  playBookingChime();

  // 2. Visual tab indicator
  const originalTitle = document.title;
  let flashCount = 0;
  const interval = setInterval(() => {
    document.title = flashCount % 2 === 0 ? '🔔 ¡NUEVA CITA RESERVADA!' : `(${details.time}) ${details.clientName}`;
    flashCount++;
    if (flashCount > 10) {
      clearInterval(interval);
      document.title = originalTitle;
    }
  }, 1000);

  // 3. System Push / Native Notification
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const notif = new Notification('¡Nueva Cita Reservada!', {
        body: `${details.clientName} agendó para ${details.date} a las ${details.time} hs.`,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: `booking-${details.date}-${details.time}-${Date.now()}`,
        requireInteraction: true
      });

      notif.onclick = () => {
        window.focus();
        notif.close();
      };
    } catch (e) {
      console.warn('Native notification failed:', e);
    }
  }
}
