import { Booking } from '../types';

/**
 * Generates a Google Calendar web link for one-click add to Google Calendar.
 */
export function getGoogleCalendarUrl(booking: Booking, shopName: string, address: string): string {
  // Date format: YYYYMMDDTHHmmSSZ or local YYYYMMDDTHHmmSS
  const startClean = booking.date.replace(/-/g, '');
  const startHourClean = booking.startTime.replace(':', '') + '00';
  const endHourClean = booking.endTime.replace(':', '') + '00';
  
  const dates = `${startClean}T${startHourClean}/${startClean}T${endHourClean}`;
  const title = encodeURIComponent(`Cita en ${shopName} - ${booking.serviceNames.join(', ')}`);
  const details = encodeURIComponent(
    `Cita confirmada en ${shopName}\n` +
    `Código de reserva: ${booking.id}\n` +
    `Servicios: ${booking.serviceNames.join(', ')}\n` +
    `Duración: ${booking.totalDurationMinutes} min\n` +
    `Total a pagar en sitio: $${booking.totalPrice.toLocaleString()}\n` +
    `Cliente: ${booking.clientName} (${booking.clientPhone})\n` +
    (booking.clientNotes ? `Notas: ${booking.clientNotes}\n` : '') +
    `\nPor favor llega 5 minutos antes. En caso de retraso o cancelación, contáctanos.`
  );
  const location = encodeURIComponent(address);

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}&location=${location}`;
}

/**
 * Generates an .ics iCalendar file content to download for Apple Calendar, Outlook, etc.
 */
export function generateIcsFile(booking: Booking, shopName: string, address: string): string {
  const startClean = booking.date.replace(/-/g, '');
  const startHourClean = booking.startTime.replace(':', '') + '00';
  const endHourClean = booking.endTime.replace(':', '') + '00';

  const summary = `Cita en ${shopName} - ${booking.serviceNames.join(', ')}`;
  const description = `Código de reserva: ${booking.id}\\nServicios: ${booking.serviceNames.join(', ')}\\nTotal a pagar en sitio: $${booking.totalPrice.toLocaleString()}\\nDuración: ${booking.totalDurationMinutes} min`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BarberTurnos//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:booking-${booking.id}@barberia`,
    `DTSTAMP:${startClean}T000000Z`,
    `DTSTART:${startClean}T${startHourClean}`,
    `DTEND:${startClean}T${endHourClean}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${address}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}

export function downloadIcsFile(booking: Booking, shopName: string, address: string) {
  const icsContent = generateIcsFile(booking, shopName, address);
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `Cita_${shopName}_${booking.id}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
