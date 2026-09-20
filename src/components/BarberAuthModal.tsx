import React, { useState, useEffect } from 'react';
import { 
  X, 
  Lock, 
  KeyRound, 
  AlertCircle, 
  ArrowRight, 
  UserPlus, 
  LogIn, 
  Mail, 
  Phone, 
  Scissors, 
  CheckCircle2, 
  ShieldCheck, 
  Store,
  Send,
  Clock,
  Fingerprint
} from 'lucide-react';
import { startAuthentication } from '@simplewebauthn/browser';
import { BarberProfile } from '../types';
import { BarberLogo } from './BarberLogo';

interface BarberAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated: (barber: BarberProfile) => void;
  barbers?: BarberProfile[];
  adminPhone?: string;
}

export const BarberAuthModal: React.FC<BarberAuthModalProps> = ({
  isOpen,
  onClose,
  onAuthenticated,
  adminPhone = '+57 310 987 6543'
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'pending_approval'>('login');
  
  // Login fields (Direct and individual credentials, no other barbers visible)
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  
  // Register fields
  const [regName, setRegName] = useState('');
  const [regShopName, setRegShopName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRole, setRegRole] = useState('Barbero Profesional');
  const [regPhone, setRegPhone] = useState('');

  // Pending barber state for WhatsApp notification
  const [registeredBarber, setRegisteredBarber] = useState<BarberProfile | null>(null);
  const [loginPendingBarber, setLoginPendingBarber] = useState<BarberProfile | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isBiometricsAvailable, setIsBiometricsAvailable] = useState(false);

  useEffect(() => {
    async function checkBiometrics() {
      try {
        if (
          typeof window !== 'undefined' &&
          window.isSecureContext &&
          window.PublicKeyCredential &&
          PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable
        ) {
          const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
          setIsBiometricsAvailable(Boolean(available));
        } else {
          setIsBiometricsAvailable(false);
        }
      } catch {
        setIsBiometricsAvailable(false);
      }
    }
    checkBiometrics();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleNotifyAdminWhatsApp = (barber: BarberProfile) => {
    const targetPhone = adminPhone || '+57 310 987 6543';
    const cleanPhone = targetPhone.replace(/\D/g, '');
    const message = `¡Hola Administrador de BarberTurno! 💈 Acabo de registrar mi cuenta de barbero y solicito la activación para comenzar a crear mi agenda.\n\n📋 *Mis Datos:*\n• *Nombre:* ${barber.name}\n• *Barbería / Estudio:* ${barber.shopName || `${barber.name} Studio`}\n• *Correo:* ${barber.email || 'N/A'}\n• *Teléfono:* ${barber.phone || 'N/A'}\n\nQuedo atento a la confirmación de activación. ¡Muchas gracias!`;
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleBiometricLogin = async () => {
    setIsLoading(true);
    setError(null);
    setLoginPendingBarber(null);

    try {
      const optionsRes = await fetch('/api/auth/webauthn/login-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim() || undefined })
      });
      const optionsData = await optionsRes.json();
      if (!optionsRes.ok || !optionsData.options) {
        throw new Error(optionsData.error || 'No fue posible iniciar el sensor biométrico.');
      }

      const authResponse = await startAuthentication({ optionsJSON: optionsData.options });

      const verifyRes = await fetch('/api/auth/webauthn/login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response: authResponse,
          challengeKey: optionsData.challengeKey
        })
      });
      const verifyData = await verifyRes.json();

      if (verifyRes.ok && verifyData.success && verifyData.barber) {
        sessionStorage.setItem('barber_auth_token', verifyData.token || 'authenticated');
        sessionStorage.setItem('barber_current_user', JSON.stringify(verifyData.barber));
        onAuthenticated(verifyData.barber);
        onClose();
        setPassword('');
      } else {
        setError(verifyData.error || 'Autenticación biométrica no reconocida.');
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setError('Acceso biométrico cancelado.');
      } else {
        setError(err?.message || 'Error durante la autenticación biométrica.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) {
      setError('Por favor ingresa tu correo electrónico o nombre de usuario.');
      return;
    }
    if (!password.trim()) {
      setError('Por favor ingresa tu contraseña personal.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setLoginPendingBarber(null);

    try {
      const res = await fetch('/api/barber/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: identifier.trim(),
          password: password.trim()
        })
      });

      const data = await res.json();
      if (res.ok && data.success && data.barber) {
        sessionStorage.setItem('barber_auth_token', data.token || 'authenticated');
        sessionStorage.setItem('barber_current_user', JSON.stringify(data.barber));
        onAuthenticated(data.barber);
        onClose();
        setPassword('');
      } else if (data.status === 'pendiente') {
        setError(data.error || 'Tu cuenta está en proceso de validación y debe ser activada por el administrador.');
        if (data.barber) {
          setLoginPendingBarber(data.barber);
        }
      } else {
        setError(data.error || 'Credenciales incorrectas. Verifica tu contraseña.');
      }
    } catch (err: any) {
      setError('Error al conectar con el servidor. Intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim()) {
      setError('Por favor ingresa tu nombre completo.');
      return;
    }
    if (!regEmail.trim()) {
      setError('Por favor ingresa tu correo electrónico para tu cuenta.');
      return;
    }
    if (!regPassword || regPassword.trim().length < 4) {
      setError('La contraseña personal debe tener al menos 4 caracteres.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/barber/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: regName.trim(),
          shopName: regShopName.trim() || undefined,
          email: regEmail.trim(),
          password: regPassword.trim(),
          role: regRole.trim() || 'Barbero Profesional',
          phone: regPhone.trim()
        })
      });

      const data = await res.json();
      if (res.ok && data.success && data.barber) {
        if (data.pending) {
          setRegisteredBarber(data.barber);
          setMode('pending_approval');
          setRegName('');
          setRegShopName('');
          setRegEmail('');
          setRegPassword('');
          setRegPhone('');
          return;
        }

        // Fallback for auto-approved accounts if ever configured
        sessionStorage.setItem('barber_auth_token', data.token || 'authenticated');
        sessionStorage.setItem('barber_current_user', JSON.stringify(data.barber));
        onAuthenticated(data.barber);
        onClose();
      } else {
        setError(data.error || 'No se pudo crear la cuenta de barbero.');
      }
    } catch (err: any) {
      setError('Error de conexión al registrar la cuenta.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-2xl border border-stone-200 bg-white shadow-2xl">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3.5 sm:px-6 sm:py-4 bg-stone-50">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-slate-900 border border-stone-800 p-1 shrink-0 shadow-xs">
              <BarberLogo size="xs" />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-bold text-slate-900">
                Acceso Exclusivo de Barberos
              </h2>
              <p className="text-[10px] sm:text-[11px] text-slate-500">
                Cada barbero ingresa a su propia agenda individual
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-stone-100 hover:text-slate-800 transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab Switcher: Login vs Register (hidden when viewing pending confirmation) */}
        {mode !== 'pending_approval' && (
          <div className="flex border-b border-stone-200 bg-white px-4 pt-3 sm:px-6">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(null); setLoginPendingBarber(null); }}
              className={`flex-1 pb-3 text-xs font-bold transition-all border-b-2 cursor-pointer ${
                mode === 'login'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Iniciar Sesión
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(null); setLoginPendingBarber(null); }}
              className={`flex-1 pb-3 text-xs font-bold transition-all border-b-2 cursor-pointer ${
                mode === 'register'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Crear Cuenta
            </button>
          </div>
        )}

        {/* Form Body */}
        <div className="p-4 sm:p-6">
          {error && !loginPendingBarber && (
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {loginPendingBarber && (
            <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 p-3.5 text-xs text-amber-900 space-y-2.5">
              <div className="flex items-start gap-2">
                <Clock className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <strong className="block font-bold">Cuenta Pendiente de Aprobación</strong>
                  <span className="text-[11px] text-amber-800 leading-relaxed">
                    Tu cuenta está registrada pero aún no ha sido activada por el administrador.
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleNotifyAdminWhatsApp(loginPendingBarber)}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-3 text-xs transition shadow-2xs cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Pedir Activación al Administrador por WhatsApp</span>
              </button>
            </div>
          )}

          {mode === 'pending_approval' && registeredBarber ? (
            /* PENDING APPROVAL CONFIRMATION */
            <div className="space-y-4 text-center py-1">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 shadow-2xs">
                <Clock className="h-7 w-7" />
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-900 font-serif">
                  ¡Cuenta Registrada con Éxito!
                </h3>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed max-w-xs mx-auto">
                  Por control de la plataforma, un administrador debe validar y activar tu cuenta antes de que puedas publicar horarios y recibir citas.
                </p>
              </div>

              {/* Summary Box */}
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-3.5 text-left text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Barbero:</span>
                  <span className="font-bold text-slate-800">{registeredBarber.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Estudio / Barbería:</span>
                  <span className="font-semibold text-slate-700">{registeredBarber.shopName || `${registeredBarber.name} Studio`}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Correo:</span>
                  <span className="font-mono text-slate-700">{registeredBarber.email}</span>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t border-stone-200">
                  <span className="text-slate-500">Estado de cuenta:</span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                    <span>⏳ Pendiente de Aprobación</span>
                  </span>
                </div>
              </div>

              {/* WhatsApp Notification Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => handleNotifyAdminWhatsApp(registeredBarber)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 text-xs transition shadow-md shadow-emerald-600/20 cursor-pointer active:scale-98"
                >
                  <Send className="h-4 w-4 text-emerald-100" />
                  <span>Notificar al Administrador por WhatsApp</span>
                </button>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Envía un mensaje predeterminado con tus datos para solicitar activación inmediata.
                </p>
              </div>

              <div className="pt-2 border-t border-stone-200 flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(null); setLoginPendingBarber(null); }}
                  className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
                >
                  Volver a Iniciar Sesión
                </button>
              </div>
            </div>
          ) : mode === 'login' ? (
            /* LOGIN MODE */
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              {/* Email / Username field */}
              <div>
                <label className="block mb-1 text-xs font-semibold text-slate-700">
                  Correo Electrónico o Usuario:
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    autoFocus
                    value={identifier}
                    onChange={e => setIdentifier(e.target.value)}
                    placeholder="ej: tu_correo@ejemplo.com o tu usuario"
                    className="w-full rounded-xl border border-stone-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder-stone-400 focus:border-blue-600 focus:outline-none shadow-2xs"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Tu Contraseña Personal:
                  </label>
                  <span className="text-[10px] text-slate-400">
                    (Default inicial: <code className="text-red-600 font-mono font-semibold">barbero123</code>)
                  </span>
                </div>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="password"
                    required
                    autoFocus
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Ingresa tu contraseña"
                    className="w-full rounded-xl border border-stone-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder-stone-400 focus:border-blue-600 focus:outline-none shadow-2xs"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-[11px] text-blue-900 leading-relaxed flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  Al ingresar accederás exclusivamente a tus citas agendadas, tus métricas de atención y la gestión individual de tus horarios.
                </span>
              </div>

              {/* Biometric One-Tap Login Button */}
              {isBiometricsAvailable && (
                <div className="pt-1">
                  <div className="relative my-3">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-stone-200" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-white px-2.5 text-slate-400 font-bold text-[10px] tracking-wider">
                        o acceso biométrico
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleBiometricLogin}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold py-2.5 px-4 text-xs transition shadow-2xs cursor-pointer active:scale-98 disabled:opacity-50"
                  >
                    <Fingerprint className="h-4 w-4 text-emerald-600" />
                    <span>Ingresar con Huella / Face ID</span>
                  </button>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-stone-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 shadow-sm cursor-pointer"
                >
                  <span>{isLoading ? 'Accediendo...' : 'Ingresar a mi Agenda'}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </form>
          ) : (
            /* REGISTER MODE */
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-[11px] text-slate-600">
                <strong className="text-slate-900 block mb-0.5">Nueva cuenta de barbero</strong>
                Define tus datos de acceso. Se creará tu enlace único de reservas y tu apartado para gestionar tus horarios de forma independiente.
              </div>

              <div>
                <label className="block mb-1 text-xs font-semibold text-slate-700">
                  Nombre Completo: *
                </label>
                <div className="relative">
                  <Scissors className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={e => setRegName(e.target.value)}
                    placeholder="ej: Mateo Gómez"
                    className="w-full rounded-xl border border-stone-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder-stone-400 focus:border-blue-600 focus:outline-none shadow-2xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 text-xs font-semibold text-slate-700">
                    Correo Electrónico: *
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={regEmail}
                      onChange={e => setRegEmail(e.target.value)}
                      placeholder="mateo@ejemplo.com"
                      className="w-full rounded-xl border border-stone-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder-stone-400 focus:border-blue-600 focus:outline-none shadow-2xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block mb-1 text-xs font-semibold text-slate-700">
                    Contraseña Personal: *
                  </label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="password"
                      required
                      minLength={4}
                      value={regPassword}
                      onChange={e => setRegPassword(e.target.value)}
                      placeholder="Mínimo 4 caracteres"
                      className="w-full rounded-xl border border-stone-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder-stone-400 focus:border-blue-600 focus:outline-none shadow-2xs"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 text-xs font-semibold text-slate-700">
                    Especialidad / Rol:
                  </label>
                  <input
                    type="text"
                    value={regRole}
                    onChange={e => setRegRole(e.target.value)}
                    placeholder="ej: Especialista en Fade y Barba"
                    className="w-full rounded-xl border border-stone-300 bg-white py-2 px-3 text-xs text-slate-900 placeholder-stone-400 focus:border-blue-600 focus:outline-none shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block mb-1 text-xs font-semibold text-slate-700">
                    Teléfono / WhatsApp:
                  </label>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="tel"
                      value={regPhone}
                      onChange={e => setRegPhone(e.target.value)}
                      placeholder="+57 312 000 0000"
                      className="w-full rounded-xl border border-stone-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder-stone-400 focus:border-blue-600 focus:outline-none shadow-2xs"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block mb-1 text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Store className="h-3.5 w-3.5 text-blue-600" />
                  <span>Nombre de tu Barbería / Estudio (Opcional):</span>
                </label>
                <input
                  type="text"
                  value={regShopName}
                  onChange={e => setRegShopName(e.target.value)}
                  placeholder="ej: Elite Barber Studio"
                  className="w-full rounded-xl border border-stone-300 bg-white py-2 px-3 text-xs text-slate-900 placeholder-stone-400 focus:border-blue-600 focus:outline-none shadow-2xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-stone-50 cursor-pointer"
                >
                  Ya tengo cuenta
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 shadow-sm cursor-pointer"
                >
                  <span>{isLoading ? 'Creando cuenta...' : 'Registrar mi Cuenta'}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
