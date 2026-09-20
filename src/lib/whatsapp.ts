import { Booking, BarberShopConfig, BarberProfile } from '../types';

/**
 * Creates the initial invite WhatsApp message that the barber can send to the customer
 * when the customer contacts them asking for an appointment.
 * Generates the dedicated link for that specific barber.
 */
export function generateBarberInviteWhatsApp(
  barber: BarberProfile, 
  shopName = 'la Barbería', 
  clientPhone?: string
): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://tubarberia.com';
  const bookingUrl = `${origin}/?barber=${encodeURIComponent(barber.slug || barber.id)}`;
  
  const text = encodeURIComponent(
    `¡Hola! 💈 Gracias por escribir a *${barber.name}* (${shopName}).\n\n` +
    `Para que elijas con comodidad tus servicios y veas mis horarios libres disponibles en tiempo real, ingresa a este enlace directo:\n` +
    `👉 ${bookingUrl}\n\n` +
    `Solo te tomará 1 minuto y recibirás la confirmación automática a tu correo. ¡Te espero!`
  );

  const cleanPhone = clientPhone ? clientPhone.replace(/\D/g, '') : '';
  if (cleanPhone) {
    return `https://wa.me/${cleanPhone}?text=${text}`;
  }
  return `https://api.whatsapp.com/send?text=${text}`;
}

/**
 * Creates a message for the customer to confirm their booking back to the barber on WhatsApp.
 * Directs the message specifically to the assigned barber's WhatsApp phone number.
 */
export function generateClientConfirmationWhatsApp(
  booking: Booking, 
  barber?: BarberProfile | null,
  config?: BarberShopConfig
): string {
  const barberName = barber?.name || booking.barberName || 'mi barbero';
  const shopName = config?.shopName || 'la Barbería';
  
  const text = encodeURIComponent(
    `¡Hola ${barberName}! 💈 Acabo de agendar mi turno en ${shopName}:\n\n` +
    `🎟️ *Cita:* #${booking.id}\n` +
    `📅 *Fecha:* ${booking.date}\n` +
    `⏰ *Hora:* ${booking.startTime} hrs\n` +
    `✂️ *Servicios:* ${booking.serviceNames.join(', ')}\n` +
    `💵 *Total (pago en sitio):* $${booking.totalPrice.toLocaleString()}\n` +
    `👤 *Cliente:* ${booking.clientName}\n\n` +
    `¡Nos vemos a esa hora!`
  );

  // Direct specifically to the barber's own phone number, fallback to shop phone
  const rawPhone = barber?.phone || config?.phoneWhatsapp || '';
  const cleanBarberPhone = rawPhone.replace(/\D/g, '');
  if (cleanBarberPhone) {
    return `https://wa.me/${cleanBarberPhone}?text=${text}`;
  }
  return `https://api.whatsapp.com/send?text=${text}`;
}

/**
 * Generates a reminder WhatsApp message for the barber to send to the client 24h before
 */
export function generateReminderWhatsApp(booking: Booking, config: BarberShopConfig, barber?: BarberProfile | null): string {
  const barberName = barber?.name || booking.barberName || config.shopName;
  const text = encodeURIComponent(
    `¡Hola ${booking.clientName}! 💈 Recordatorio de tu cita con *${barberName}* en *${config.shopName}*:\n\n` +
    `📅 Fecha: *${booking.date}*\n` +
    `⏰ Hora: *${booking.startTime} hrs*\n` +
    `✂️ Servicios: ${booking.serviceNames.join(', ')}\n` +
    `📍 Dirección: ${config.address}\n\n` +
    `Por favor confirma respondiendo a este mensaje. ¡Te esperamos puntual!`
  );

  const cleanClientPhone = booking.clientPhone.replace(/\D/g, '');
  if (cleanClientPhone) {
    return `https://wa.me/${cleanClientPhone}?text=${text}`;
  }
  return `https://api.whatsapp.com/send?text=${text}`;
}

/**
 * Generates an announcement for filling a dead time slot ("Hueco libre")
 */
export function generateDeadSlotWhatsApp(
  date: string, 
  time: string, 
  duration: number, 
  config: BarberShopConfig,
  barber?: BarberProfile | null
): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const barberSlug = barber?.slug || barber?.id || '';
  const bookingUrl = barberSlug ? `${origin}/?barber=${encodeURIComponent(barberSlug)}` : origin;
  const barberName = barber ? ` con *${barber.name}*` : '';

  const text = encodeURIComponent(
    `💈 ¡Cupo libre de última hora${barberName} en *${config.shopName}*!\n\n` +
    `📅 Fecha: ${date}\n` +
    `⏰ Hora disponible: ${time} (${duration} min)\n\n` +
    `Resérvalo antes de que se ocupe aquí:\n👉 ${bookingUrl}\n\n¡Aprovecha el espacio disponible!`
  );
  return `https://api.whatsapp.com/send?text=${text}`;
}
