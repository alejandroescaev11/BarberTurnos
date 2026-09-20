export type ServiceId = 'corte_clasico' | 'corte_barba' | 'diseno_detallado' | 'barba_express' | 'tratamiento_capilar' | string;

export interface Service {
  id: ServiceId;
  barberId?: string;
  name: string;
  description: string;
  durationMinutes: number;
  price: number;
  popular?: boolean;
  category?: 'corte' | 'barba' | 'combo' | 'extra';
  active: boolean;
}

export interface DaySchedule {
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  dayName: string;
  isOpen: boolean;
  openTime: string; // "09:00"
  closeTime: string; // "20:00"
  lunchBreak?: {
    start: string; // "13:00"
    end: string; // "14:00"
  };
}

export type BarberStatus = 'pendiente' | 'aprobado' | 'pausado' | 'rechazado';

export interface BarberProfile {
  id: string; // e.g. "alejandro" or "carlos"
  slug: string; // url-friendly slug for unique booking link: e.g. "alejandro"
  name: string; // "Alejandro Barber"
  shopName?: string; // "Alejo Barber Studio" (barber's individual business name)
  role?: string; // "Barbero Master" | "Especialista en Fade & Barba"
  avatar?: string;
  photoUrl?: string;
  phone?: string;
  email?: string;
  password?: string; // Personal account password or PIN
  active: boolean;
  status?: BarberStatus; // 'pendiente' | 'aprobado' | 'rechazado'
  isAdmin?: boolean; // Superuser authority to approve other barbers
  createdAt?: string;
}

export interface BarberAuthResponse {
  success: boolean;
  token?: string;
  barber?: BarberProfile;
  error?: string;
}

export interface BarberShopConfig {
  appName?: string; // "BarberTurno"
  shopName: string; // Default or fallback name
  tagline: string;
  address?: string;
  phoneWhatsapp: string;
  email: string;
  currencySymbol: string;
  slotIntervalMinutes: number; // e.g. 30 or 15
  autoSendEmail: boolean;
  barberPassword?: string;
  schedule: DaySchedule[];
  services: Service[];
  barbers?: BarberProfile[];
}

export type SlotStatus = 'DISPONIBLE' | 'RESERVADO' | 'BLOQUEADO';

export interface BarberSlot {
  date: string; // "YYYY-MM-DD"
  time: string; // "09:00"
  status: SlotStatus;
  barberId?: string;
  client?: string;
  clientName?: string;
  clientPhone?: string;
  phone?: string;
  clientEmail?: string;
  email?: string;
  service?: string;
  price?: number | string;
  notes?: string;
  rowIndex?: number;
  rawTime?: string;
  rawDate?: string;
}

export interface BarberDateOption {
  date: string; // "YYYY-MM-DD"
  label: string; // "Hoy, 14 Sep" or "Vie, 20 Mar"
  dayName: string; // "Vie"
  totalSlots: number;
  availableSlots: number;
}

export type BookingStatus = 'pendiente' | 'confirmada' | 'completada' | 'cancelada' | 'no_asistio';

export interface Booking {
  id: string; // e.g. "BARB-4819"
  createdAt: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientNotes?: string;
  preferredStyle?: string;
  barberId?: string;
  barberName?: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "10:30"
  endTime: string; // "11:15"
  serviceIds: string[];
  serviceNames: string[];
  totalPrice: number;
  totalDurationMinutes: number;
  status: BookingStatus;
  emailSent: boolean;
  emailSentAt?: string;
  emailError?: string;
  googleCalendarEventUrl?: string;
}

export interface TimeSlot {
  time: string; // "10:00"
  available: boolean;
  reason?: 'ocupado' | 'almuerzo' | 'pasado' | 'fuera_horario';
  isContiguous?: boolean; // Recommended to minimize dead times
}

export interface EmailRecord {
  id: string;
  to: string;
  subject: string;
  bookingId: string;
  sentAt: string;
  status: 'sent' | 'simulated' | 'error';
  htmlContent: string;
  previewText: string;
  error?: string;
}

export interface BarberAuthenticator {
  id: string;
  barberId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports?: string;
  deviceType?: string;
  deviceName?: string;
  createdAt: string;
}

export interface BarberPushSubscription {
  id: string;
  barberId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  deviceName?: string;
  createdAt: string;
}


