import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { 
  BarberShopConfig, 
  BarberProfile, 
  BarberStatus,
  Booking, 
  BookingStatus, 
  EmailRecord, 
  Service, 
  BarberSlot, 
  BarberDateOption,
  BarberAuthenticator,
  BarberPushSubscription 
} from '../types';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_FILE = path.join(DATA_DIR, 'barberturnos.db');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const BOOKINGS_FILE = path.join(DATA_DIR, 'bookings.json');
const APP_SLOTS_FILE = path.join(DATA_DIR, 'app_slots.json');
const EMAIL_LOGS_FILE = path.join(DATA_DIR, 'email-logs.json');

// Initialize SQLite database instance
const db = new DatabaseSync(DB_FILE);

// Set performance pragmas: WAL mode for fast concurrency, foreign keys enabled
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
`);

// Create Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS barbers (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    shopName TEXT,
    role TEXT,
    avatar TEXT,
    phone TEXT,
    email TEXT UNIQUE,
    password TEXT,
    active INTEGER DEFAULT 1,
    status TEXT DEFAULT 'aprobado',
    isAdmin INTEGER DEFAULT 0,
    createdAt TEXT
  );

  CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY,
    barberId TEXT,
    name TEXT NOT NULL,
    description TEXT,
    durationMinutes INTEGER DEFAULT 30,
    price INTEGER DEFAULT 15000,
    popular INTEGER DEFAULT 0,
    category TEXT DEFAULT 'corte',
    active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS barber_slots (
    id TEXT PRIMARY KEY,
    barberId TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DISPONIBLE',
    clientName TEXT,
    clientPhone TEXT,
    clientEmail TEXT,
    service TEXT,
    price INTEGER,
    notes TEXT,
    rawDate TEXT,
    rawTime TEXT,
    rowIndex INTEGER,
    createdAt TEXT,
    UNIQUE(barberId, date, time)
  );
  CREATE INDEX IF NOT EXISTS idx_slots_barber_date ON barber_slots(barberId, date);

  CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    barberId TEXT NOT NULL,
    barberName TEXT,
    clientName TEXT NOT NULL,
    clientEmail TEXT,
    clientPhone TEXT NOT NULL,
    clientNotes TEXT,
    preferredStyle TEXT,
    date TEXT NOT NULL,
    startTime TEXT NOT NULL,
    endTime TEXT NOT NULL,
    serviceIds TEXT,
    serviceNames TEXT,
    totalPrice INTEGER,
    totalDurationMinutes INTEGER,
    status TEXT DEFAULT 'confirmada',
    emailSent INTEGER DEFAULT 0,
    emailSentAt TEXT,
    emailError TEXT,
    createdAt TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_bookings_barber_date ON bookings(barberId, date);

  CREATE TABLE IF NOT EXISTS email_logs (
    id TEXT PRIMARY KEY,
    bookingId TEXT,
    toEmail TEXT,
    subject TEXT,
    sentAt TEXT,
    status TEXT,
    htmlContent TEXT,
    previewText TEXT,
    error TEXT
  );

  CREATE TABLE IF NOT EXISTS shop_config (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS barber_authenticators (
    id TEXT PRIMARY KEY,
    barberId TEXT NOT NULL,
    credentialId TEXT UNIQUE NOT NULL,
    publicKey TEXT NOT NULL,
    counter INTEGER DEFAULT 0,
    transports TEXT,
    deviceType TEXT,
    deviceName TEXT,
    createdAt TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_auth_barberId ON barber_authenticators(barberId);
  CREATE INDEX IF NOT EXISTS idx_auth_credId ON barber_authenticators(credentialId);

  CREATE TABLE IF NOT EXISTS barber_push_subscriptions (
    id TEXT PRIMARY KEY,
    barberId TEXT NOT NULL,
    endpoint TEXT UNIQUE NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    deviceName TEXT,
    createdAt TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_push_barberId ON barber_push_subscriptions(barberId);
  CREATE INDEX IF NOT EXISTS idx_push_endpoint ON barber_push_subscriptions(endpoint);
`);

// Migration: Ensure shopName, status and isAdmin columns exist on barbers table
try {
  db.exec('ALTER TABLE barbers ADD COLUMN shopName TEXT;');
} catch {
  // column already exists
}
try {
  db.exec("ALTER TABLE barbers ADD COLUMN status TEXT DEFAULT 'aprobado';");
} catch {
  // column already exists
}
try {
  db.exec('ALTER TABLE barbers ADD COLUMN isAdmin INTEGER DEFAULT 0;');
} catch {
  // column already exists
}

/**
 * Helper to read JSON file safely
 */
function readJsonSafely<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
  }
  return fallback;
}

/**
 * Seed SQLite database from existing JSON files on first run if database is empty
 */
function seedDatabase() {
  // Check if barbers table is empty
  const countBarbers = (db.prepare('SELECT count(*) as count FROM barbers').get() as any)?.count || 0;
  
  if (countBarbers === 0) {
    console.log('[SQLite DB] Migrando y sembrando datos iniciales en la base de datos...');
    const configData = readJsonSafely<any>(CONFIG_FILE, null);
    
    if (configData) {
      // 1. Save config
      db.prepare('INSERT OR REPLACE INTO shop_config (id, data) VALUES (?, ?)').run('main', JSON.stringify(configData));

      // 2. Insert Barbers
      if (Array.isArray(configData.barbers)) {
        const insertBarber = db.prepare(`
          INSERT OR REPLACE INTO barbers 
          (id, slug, name, shopName, role, avatar, phone, email, password, active, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const b of configData.barbers) {
          const defaultShop = b.id === 'carlos' ? 'Mendoza Barber Club' : 'Alejo Barber Studio';
          insertBarber.run(
            b.id,
            b.slug || b.id,
            b.name,
            b.shopName || defaultShop,
            b.role || 'Barbero Profesional',
            b.avatar || '',
            b.phone || '',
            b.email || '',
            b.password || 'barbero123',
            b.active ? 1 : 0,
            b.createdAt || new Date().toISOString()
          );
        }
      }

      // 3. Insert Services
      if (Array.isArray(configData.services)) {
        const insertService = db.prepare(`
          INSERT OR REPLACE INTO services 
          (id, barberId, name, description, durationMinutes, price, popular, category, active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const s of configData.services) {
          insertService.run(
            s.id,
            null, // Shop default available to all
            s.name,
            s.description || '',
            s.durationMinutes || 30,
            s.price || 15000,
            s.popular ? 1 : 0,
            s.category || 'corte',
            s.active ? 1 : 0
          );
        }
      }
    }

    // 4. Migrate Bookings
    const bookingsData = readJsonSafely<Booking[]>(BOOKINGS_FILE, []);
    if (Array.isArray(bookingsData) && bookingsData.length > 0) {
      const insertBooking = db.prepare(`
        INSERT OR REPLACE INTO bookings 
        (id, barberId, barberName, clientName, clientEmail, clientPhone, clientNotes, preferredStyle, date, startTime, endTime, serviceIds, serviceNames, totalPrice, totalDurationMinutes, status, emailSent, emailSentAt, emailError, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const b of bookingsData) {
        insertBooking.run(
          b.id,
          b.barberId || 'alejandro',
          b.barberName || 'Alejandro Barber',
          b.clientName,
          b.clientEmail || '',
          b.clientPhone || '',
          b.clientNotes || '',
          b.preferredStyle || '',
          b.date,
          b.startTime,
          b.endTime,
          JSON.stringify(b.serviceIds || []),
          JSON.stringify(b.serviceNames || []),
          b.totalPrice || 0,
          b.totalDurationMinutes || 30,
          b.status || 'confirmada',
          b.emailSent ? 1 : 0,
          b.emailSentAt || null,
          b.emailError || null,
          b.createdAt || new Date().toISOString()
        );
      }
    }

    // 5. Migrate Slots
    const slotsData = readJsonSafely<BarberSlot[]>(APP_SLOTS_FILE, []);
    if (Array.isArray(slotsData) && slotsData.length > 0) {
      const insertSlot = db.prepare(`
        INSERT OR REPLACE INTO barber_slots
        (id, barberId, date, time, status, clientName, clientPhone, clientEmail, service, price, notes, rawDate, rawTime, rowIndex, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const s of slotsData) {
        const barberId = (s as any).barberId || 'alejandro';
        insertSlot.run(
          `${barberId}_${s.date}_${s.time}`,
          barberId,
          s.date,
          s.time,
          s.status || 'DISPONIBLE',
          s.clientName || s.client || '',
          s.clientPhone || s.phone || '',
          s.clientEmail || s.email || '',
          s.service || '',
          typeof s.price === 'number' ? s.price : 0,
          s.notes || '',
          s.rawDate || s.date,
          s.rawTime || s.time,
          s.rowIndex || null,
          new Date().toISOString()
        );
      }
    }

    // 6. Migrate Email Logs
    const emailsData = readJsonSafely<EmailRecord[]>(EMAIL_LOGS_FILE, []);
    if (Array.isArray(emailsData) && emailsData.length > 0) {
      const insertEmail = db.prepare(`
        INSERT OR REPLACE INTO email_logs
        (id, bookingId, toEmail, subject, sentAt, status, htmlContent, previewText, error)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const em of emailsData) {
        insertEmail.run(
          em.id,
          em.bookingId,
          em.to,
          em.subject,
          em.sentAt,
          em.status,
          em.htmlContent,
          em.previewText,
          em.error || null
        );
      }
    }
    console.log('[SQLite DB] ¡Migración completada exitosamente a SQLite!');
  }
}

// Run initial seed if needed
seedDatabase();

// Ensure default barbers in database have approved status and admin role if missing
try {
  db.prepare(`UPDATE barbers SET status = 'aprobado' WHERE status IS NULL OR status = ''`).run();
  db.prepare(`UPDATE barbers SET isAdmin = 1 WHERE id = 'alejandro'`).run();
} catch (e) {
  console.warn('[SQLite DB] Warning updating default barbers admin/status:', e);
}

// =========================================================================
// BARBER MANAGEMENT METHODS
// =========================================================================

export function getBarberByParam(param?: string): BarberProfile | null {
  if (!param) return null;
  const clean = String(param).trim().toLowerCase();
  const row = db.prepare(`
    SELECT * FROM barbers 
    WHERE lower(id) = ? OR lower(slug) = ? OR lower(email) = ?
    LIMIT 1
  `).get(clean, clean, clean) as any;

  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shopName: row.shopName || undefined,
    role: row.role || 'Barbero Profesional',
    avatar: row.avatar,
    phone: row.phone,
    email: row.email,
    password: row.password,
    active: Boolean(row.active),
    status: (row.status || 'aprobado') as BarberStatus,
    isAdmin: Boolean(row.isAdmin),
    createdAt: row.createdAt
  };
}

export const getBarberById = getBarberByParam;

export function getAllBarbers(filterStatus?: BarberStatus): BarberProfile[] {
  let query = 'SELECT * FROM barbers';
  const params: any[] = [];
  if (filterStatus) {
    query += ' WHERE status = ?';
    params.push(filterStatus);
  }
  query += ' ORDER BY createdAt ASC';

  const rows = db.prepare(query).all(...params) as any[];
  return rows.map(row => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    shopName: row.shopName || undefined,
    role: row.role || 'Barbero Profesional',
    avatar: row.avatar,
    phone: row.phone,
    email: row.email,
    password: row.password,
    active: Boolean(row.active),
    status: (row.status || 'aprobado') as BarberStatus,
    isAdmin: Boolean(row.isAdmin),
    createdAt: row.createdAt
  }));
}

export function createBarber(barber: BarberProfile): BarberProfile {
  db.prepare(`
    INSERT INTO barbers (id, slug, name, shopName, role, avatar, phone, email, password, active, status, isAdmin, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    barber.id,
    barber.slug,
    barber.name,
    barber.shopName || `${barber.name} Studio`,
    barber.role || 'Barbero Profesional',
    barber.avatar || '',
    barber.phone || '',
    barber.email || '',
    barber.password || 'barbero123',
    barber.active ? 1 : 0,
    barber.status || 'aprobado',
    barber.isAdmin ? 1 : 0,
    barber.createdAt || new Date().toISOString()
  );
  return barber;
}

export function updateBarber(id: string, updates: Partial<BarberProfile>): BarberProfile | null {
  const current = getBarberByParam(id);
  if (!current) return null;

  const merged = { ...current, ...updates };
  db.prepare(`
    UPDATE barbers 
    SET name = ?, shopName = ?, role = ?, avatar = ?, phone = ?, email = ?, password = ?, active = ?, status = ?, isAdmin = ?
    WHERE id = ?
  `).run(
    merged.name,
    merged.shopName !== undefined ? merged.shopName : (current.shopName || ''),
    merged.role || 'Barbero Profesional',
    merged.avatar || '',
    merged.phone !== undefined ? merged.phone : (current.phone || ''),
    merged.email || '',
    merged.password || '',
    merged.active ? 1 : 0,
    merged.status || 'aprobado',
    merged.isAdmin ? 1 : 0,
    current.id
  );
  return merged;
}

export function updateBarberStatus(id: string, status: BarberStatus): BarberProfile | null {
  const active = status === 'aprobado';
  return updateBarber(id, { status, active });
}

export function deleteBarber(id: string): boolean {
  // Clean up any published slots, authenticators and bookings
  try {
    db.prepare('DELETE FROM barber_slots WHERE barberId = ?').run(id);
    db.prepare('DELETE FROM barber_authenticators WHERE barberId = ?').run(id);
  } catch (err) {
    console.warn('Warning cleaning barber_slots/authenticators for', id, err);
  }
  const result = db.prepare('DELETE FROM barbers WHERE id = ? OR slug = ?').run(id, id);
  return result.changes > 0;
}

// =========================================================================
// SLOTS & AGENDA METHODS (STRICTLY PARTITIONED BY BARBER)
// =========================================================================

export function getSlotsForBarber(barberId: string, date?: string): BarberSlot[] {
  let query = 'SELECT * FROM barber_slots WHERE barberId = ?';
  const params: any[] = [barberId];

  if (date) {
    query += ' AND date = ?';
    params.push(date);
  }
  query += ' ORDER BY date ASC, time ASC';

  const rows = db.prepare(query).all(...params) as any[];
  return rows.map(r => ({
    date: r.date,
    time: r.time,
    status: r.status as any,
    client: r.clientName || undefined,
    clientName: r.clientName || undefined,
    phone: r.clientPhone || undefined,
    clientPhone: r.clientPhone || undefined,
    email: r.clientEmail || undefined,
    clientEmail: r.clientEmail || undefined,
    service: r.service || undefined,
    price: r.price || undefined,
    notes: r.notes || undefined,
    rowIndex: r.rowIndex || undefined,
    rawTime: r.rawTime || r.time,
    rawDate: r.rawDate || r.date
  }));
}

export function getAvailableDatesForBarber(barberId: string, minDate: string, minTime?: string): BarberDateOption[] {
  const currentTime = minTime || '00:00';
  const rows = db.prepare(`
    SELECT date,
           count(*) as totalSlots,
           sum(CASE WHEN status = 'DISPONIBLE' AND (date > ? OR time > ?) THEN 1 ELSE 0 END) as availableSlots
    FROM barber_slots
    WHERE barberId = ? AND date >= ?
    GROUP BY date
    ORDER BY date ASC
  `).all(minDate, currentTime, barberId, minDate) as any[];

  return rows.map(r => {
    const parts = r.date.split('-');
    let label = r.date;
    let dayName = '';
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      dayName = dayNames[d.getDay()] || '';
      label = `${dayName}, ${d.getDate()} ${monthNames[d.getMonth()] || ''}`;
    }
    return {
      date: r.date,
      label,
      dayName,
      totalSlots: Number(r.totalSlots) || 0,
      availableSlots: Number(r.availableSlots) || 0
    };
  });
}

export function batchCreateSlots(
  barberId: string, 
  dates: string[], 
  times: string[], 
  replaceDayMode = false
): { totalCreated: number } {
  let count = 0;

  // Run in a single transaction for maximum speed and atomicity
  db.exec('BEGIN TRANSACTION');
  try {
    for (const d of dates) {
      if (replaceDayMode) {
        // Remove existing DISPONIBLE slots not in the times list for this day
        db.prepare(`
          DELETE FROM barber_slots 
          WHERE barberId = ? AND date = ? AND status = 'DISPONIBLE'
        `).run(barberId, d);
      }

      const insertSlot = db.prepare(`
        INSERT INTO barber_slots (id, barberId, date, time, status, createdAt)
        VALUES (?, ?, ?, ?, 'DISPONIBLE', ?)
        ON CONFLICT(barberId, date, time) DO UPDATE SET
          status = CASE WHEN barber_slots.status != 'RESERVADO' THEN 'DISPONIBLE' ELSE barber_slots.status END
      `);

      for (const t of times) {
        const id = `${barberId}_${d}_${t}`;
        insertSlot.run(id, barberId, d, t, new Date().toISOString());
        count++;
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return { totalCreated: count };
}

export function releaseSlot(barberId: string, date: string, time: string): boolean {
  const result = db.prepare(`
    UPDATE barber_slots 
    SET status = 'DISPONIBLE', clientName = NULL, clientPhone = NULL, clientEmail = NULL, service = NULL, price = NULL, notes = NULL
    WHERE barberId = ? AND date = ? AND time = ?
  `).run(barberId, date, time);

  // Also cancel any booking at this slot
  db.prepare(`
    UPDATE bookings 
    SET status = 'cancelada' 
    WHERE barberId = ? AND date = ? AND startTime = ? AND status != 'cancelada'
  `).run(barberId, date, time);

  return result.changes > 0;
}

export function deleteSlot(barberId: string, date: string, time: string): boolean {
  const result = db.prepare(`
    DELETE FROM barber_slots 
    WHERE barberId = ? AND date = ? AND time = ?
  `).run(barberId, date, time);
  return result.changes > 0;
}

export function clearDaySlots(barberId: string, date: string, forceAll = false): boolean {
  let sql = 'DELETE FROM barber_slots WHERE barberId = ? AND date = ?';
  if (!forceAll) {
    sql += " AND status = 'DISPONIBLE'";
  }
  const result = db.prepare(sql).run(barberId, date);
  return result.changes > 0;
}

export function bookSlotInDb(barberId: string, booking: Booking): boolean {
  const slotId = `${barberId}_${booking.date}_${booking.startTime}`;
  
  // Update or insert slot as RESERVADO
  db.prepare(`
    INSERT INTO barber_slots (
      id, barberId, date, time, status, clientName, clientPhone, clientEmail, service, price, notes, createdAt
    ) VALUES (?, ?, ?, ?, 'RESERVADO', ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(barberId, date, time) DO UPDATE SET
      status = 'RESERVADO',
      clientName = excluded.clientName,
      clientPhone = excluded.clientPhone,
      clientEmail = excluded.clientEmail,
      service = excluded.service,
      price = excluded.price,
      notes = excluded.notes
  `).run(
    slotId,
    barberId,
    booking.date,
    booking.startTime,
    booking.clientName,
    booking.clientPhone,
    booking.clientEmail,
    booking.serviceNames.join(' + '),
    booking.totalPrice,
    booking.clientNotes || 'Cita web',
    new Date().toISOString()
  );

  return true;
}

// =========================================================================
// BOOKINGS METHODS
// =========================================================================

export function getBookings(filter?: { barberId?: string; date?: string }): Booking[] {
  let query = 'SELECT * FROM bookings WHERE 1=1';
  const params: any[] = [];

  if (filter?.barberId && filter.barberId !== 'todos') {
    query += ' AND (lower(barberId) = lower(?) OR lower(barberName) LIKE ?)';
    params.push(filter.barberId, `%${filter.barberId}%`);
  }
  if (filter?.date) {
    query += ' AND date = ?';
    params.push(filter.date);
  }
  query += ' ORDER BY date DESC, startTime DESC';

  const rows = db.prepare(query).all(...params) as any[];
  return rows.map(r => ({
    id: r.id,
    barberId: r.barberId,
    barberName: r.barberName,
    clientName: r.clientName,
    clientEmail: r.clientEmail || '',
    clientPhone: r.clientPhone,
    clientNotes: r.clientNotes || undefined,
    preferredStyle: r.preferredStyle || undefined,
    date: r.date,
    startTime: r.startTime,
    endTime: r.endTime,
    serviceIds: JSON.parse(r.serviceIds || '[]'),
    serviceNames: JSON.parse(r.serviceNames || '[]'),
    totalPrice: r.totalPrice,
    totalDurationMinutes: r.totalDurationMinutes,
    status: r.status as BookingStatus,
    emailSent: Boolean(r.emailSent),
    emailSentAt: r.emailSentAt || undefined,
    emailError: r.emailError || undefined,
    createdAt: r.createdAt
  }));
}

export function createBooking(b: Booking): Booking {
  db.prepare(`
    INSERT OR REPLACE INTO bookings (
      id, barberId, barberName, clientName, clientEmail, clientPhone, clientNotes, preferredStyle,
      date, startTime, endTime, serviceIds, serviceNames, totalPrice, totalDurationMinutes,
      status, emailSent, emailSentAt, emailError, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    b.id,
    b.barberId || 'alejandro',
    b.barberName || 'Barbero',
    b.clientName,
    b.clientEmail || '',
    b.clientPhone,
    b.clientNotes || '',
    b.preferredStyle || '',
    b.date,
    b.startTime,
    b.endTime,
    JSON.stringify(b.serviceIds || []),
    JSON.stringify(b.serviceNames || []),
    b.totalPrice,
    b.totalDurationMinutes,
    b.status || 'confirmada',
    b.emailSent ? 1 : 0,
    b.emailSentAt || null,
    b.emailError || null,
    b.createdAt || new Date().toISOString()
  );

  // Update the slot table to keep both in sync
  bookSlotInDb(b.barberId || 'alejandro', b);

  return b;
}

export function updateBookingStatus(id: string, status: BookingStatus): boolean {
  const result = db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, id);
  if (status === 'cancelada') {
    // If canceled, find the booking to release its slot
    const b = db.prepare('SELECT barberId, date, startTime FROM bookings WHERE id = ?').get(id) as any;
    if (b) {
      db.prepare(`
        UPDATE barber_slots 
        SET status = 'DISPONIBLE', clientName = NULL, clientPhone = NULL, clientEmail = NULL
        WHERE barberId = ? AND date = ? AND time = ?
      `).run(b.barberId, b.date, b.startTime);
    }
  }
  return result.changes > 0;
}

// =========================================================================
// SERVICES & CONFIG METHODS
// =========================================================================

export function getServicesForBarber(barberId?: string): Service[] {
  let query = 'SELECT * FROM services WHERE active = 1';
  const params: any[] = [];
  if (barberId) {
    query += ' AND (barberId = ? OR barberId IS NULL)';
    params.push(barberId);
  }
  const rows = db.prepare(query).all(...params) as any[];
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    description: r.description || '',
    durationMinutes: r.durationMinutes || 30,
    price: r.price || 15000,
    popular: Boolean(r.popular),
    category: r.category || 'corte',
    active: Boolean(r.active)
  }));
}

export function getConfig(): BarberShopConfig {
  const row = db.prepare('SELECT data FROM shop_config WHERE id = ?').get('main') as any;
  let cfg: BarberShopConfig;
  if (row && row.data) {
    cfg = JSON.parse(row.data);
  } else {
    cfg = readJsonSafely<BarberShopConfig>(CONFIG_FILE, {} as any);
  }

  // Always keep barbers list current from the database: only approved and active barbers for booking
  cfg.barbers = getAllBarbers('aprobado').filter(b => b.active);
  cfg.services = getServicesForBarber();
  return cfg;
}

export function updateConfig(newConfig: BarberShopConfig): BarberShopConfig {
  db.prepare('INSERT OR REPLACE INTO shop_config (id, data) VALUES (?, ?)').run('main', JSON.stringify(newConfig));
  return getConfig();
}

// =========================================================================
// EMAIL LOGS METHODS
// =========================================================================

export function addEmailLog(log: EmailRecord) {
  db.prepare(`
    INSERT INTO email_logs (id, bookingId, toEmail, subject, sentAt, status, htmlContent, previewText, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    log.id,
    log.bookingId,
    log.to,
    log.subject,
    log.sentAt,
    log.status,
    log.htmlContent,
    log.previewText,
    log.error || null
  );
}

export function getEmailLogs(limit = 50): EmailRecord[] {
  const rows = db.prepare('SELECT * FROM email_logs ORDER BY sentAt DESC LIMIT ?').all(limit) as any[];
  return rows.map(r => ({
    id: r.id,
    bookingId: r.bookingId,
    to: r.toEmail,
    subject: r.subject,
    sentAt: r.sentAt,
    status: r.status,
    htmlContent: r.htmlContent,
    previewText: r.previewText,
    error: r.error || undefined
  }));
}

// =========================================================================
// WEBAUTHN / BIOMETRIC AUTHENTICATORS
// =========================================================================

export function saveAuthenticator(auth: BarberAuthenticator): BarberAuthenticator {
  db.prepare(`
    INSERT OR REPLACE INTO barber_authenticators
    (id, barberId, credentialId, publicKey, counter, transports, deviceType, deviceName, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    auth.id,
    auth.barberId,
    auth.credentialId,
    auth.publicKey,
    auth.counter || 0,
    auth.transports || null,
    auth.deviceType || 'platform',
    auth.deviceName || 'Dispositivo Biométrico',
    auth.createdAt || new Date().toISOString()
  );
  return auth;
}

export function getAuthenticatorsForBarber(barberId: string): BarberAuthenticator[] {
  const rows = db.prepare(`
    SELECT * FROM barber_authenticators 
    WHERE barberId = ? 
    ORDER BY createdAt DESC
  `).all(barberId) as any[];

  return rows.map(r => ({
    id: r.id,
    barberId: r.barberId,
    credentialId: r.credentialId,
    publicKey: r.publicKey,
    counter: Number(r.counter) || 0,
    transports: r.transports || undefined,
    deviceType: r.deviceType || undefined,
    deviceName: r.deviceName || undefined,
    createdAt: r.createdAt
  }));
}

export function getAuthenticatorByCredentialId(credentialId: string): BarberAuthenticator | null {
  const r = db.prepare(`
    SELECT * FROM barber_authenticators 
    WHERE credentialId = ? 
    LIMIT 1
  `).get(credentialId) as any;

  if (!r) return null;
  return {
    id: r.id,
    barberId: r.barberId,
    credentialId: r.credentialId,
    publicKey: r.publicKey,
    counter: Number(r.counter) || 0,
    transports: r.transports || undefined,
    deviceType: r.deviceType || undefined,
    deviceName: r.deviceName || undefined,
    createdAt: r.createdAt
  };
}

export function updateAuthenticatorCounter(credentialId: string, counter: number): boolean {
  const res = db.prepare(`
    UPDATE barber_authenticators 
    SET counter = ? 
    WHERE credentialId = ?
  `).run(counter, credentialId);
  return res.changes > 0;
}

export function deleteAuthenticator(id: string, barberId: string): boolean {
  const res = db.prepare(`
    DELETE FROM barber_authenticators 
    WHERE id = ? AND barberId = ?
  `).run(id, barberId);
  return res.changes > 0;
}

// =========================================================================
// WEBPUSH / PUSH SUBSCRIPTIONS (PER BARBER)
// =========================================================================

export function savePushSubscription(
  barberId: string, 
  subscription: { endpoint: string; keys?: { p256dh?: string; auth?: string } }, 
  deviceName: string = 'Dispositivo Móvil'
): BarberPushSubscription {
  const endpoint = subscription.endpoint;
  const p256dh = subscription.keys?.p256dh || '';
  const auth = subscription.keys?.auth || '';
  const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const createdAt = new Date().toISOString();

  // Upsert on endpoint
  db.prepare(`
    INSERT INTO barber_push_subscriptions (id, barberId, endpoint, p256dh, auth, deviceName, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      barberId = excluded.barberId,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      deviceName = excluded.deviceName,
      createdAt = excluded.createdAt
  `).run(id, barberId, endpoint, p256dh, auth, deviceName, createdAt);

  return { id, barberId, endpoint, p256dh, auth, deviceName, createdAt };
}

export function getPushSubscriptionsForBarber(barberId: string): BarberPushSubscription[] {
  const rows = db.prepare(`
    SELECT * FROM barber_push_subscriptions 
    WHERE barberId = ? 
    ORDER BY createdAt DESC
  `).all(barberId) as any[];

  return rows.map(r => ({
    id: r.id,
    barberId: r.barberId,
    endpoint: r.endpoint,
    p256dh: r.p256dh,
    auth: r.auth,
    deviceName: r.deviceName || 'Dispositivo',
    createdAt: r.createdAt
  }));
}

export function deletePushSubscription(endpoint: string): boolean {
  const res = db.prepare('DELETE FROM barber_push_subscriptions WHERE endpoint = ?').run(endpoint);
  return res.changes > 0;
}

export function getAllPushSubscriptions(): BarberPushSubscription[] {
  const rows = db.prepare('SELECT * FROM barber_push_subscriptions').all() as any[];
  return rows.map(r => ({
    id: r.id,
    barberId: r.barberId,
    endpoint: r.endpoint,
    p256dh: r.p256dh,
    auth: r.auth,
    deviceName: r.deviceName || 'Dispositivo',
    createdAt: r.createdAt
  }));
}


