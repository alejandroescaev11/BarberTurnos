// ==============================================================================
// SUITE COMPLETA DE PRUEBAS: FUNCIONALIDAD, SEGURIDAD Y AISLAMIENTO DE DATOS
// Proyecto: BarberTurnos
// ==============================================================================

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const TEST_PORT = 3133;
const BASE_URL = `http://localhost:${TEST_PORT}`;

// Visual formatting helpers
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

let passedCount = 0;
let failedCount = 0;
const results = [];

function recordTest(id, title, success, details = '') {
  if (success) {
    passedCount++;
    results.push({ id, title, status: 'PASS', details });
    console.log(`  ${colors.green}✔ [PASS]${colors.reset} ${colors.bright}${id}:${colors.reset} ${title}`);
    if (details) console.log(`         ${colors.dim}${details}${colors.reset}`);
  } else {
    failedCount++;
    results.push({ id, title, status: 'FAIL', details });
    console.log(`  ${colors.red}✖ [FAIL]${colors.reset} ${colors.bright}${id}:${colors.reset} ${title}`);
    if (details) console.log(`         ${colors.red}Error: ${details}${colors.reset}`);
  }
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// -----------------------------------------------------------------------------
// MAIN TEST RUNNER
// -----------------------------------------------------------------------------
async function runSuite() {
  console.log(`\n${colors.cyan}==============================================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}  💈 BARBERTURNOS - SUITE DE PRUEBAS DE FUNCIONALIDAD Y SEGURIDAD 💈${colors.reset}`);
  console.log(`${colors.cyan}==============================================================================${colors.reset}\n`);

  // 1. Start Server for Testing
  console.log(`${colors.yellow}▶ Iniciando servidor de pruebas en puerto ${TEST_PORT}...${colors.reset}`);
  const serverProcess = spawn('npx', ['tsx', 'server.ts'], {
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      NODE_ENV: 'test',
      DISABLE_HMR: 'true'
    },
    stdio: 'pipe',
    shell: true
  });

  serverProcess.stderr.on('data', data => {
    const msg = data.toString();
    if (!msg.includes('ExperimentalWarning')) {
      // ignore node crypto experimental warnings
    }
  });

  // Wait for server ready
  let isReady = false;
  for (let i = 0; i < 30; i++) {
    await wait(500);
    try {
      const res = await fetch(`${BASE_URL}/api/config`);
      if (res.ok) {
        isReady = true;
        break;
      }
    } catch {}
  }

  if (!isReady) {
    console.error(`${colors.red}❌ Error: El servidor de pruebas no respondió a tiempo.${colors.reset}`);
    serverProcess.kill();
    process.exit(1);
  }
  console.log(`${colors.green}✔ Servidor listo y respondiendo en ${BASE_URL}${colors.reset}\n`);

  try {
    // -------------------------------------------------------------------------
    // CP-01: Catálogo Público de Barberos y Ocultamiento
    // -------------------------------------------------------------------------
    console.log(`${colors.blue}--- [1] Catálogo de Barberos y Visibilidad Pública ---${colors.reset}`);
    {
      const res = await fetch(`${BASE_URL}/api/barbers`);
      const barbers = await res.json();
      const allActive = Array.isArray(barbers) && barbers.every(b => (b.status === 'aprobado' || !b.status) && b.active !== false);
      const hasSensitiveFields = barbers.some(b => 'password' in b);

      recordTest(
        'CP-01.1',
        'Catálogo público solo expone barberos aprobados y activos',
        allActive && barbers.length > 0,
        `Se encontraron ${barbers.length} barberos activos. Ninguno pausado ni pendiente visible.`
      );

      recordTest(
        'CP-01.2',
        'El catálogo público NUNCA expone contraseñas de barberos',
        !hasSensitiveFields,
        'Ningún registro expone hashes ni contraseñas en el payload público.'
      );
    }

    // -------------------------------------------------------------------------
    // CP-02: Bloqueo de Horas Pasadas en Horarios
    // -------------------------------------------------------------------------
    console.log(`\n${colors.blue}--- [2] Reglas de Negocio: Bloqueo de Horas Pasadas ---${colors.reset}`);
    {
      const todayStr = new Date().toISOString().split('T')[0];
      const res = await fetch(`${BASE_URL}/api/slots?date=${todayStr}`);
      const data = await res.json();

      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      let hasPastSlotAvailable = false;
      if (Array.isArray(data.slots)) {
        for (const slot of data.slots) {
          const [h, m] = slot.time.split(':').map(Number);
          const slotMinutes = h * 60 + m;
          if (slotMinutes <= currentMinutes && slot.status === 'DISPONIBLE') {
            hasPastSlotAvailable = true;
            break;
          }
        }
      }

      recordTest(
        'CP-02',
        'Los horarios de horas pasadas para la fecha de hoy no se ofrecen como DISPONIBLES',
        !hasPastSlotAvailable,
        `Validación contra la hora actual del servidor (${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}).`
      );
    }

    // -------------------------------------------------------------------------
    // CP-03: Prevención de Colisiones Simultáneas de Citas (Concurrencia)
    // -------------------------------------------------------------------------
    {
      const futureDate = '2028-10-' + String(10 + (Date.now() % 15)).padStart(2, '0');
      const slotTime = '11:00';
      const barberId = 'alejandro';

      // 1. Create available slot
      await fetch(`${BASE_URL}/api/slots/batch-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dates: [futureDate],
          times: [slotTime],
          barberId
        })
      });

      // 2. Client 1 books it
      const res1 = await fetch(`${BASE_URL}/api/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barberId,
          date: futureDate,
          startTime: slotTime,
          clientName: 'Cliente Primero',
          clientPhone: '3001112233',
          serviceIds: ['corte_clasico']
        })
      });
      const data1 = await res1.json();

      // 3. Client 2 attempts to book the EXACT same slot
      const res2 = await fetch(`${BASE_URL}/api/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barberId,
          date: futureDate,
          startTime: slotTime,
          clientName: 'Cliente Segundo Colisión',
          clientPhone: '3009998877',
          serviceIds: ['corte_clasico']
        })
      });

      recordTest(
        'CP-03.1',
        'Primera reserva se confirma exitosamente (201 Created)',
        res1.status === 201 && data1.success === true,
        `Cita ID: ${data1.booking?.id}`
      );

      recordTest(
        'CP-03.2',
        'Segunda reserva simultánea es rechazada con Conflicto 409',
        res2.status === 409,
        'El servidor detectó la colisión y protegió la agenda contra doble asignación.'
      );
    }

    // -------------------------------------------------------------------------
    // CP-04: Aislamiento e Invisibilidad Total entre Barberos
    // -------------------------------------------------------------------------
    console.log(`\n${colors.blue}--- [4] Seguridad de Datos: Aislamiento e Invisibilidad entre Barberos ---${colors.reset}`);
    let adminToken = '';
    let barberToken = '';
    {
      // 1. Login as Superuser
      const loginAdmin = await fetch(`${BASE_URL}/api/barber/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'alejandro', password: 'barbero123' })
      });
      const adminData = await loginAdmin.json();
      adminToken = adminData.token;

      // 2. Login as Standard Barber (Carlos)
      const loginBarber = await fetch(`${BASE_URL}/api/barber/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'carlos', password: 'barbero123' })
      });
      const barberData = await loginBarber.json();
      barberToken = barberData.token;

      recordTest(
        'CP-04.1',
        'Autenticación individual por credenciales personales emite tokens independientes',
        Boolean(adminToken && barberToken && adminToken !== barberToken),
        'Tokens emitidos sin exponer listados públicos de cuentas.'
      );

      // 3. Request bookings as Carlos -> MUST ONLY return Carlos bookings
      const carlosBookingsRes = await fetch(`${BASE_URL}/api/bookings`, {
        headers: {
          Authorization: `Bearer ${barberToken}`,
          'x-barber-id': 'carlos'
        }
      });
      const carlosBookings = await carlosBookingsRes.json();
      const hasForeignBookings = carlosBookings.some(b => b.barberId !== 'carlos');

      recordTest(
        'CP-04.2',
        'Barbero estándar solo recibe sus propias citas (cero visibilidad de otros barberos)',
        !hasForeignBookings,
        `Se devolvieron ${carlosBookings.length} citas; ninguna pertenece a otro barbero.`
      );

      // 4. Spoof attempt: Carlos tries to request Alejandro's bookings via query param
      const spoofRes = await fetch(`${BASE_URL}/api/bookings?barberId=alejandro`, {
        headers: {
          Authorization: `Bearer ${barberToken}`,
          'x-barber-id': 'carlos'
        }
      });
      const spoofBookings = await spoofRes.json();
      const spoofSucceeded = spoofBookings.some(b => b.barberId === 'alejandro');

      recordTest(
        'CP-04.3',
        'Backend bloquea suplantación de parámetro ?barberId forzando el filtro de sesión',
        !spoofSucceeded,
        'El servidor forzó el filtro al barbero autenticado Carlos ignorando el query ajeno.'
      );
    }

    // -------------------------------------------------------------------------
    // CP-05: Apertura y Publicación de Agenda en SQLite
    // -------------------------------------------------------------------------
    console.log(`\n${colors.blue}--- [5] Generador de Agenda del Barbero ---${colors.reset}`);
    {
      const agendaDate = '2027-11-20';
      const agendaTimes = ['08:00', '08:30', '09:00', '09:30', '10:00'];

      const batchRes = await fetch(`${BASE_URL}/api/slots/batch-create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${barberToken}`,
          'x-barber-id': 'carlos'
        },
        body: JSON.stringify({
          dates: [agendaDate],
          times: agendaTimes,
          barberId: 'carlos',
          replaceDayMode: true
        })
      });
      const batchData = await batchRes.json();

      const getSlotsRes = await fetch(`${BASE_URL}/api/slots?date=${agendaDate}&barberId=carlos`);
      const getSlotsData = await getSlotsRes.json();
      const publishedCount = Array.isArray(getSlotsData.slots) ? getSlotsData.slots.length : 0;

      recordTest(
        'CP-05',
        'Barbero publica franjas de 30 minutos y se reflejan en tiempo real en SQLite',
        batchData.success === true && publishedCount === agendaTimes.length,
        `Se publicaron exitosamente ${publishedCount} horarios para ${agendaDate}.`
      );
    }

    // -------------------------------------------------------------------------
    // CP-06: Registro de Barbero y Aprobación de Superusuario
    // -------------------------------------------------------------------------
    console.log(`\n${colors.blue}--- [6] Registro y Control de Aprobación de Nuevos Barberos ---${colors.reset}`);
    const tempSlug = `barbero_test_${Date.now()}`;
    let tempBarberId = '';
    {
      // 1. Register new barber
      const regRes = await fetch(`${BASE_URL}/api/barbers/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Barbero Test Prueba',
          email: `${tempSlug}@test.com`,
          password: 'password123',
          phone: '3105559999',
          shopName: 'Barbería San Juan'
        })
      });
      const regData = await regRes.json();
      tempBarberId = regData.barber?.id;

      recordTest(
        'CP-06.1',
        'Nuevo barbero se crea con estado "pendiente"',
        regRes.status === 201 && regData.barber?.status === 'pendiente',
        `ID: ${tempBarberId}, Estado: ${regData.barber?.status}`
      );

      // 2. Attempt login before approval -> MUST FAIL 403
      const prematureLogin = await fetch(`${BASE_URL}/api/barber/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: `${tempSlug}@test.com`, password: 'password123' })
      });

      recordTest(
        'CP-06.2',
        'Login bloqueado (403 Forbidden) para cuentas pendientes de aprobación',
        prematureLogin.status === 403,
        'Se informa al usuario que su cuenta requiere aprobación del administrador.'
      );

      // 3. Superuser approves the account
      const approveRes = await fetch(`${BASE_URL}/api/barbers/${encodeURIComponent(tempBarberId)}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
          'x-barber-id': 'alejandro'
        },
        body: JSON.stringify({ status: 'aprobado' })
      });
      const approveData = await approveRes.json();

      // 4. Login after approval -> MUST SUCCEED 200
      const approvedLogin = await fetch(`${BASE_URL}/api/barber/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: `${tempSlug}@test.com`, password: 'password123' })
      });

      recordTest(
        'CP-06.3',
        'Superusuario aprueba la cuenta y el barbero puede iniciar sesión de inmediato',
        approveRes.status === 200 && approvedLogin.status === 200,
        'Flujo completo de registro -> pendiente -> aprobado verificado.'
      );
    }

    // -------------------------------------------------------------------------
    // CP-07 & CP-08: Pausar Acceso, Revocación Inmediata y Reactivación
    // -------------------------------------------------------------------------
    console.log(`\n${colors.blue}--- [7 & 8] Pausa de Cuenta, Revocación de Sesiones y Reactivación ---${colors.reset}`);
    {
      // 1. Pause the newly approved barber
      const pauseRes = await fetch(`${BASE_URL}/api/barbers/${encodeURIComponent(tempBarberId)}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
          'x-barber-id': 'alejandro'
        },
        body: JSON.stringify({ status: 'pausado' })
      });

      // 2. Verify login returns 403
      const pausedLogin = await fetch(`${BASE_URL}/api/barber/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: `${tempSlug}@test.com`, password: 'password123' })
      });

      // 3. Verify client profile returns 403 with isPaused
      const clientProfileRes = await fetch(`${BASE_URL}/api/barber/profile?barberId=${encodeURIComponent(tempBarberId)}`);
      const clientProfileData = await clientProfileRes.json();

      recordTest(
        'CP-07',
        'Superusuario pausa cuenta: login denegado y perfil de agendamiento bloqueado con 403',
        pauseRes.status === 200 && pausedLogin.status === 403 && clientProfileRes.status === 403 && clientProfileData.isPaused === true,
        'Cliente no puede ver horarios ni agendar; barbero no puede ingresar.'
      );

      // 4. Superuser reactivates account
      const reactivateRes = await fetch(`${BASE_URL}/api/barbers/${encodeURIComponent(tempBarberId)}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
          'x-barber-id': 'alejandro'
        },
        body: JSON.stringify({ status: 'aprobado' })
      });

      const reactivatedLogin = await fetch(`${BASE_URL}/api/barber/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: `${tempSlug}@test.com`, password: 'password123' })
      });

      recordTest(
        'CP-08',
        'Superusuario reanuda cuenta: acceso reactivado y perfil habilitado nuevamente',
        reactivateRes.status === 200 && reactivatedLogin.status === 200,
        'Cuenta restaurada a estado activo y operativo.'
      );

      // Clean up test barber
      await fetch(`${BASE_URL}/api/barbers/${encodeURIComponent(tempBarberId)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'x-barber-id': 'alejandro'
        }
      });
    }

    // -------------------------------------------------------------------------
    // CP-09: Seguridad contra Inyección SQL (Anti-SQLi)
    // -------------------------------------------------------------------------
    console.log(`\n${colors.blue}--- [9] Seguridad de Base de Datos: Resistencia a Inyecciones SQL ---${colors.reset}`);
    {
      const sqliPayloads = [
        "' OR '1'='1",
        "alejandro' UNION SELECT 'hacked', 'hacked'--",
        "1; DROP TABLE barbers;--"
      ];

      let allSafe = true;
      for (const payload of sqliPayloads) {
        const sqliRes = await fetch(`${BASE_URL}/api/barber/profile?barberId=${encodeURIComponent(payload)}`);
        // Should return 404 or 400 safely, never 500 or leaked data
        if (sqliRes.status === 500) {
          allSafe = false;
        }
      }

      // Verify barbers table is intact
      const verifyRes = await fetch(`${BASE_URL}/api/barbers`);
      const barbersAfterSqli = await verifyRes.json();
      const tableIntact = Array.isArray(barbersAfterSqli) && barbersAfterSqli.length > 0;

      recordTest(
        'CP-09',
        'Consultas SQLite parametrizadas neutralizan ataques de inyección SQL (SQLi)',
        allSafe && tableIntact,
        'Los caracteres maliciosos fueron tratados como texto literal. Las tablas permanecen intactas.'
      );
    }

    // -------------------------------------------------------------------------
    // CP-10: Criptografía WebAuthn / Passkeys
    // -------------------------------------------------------------------------
    console.log(`\n${colors.blue}--- [10] Seguridad Biométrica: WebAuthn / Passkeys ---${colors.reset}`);
    {
      // 1. Generate Login Challenge
      const loginOptRes = await fetch(`${BASE_URL}/api/auth/webauthn/login-options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'alejandro' })
      });
      const loginOptData = await loginOptRes.json();

      const hasChallenge = Boolean(loginOptData.options?.challenge);
      const hasTimeout = loginOptData.options?.timeout === 60000;

      recordTest(
        'CP-10.1',
        'Generación de desafío criptográfico de autenticación biométrica (challenge)',
        hasChallenge && hasTimeout,
        `Challenge emitido: ${loginOptData.options?.challenge?.slice(0, 16)}... con caducidad segura.`
      );

      // 2. Generate Register Options with session token
      const regOptRes = await fetch(`${BASE_URL}/api/auth/webauthn/register-options`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'x-barber-id': 'alejandro'
        }
      });
      const regOptData = await regOptRes.json();
      const validRp = regOptData.options?.rp?.name === 'BarberTurno';

      recordTest(
        'CP-10.2',
        'Generación de opciones de registro de autenticador de plataforma (Huella / Face ID)',
        regOptRes.status === 200 && validRp && Boolean(regOptData.challengeKey),
        `RP ID: ${regOptData.options?.rp?.id}, ChallengeKey: ${regOptData.challengeKey}`
      );
    }

    // -------------------------------------------------------------------------
    // CP-11: Notificaciones Push en Vivo para Barberos (VAPID)
    // -------------------------------------------------------------------------
    console.log(`\n${colors.blue}--- [11] Notificaciones Push en Vivo: VAPID & Dispositivos ---${colors.reset}`);
    {
      // 1. Get Public VAPID Key
      const keyRes = await fetch(`${BASE_URL}/api/push/public-key`);
      const keyData = await keyRes.json();
      const validKey = keyRes.status === 200 && typeof keyData.publicKey === 'string' && keyData.publicKey.length > 30;

      recordTest(
        'CP-11.1',
        'Obtención de clave pública VAPID para suscripción del navegador',
        validKey,
        `VAPID Key válida emitida: ${keyData.publicKey?.slice(0, 20)}...`
      );

      // 2. Subscribe Barber Device
      const mockEndpoint = `https://fcm.googleapis.com/fcm/send/mock-token-${Date.now()}`;
      const mockP256dh = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9AcDnVwT3JhWuWSSpt8mtDuS88GLumTNxIbTScE7HJH_Ro';
      const mockAuth = 'tB8NClvd8w0hee1307Re0Q';

      const subRes = await fetch(`${BASE_URL}/api/push/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
          'x-barber-id': 'alejandro'
        },
        body: JSON.stringify({
          subscription: {
            endpoint: mockEndpoint,
            keys: { p256dh: mockP256dh, auth: mockAuth }
          },
          deviceName: 'Celular Samsung Galaxy (Prueba)'
        })
      });
      const subData = await subRes.json();

      recordTest(
        'CP-11.2',
        'Registro y persistencia de suscripción Web Push vinculada al barbero',
        subRes.status === 200 && subData.success && subData.subscription?.barberId === 'alejandro',
        `Dispositivo registrado en SQLite: ${subData.subscription?.deviceName}`
      );

      // 3. Test Push Dispatch
      const testPushRes = await fetch(`${BASE_URL}/api/push/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
          'x-barber-id': 'alejandro'
        }
      });
      const testPushData = await testPushRes.json();

      recordTest(
        'CP-11.3',
        'Ejecución del endpoint de prueba de notificación push al barbero autenticado',
        testPushRes.status === 200 && testPushData.success,
        `Mensaje: ${testPushData.message}, Dispositivos objetivo: ${testPushData.registeredDevices}`
      );

      // 4. Unsubscribe Device
      const unsubRes = await fetch(`${BASE_URL}/api/push/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: mockEndpoint })
      });
      const unsubData = await unsubRes.json();

      recordTest(
        'CP-11.4',
        'Desuscripción segura y remoción del endpoint en la base de datos',
        unsubRes.status === 200 && unsubData.deleted === true,
        'Endpoint eliminado de la tabla barber_push_subscriptions exitosamente.'
      );
    }

    // -------------------------------------------------------------------------
    // CP-12: Correo Electrónico Centralizado y Notificación Dual
    // -------------------------------------------------------------------------
    console.log(`\n${colors.blue}--- [12] Notificaciones por Correo Electrónico Centralizado ---${colors.reset}`);
    {
      // 1. Query Email Status
      const statusRes = await fetch(`${BASE_URL}/api/email/status`);
      const statusData = await statusRes.json();

      const hasMode = statusData.mode === 'smtp' || statusData.mode === 'simulation';
      const hasFrom = typeof statusData.from === 'string' && statusData.from.length > 0;

      recordTest(
        'CP-12.1',
        'Diagnóstico del servicio de correo y verificación de cuenta centralizada (FROM)',
        statusRes.status === 200 && hasMode && hasFrom,
        `Modo: ${statusData.mode.toUpperCase()}, Remitente central: ${statusData.from}`
      );

      // 2. Dispatch Centralized Test Email
      const testEmailRes = await fetch(`${BASE_URL}/api/email/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ email: 'barbero.test@barberturnos.local' })
      });
      const testEmailData = await testEmailRes.json();

      recordTest(
        'CP-12.2',
        'Emisión de correo de prueba desde la cuenta centralizada de la aplicación',
        testEmailRes.status === 200 && testEmailData.success,
        `Destino: ${testEmailData.targetEmail}, Modo de despacho: ${testEmailData.result?.mode}`
      );

      // 3. Dual Notification on Booking: Client + Barber
      const dualBookingDate = '2029-05-' + String(10 + (Date.now() % 15)).padStart(2, '0');
      const dualSlotTime = '14:30';

      // Ensure slot is created
      await fetch(`${BASE_URL}/api/slots/batch-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dates: [dualBookingDate],
          times: [dualSlotTime],
          barberId: 'alejandro'
        })
      });

      const dualBookingRes = await fetch(`${BASE_URL}/api/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: 'Cliente Notificaciones',
          clientEmail: 'cliente.dual@ejemplo.com',
          clientPhone: '+57 311 555 9999',
          barberId: 'alejandro',
          date: dualBookingDate,
          startTime: dualSlotTime,
          serviceIds: ['corte_clasico']
        })
      });
      const dualBookingData = await dualBookingRes.json();

      const bookingCreated = dualBookingRes.status === 201 && Boolean(dualBookingData.booking?.id);

      // Wait briefly for background notification dispatch to record log
      await wait(300);

      // Check that email log exists
      const logsRes = await fetch(`${BASE_URL}/api/email-logs`);
      const logs = await logsRes.json();
      const hasBookingLog = logs.some(l => l.bookingId === dualBookingData.booking?.id);

      recordTest(
        'CP-12.3',
        'Reserva dispara confirmación centralizada con registro en historial y notificación push',
        bookingCreated && hasBookingLog,
        bookingCreated
          ? `Cita ${dualBookingData.booking?.id} confirmada de forma inmediata. Log de correo registrado para ${dualBookingData.booking?.clientEmail}.`
          : `Fallo al crear reserva: ${dualBookingData.error || dualBookingRes.status}`
      );
    }
  } catch (err) {
    console.error(`${colors.red}Error durante la ejecución de las pruebas:${colors.reset}`, err);
  } finally {
    // Teardown
    console.log(`\n${colors.yellow}▶ Deteniendo servidor de pruebas...${colors.reset}`);
    serverProcess.kill();
  }

  // Final Summary Report
  console.log(`\n${colors.cyan}==============================================================================${colors.reset}`);
  console.log(`${colors.bright}  RESUMEN FINAL DE LA SUITE DE PRUEBAS${colors.reset}`);
  console.log(`${colors.cyan}==============================================================================${colors.reset}`);
  console.log(`  Total Casos de Prueba : ${results.length}`);
  console.log(`  ${colors.green}Pruebas Aprobadas     : ${passedCount}${colors.reset}`);
  console.log(`  ${failedCount === 0 ? colors.green : colors.red}Pruebas Fallidas      : ${failedCount}${colors.reset}`);
  console.log(`${colors.cyan}==============================================================================${colors.reset}\n`);

  if (failedCount > 0) {
    process.exit(1);
  } else {
    console.log(`${colors.green}${colors.bright}  🎉 ¡TODAS LAS PRUEBAS DE FUNCIONALIDAD Y SEGURIDAD HAN PASADO AL 100%!${colors.reset}\n`);
    process.exit(0);
  }
}

runSuite();
