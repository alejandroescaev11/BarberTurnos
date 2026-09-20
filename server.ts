import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createServer as createViteServer } from 'vite';
import nodemailer from 'nodemailer';
import webpush from 'web-push';
import dotenv from 'dotenv';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { BarberShopConfig, BarberProfile, Booking, EmailRecord, Service, DaySchedule, BarberSlot, BarberDateOption } from './src/types';
import * as db from './src/server/db';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// Ensure data directory exists
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const BOOKINGS_FILE = path.join(DATA_DIR, 'bookings.json');
const EMAIL_LOGS_FILE = path.join(DATA_DIR, 'email-logs.json');
const APP_SLOTS_FILE = path.join(DATA_DIR, 'app_slots.json');
const PUBLIC_URL_FILE = path.join(DATA_DIR, 'public_url.txt');

// Default initial config for BarberTurno platform
const DEFAULT_CONFIG: BarberShopConfig = {
  appName: 'BarberTurno',
  shopName: 'BarberTurno - Plataforma de Gestión',
  tagline: 'Reserva tu cita con tu barbero de confianza',
  address: 'Calle 45 # 18-24, Zona Centro',
  phoneWhatsapp: '+57 310 987 6543',
  email: 'contacto@barberturno.com',
  currencySymbol: '$',
  slotIntervalMinutes: 30,
  autoSendEmail: true,
  barberPassword: process.env.BARBER_PASSWORD || 'barbero123',
  schedule: [
    { dayOfWeek: 1, dayName: 'Lunes', isOpen: true, openTime: '09:00', closeTime: '20:00', lunchBreak: { start: '13:00', end: '14:00' } },
    { dayOfWeek: 2, dayName: 'Martes', isOpen: true, openTime: '09:00', closeTime: '20:00', lunchBreak: { start: '13:00', end: '14:00' } },
    { dayOfWeek: 3, dayName: 'Miércoles', isOpen: true, openTime: '09:00', closeTime: '20:00', lunchBreak: { start: '13:00', end: '14:00' } },
    { dayOfWeek: 4, dayName: 'Jueves', isOpen: true, openTime: '09:00', closeTime: '20:00', lunchBreak: { start: '13:00', end: '14:00' } },
    { dayOfWeek: 5, dayName: 'Viernes', isOpen: true, openTime: '09:00', closeTime: '20:30', lunchBreak: { start: '13:00', end: '14:00' } },
    { dayOfWeek: 6, dayName: 'Sábado', isOpen: true, openTime: '09:00', closeTime: '21:00', lunchBreak: { start: '13:30', end: '14:30' } },
    { dayOfWeek: 0, dayName: 'Domingo', isOpen: false, openTime: '10:00', closeTime: '15:00' }
  ],
  services: [
    {
      id: 'corte_clasico',
      name: 'Corte Sencillo / Clásico',
      description: 'Corte tradicional a tijera o máquina con acabado limpio a navaja y talco refrescante.',
      durationMinutes: 30,
      price: 15000,
      popular: false,
      category: 'corte',
      active: true
    },
    {
      id: 'corte_barba',
      name: 'Corte + Barba',
      description: 'Corte completo con perfilado de barba, toalla caliente aromatizada y bálsamo hidratante.',
      durationMinutes: 45,
      price: 22000,
      popular: true,
      category: 'combo',
      active: true
    }
  ]
};

// Seed sample initial bookings if empty
const SAMPLE_BOOKINGS: Booking[] = [
  {
    id: 'BARB-7102',
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    clientName: 'Mateo Gómez',
    clientEmail: 'mateo.gomez@ejemplo.com',
    clientPhone: '+57 312 456 7890',
    clientNotes: 'Degradado medio en los lados, tijera arriba.',
    date: new Date().toISOString().split('T')[0],
    startTime: '10:00',
    endTime: '10:45',
    serviceIds: ['corte_barba'],
    serviceNames: ['Corte + Barba Tradicional'],
    totalPrice: 22000,
    totalDurationMinutes: 45,
    status: 'confirmada',
    emailSent: true,
    emailSentAt: new Date(Date.now() - 3600000 * 2).toISOString()
  },
  {
    id: 'BARB-8491',
    createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    clientName: 'Santiago Rodríguez',
    clientEmail: 'santiago.r@ejemplo.com',
    clientPhone: '+57 315 789 1234',
    clientNotes: 'Primera vez en la barbería.',
    date: new Date().toISOString().split('T')[0],
    startTime: '11:30',
    endTime: '12:00',
    serviceIds: ['corte_clasico'],
    serviceNames: ['Corte Clásico / Sencillo'],
    totalPrice: 15000,
    totalDurationMinutes: 30,
    status: 'confirmada',
    emailSent: true,
    emailSentAt: new Date(Date.now() - 3600000 * 4).toISOString()
  }
];

// Helper to read/write JSON files
function readJsonFile<T>(filePath: string, defaultValue: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
  }
  return defaultValue;
}

function writeJsonFile<T>(filePath: string, data: T): void {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err);
  }
}

// In-memory data initialized from files
let config: BarberShopConfig = readJsonFile<BarberShopConfig>(CONFIG_FILE, DEFAULT_CONFIG);
let bookings: Booking[] = readJsonFile<Booking[]>(BOOKINGS_FILE, SAMPLE_BOOKINGS);
let emailLogs: EmailRecord[] = readJsonFile<EmailRecord[]>(EMAIL_LOGS_FILE, []);
let appSlots: BarberSlot[] = readJsonFile<BarberSlot[]>(APP_SLOTS_FILE, []);

// Write back to ensure files exist
writeJsonFile(CONFIG_FILE, config);
writeJsonFile(BOOKINGS_FILE, bookings);
writeJsonFile(EMAIL_LOGS_FILE, emailLogs);
writeJsonFile(APP_SLOTS_FILE, appSlots);

/**
 * Configure Nodemailer transport if SMTP env variables are provided
 */
function getEmailTransporter() {
  const service = process.env.SMTP_SERVICE;
  const host = process.env.SMTP_HOST || (process.env.SMTP_USER?.includes('@gmail.com') ? 'smtp.gmail.com' : undefined);
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : (service === 'gmail' || host === 'smtp.gmail.com' ? 465 : 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (user && pass) {
    const transportOptions: any = {
      connectionTimeout: 4000,
      greetingTimeout: 4000,
      socketTimeout: 6000
    };

    if (service) {
      return nodemailer.createTransport({
        service,
        auth: { user, pass },
        ...transportOptions
      });
    }
    if (host) {
      return nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        ...transportOptions
      });
    }
  }
  return null;
}

// ----------------------------------------------------
// WEBPUSH / VAPID CONFIGURATION
// ----------------------------------------------------
const VAPID_FILE = path.join(DATA_DIR, 'vapid.json');
let vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY || '',
  privateKey: process.env.VAPID_PRIVATE_KEY || ''
};

if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
  try {
    if (fs.existsSync(VAPID_FILE)) {
      vapidKeys = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf-8'));
    }
  } catch {}

  if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
    vapidKeys = webpush.generateVAPIDKeys();
    try {
      fs.writeFileSync(VAPID_FILE, JSON.stringify(vapidKeys, null, 2));
    } catch {}
  }
}

const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:soporte@barberturnos.com';
try {
  webpush.setVapidDetails(VAPID_SUBJECT, vapidKeys.publicKey, vapidKeys.privateKey);
} catch (e: any) {
  console.warn('[WebPush] Error configuring VAPID details:', e?.message);
}

async function sendPushNotificationToBarber(
  barberId: string, 
  payload: { title: string; body: string; data?: any; icon?: string; badge?: string }
): Promise<{ sentCount: number; failedCount: number }> {
  const subscriptions = db.getPushSubscriptionsForBarber(barberId);
  if (!subscriptions || subscriptions.length === 0) {
    return { sentCount: 0, failedCount: 0 };
  }

  const pushPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || '/pwa-192x192.png',
    badge: payload.badge || '/pwa-192x192.png',
    data: payload.data || { url: '/?view=dashboard' }
  });

  let sentCount = 0;
  let failedCount = 0;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        },
        pushPayload
      );
      sentCount++;
    } catch (err: any) {
      failedCount++;
      if (err.statusCode === 404 || err.statusCode === 410) {
        db.deletePushSubscription(sub.endpoint);
        console.log(`[WebPush] Removed expired subscription for barber ${barberId}`);
      } else {
        console.warn(`[WebPush] Handled push warning for ${sub.endpoint}:`, err?.message);
      }
    }
  }

  return { sentCount, failedCount };
}

/**
 * Generates rich HTML template for client booking confirmation
 */
function generateEmailHtml(booking: Booking, shopConfig: BarberShopConfig): string {
  const dateFormatted = booking.date;
  const servicesListHtml = booking.serviceNames
    .map(name => `<li style="padding: 4px 0; color: #d4d4d8;">✂️ <strong>${name}</strong></li>`)
    .join('');

  const cleanWhatsapp = (shopConfig.phoneWhatsapp || '').replace(/\D/g, '');
  const waUrl = cleanWhatsapp ? `https://wa.me/${cleanWhatsapp}?text=${encodeURIComponent(`Hola, tengo una pregunta sobre mi cita #${booking.id} para el ${booking.date}.`)}` : '';

  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8">
      <title>Confirmación de Reserva</title>
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 24px;">
      <div style="max-width: 580px; margin: 0 auto; background: #1e293b; border-radius: 16px; border: 1px solid #334155; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 50%, #dc2626 100%); padding: 32px 24px; text-align: center;">
          <span style="font-size: 40px;">💈</span>
          <h1 style="margin: 8px 0 0 0; font-size: 24px; color: #ffffff; letter-spacing: 0.5px;">¡Cita Confirmada con Éxito!</h1>
          <p style="margin: 6px 0 0 0; color: #fef3c7; font-size: 15px;">${shopConfig.shopName}</p>
        </div>

        <!-- Content -->
        <div style="padding: 32px 28px;">
          <p style="font-size: 16px; color: #cbd5e1; margin-top: 0;">
            Hola <strong>${booking.clientName}</strong>, tu cita con <strong>${booking.barberName || 'tu barbero'}</strong> en <strong>${shopConfig.shopName}</strong> ha sido agendada exitosamente.
          </p>

          <!-- Ticket Box -->
          <div style="background-color: #090d16; border: 1px dashed #f59e0b; border-radius: 12px; padding: 20px; margin: 24px 0;">
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #1e293b; padding-bottom: 12px; margin-bottom: 12px;">
              <span style="color: #94a3b8; font-size: 13px;">CÓDIGO DE RESERVA:</span>
              <strong style="color: #f59e0b; font-size: 16px; letter-spacing: 1px;">#${booking.id}</strong>
            </div>

            <table style="width: 100%; border-collapse: collapse; font-size: 14px; line-height: 1.6;">
              <tr>
                <td style="color: #94a3b8; padding: 6px 0;">✂️ Barbero:</td>
                <td style="color: #f8fafc; font-weight: 700; text-align: right;">${booking.barberName || 'Barbero Profesional'}</td>
              </tr>
              <tr>
                <td style="color: #94a3b8; padding: 6px 0;">📅 Fecha:</td>
                <td style="color: #f8fafc; font-weight: 600; text-align: right;">${dateFormatted}</td>
              </tr>
              <tr>
                <td style="color: #94a3b8; padding: 6px 0;">⏰ Horario:</td>
                <td style="color: #f59e0b; font-weight: 700; text-align: right;">${booking.startTime} - ${booking.endTime} hrs</td>
              </tr>
              <tr>
                <td style="color: #94a3b8; padding: 6px 0;">⏱️ Duración estimada:</td>
                <td style="color: #f8fafc; text-align: right;">${booking.totalDurationMinutes} minutos</td>
              </tr>
              <tr>
                <td style="color: #94a3b8; padding: 6px 0;">📍 Ubicación:</td>
                <td style="color: #f8fafc; text-align: right;">${shopConfig.address}</td>
              </tr>
              <tr>
                <td style="color: #94a3b8; padding: 6px 0;">💵 Total a pagar en el local:</td>
                <td style="color: #10b981; font-weight: 800; font-size: 16px; text-align: right;">$${booking.totalPrice.toLocaleString()}</td>
              </tr>
            </table>

            <div style="margin-top: 16px; padding-top: 14px; border-top: 1px solid #1e293b;">
              <span style="color: #94a3b8; font-size: 13px; display: block; margin-bottom: 6px;">Servicios seleccionados:</span>
              <ul style="margin: 0; padding-left: 20px; font-size: 14px;">
                ${servicesListHtml}
              </ul>
            </div>

            ${booking.clientNotes ? `
              <div style="margin-top: 12px; font-size: 13px; color: #94a3b8; background: #1e293b; padding: 8px 12px; border-radius: 6px;">
                <strong>Nota del cliente:</strong> ${booking.clientNotes}
              </div>
            ` : ''}
          </div>

          <!-- Instructions -->
          <div style="background-color: #1e293b; border-left: 4px solid #f59e0b; padding: 14px; border-radius: 4px; margin-bottom: 24px; font-size: 14px; color: #cbd5e1;">
            <p style="margin: 0;"><strong>💡 Recordatorio importante:</strong> Recuerda llegar 5 minutos antes de tu cita para garantizar la atención puntual. El pago se realiza directamente en el local en efectivo o transferencia.</p>
          </div>

          <!-- Contact info & WhatsApp -->
          <div style="text-align: center; margin-top: 24px;">
            ${waUrl ? `
              <a href="${waUrl}" style="display: inline-block; background: #16a34a; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-weight: bold; font-size: 14px;">
                💬 Contactar por WhatsApp al Local
              </a>
            ` : ''}
          </div>
        </div>

        <!-- Footer -->
        <div style="background-color: #0b1120; padding: 16px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #1e293b;">
          ${shopConfig.shopName} • Sistema de Asignación de Turnos BarberTurnos
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generates rich HTML template for barber appointment notification
 */
function generateBarberNotificationEmailHtml(booking: Booking, barber: BarberProfile, shopConfig: BarberShopConfig): string {
  const cleanPhone = (booking.clientPhone || '').replace(/\D/g, '');
  const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(`Hola ${booking.clientName}, te escribo de ${shopConfig.shopName} respecto a tu cita agendada para el ${booking.date} a las ${booking.startTime} hs.`)}` : '';
  const servicesListHtml = booking.serviceNames
    .map(name => `<li style="padding: 4px 0; color: #d4d4d8;">✂️ <strong>${name}</strong></li>`)
    .join('');

  return `
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="utf-8"><title>Nueva Cita Agendada</title></head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 24px;">
      <div style="max-width: 580px; margin: 0 auto; background: #1e293b; border-radius: 16px; border: 1px solid #334155; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 50%, #dc2626 100%); padding: 30px 24px; text-align: center;">
          <span style="font-size: 40px;">💈</span>
          <h1 style="margin: 8px 0 0 0; font-size: 24px; color: #ffffff;">¡Tienes una Nueva Cita!</h1>
          <p style="margin: 6px 0 0 0; color: #93c5fd; font-size: 15px;">Hola ${barber.name}, un cliente ha reservado en tu agenda</p>
        </div>

        <!-- Content -->
        <div style="padding: 30px 28px;">
          <!-- Client Card -->
          <div style="background-color: #090d16; border: 1px solid #2563eb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #1e293b; padding-bottom: 12px; margin-bottom: 12px;">
              <span style="color: #94a3b8; font-size: 13px;">CITA #${booking.id}</span>
              <strong style="color: #38bdf8; font-size: 14px;">ESTADO: CONFIRMADA</strong>
            </div>

            <table style="width: 100%; border-collapse: collapse; font-size: 14px; line-height: 1.6;">
              <tr>
                <td style="color: #94a3b8; padding: 6px 0;">👤 Cliente:</td>
                <td style="color: #ffffff; font-weight: 700; text-align: right;">${booking.clientName}</td>
              </tr>
              <tr>
                <td style="color: #94a3b8; padding: 6px 0;">📱 Teléfono:</td>
                <td style="color: #38bdf8; font-weight: 600; text-align: right;">${booking.clientPhone}</td>
              </tr>
              <tr>
                <td style="color: #94a3b8; padding: 6px 0;">📅 Fecha:</td>
                <td style="color: #ffffff; font-weight: 600; text-align: right;">${booking.date}</td>
              </tr>
              <tr>
                <td style="color: #94a3b8; padding: 6px 0;">⏰ Hora:</td>
                <td style="color: #fbbf24; font-weight: 700; text-align: right;">${booking.startTime} - ${booking.endTime} hs</td>
              </tr>
              <tr>
                <td style="color: #94a3b8; padding: 6px 0;">⏱️ Duración:</td>
                <td style="color: #ffffff; text-align: right;">${booking.totalDurationMinutes} min</td>
              </tr>
              <tr>
                <td style="color: #94a3b8; padding: 6px 0;">💵 Valor a cobrar:</td>
                <td style="color: #10b981; font-weight: 800; font-size: 16px; text-align: right;">$${booking.totalPrice.toLocaleString()}</td>
              </tr>
            </table>

            <div style="margin-top: 14px; padding-top: 12px; border-top: 1px solid #1e293b;">
              <span style="color: #94a3b8; font-size: 13px; display: block; margin-bottom: 6px;">Servicios solicitados:</span>
              <ul style="margin: 0; padding-left: 20px; font-size: 14px;">
                ${servicesListHtml}
              </ul>
            </div>

            ${booking.clientNotes ? `
              <div style="margin-top: 12px; font-size: 13px; color: #cbd5e1; background: #1e293b; padding: 10px 12px; border-radius: 6px; border-left: 3px solid #38bdf8;">
                <strong>Nota del cliente:</strong> ${booking.clientNotes}
              </div>
            ` : ''}
          </div>

          <!-- Actions -->
          <div style="text-align: center; margin: 20px 0;">
            ${waUrl ? `
              <a href="${waUrl}" style="display: inline-block; background-color: #16a34a; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-weight: bold; font-size: 14px;">
                💬 Chatear por WhatsApp con el Cliente
              </a>
            ` : ''}
          </div>
        </div>

        <!-- Footer -->
        <div style="background-color: #0b1120; padding: 16px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #1e293b;">
          ${shopConfig.shopName} • Notificación Automática de Citas
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Dispatch confirmation email or log simulation (notifies client AND barber from the central application account)
 */
async function dispatchConfirmationEmail(booking: Booking, currentConfig: BarberShopConfig): Promise<{ sent: boolean; mode: 'smtp' | 'simulation'; error?: string; log: EmailRecord }> {
  const htmlContent = generateEmailHtml(booking, currentConfig);
  const subject = `💈 Confirmación de Turno #${booking.id} - ${currentConfig.shopName} (${booking.date} ${booking.startTime})`;
  const transporter = getEmailTransporter();

  let status: 'sent' | 'simulated' | 'error' = 'simulated';
  let errorMsg: string | undefined = undefined;

  const fromAddr = process.env.SMTP_FROM || `"${currentConfig.shopName}" <${process.env.SMTP_USER || currentConfig.email}>`;

  if (transporter && currentConfig.autoSendEmail) {
    try {
      // 1. Send confirmation to Client
      await transporter.sendMail({
        from: fromAddr,
        to: booking.clientEmail,
        subject,
        html: htmlContent
      });
      status = 'sent';
      console.log(`[Email] Sent real confirmation email to client ${booking.clientEmail} for booking ${booking.id}`);

      // 2. Also notify Barber via Email if barber has an email address registered
      if (booking.barberId) {
        const barber = db.getBarberByParam(booking.barberId);
        if (barber && barber.email && barber.email.includes('@')) {
          const barberSubject = `💈 ¡Nuevo Turno Agendado! #${booking.id} - ${booking.clientName} (${booking.date} ${booking.startTime})`;
          const barberHtml = generateBarberNotificationEmailHtml(booking, barber, currentConfig);
          try {
            await transporter.sendMail({
              from: fromAddr,
              to: barber.email,
              subject: barberSubject,
              html: barberHtml
            });
            console.log(`[Email] Notification sent to barber ${barber.name} (${barber.email})`);
          } catch (barberErr: any) {
            console.warn('[Email] Could not dispatch email to barber:', barberErr?.message);
          }
        }
      }
    } catch (err: any) {
      console.error('[Email] Failed sending real email:', err);
      status = 'error';
      errorMsg = err?.message || 'Error en el servidor SMTP';
    }
  } else {
    // Simulated delivery with full inspection
    console.log(`[Email-Simulation] Auto-generated confirmation email for client ${booking.clientEmail} (#${booking.id})`);
    if (booking.barberId) {
      const barber = db.getBarberByParam(booking.barberId);
      if (barber?.email) {
        console.log(`[Email-Simulation] Barber notification simulated for ${barber.email}`);
      }
    }
    status = 'simulated';
  }

  const emailRecord: EmailRecord = {
    id: `email_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    bookingId: booking.id,
    to: booking.clientEmail,
    subject,
    sentAt: new Date().toISOString(),
    status,
    htmlContent,
    previewText: `Cita #${booking.id} confirmada para ${booking.clientName} el ${booking.date} a las ${booking.startTime} hrs. Total: $${booking.totalPrice}.`,
    error: errorMsg
  };

  emailLogs.unshift(emailRecord);
  if (emailLogs.length > 50) emailLogs = emailLogs.slice(0, 50);
  writeJsonFile(EMAIL_LOGS_FILE, emailLogs);

  return {
    sent: status === 'sent',
    mode: status === 'sent' ? 'smtp' : 'simulation',
    error: errorMsg,
    log: emailRecord
  };
}

// ----------------------------------------------------
// TIME & DATE HELPERS
// ----------------------------------------------------

function normalizeSlotTime(rawTime: any): string {
  if (!rawTime) return '00:00';
  const s = String(rawTime).trim();
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [h, m] = s.split(':');
    return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
  }
  const match = s.match(/(?:(\d{1,2}):(\d{2}))(?::\d{2})?/);
  if (match) {
    const h = match[1].padStart(2, '0');
    const m = match[2].padStart(2, '0');
    return `${h}:${m}`;
  }
  return s;
}

function normalizeSlotDate(rawDate: any): string {
  if (!rawDate) return '';
  const s = String(rawDate).trim();
  if (!s) return '';

  const ddmmyyyyMatch = s.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})/);
  if (ddmmyyyyMatch) {
    const day = ddmmyyyyMatch[1].padStart(2, '0');
    const month = ddmmyyyyMatch[2].padStart(2, '0');
    let year = ddmmyyyyMatch[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }

  const yyyymmddMatch = s.match(/^(\d{4})[\/\.-](\d{1,2})[\/\.-](\d{1,2})/);
  if (yyyymmddMatch) {
    const year = yyyymmddMatch[1];
    const month = yyyymmddMatch[2].padStart(2, '0');
    const day = yyyymmddMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  return s;
}

function formatToDDMMYYYY(dateStr: string): string {
  if (!dateStr) return '';
  const normalized = normalizeSlotDate(dateStr);
  const parts = normalized.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

function formatDayDisplay(dateStr: string): { label: string; dayName: string } {
  const parts = dateStr.split('-');
  if (parts.length < 3) return { label: dateStr, dayName: '' };
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  const dayOfWeek = d.getDay();
  const dayName = dayNames[dayOfWeek] || '';
  const monthName = monthNames[d.getMonth()] || '';

  if (dateStr === todayStr) {
    return { label: `Hoy, ${d.getDate()} ${monthName}`, dayName: 'Hoy' };
  }
  if (dateStr === tomorrowStr) {
    return { label: `Mañana, ${d.getDate()} ${monthName}`, dayName: 'Mañana' };
  }

  return { label: `${dayName}, ${d.getDate()} ${monthName}`, dayName };
}

function isSlotInThePast(slotDate: string, slotTime: string, now: Date = new Date()): boolean {
  const normalizedDate = normalizeSlotDate(slotDate);
  const normalizedTime = normalizeSlotTime(slotTime);
  if (!normalizedDate || !normalizedTime) return false;

  const todayYear = now.getFullYear();
  const todayMonth = String(now.getMonth() + 1).padStart(2, '0');
  const todayDay = String(now.getDate()).padStart(2, '0');
  const todayStr = `${todayYear}-${todayMonth}-${todayDay}`;

  if (normalizedDate < todayStr) return true;
  if (normalizedDate > todayStr) return false;

  // Same date: compare time
  const currentH = String(now.getHours()).padStart(2, '0');
  const currentM = String(now.getMinutes()).padStart(2, '0');
  const currentTimeStr = `${currentH}:${currentM}`;
  return normalizedTime <= currentTimeStr;
}

// Helper to find barber profile by id, slug or email
function getBarberByParam(barberParam?: string): BarberProfile | null {
  return db.getBarberByParam(barberParam);
}

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// GET configuration
app.get('/api/config', (req, res) => {
  const currentConfig = db.getConfig();
  const safeConfig = { ...currentConfig, hasPassword: Boolean(currentConfig.barberPassword || process.env.BARBER_PASSWORD) };
  delete (safeConfig as any).barberPassword;
  res.json(safeConfig);
});

// POST update configuration
app.post('/api/config', (req, res) => {
  const currentConfig = db.getConfig();
  const updated = { ...currentConfig, ...req.body };
  db.updateConfig(updated);
  const safeConfig = { ...updated, hasPassword: Boolean(updated.barberPassword || process.env.BARBER_PASSWORD) };
  delete (safeConfig as any).barberPassword;
  res.json({ success: true, config: safeConfig });
});

// GET public profile of a barber by slug or ID
app.get(['/api/barber/profile/:slug', '/api/barber/profile'], (req, res) => {
  const targetParam = String(req.params.slug || req.query.barberId || req.query.slug || '').trim();
  const barber = db.getBarberByParam(targetParam);
  if (!barber) {
    return res.status(404).json({ error: 'Barbero no encontrado' });
  }
  if (barber.status === 'pausado' || barber.active === false) {
    return res.status(403).json({
      error: 'La agenda de este barbero se encuentra temporalmente pausada.',
      isPaused: true,
      barber: sanitizeBarber(barber)
    });
  }
  if (barber.status && barber.status !== 'aprobado') {
    return res.status(403).json({ error: 'Este barbero está en proceso de validación y aún no recibe citas.' });
  }
  const services = db.getServicesForBarber(barber.id);
  res.json({
    barber: sanitizeBarber(barber),
    services
  });
});

// GET slots for a specific barber and date (100% SQLite powered, isolated per barber)
app.get('/api/slots', (req, res) => {
  const { date, barber: barberSlug, barberId } = req.query;
  const barberParam = String(barberId || barberSlug || '').trim();
  let targetBarber = barberParam ? db.getBarberByParam(barberParam) : null;
  if (!targetBarber) {
    const allBarbers = db.getAllBarbers('aprobado').filter(b => b.active);
    targetBarber = allBarbers[0] || null;
  }

  if (!targetBarber) {
    return res.status(404).json({ error: 'No hay barberos aprobados y configurados.' });
  }

  if (targetBarber.status === 'pausado' || targetBarber.active === false) {
    return res.status(403).json({
      error: 'La agenda de este barbero se encuentra temporalmente pausada.',
      isPaused: true,
      barber: sanitizeBarber(targetBarber)
    });
  }

  if (targetBarber.status && targetBarber.status !== 'aprobado') {
    return res.status(403).json({ error: 'Este barbero está en proceso de validación y aún no recibe citas.' });
  }

  const now = new Date();
  const todayYear = now.getFullYear();
  const todayMonth = String(now.getMonth() + 1).padStart(2, '0');
  const todayDay = String(now.getDate()).padStart(2, '0');
  const todayStr = `${todayYear}-${todayMonth}-${todayDay}`;
  const currentH = String(now.getHours()).padStart(2, '0');
  const currentM = String(now.getMinutes()).padStart(2, '0');
  const currentTimeStr = `${currentH}:${currentM}`;

  const availableDates = db.getAvailableDatesForBarber(targetBarber.id, todayStr, currentTimeStr);
  const normalizedReqDate = typeof date === 'string' && date ? normalizeSlotDate(date) : '';
  let targetDate = normalizedReqDate && normalizedReqDate >= todayStr ? normalizedReqDate : '';
  if (!targetDate) {
    targetDate = availableDates.length > 0 ? availableDates[0].date : todayStr;
  }

  const barberSlots = db.getSlotsForBarber(targetBarber.id, targetDate);

  if (barberSlots.length > 0) {
    // Strictly filter out past hours: mark as BLOQUEADO if already passed
    const sanitizedSlots = barberSlots.map(s => {
      if (isSlotInThePast(targetDate, s.time, now) && s.status === 'DISPONIBLE') {
        return {
          ...s,
          status: 'BLOQUEADO' as const,
          notes: 'Hora pasada'
        };
      }
      return s;
    });

    return res.json({
      source: 'sqlite_db',
      configured: true,
      selectedDate: targetDate,
      availableDates,
      slots: sanitizedSlots,
      totalSlotsInSheet: sanitizedSlots.length,
      barber: sanitizeBarber(targetBarber)
    });
  }

  // Fallback: generate slots from schedule if barber has not published specific slots for this date
  const shopConfig = db.getConfig();
  const dayOfWeek = new Date(targetDate + 'T00:00:00').getDay();
  const daySchedule = shopConfig.schedule.find(s => s.dayOfWeek === dayOfWeek);

  if (!daySchedule || !daySchedule.isOpen) {
    return res.json({ 
      source: 'sqlite_db', 
      configured: true, 
      selectedDate: targetDate, 
      availableDates, 
      slots: [],
      barber: sanitizeBarber(targetBarber)
    });
  }

  const interval = shopConfig.slotIntervalMinutes || 45;
  const [openH, openM] = daySchedule.openTime.split(':').map(Number);
  const [closeH, closeM] = daySchedule.closeTime.split(':').map(Number);
  const openTotalMin = openH * 60 + openM;
  const closeTotalMin = closeH * 60 + closeM;

  let lunchStartMin = -1;
  let lunchEndMin = -1;
  if (daySchedule.lunchBreak) {
    const [lsh, lsm] = daySchedule.lunchBreak.start.split(':').map(Number);
    const [leh, lem] = daySchedule.lunchBreak.end.split(':').map(Number);
    lunchStartMin = lsh * 60 + lsm;
    lunchEndMin = leh * 60 + lem;
  }

  const dateBookings = db.getBookings({ barberId: targetBarber.id, date: targetDate });
  const slots: BarberSlot[] = [];

  for (let m = openTotalMin; m + 30 <= closeTotalMin; m += interval) {
    const slotHour = Math.floor(m / 60);
    const slotMin = m % 60;
    const timeStr = `${String(slotHour).padStart(2, '0')}:${String(slotMin).padStart(2, '0')}`;

    // Mark past hours as blocked
    if (isSlotInThePast(targetDate, timeStr, now)) {
      slots.push({
        date: targetDate,
        time: timeStr,
        status: 'BLOQUEADO',
        barberId: targetBarber.id,
        notes: 'Hora pasada'
      });
      continue;
    }

    if (lunchStartMin >= 0 && m >= lunchStartMin && m < lunchEndMin) {
      slots.push({
        date: targetDate,
        time: timeStr,
        status: 'BLOQUEADO',
        barberId: targetBarber.id,
        notes: 'Pausa Almuerzo'
      });
      continue;
    }

    const booked = dateBookings.find(b => {
      const [bh, bm] = b.startTime.split(':').map(Number);
      return bh * 60 + bm === m && b.status !== 'cancelada';
    });

    if (booked) {
      slots.push({
        date: targetDate,
        time: timeStr,
        status: 'RESERVADO',
        barberId: targetBarber.id,
        clientName: booked.clientName,
        clientPhone: booked.clientPhone,
        service: booked.serviceNames.join(', '),
        price: booked.totalPrice
      });
    } else {
      slots.push({
        date: targetDate,
        time: timeStr,
        status: 'DISPONIBLE',
        barberId: targetBarber.id
      });
    }
  }

  res.json({
    source: 'sqlite_db',
    configured: true,
    selectedDate: targetDate,
    availableDates,
    slots,
    barber: sanitizeBarber(targetBarber)
  });
});

// Active sessions map: token -> barberId
const barberSessions = new Map<string, string>();

// Helper to strip sensitive credentials before sending to client
function sanitizeBarber(b: BarberProfile): BarberProfile {
  const sanitized = { ...b };
  delete (sanitized as any).password;
  return sanitized;
}

// POST verify barber password / PIN (backwards compatibility)
app.post('/api/barber/verify-pin', (req, res) => {
  const { password, barberId, email } = req.body;
  const rawPass = String(password || '').trim();
  const currentPassword = config.barberPassword || process.env.BARBER_PASSWORD || 'barbero123';

  if (!rawPass) {
    return res.status(400).json({ success: false, error: 'Por favor ingresa la contraseña.' });
  }

  // If a specific barber is requested
  if (barberId || email) {
    const matched = getBarberByParam(barberId || email);
    if (matched) {
      const barberPass = matched.password || currentPassword;
      if (rawPass === barberPass || rawPass === currentPassword) {
        const token = `btoken_${matched.id}_${Date.now()}`;
        barberSessions.set(token, matched.id);
        return res.json({ success: true, token, barber: sanitizeBarber(matched) });
      }
      return res.status(401).json({ success: false, error: 'Contraseña incorrecta para este barbero.' });
    }
  }

  // Check if matches master or any barber
  if (rawPass === currentPassword.trim()) {
    const primaryBarber = config.barbers?.[0];
    const token = 'barber_session_' + Date.now();
    if (primaryBarber) barberSessions.set(token, primaryBarber.id);
    return res.json({ success: true, token, barber: primaryBarber ? sanitizeBarber(primaryBarber) : undefined });
  }

  const matchedBarber = config.barbers?.find(b => b.password && b.password.trim() === rawPass);
  if (matchedBarber) {
    const token = `btoken_${matchedBarber.id}_${Date.now()}`;
    barberSessions.set(token, matchedBarber.id);
    return res.json({ success: true, token, barber: sanitizeBarber(matchedBarber) });
  }

  return res.status(401).json({ success: false, error: 'Contraseña incorrecta. Intenta nuevamente.' });
});

// POST dedicated login per barber account
app.post('/api/barber/login', (req, res) => {
  const { identifier, email, username, barberId, password } = req.body;
  const query = String(identifier || email || username || barberId || '').trim();
  const rawPass = String(password || '').trim();

  if (!query) {
    return res.status(400).json({ success: false, error: 'Por favor ingresa tu correo electrónico o usuario.' });
  }

  if (!rawPass) {
    return res.status(400).json({ success: false, error: 'Por favor ingresa tu contraseña.' });
  }

  const barbers = db.getAllBarbers();
  if (!barbers.length) {
    return res.status(404).json({ success: false, error: 'No se encontraron cuentas de barberos configuradas.' });
  }

  const matched = db.getBarberByParam(query);
  const currentConfig = db.getConfig();
  const masterPass = (currentConfig.barberPassword || process.env.BARBER_PASSWORD || 'barbero123').trim();

  if (!matched) {
    return res.status(401).json({
      success: false,
      error: 'Cuenta no encontrada. Verifica tu correo electrónico o usuario.'
    });
  }

  const expectedPass = (matched.password || masterPass).trim();
  if (rawPass !== expectedPass && rawPass !== masterPass) {
    return res.status(401).json({
      success: false,
      error: 'Contraseña incorrecta. Verifica e intenta de nuevo.'
    });
  }

  // Check approval status
  if (matched.status === 'pendiente') {
    return res.status(403).json({
      success: false,
      status: 'pendiente',
      barber: sanitizeBarber(matched),
      error: 'Tu cuenta está en proceso de validación y debe ser activada por el administrador antes de poder ingresar.'
    });
  }

  if (matched.status === 'pausado' || matched.active === false) {
    return res.status(403).json({
      success: false,
      status: 'pausado',
      error: 'El acceso a tu cuenta y la gestión de tu agenda han sido pausados temporalmente por el administrador. Comunícate con soporte para reactivar tu cuenta.'
    });
  }

  if (matched.status === 'rechazado') {
    return res.status(403).json({
      success: false,
      status: 'rechazado',
      error: 'Esta cuenta ha sido rechazada o suspendida. Comunícate con el administrador.'
    });
  }

  // Grant admin flag strictly if designated admin account in database or primary admin
  matched.isAdmin = Boolean(matched.isAdmin || matched.id === 'alejandro');

  const token = `btoken_${matched.id}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  barberSessions.set(token, matched.id);

  return res.json({
    success: true,
    token,
    barber: sanitizeBarber(matched)
  });
});

// POST register a new barber account (supports both singular and plural)
app.post(['/api/barber/register', '/api/barbers/register'], (req, res) => {
  const { name, shopName, email, password, role, phone } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, error: 'El nombre completo es obligatorio.' });
  }
  if (!email || !email.trim()) {
    return res.status(400).json({ success: false, error: 'El correo electrónico es obligatorio para tu acceso.' });
  }
  if (!password || password.trim().length < 4) {
    return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 4 caracteres.' });
  }

  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();

  const existing = db.getBarberByParam(cleanEmail);
  if (existing) {
    return res.status(400).json({
      success: false,
      error: 'Ya existe una cuenta registrada con este correo. Puedes iniciar sesión con tu contraseña.'
    });
  }

  const baseSlug = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || `barbero-${Date.now()}`;
  let slug = baseSlug;
  let counter = 1;
  while (db.getBarberByParam(slug)) {
    slug = `${baseSlug}-${counter++}`;
  }

  const newBarber: BarberProfile = {
    id: slug,
    slug: slug,
    name: cleanName,
    shopName: shopName?.trim() || `${cleanName} Studio`,
    email: cleanEmail,
    password: password.trim(),
    role: role?.trim() || 'Barbero Profesional',
    phone: phone?.trim() || '',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
    active: true,
    status: 'pendiente',
    isAdmin: false,
    createdAt: new Date().toISOString()
  };

  db.createBarber(newBarber);

  // Return pending confirmation without session token
  return res.status(201).json({
    success: true,
    pending: true,
    message: '¡Registro exitoso! Tu cuenta ha sido recibida y está pendiente de activación por el administrador de BarberTurno.',
    barber: sanitizeBarber(newBarber)
  });
});

// GET current authenticated barber profile
app.get('/api/barber/me', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim() || String(req.query.token || '');
  const barberId = barberSessions.get(token) || String(req.headers['x-barber-id'] || req.query.barberId || '');

  let barber: BarberProfile | null = null;
  if (barberId) {
    barber = db.getBarberByParam(barberId);
  }
  if (!barber) {
    barber = db.getAllBarbers()[0] || null;
  }

  if (!barber) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  res.json({ barber: sanitizeBarber(barber) });
});

// PATCH update current barber profile (including shopName and personal password)
app.patch('/api/barber/me', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim() || String(req.query.token || '');
  const reqBarberId = barberSessions.get(token) || String(req.headers['x-barber-id'] || req.body.barberId || '');

  const targetId = reqBarberId || db.getAllBarbers()[0]?.id;
  if (!targetId) {
    return res.status(401).json({ error: 'Sesión no válida o expirada.' });
  }

  const current = db.getBarberByParam(targetId);
  if (!current) {
    return res.status(404).json({ error: 'Cuenta de barbero no encontrada.' });
  }

  const { name, shopName, role, phone, email, avatar, newPassword, password } = req.body;
  const updates: Partial<BarberProfile> = {};

  if (name && String(name).trim()) updates.name = String(name).trim();
  if (shopName && String(shopName).trim()) updates.shopName = String(shopName).trim();
  if (role && String(role).trim()) updates.role = String(role).trim();
  if (phone !== undefined) updates.phone = String(phone).trim();
  if (email && String(email).trim()) updates.email = String(email).trim().toLowerCase();
  if (avatar && String(avatar).trim()) updates.avatar = String(avatar).trim();

  const nextPass = newPassword || password;
  if (nextPass && String(nextPass).trim().length >= 4) {
    updates.password = String(nextPass).trim();
  }

  const updated = db.updateBarber(current.id, updates);
  res.json({ success: true, barber: updated ? sanitizeBarber(updated) : null });
});

// ----------------------------------------------------
// WEBAUTHN / BIOMETRIC AUTHENTICATION & MULTI-DEVICE
// ----------------------------------------------------

function getLocalIpAddress(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

function getWebAuthnRpID(req: express.Request): string {
  const host = req.hostname || (req.get('host') || '').split(':')[0] || 'localhost';
  return host;
}

function getWebAuthnOrigin(req: express.Request): string {
  const originHeader = req.headers.origin;
  if (originHeader) return originHeader;
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

interface WebAuthnChallengeRecord {
  challenge: string;
  barberId?: string;
  expiresAt: number;
}
const webAuthnChallenges = new Map<string, WebAuthnChallengeRecord>();

// Periodic challenge cleanup
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of webAuthnChallenges.entries()) {
    if (val.expiresAt < now) {
      webAuthnChallenges.delete(key);
    }
  }
}, 60000);

// GET network info for multi-device testing
app.get('/api/network-info', (req, res) => {
  const localIp = getLocalIpAddress();
  const host = req.get('host') || '';
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  let publicUrl: string | undefined = undefined;
  try {
    if (fs.existsSync(PUBLIC_URL_FILE)) {
      publicUrl = fs.readFileSync(PUBLIC_URL_FILE, 'utf-8').trim();
    }
  } catch {}

  const activePublicUrl = publicUrl || (host.includes('trycloudflare.com') || host.includes('loca.lt') ? `${isHttps ? 'https' : 'http'}://${host}` : undefined);

  res.json({
    localIp,
    port: PORT,
    localUrl: `http://${localIp}:${PORT}`,
    publicUrl: activePublicUrl,
    currentUrl: `${isHttps ? 'https' : 'http'}://${host}`,
    isSecureContext: isHttps || host.includes('localhost') || host.includes('127.0.0.1')
  });
});

// POST WebAuthn Register Options (Authenticated barber only)
app.post('/api/auth/webauthn/register-options', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const reqBarberId = barberSessions.get(token) || String(req.headers['x-barber-id'] || '');
    const barber = reqBarberId ? db.getBarberByParam(reqBarberId) : null;

    if (!barber) {
      return res.status(401).json({ error: 'Debes iniciar sesión para vincular biometría en este dispositivo.' });
    }

    if (barber.status === 'pausado' || barber.active === false) {
      return res.status(403).json({ error: 'Tu cuenta está temporalmente pausada.' });
    }

    const rpID = getWebAuthnRpID(req);
    const existingAuthenticators = db.getAuthenticatorsForBarber(barber.id);

    const options = await generateRegistrationOptions({
      rpName: 'BarberTurno',
      rpID,
      userID: new Uint8Array(Buffer.from(barber.id, 'utf-8')),
      userName: barber.email || barber.id,
      userDisplayName: barber.name,
      attestationType: 'none',
      excludeCredentials: existingAuthenticators.map(auth => ({
        id: auth.credentialId,
        transports: auth.transports ? JSON.parse(auth.transports) : undefined,
      })),
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'preferred',
        residentKey: 'preferred',
      },
    });

    const challengeKey = `reg_${barber.id}_${Date.now()}`;
    webAuthnChallenges.set(challengeKey, {
      challenge: options.challenge,
      barberId: barber.id,
      expiresAt: Date.now() + 5 * 60 * 1000
    });

    res.json({ options, challengeKey });
  } catch (err: any) {
    console.error('[WebAuthn] Error generating registration options:', err);
    res.status(500).json({ error: err.message || 'Error al generar opciones de biometría.' });
  }
});

// POST WebAuthn Register Verify (Authenticated barber only)
app.post('/api/auth/webauthn/register-verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const reqBarberId = barberSessions.get(token) || String(req.headers['x-barber-id'] || '');
    const barber = reqBarberId ? db.getBarberByParam(reqBarberId) : null;

    if (!barber) {
      return res.status(401).json({ error: 'Debes iniciar sesión para verificar la biometría.' });
    }

    const { response, challengeKey, deviceName } = req.body;
    const challengeRecord = challengeKey ? webAuthnChallenges.get(challengeKey) : null;

    if (!challengeRecord || challengeRecord.barberId !== barber.id) {
      return res.status(400).json({ error: 'El desafío biométrico ha expirado o es inválido. Intenta de nuevo.' });
    }

    const rpID = getWebAuthnRpID(req);
    const origin = getWebAuthnOrigin(req);

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challengeRecord.challenge,
      expectedOrigin: [origin, `http://${req.get('host')}`, `https://${req.get('host')}`],
      expectedRPID: rpID,
      requireUserVerification: false,
    });

    if (verification.verified && verification.registrationInfo) {
      const { credential } = verification.registrationInfo;
      const pubKeyB64 = Buffer.from(credential.publicKey).toString('base64url');

      db.saveAuthenticator({
        id: `auth_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        barberId: barber.id,
        credentialId: credential.id,
        publicKey: pubKeyB64,
        counter: credential.counter,
        transports: credential.transports ? JSON.stringify(credential.transports) : undefined,
        deviceType: 'platform',
        deviceName: deviceName || 'Sensor Biométrico (Huella / Face ID)',
        createdAt: new Date().toISOString()
      });

      webAuthnChallenges.delete(challengeKey);

      res.json({
        success: true,
        message: '¡Reconocimiento biométrico registrado exitosamente en este dispositivo!',
      });
    } else {
      res.status(400).json({ success: false, error: 'No se pudo verificar el sensor biométrico.' });
    }
  } catch (err: any) {
    console.error('[WebAuthn] Error verifying registration:', err);
    res.status(400).json({ error: err.message || 'Error en la verificación biométrica.' });
  }
});

// POST WebAuthn Login Options (Public, allows login by biometrics)
app.post('/api/auth/webauthn/login-options', async (req, res) => {
  try {
    const { identifier, barberId, email } = req.body;
    const query = String(identifier || barberId || email || '').trim();
    const rpID = getWebAuthnRpID(req);

    let allowCredentials = undefined;
    let targetBarberId: string | undefined = undefined;

    if (query) {
      const barber = db.getBarberByParam(query);
      if (barber) {
        targetBarberId = barber.id;
        const authenticators = db.getAuthenticatorsForBarber(barber.id);
        if (authenticators.length > 0) {
          allowCredentials = authenticators.map(auth => ({
            id: auth.credentialId,
            transports: auth.transports ? JSON.parse(auth.transports) : undefined,
          }));
        }
      }
    }

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'preferred',
      allowCredentials,
    });

    const challengeKey = `auth_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    webAuthnChallenges.set(challengeKey, {
      challenge: options.challenge,
      barberId: targetBarberId,
      expiresAt: Date.now() + 5 * 60 * 1000
    });

    res.json({ options, challengeKey });
  } catch (err: any) {
    console.error('[WebAuthn] Error generating auth options:', err);
    res.status(500).json({ error: err.message || 'Error al iniciar acceso biométrico.' });
  }
});

// POST WebAuthn Login Verify
app.post('/api/auth/webauthn/login-verify', async (req, res) => {
  try {
    const { response, challengeKey } = req.body;
    const challengeRecord = challengeKey ? webAuthnChallenges.get(challengeKey) : null;

    if (!challengeRecord) {
      return res.status(400).json({ error: 'La sesión de biometría expiró. Intenta de nuevo.' });
    }

    const credId = response?.id;
    if (!credId) {
      return res.status(400).json({ error: 'Identificador de credencial no proporcionado.' });
    }

    const authenticator = db.getAuthenticatorByCredentialId(credId);
    if (!authenticator) {
      return res.status(404).json({ error: 'Dispositivo biométrico no reconocido o desvinculado.' });
    }

    const barber = db.getBarberByParam(authenticator.barberId);
    if (!barber) {
      return res.status(404).json({ error: 'Barbero no encontrado.' });
    }

    if (barber.status === 'pausado' || barber.active === false) {
      return res.status(403).json({ error: 'El acceso a tu cuenta está pausado temporalmente por administración.' });
    }

    if (barber.status && barber.status !== 'aprobado') {
      return res.status(403).json({ error: 'Tu cuenta aún está pendiente de activación por el administrador.' });
    }

    const rpID = getWebAuthnRpID(req);
    const origin = getWebAuthnOrigin(req);

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challengeRecord.challenge,
      expectedOrigin: [origin, `http://${req.get('host')}`, `https://${req.get('host')}`],
      expectedRPID: rpID,
      credential: {
        id: authenticator.credentialId,
        publicKey: new Uint8Array(Buffer.from(authenticator.publicKey, 'base64url')),
        counter: authenticator.counter,
        transports: authenticator.transports ? JSON.parse(authenticator.transports) : undefined,
      },
      requireUserVerification: false,
    });

    if (verification.verified) {
      db.updateAuthenticatorCounter(authenticator.credentialId, verification.authenticationInfo.newCounter);
      webAuthnChallenges.delete(challengeKey);

      const token = `btoken_${barber.id}_${Date.now()}`;
      barberSessions.set(token, barber.id);

      return res.json({
        success: true,
        token,
        barber: sanitizeBarber(barber)
      });
    } else {
      return res.status(401).json({ success: false, error: 'Verificación biométrica rechazada.' });
    }
  } catch (err: any) {
    console.error('[WebAuthn] Error verifying authentication:', err);
    res.status(400).json({ error: err.message || 'Error en la verificación biométrica.' });
  }
});

// GET registered devices for current barber
app.get('/api/auth/webauthn/devices', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const reqBarberId = barberSessions.get(token) || String(req.headers['x-barber-id'] || '');
  const barber = reqBarberId ? db.getBarberByParam(reqBarberId) : null;

  if (!barber) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  const devices = db.getAuthenticatorsForBarber(barber.id);
  res.json({
    devices: devices.map(d => ({
      id: d.id,
      deviceName: d.deviceName,
      deviceType: d.deviceType,
      createdAt: d.createdAt
    }))
  });
});

// DELETE a registered device for current barber
app.delete('/api/auth/webauthn/devices/:id', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const reqBarberId = barberSessions.get(token) || String(req.headers['x-barber-id'] || '');
  const barber = reqBarberId ? db.getBarberByParam(reqBarberId) : null;

  if (!barber) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  const { id } = req.params;
  const deleted = db.deleteAuthenticator(id, barber.id);
  res.json({ success: deleted });
});

// Barber Management Endpoints (Public sanitized list: only approved barbers by default)
app.get('/api/barbers', (req, res) => {
  const { all } = req.query;
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim() || String(req.query.token || '');
  const callerBarberId = barberSessions.get(token) || String(req.headers['x-barber-id'] || '');
  const caller = callerBarberId ? db.getBarberByParam(callerBarberId) : null;

  // If all barbers are requested by an authenticated barber or admin
  if (all === 'true' && (caller || token)) {
    return res.json(db.getAllBarbers().map(sanitizeBarber));
  }

  // Public booking view: only approved and active barbers
  const approved = db.getAllBarbers('aprobado').filter(b => b.active).map(sanitizeBarber);
  res.json(approved);
});

// PATCH update barber approval status (Admin Superuser only)
app.patch('/api/barbers/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['aprobado', 'pendiente', 'pausado', 'rechazado'].includes(status)) {
    return res.status(400).json({ error: 'Estado inválido. Debe ser aprobado, pendiente, pausado o rechazado.' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim() || String(req.query.token || '');
  const callerBarberId = barberSessions.get(token) || String(req.headers['x-barber-id'] || '');
  const caller = callerBarberId ? db.getBarberByParam(callerBarberId) : null;
  const isMasterToken = token && token.startsWith('barber_session_');

  if (!isMasterToken && (!caller || (!caller.isAdmin && caller.id !== 'alejandro'))) {
    return res.status(403).json({ error: 'Solo un administrador tiene potestad para validar o cambiar el estado de las cuentas de barberos.' });
  }

  if (status === 'pausado' && (id === 'alejandro' || (caller && caller.id === id))) {
    return res.status(400).json({ error: 'No es posible pausar la cuenta del superusuario principal.' });
  }

  // If paused or rejected, invalidate their active sessions immediately
  if (status === 'pausado' || status === 'rechazado') {
    for (const [sToken, bId] of barberSessions.entries()) {
      if (bId === id) {
        barberSessions.delete(sToken);
      }
    }
  }

  const updated = db.updateBarberStatus(id, status);
  if (!updated) {
    return res.status(404).json({ error: 'Barbero no encontrado.' });
  }

  res.json({
    success: true,
    barber: sanitizeBarber(updated),
    barbers: db.getAllBarbers().map(sanitizeBarber)
  });
});

app.post('/api/barbers', (req, res) => {
  const barberData = req.body;
  if (!barberData.name) {
    return res.status(400).json({ error: 'El nombre del barbero es obligatorio' });
  }

  const cleanName = barberData.name.trim();
  const slug = (barberData.slug || cleanName.toLowerCase().replace(/[^a-z0-9]/g, '-')).replace(/^-+|-+$/g, '') || `barbero-${Date.now()}`;
  const id = barberData.id || slug;
  const existing = db.getBarberByParam(id);

  const barberProfile: BarberProfile = {
    id,
    slug,
    name: cleanName,
    shopName: barberData.shopName || `${cleanName} Studio`,
    role: barberData.role || 'Barbero Profesional',
    avatar: barberData.avatar || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
    phone: barberData.phone || '',
    email: barberData.email || '',
    active: barberData.active !== false,
    status: barberData.status || 'aprobado',
    isAdmin: Boolean(barberData.isAdmin)
  };

  if (existing) {
    db.updateBarber(existing.id, barberProfile);
  } else {
    db.createBarber(barberProfile);
  }

  res.json({ success: true, barber: barberProfile, barbers: db.getAllBarbers().map(sanitizeBarber) });
});

app.delete('/api/barbers/:id', (req, res) => {
  const { id } = req.params;
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim() || String(req.query.token || '');
  const callerBarberId = barberSessions.get(token) || String(req.headers['x-barber-id'] || '');
  const caller = callerBarberId ? db.getBarberByParam(callerBarberId) : null;
  const isMasterToken = token && token.startsWith('barber_session_');

  if (!isMasterToken && (!caller || (!caller.isAdmin && caller.id !== 'alejandro'))) {
    return res.status(403).json({ error: 'Solo un administrador tiene potestad para eliminar cuentas de barberos.' });
  }

  if (id === 'alejandro' || (caller && caller.id === id)) {
    return res.status(400).json({ error: 'No es posible eliminar la cuenta del superusuario principal.' });
  }

  // Invalidate any active session tokens for this barber
  for (const [sToken, bId] of barberSessions.entries()) {
    if (bId === id) {
      barberSessions.delete(sToken);
    }
  }

  const deleted = db.deleteBarber(id);
  if (!deleted) {
    return res.status(404).json({ error: 'Barbero no encontrado.' });
  }

  res.json({
    success: true,
    message: 'Cuenta de barbero eliminada exitosamente.',
    barbers: db.getAllBarbers().map(sanitizeBarber)
  });
});

// GET all bookings (partitioned strictly by barber for authenticated non-admin barbers)
app.get('/api/bookings', (req, res) => {
  const { date, barberId, barber } = req.query;
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim() || String(req.query.token || '');
  const callerBarberId = barberSessions.get(token) || String(req.headers['x-barber-id'] || '');
  const caller = callerBarberId ? db.getBarberByParam(callerBarberId) : null;

  let effectiveBarberId = String(barberId || barber || '').trim();
  // If caller is an authenticated regular barber (non-admin), force scope strictly to their own barber ID
  if (caller && !caller.isAdmin && caller.id !== 'alejandro') {
    effectiveBarberId = caller.id;
  }

  const bookingsList = db.getBookings({
    barberId: effectiveBarberId || undefined,
    date: date ? String(date) : undefined
  });
  res.json(bookingsList);
});

// POST batch-create/enable slots defined by barber from the app
app.post('/api/slots/batch-create', async (req, res) => {
  try {
    const { date, dates, times, barberId, replaceDayMode } = req.body;
    const targetDates: string[] = Array.isArray(dates) && dates.length > 0 
      ? dates 
      : (date ? [date] : []);

    if (!targetDates.length || !Array.isArray(times) || !times.length) {
      return res.status(400).json({ error: 'Debes seleccionar al menos una fecha y al menos un horario para habilitar.' });
    }

    const targetBarber = db.getBarberByParam(barberId) || db.getAllBarbers()[0];
    if (!targetBarber) {
      return res.status(404).json({ error: 'Barbero no encontrado.' });
    }
    if ((targetBarber.status && targetBarber.status !== 'aprobado') || targetBarber.active === false) {
      return res.status(403).json({ error: 'Tu cuenta aún no ha sido aprobada o se encuentra pausada para publicar horarios.' });
    }
    const bId = targetBarber.id;

    // Save in SQLite DB (atomic transaction strictly scoped to this barber)
    const result = db.batchCreateSlots(bId, targetDates, times, Boolean(replaceDayMode));

    res.json({
      success: true,
      message: `¡Horarios habilitados exitosamente! ${times.length} turno(s) guardados en tu agenda para ${targetDates.length} día(s).`,
      dates: targetDates,
      timesCount: times.length,
      totalSlots: result.totalCreated
    });
  } catch (err: any) {
    console.error('Error in /api/slots/batch-create:', err);
    res.status(500).json({ error: err.message || 'Error al guardar la agenda de horarios' });
  }
});

// POST release/unbook a slot in DB (for barber)
app.post('/api/slots/release', (req, res) => {
  const { date, time, barberId } = req.body;
  if (!date || !time) {
    return res.status(400).json({ error: 'Faltan parámetros date y time' });
  }

  const targetBarber = db.getBarberByParam(barberId) || db.getAllBarbers()[0];
  const bId = targetBarber.id;
  const normalizedDate = normalizeSlotDate(date);

  db.releaseSlot(bId, normalizedDate, time);
  res.json({ success: true, message: 'Horario liberado exitosamente.' });
});

// POST delete a specific slot from Barber Agenda
app.post('/api/slots/delete', (req, res) => {
  const { date, time, barberId } = req.body;
  if (!date || !time) {
    return res.status(400).json({ error: 'Faltan parámetros date y time' });
  }

  const targetBarber = db.getBarberByParam(barberId) || db.getAllBarbers()[0];
  const bId = targetBarber.id;
  const normalizedDate = normalizeSlotDate(date);

  db.deleteSlot(bId, normalizedDate, time);
  res.json({ success: true, message: `Horario ${time} retirado.` });
});

// POST clear all available slots for a given day (Limpiar día completo)
app.post('/api/slots/clear-day', (req, res) => {
  const { date, forceAll, barberId } = req.body;
  if (!date) {
    return res.status(400).json({ error: 'Falta parámetro date' });
  }

  const targetBarber = db.getBarberByParam(barberId) || db.getAllBarbers()[0];
  const bId = targetBarber.id;
  const normalizedDate = normalizeSlotDate(date);

  db.clearDaySlots(bId, normalizedDate, Boolean(forceAll));
  res.json({ success: true, message: `Día ${normalizedDate} limpiado.` });
});

// POST new booking
app.post('/api/bookings', async (req, res) => {
  try {
    const { clientName, clientEmail, clientPhone, clientNotes, preferredStyle, date, startTime, serviceIds, barberId } = req.body;

    if (!clientName || !clientPhone || !date || !startTime) {
      return res.status(400).json({ error: 'Faltan campos obligatorios para la reserva (nombre, teléfono, fecha u hora).' });
    }

    const targetBarber = db.getBarberByParam(barberId) || db.getAllBarbers('aprobado')[0];
    if (!targetBarber) {
      return res.status(404).json({ error: 'No se encontró un barbero disponible.' });
    }
    if (targetBarber.status === 'pausado' || targetBarber.active === false) {
      return res.status(403).json({ error: 'La agenda de este barbero se encuentra temporalmente pausada.' });
    }
    if (targetBarber.status && targetBarber.status !== 'aprobado') {
      return res.status(403).json({ error: 'Este barbero está en proceso de validación y aún no recibe citas.' });
    }

    const assignedBarberId = targetBarber.id;
    const assignedBarberName = targetBarber.name;

    const normalizedBookingDate = normalizeSlotDate(date);

    // Validate that slot is not in the past
    if (isSlotInThePast(normalizedBookingDate, startTime)) {
      return res.status(400).json({ error: 'No es posible reservar un turno en un horario que ya ha pasado.' });
    }

    const shopConfig = db.getConfig();

    // Default to general appointment if no services were picked
    const rawServiceIds = Array.isArray(serviceIds) && serviceIds.length ? serviceIds : ['turno_general'];
    let matchedServices = shopConfig.services.filter(s => rawServiceIds.includes(s.id));
    if (!matchedServices.length) {
      matchedServices = [{
        id: 'turno_general',
        name: 'Turno en Barbería',
        durationMinutes: 45,
        price: 15000,
        description: 'Reserva de turno',
        active: true
      }];
    }

    const totalDurationMinutes = matchedServices.reduce((sum, s) => sum + (s.durationMinutes || 45), 0);
    const totalPrice = matchedServices.reduce((sum, s) => sum + (s.price || 0), 0);

    // Calculate end time
    const [startHour, startMin] = startTime.split(':').map(Number);
    const totalMinutes = startHour * 60 + startMin + totalDurationMinutes;
    const endHour = Math.floor(totalMinutes / 60);
    const endMinutes = totalMinutes % 60;
    const endTime = `${String(endHour).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;

    // Generate ticket ID
    const randomCode = Math.floor(1000 + Math.random() * 9000);
    const bookingId = `BARB-${randomCode}`;

    // Local collision check in SQLite DB strictly for this barber
    const existingBookings = db.getBookings({ barberId: assignedBarberId, date: normalizedBookingDate });
    const hasCollision = existingBookings.some(b => {
      if (b.status === 'cancelada') return false;
      const [bh, bm] = b.startTime.split(':').map(Number);
      const [beh, bem] = b.endTime.split(':').map(Number);
      const bStart = bh * 60 + bm;
      const bEnd = beh * 60 + bem;
      const newStart = startHour * 60 + startMin;
      const newEnd = totalMinutes;
      return (newStart < bEnd && newEnd > bStart);
    });

    if (hasCollision) {
      return res.status(409).json({ error: 'El horario seleccionado ya no está disponible con este barbero. Por favor elige otro horario.' });
    }

    const newBooking: Booking = {
      id: bookingId,
      createdAt: new Date().toISOString(),
      clientName: clientName.trim(),
      clientEmail: (clientEmail && clientEmail.trim()) ? clientEmail.trim() : `${clientPhone.replace(/\D/g, '') || 'cliente'}@barberturnos.local`,
      clientPhone: clientPhone.trim(),
      clientNotes: clientNotes ? clientNotes.trim() : '',
      preferredStyle: preferredStyle || '',
      barberId: assignedBarberId,
      barberName: assignedBarberName,
      date: normalizedBookingDate,
      startTime,
      endTime,
      serviceIds: rawServiceIds,
      serviceNames: matchedServices.map(s => s.name),
      totalPrice,
      totalDurationMinutes,
      status: 'confirmada',
      emailSent: false
    };

    // Save in SQLite DB (both in bookings and barber_slots table)
    db.createBooking(newBooking);

    // Respond immediately to the client (instant confirmation!)
    res.status(201).json({
      success: true,
      booking: newBooking
    });

    // Run notifications in background asynchronously without blocking the client booking screen
    (async () => {
      try {
        const emailResult = await dispatchConfirmationEmail(newBooking, shopConfig);
        newBooking.emailSent = emailResult.sent || emailResult.mode === 'simulation';
        newBooking.emailSentAt = emailResult.log.sentAt;
        if (emailResult.error) {
          newBooking.emailError = emailResult.error;
        }
        db.createBooking(newBooking);
        db.addEmailLog(emailResult.log);
      } catch (err: any) {
        console.warn('[Email] Error in background email dispatch:', err?.message);
      }

      // Dispatch real-time Web Push notification to the assigned barber
      sendPushNotificationToBarber(assignedBarberId, {
        title: '💈 ¡Nuevo Turno Reservado!',
        body: `${newBooking.clientName} ha reservado para el ${newBooking.date} a las ${newBooking.startTime} hs (${newBooking.serviceNames.join(', ')}).`,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        data: {
          bookingId: newBooking.id,
          url: '/?view=dashboard'
        }
      }).catch(pushErr => console.warn('[Push] Error sending booking notification to barber:', pushErr?.message));
    })();
  } catch (err: any) {
    console.error('Error creating booking:', err);
    res.status(500).json({ error: 'Error interno al procesar la reserva.' });
  }
});

// PATCH booking status
app.patch('/api/bookings/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (status) {
    db.updateBookingStatus(id, status);
  }

  const all = db.getBookings();
  const booking = all.find(b => b.id === id);
  if (!booking) {
    return res.status(404).json({ error: 'Cita no encontrada.' });
  }

  res.json({ success: true, booking });
});

// POST resend confirmation email or send reminder
app.post('/api/bookings/:id/send-email', async (req, res) => {
  const { id } = req.params;
  const all = db.getBookings();
  const booking = all.find(b => b.id === id);
  if (!booking) {
    return res.status(404).json({ error: 'Cita no encontrada.' });
  }

  const shopConfig = db.getConfig();
  const result = await dispatchConfirmationEmail(booking, shopConfig);
  res.json({ success: true, result });
});

// GET email logs (for reviewing sent confirmation emails in the dashboard)
app.get('/api/email-logs', (req, res) => {
  res.json(db.getEmailLogs());
});

// ----------------------------------------------------
// PUSH NOTIFICATIONS & EMAIL DIAGNOSTICS ENDPOINTS
// ----------------------------------------------------

// GET public VAPID key for browser subscription
app.get('/api/push/public-key', (req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

// POST subscribe a barber device to Web Push
app.post('/api/push/subscribe', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const reqBarberId = barberSessions.get(token) || String(req.headers['x-barber-id'] || req.body.barberId || '');
  const barber = reqBarberId ? db.getBarberByParam(reqBarberId) : db.getAllBarbers()[0];

  if (!barber) {
    return res.status(401).json({ error: 'Debes iniciar sesión para activar las notificaciones push en este dispositivo.' });
  }

  const { subscription, deviceName } = req.body;
  if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return res.status(400).json({ error: 'Objeto de suscripción Push inválido.' });
  }

  const saved = db.savePushSubscription(barber.id, subscription, deviceName || 'Dispositivo');
  res.json({
    success: true,
    message: 'Dispositivo suscrito exitosamente a notificaciones push.',
    subscription: saved
  });
});

// POST unsubscribe a device
app.post('/api/push/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) {
    return res.status(400).json({ error: 'Se requiere el endpoint de la suscripción.' });
  }
  const deleted = db.deletePushSubscription(endpoint);
  res.json({ success: true, deleted });
});

// POST send a test push notification to barber's active devices
app.post('/api/push/test', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const reqBarberId = barberSessions.get(token) || String(req.headers['x-barber-id'] || req.body.barberId || '');
    const barber = reqBarberId ? db.getBarberByParam(reqBarberId) : db.getAllBarbers()[0];

    if (!barber) {
      return res.status(401).json({ error: 'Debes iniciar sesión para enviar una prueba push.' });
    }

    const subs = db.getPushSubscriptionsForBarber(barber.id);
    const result = await sendPushNotificationToBarber(barber.id, {
      title: '💈 Notificación de Prueba BarberTurnos',
      body: `¡Hola ${barber.name}! Las notificaciones push en tiempo real están funcionando perfectamente en este dispositivo.`,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      data: {
        url: '/?view=dashboard',
        timestamp: Date.now()
      }
    });

    res.json({
      success: true,
      message: subs.length > 0 
        ? `Notificación enviada a ${result.sentCount} de ${subs.length} dispositivo(s) registrado(s).`
        : 'No hay dispositivos suscritos para este barbero. Primero presiona "Activar Notificaciones en este Dispositivo".',
      registeredDevices: subs.length,
      ...result
    });
  } catch (err: any) {
    console.error('Error in /api/push/test:', err);
    res.status(500).json({ error: err.message || 'Error al procesar la notificación push de prueba.' });
  }
});

// GET email service status (centralized account info)
app.get('/api/email/status', (req, res) => {
  const transporter = getEmailTransporter();
  const currentConfig = db.getConfig();
  const isSmtp = Boolean(transporter && currentConfig.autoSendEmail);
  const host = process.env.SMTP_HOST || (process.env.SMTP_USER?.includes('@gmail.com') ? 'smtp.gmail.com' : undefined);
  const user = process.env.SMTP_USER;
  const fromAddr = process.env.SMTP_FROM || `"${currentConfig.shopName}" <${process.env.SMTP_USER || currentConfig.email}>`;

  res.json({
    mode: isSmtp ? 'smtp' : 'simulation',
    autoSendEmail: currentConfig.autoSendEmail,
    configured: Boolean(user),
    from: fromAddr,
    host: host || 'Modo Simulación (Consola / Logs)',
    user: user ? user.replace(/(.{2})(.*)(@.*)/, '$1***$3') : 'No configurado',
    recentLogsCount: db.getEmailLogs().length
  });
});

// POST send a test email from centralized account
app.post('/api/email/test', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const reqBarberId = barberSessions.get(token) || String(req.headers['x-barber-id'] || req.body.barberId || '');
  const barber = reqBarberId ? db.getBarberByParam(reqBarberId) : db.getAllBarbers()[0];

  const targetEmail = req.body.email || barber?.email || process.env.SMTP_USER;
  if (!targetEmail) {
    return res.status(400).json({ error: 'Ingresa un correo electrónico de destino para la prueba.' });
  }

  const currentConfig = db.getConfig();
  const testBooking: Booking = {
    id: `TEST-${Math.floor(1000 + Math.random() * 9000)}`,
    createdAt: new Date().toISOString(),
    clientName: 'Cliente de Prueba',
    clientEmail: targetEmail,
    clientPhone: '+57 300 123 4567',
    clientNotes: 'Prueba de entrega de correo centralizado',
    barberId: barber?.id || 'alejandro',
    barberName: barber?.name || 'Alejandro',
    date: new Date().toISOString().split('T')[0],
    startTime: '10:00',
    endTime: '10:45',
    serviceIds: ['corte_clasico'],
    serviceNames: ['Corte Clásico / Sencillo'],
    totalPrice: 18000,
    totalDurationMinutes: 45,
    status: 'confirmada',
    emailSent: false
  };

  const emailResult = await dispatchConfirmationEmail(testBooking, currentConfig);
  res.json({
    success: emailResult.sent || emailResult.mode === 'simulation',
    result: emailResult,
    targetEmail
  });
});

// ----------------------------------------------------
// VITE MIDDLEWARE & SERVER STARTUP
// ----------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`💈 BarberTurnos server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
