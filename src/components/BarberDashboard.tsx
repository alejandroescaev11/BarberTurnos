import React, { useState, useMemo, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  User, 
  Phone, 
  Mail, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Search, 
  DollarSign, 
  Share2, 
  Plus, 
  Download, 
  Send, 
  RefreshCw, 
  Sparkles, 
  Scissors, 
  Table, 
  Check, 
  Copy, 
  ExternalLink, 
  ShieldCheck, 
  Users, 
  Link, 
  LogOut, 
  Key, 
  Store,
  Pause,
  Play,
  Trash2,
  Fingerprint,
  Bell,
  BellRing,
  Smartphone,
  CheckCheck
} from 'lucide-react';
import { startRegistration } from '@simplewebauthn/browser';
import { BarberShopConfig, BarberProfile, Booking, BookingStatus, BarberSlot } from '../types';
import { generateReminderWhatsApp } from '../lib/whatsapp';
import { notifyNewBooking, playBookingChime, requestNotificationPermission } from '../lib/notifications';
import { 
  isPushSupported, 
  getCurrentPushSubscription, 
  subscribeToPush, 
  unsubscribeFromPush, 
  sendTestPush, 
  getEmailStatus, 
  sendTestEmail 
} from '../lib/pushNotifications';
import { ScheduleOpener } from './ScheduleOpener';

interface BarberDashboardProps {
  config: BarberShopConfig;
  bookings: Booking[];
  currentBarber: BarberProfile | null;
  onUpdateStatus: (bookingId: string, newStatus: BookingStatus) => void;
  onRefreshBookings: () => void;
  onOpenQuickBooking: () => void;
  onLogout: () => void;
  onUpdateCurrentBarber?: (updated: BarberProfile, updatedConfig?: BarberShopConfig) => void;
}

export const BarberDashboard: React.FC<BarberDashboardProps> = ({
  config,
  bookings,
  currentBarber,
  onUpdateStatus,
  onRefreshBookings,
  onOpenQuickBooking,
  onLogout,
  onUpdateCurrentBarber
}) => {
  const [barbersList, setBarbersList] = useState<BarberProfile[]>(currentBarber ? [currentBarber] : (config.barbers || []));
  
  // Active authenticated barber (defaults to first barber in list if not passed)
  const activeBarber = currentBarber || barbersList[0];

  const [activeTab, setActiveTab] = useState<'citas' | 'abrir_agenda' | 'live_slots' | 'perfil' | 'barberos'>('citas');
  const [selectedFilterDate, setSelectedFilterDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [copiedBarberSlug, setCopiedBarberSlug] = useState<string | null>(null);
  const [isResendingEmail, setIsResendingEmail] = useState<string | null>(null);

  // Profile update state
  const [profileName, setProfileName] = useState(activeBarber?.name || '');
  const [profileShopName, setProfileShopName] = useState(activeBarber?.shopName || '');
  const [profileRole, setProfileRole] = useState(activeBarber?.role || '');
  const [profilePhone, setProfilePhone] = useState(activeBarber?.phone || '');
  const [profilePassword, setProfilePassword] = useState('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ success: boolean; text: string } | null>(null);

  // Biometrics & Registered Devices state
  const [registeredDevices, setRegisteredDevices] = useState<Array<{ id: string; deviceName: string; deviceType: string; createdAt: string }>>([]);
  const [isBiometricsAvailable, setIsBiometricsAvailable] = useState(false);
  const [isRegisteringBiometrics, setIsRegisteringBiometrics] = useState(false);
  const [biometricMessage, setBiometricMessage] = useState<{ success: boolean; text: string } | null>(null);

  // Check device biometrics availability
  useEffect(() => {
    async function checkDevice() {
      try {
        if (
          typeof window !== 'undefined' &&
          window.isSecureContext &&
          window.PublicKeyCredential &&
          PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable
        ) {
          const avail = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
          setIsBiometricsAvailable(Boolean(avail));
        } else {
          setIsBiometricsAvailable(false);
        }
      } catch {
        setIsBiometricsAvailable(false);
      }
    }
    checkDevice();
  }, []);

  const fetchRegisteredDevices = async () => {
    try {
      const token = sessionStorage.getItem('barber_auth_token') || '';
      const res = await fetch('/api/auth/webauthn/devices', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-barber-id': activeBarber?.id || ''
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.devices)) {
          setRegisteredDevices(data.devices);
        }
      }
    } catch (e) {
      console.warn('Error loading biometric devices:', e);
    }
  };

  useEffect(() => {
    if (activeTab === 'perfil') {
      fetchRegisteredDevices();
    }
  }, [activeTab, activeBarber?.id]);

  const handleRegisterBiometrics = async () => {
    setIsRegisteringBiometrics(true);
    setBiometricMessage(null);

    try {
      const token = sessionStorage.getItem('barber_auth_token') || '';
      const optRes = await fetch('/api/auth/webauthn/register-options', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-barber-id': activeBarber?.id || ''
        }
      });
      const optData = await optRes.json();
      if (!optRes.ok || !optData.options) {
        throw new Error(optData.error || 'No se pudieron generar las opciones para el registro biométrico.');
      }

      const regResponse = await startRegistration({ optionsJSON: optData.options });

      const deviceName = `${navigator.userAgent.includes('Mobile') ? 'Móvil' : 'Computador'} (${new Date().toLocaleDateString('es-CO')})`;
      const verRes = await fetch('/api/auth/webauthn/register-verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-barber-id': activeBarber?.id || ''
        },
        body: JSON.stringify({
          response: regResponse,
          challengeKey: optData.challengeKey,
          deviceName
        })
      });
      const verData = await verRes.json();

      if (verRes.ok && verData.success) {
        setBiometricMessage({ success: true, text: '¡Sensor biométrico (Huella / Face ID) vinculado exitosamente a tu cuenta!' });
        await fetchRegisteredDevices();
      } else {
        setBiometricMessage({ success: false, text: verData.error || 'No se pudo completar la verificación biométrica.' });
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setBiometricMessage({ success: false, text: 'Operación biométrica cancelada.' });
      } else {
        setBiometricMessage({ success: false, text: err?.message || 'Error al vincular el sensor biométrico.' });
      }
    } finally {
      setIsRegisteringBiometrics(false);
    }
  };

  const handleDeleteDevice = async (deviceId: string) => {
    if (!confirm('¿Deseas desvincular este dispositivo biométrico?')) return;
    try {
      const token = sessionStorage.getItem('barber_auth_token') || '';
      const res = await fetch(`/api/auth/webauthn/devices/${encodeURIComponent(deviceId)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-barber-id': activeBarber?.id || ''
        }
      });
      if (res.ok) {
        await fetchRegisteredDevices();
        setBiometricMessage({ success: true, text: 'Dispositivo biométrico desvinculado.' });
      }
    } catch (e: any) {
      alert(e.message || 'Error al desvincular el dispositivo.');
    }
  };

  // Web Push & Email notification state
  const [isPushSupportedDevice, setIsPushSupportedDevice] = useState(false);
  const [isPushSubscribed, setIsPushSubscribed] = useState(false);
  const [isSubscribingPush, setIsSubscribingPush] = useState(false);
  const [isSendingTestPush, setIsSendingTestPush] = useState(false);
  const [pushStatusMessage, setPushStatusMessage] = useState<{ success: boolean; text: string } | null>(null);

  const [emailServiceStatus, setEmailServiceStatus] = useState<{
    mode: 'smtp' | 'simulation';
    autoSendEmail: boolean;
    configured: boolean;
    from: string;
    host: string;
    user: string;
    recentLogsCount: number;
  } | null>(null);
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [emailStatusMessage, setEmailStatusMessage] = useState<{ success: boolean; text: string } | null>(null);

  // Load push and email status when perfil tab opens
  useEffect(() => {
    if (activeTab === 'perfil') {
      setIsPushSupportedDevice(isPushSupported());
      getCurrentPushSubscription().then(sub => {
        setIsPushSubscribed(Boolean(sub));
      }).catch(err => console.warn('Error checking push subscription:', err));

      getEmailStatus().then(status => {
        setEmailServiceStatus(status);
      }).catch(err => console.warn('Error checking email status:', err));
    }
  }, [activeTab]);

  const handleTogglePush = async () => {
    setPushStatusMessage(null);
    setIsSubscribingPush(true);
    const token = sessionStorage.getItem('barber_auth_token') || '';
    try {
      if (isPushSubscribed) {
        const res = await unsubscribeFromPush(token);
        if (res.success) {
          setIsPushSubscribed(false);
          setPushStatusMessage({ success: true, text: 'Notificaciones push desactivadas en este dispositivo.' });
        } else {
          setPushStatusMessage({ success: false, text: res.error || 'Error al desactivar notificaciones.' });
        }
      } else {
        const res = await subscribeToPush(activeBarber?.id, token);
        if (res.success) {
          setIsPushSubscribed(true);
          setPushStatusMessage({ success: true, text: '¡Notificaciones push activadas! Recibirás una alerta en vivo cuando un cliente reserve contigo.' });
        } else {
          setPushStatusMessage({ success: false, text: res.error || 'No se pudo activar las notificaciones push.' });
        }
      }
    } catch (err: any) {
      setPushStatusMessage({ success: false, text: err?.message || 'Error en la suscripción push.' });
    } finally {
      setIsSubscribingPush(false);
    }
  };

  const handleSendTestPush = async () => {
    setPushStatusMessage(null);
    setIsSendingTestPush(true);
    const token = sessionStorage.getItem('barber_auth_token') || '';
    try {
      const res = await sendTestPush(token);
      if (res.success) {
        setPushStatusMessage({ success: true, text: `✅ ${res.message}` });
      } else {
        setPushStatusMessage({ success: false, text: res.message || 'Error al enviar notificación de prueba.' });
      }
    } catch (err: any) {
      setPushStatusMessage({ success: false, text: err?.message || 'Error en prueba push.' });
    } finally {
      setIsSendingTestPush(false);
    }
  };

  const handleSendTestEmail = async () => {
    setEmailStatusMessage(null);
    setIsSendingTestEmail(true);
    const token = sessionStorage.getItem('barber_auth_token') || '';
    try {
      const targetEmail = activeBarber?.email || config.email;
      const res = await sendTestEmail(targetEmail, token);
      if (res.success) {
        const modeText = res.result?.mode === 'smtp' ? 'enviado vía SMTP real' : 'registrado en modo simulación';
        setEmailStatusMessage({ success: true, text: `✅ Correo de prueba (${modeText}) a ${targetEmail}. Revisa la bandeja de entrada o los registros.` });
      } else {
        setEmailStatusMessage({ success: false, text: res.error || 'Error al enviar correo de prueba.' });
      }
    } catch (err: any) {
      setEmailStatusMessage({ success: false, text: err?.message || 'Error en prueba de correo.' });
    } finally {
      setIsSendingTestEmail(false);
    }
  };

  // New barber modal/form state
  const [showAddBarberModal, setShowAddBarberModal] = useState(false);
  const [newBarberName, setNewBarberName] = useState('');
  const [newBarberShopName, setNewBarberShopName] = useState('');
  const [newBarberRole, setNewBarberRole] = useState('Barbero Profesional');
  const [newBarberPhone, setNewBarberPhone] = useState('');
  const [newBarberEmail, setNewBarberEmail] = useState('');
  const [newBarberPassword, setNewBarberPassword] = useState('');
  const [isAddingBarber, setIsAddingBarber] = useState(false);

  // Live Slots Management State (SQLite per barber)
  const [liveSlots, setLiveSlots] = useState<BarberSlot[]>([]);
  const [isLoadingLiveSlots, setIsLoadingLiveSlots] = useState(false);
  const [releasingSlotTime, setReleasingSlotTime] = useState<string | null>(null);

  // Keep profile fields synchronized ONLY when switching to a different barber account
  useEffect(() => {
    if (activeBarber) {
      setProfileName(activeBarber.name);
      setProfileShopName(activeBarber.shopName || '');
      setProfileRole(activeBarber.role);
      setProfilePhone(activeBarber.phone || '');
    }
  }, [activeBarber?.id]);

  // Fetch barbers list from server (strictly only for superuser admin)
  const fetchBarbers = async () => {
    if (!activeBarber?.isAdmin) {
      if (activeBarber) setBarbersList([activeBarber]);
      return;
    }
    try {
      const token = sessionStorage.getItem('barber_auth_token') || '';
      const res = await fetch('/api/barbers?all=true', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-barber-id': activeBarber?.id || ''
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setBarbersList(data);
        }
      }
    } catch (e) {
      console.warn('Error fetching barbers:', e);
    }
  };

  useEffect(() => {
    fetchBarbers();
  }, [activeBarber?.id, activeBarber?.isAdmin]);

  // Derived lists for pending and active barbers
  const pendingBarbers = useMemo(() => {
    return barbersList.filter(b => b.status === 'pendiente');
  }, [barbersList]);

  const approvedBarbers = useMemo(() => {
    return barbersList.filter(b => b.status === 'aprobado' || b.status === 'pausado' || !b.status);
  }, [barbersList]);

  const handleApproveBarber = async (barberId: string) => {
    try {
      const token = sessionStorage.getItem('barber_auth_token') || '';
      const res = await fetch(`/api/barbers/${encodeURIComponent(barberId)}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-barber-id': activeBarber?.id || ''
        },
        body: JSON.stringify({ status: 'aprobado' })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await fetchBarbers();
        alert(`¡Barbero aprobado exitosamente! Ahora puede iniciar sesión y generar su agenda.`);
      } else {
        alert(data.error || 'No se pudo aprobar al barbero.');
      }
    } catch (err: any) {
      alert(err.message || 'Error de conexión.');
    }
  };

  const handleRejectBarber = async (barberId: string) => {
    if (!confirm('¿Estás seguro de que deseas rechazar la solicitud de este barbero?')) return;
    try {
      const token = sessionStorage.getItem('barber_auth_token') || '';
      const res = await fetch(`/api/barbers/${encodeURIComponent(barberId)}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-barber-id': activeBarber?.id || ''
        },
        body: JSON.stringify({ status: 'rechazado' })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await fetchBarbers();
      } else {
        alert(data.error || 'No se pudo rechazar la solicitud.');
      }
    } catch (err: any) {
      alert(err.message || 'Error de conexión.');
    }
  };

  const handleTogglePauseBarber = async (barber: BarberProfile) => {
    const isCurrentlyPaused = barber.status === 'pausado' || barber.active === false;
    const nextStatus = isCurrentlyPaused ? 'aprobado' : 'pausado';
    const actionLabel = isCurrentlyPaused ? 'reanudar y activar' : 'pausar el acceso y la agenda de';
    
    if (!confirm(`¿Estás seguro de que deseas ${actionLabel} ${barber.name}?`)) return;

    try {
      const token = sessionStorage.getItem('barber_auth_token') || '';
      const res = await fetch(`/api/barbers/${encodeURIComponent(barber.id)}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-barber-id': activeBarber?.id || ''
        },
        body: JSON.stringify({ status: nextStatus })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await fetchBarbers();
        alert(`Cuenta de ${barber.name} ${isCurrentlyPaused ? 'activada y reanudada' : 'pausada temporalmente'}.`);
      } else {
        alert(data.error || 'No se pudo actualizar el estado del barbero.');
      }
    } catch (err: any) {
      alert(err.message || 'Error de conexión.');
    }
  };

  const handleDeleteBarber = async (barber: BarberProfile) => {
    if (!confirm(`⚠️ ¿Estás completamente seguro de que deseas ELIMINAR permanentemente la cuenta de ${barber.name}?\n\nEsta acción revocará su acceso a la app, cancelará sus sesiones y limpiará sus horarios publicados.`)) return;

    try {
      const token = sessionStorage.getItem('barber_auth_token') || '';
      const res = await fetch(`/api/barbers/${encodeURIComponent(barber.id)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-barber-id': activeBarber?.id || ''
        }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await fetchBarbers();
        alert(`La cuenta de ${barber.name} ha sido eliminada exitosamente.`);
      } else {
        alert(data.error || 'No se pudo eliminar la cuenta del barbero.');
      }
    } catch (err: any) {
      alert(err.message || 'Error al eliminar barbero.');
    }
  };

  const handleCopyBarberLink = (slugOrId: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}/?barber=${encodeURIComponent(slugOrId)}`;
    navigator.clipboard.writeText(url);
    setCopiedBarberSlug(slugOrId);
    setTimeout(() => setCopiedBarberSlug(null), 2500);
  };

  const fetchLiveSlots = async (date: string, bId?: string) => {
    setIsLoadingLiveSlots(true);
    try {
      const targetBId = bId !== undefined ? bId : (activeBarber?.id || undefined);
      const bQuery = targetBId ? `&barberId=${encodeURIComponent(targetBId)}` : '';
      const res = await fetch(`/api/slots?date=${date}&nocache=1${bQuery}`);
      const data = await res.json();
      if (data && Array.isArray(data.slots)) {
        const valid = data.slots.filter((s: BarberSlot) => !s.status.includes('DESHABILITADO'));
        const map = new Map<string, BarberSlot>();
        for (const s of valid) {
          if (!map.has(s.time) || s.status === 'RESERVADO') {
            map.set(s.time, s);
          }
        }
        const deduped = Array.from(map.values()).sort((a, b) => a.time.localeCompare(b.time));
        setLiveSlots(deduped);
      }
    } catch (err) {
      console.error('Error fetching live slots:', err);
    } finally {
      setIsLoadingLiveSlots(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'live_slots') {
      const targetDate = selectedFilterDate === 'todas' ? new Date().toISOString().split('T')[0] : selectedFilterDate;
      fetchLiveSlots(targetDate);
    }
  }, [activeTab, selectedFilterDate, activeBarber?.id]);

  const handleReleaseSlot = async (time: string) => {
    const targetDate = selectedFilterDate === 'todas' ? new Date().toISOString().split('T')[0] : selectedFilterDate;
    setReleasingSlotTime(time);
    try {
      const bId = activeBarber?.id || undefined;
      const res = await fetch('/api/slots/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: targetDate, time, barberId: bId })
      });
      if (res.ok) {
        await fetchLiveSlots(targetDate);
        onRefreshBookings();
      }
    } catch (err) {
      console.error('Error releasing slot:', err);
    } finally {
      setReleasingSlotTime(null);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingProfile(true);
    setProfileMessage(null);
    try {
      const res = await fetch('/api/barber/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('barber_auth_token') || ''}`,
          'x-barber-id': activeBarber?.id || ''
        },
        body: JSON.stringify({
          name: profileName.trim(),
          shopName: profileShopName.trim(),
          role: profileRole.trim(),
          phone: profilePhone.trim(),
          ...(profilePassword.trim() ? { password: profilePassword.trim() } : {})
        })
      });
      const data = await res.json();
      if (res.ok && data.success && data.barber) {
        // Immediately sync local form state with confirmed saved barber data
        setProfileName(data.barber.name);
        setProfileShopName(data.barber.shopName || '');
        setProfileRole(data.barber.role);
        setProfilePhone(data.barber.phone || '');
        setProfilePassword('');

        if (onUpdateCurrentBarber) {
          onUpdateCurrentBarber(data.barber, data.config);
        }
        setProfileMessage({ success: true, text: '¡Tus datos y contraseña se actualizaron correctamente!' });
        fetchBarbers();
      } else {
        setProfileMessage({ success: false, text: data.error || 'No se pudo actualizar el perfil.' });
      }
    } catch (err: any) {
      setProfileMessage({ success: false, text: err.message || 'Error de conexión.' });
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleCreateBarber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBarberName.trim()) return;
    setIsAddingBarber(true);
    try {
      const res = await fetch('/api/barber/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newBarberName.trim(),
          shopName: newBarberShopName.trim() || undefined,
          role: newBarberRole.trim() || 'Barbero Profesional',
          phone: newBarberPhone.trim(),
          email: newBarberEmail.trim() || undefined,
          password: newBarberPassword.trim() || 'barbero123'
        })
      });
      const data = await res.json();
      if (res.ok && data.success && data.barber) {
        setShowAddBarberModal(false);
        setNewBarberName('');
        setNewBarberPhone('');
        setNewBarberEmail('');
        setNewBarberPassword('');
        setNewBarberShopName('');
        await fetchBarbers();
        alert(`¡Cuenta creada para ${data.barber.name}! Ya puede iniciar sesión con su contraseña.`);
      } else {
        alert(data.error || 'No se pudo registrar al barbero.');
      }
    } catch (err: any) {
      alert(err.message || 'Error al crear barbero.');
    } finally {
      setIsAddingBarber(false);
    }
  };

  const handleShareBarberWhatsApp = (barber: BarberProfile) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const uniqueUrl = `${origin}/?barber=${encodeURIComponent(barber.slug || barber.id)}`;
    const text = `¡Hola! Reserva tu cita directamente conmigo (*${barber.name}*) desde mi enlace exclusivo:\n\n👉 ${uniqueUrl}\n\n¡Te espero para tu próximo corte y estilo! ✂️`;
    const shareUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(shareUrl, '_blank', 'noopener,noreferrer');
  };

  const isBookingMine = (b: Booking) => {
    if (!activeBarber) return true;
    const matchId = b.barberId && (b.barberId.toLowerCase() === activeBarber.id.toLowerCase() || b.barberId.toLowerCase() === activeBarber.slug.toLowerCase());
    const matchName = b.barberName && b.barberName.toLowerCase().includes(activeBarber.name.toLowerCase());
    return Boolean(matchId || matchName);
  };

  // Filter bookings (Strictly isolated to active barber)
  const filteredBookings = useMemo(() => {
    return bookings.filter(b => {
      if (!isBookingMine(b)) {
        return false;
      }
      if (selectedFilterDate && selectedFilterDate !== 'todas' && b.date !== selectedFilterDate) {
        return false;
      }
      if (statusFilter !== 'todos' && b.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = b.clientName.toLowerCase().includes(q);
        const matchPhone = b.clientPhone.toLowerCase().includes(q);
        const matchId = b.id.toLowerCase().includes(q);
        const matchServices = b.serviceNames.some(s => s.toLowerCase().includes(q));
        if (!matchName && !matchPhone && !matchId && !matchServices) return false;
      }
      return true;
    }).sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [bookings, activeBarber, selectedFilterDate, statusFilter, searchQuery]);

  // Today metrics strictly for active barber
  const todayStr = new Date().toISOString().split('T')[0];
  const todayBookings = useMemo(() => {
    return bookings.filter(b => b.date === todayStr && b.status !== 'cancelada' && isBookingMine(b));
  }, [bookings, todayStr, activeBarber]);

  const [audioChimeEnabled] = useState(true);

  // Track known booking IDs to detect new ones arriving in real-time
  const knownBookingIdsRef = React.useRef<Set<string>>(new Set(bookings.map(b => b.id)));

  // Polling for new bookings in real time (every 10 seconds)
  useEffect(() => {
    const checkNewBookings = async () => {
      try {
        const res = await fetch('/api/bookings');
        if (!res.ok) return;
        const freshBookings: Booking[] = await res.json();
        if (!Array.isArray(freshBookings)) return;

        const newOnes = freshBookings.filter(b => !knownBookingIdsRef.current.has(b.id));

        if (newOnes.length > 0) {
          newOnes.forEach(b => knownBookingIdsRef.current.add(b.id));
          
          const newest = newOnes[0];
          if (audioChimeEnabled) {
            notifyNewBooking({
              clientName: newest.clientName,
              date: newest.date,
              time: newest.startTime,
              phone: newest.clientPhone
            });
          }
          onRefreshBookings();
        }
      } catch (e) {
        // silent background check
      }
    };

    const interval = setInterval(checkNewBookings, 10000);
    return () => clearInterval(interval);
  }, [audioChimeEnabled, onRefreshBookings]);

  // Resend email
  const handleResendEmail = async (bookingId: string) => {
    setIsResendingEmail(bookingId);
    try {
      await fetch(`/api/bookings/${bookingId}/send-email`, { method: 'POST' });
      onRefreshBookings();
    } catch (err) {
      console.error(err);
    } finally {
      setIsResendingEmail(null);
    }
  };

  // Export to CSV
  const handleExportCsv = () => {
    const headers = ['ID', 'Fecha', 'Hora_Inicio', 'Hora_Fin', 'Cliente', 'Telefono', 'Correo', 'Servicios', 'Total_Precio', 'Estado', 'Notas'];
    const rows = bookings.map(b => [
      b.id,
      b.date,
      b.startTime,
      b.endTime,
      `"${b.clientName.replace(/"/g, '""')}"`,
      `"${b.clientPhone}"`,
      `"${b.clientEmail}"`,
      `"${b.serviceNames.join(' + ').replace(/"/g, '""')}"`,
      b.totalPrice,
      b.status,
      `"${(b.clientNotes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Citas_Barberia_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Bar with Metrics & Quick Actions */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1: Citas para Hoy */}
        <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Citas para Hoy
            </span>
            <CalendarIcon className="h-4 w-4 text-blue-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900">{todayBookings.length}</span>
            <span className="text-xs text-slate-500">turnos activos</span>
          </div>
        </div>

        {/* Metric 2: Equipo de Barberos (Admin) o Mis Citas Confirmadas (Barbero) */}
        <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {activeBarber?.isAdmin ? 'Equipo de Barberos' : 'Mis Citas Agendadas'}
            </span>
            <Users className="h-4 w-4 text-red-600" />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900">
                {activeBarber?.isAdmin ? barbersList.length : filteredBookings.length}
              </span>
              <span className="text-xs text-slate-500">
                {activeBarber?.isAdmin ? 'con enlace único' : 'reservas totales'}
              </span>
            </div>
            {activeBarber?.isAdmin && (
              <button
                onClick={() => setActiveTab('barberos')}
                className="text-xs font-bold text-red-600 hover:text-red-700 underline cursor-pointer"
              >
                Ver Enlaces
              </button>
            )}
          </div>
        </div>

        {/* Metric 3: Horarios Activos */}
        <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Horarios Activos
            </span>
            <Table className="h-4 w-4 text-blue-600" />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-blue-700">{liveSlots.length}</span>
              <span className="text-xs text-slate-500">cupos cargados</span>
            </div>
            <button
              onClick={() => setActiveTab('live_slots')}
              className="text-xs font-bold text-blue-700 hover:text-blue-800 underline cursor-pointer"
            >
              Ver Horarios
            </button>
          </div>
        </div>

        {/* Action button: Nueva Cita Manual */}
        <div className="flex flex-col justify-center rounded-2xl border border-stone-200 bg-stone-50 p-5 shadow-sm">
          <span className="text-xs font-semibold text-slate-700 mb-2">
            Gestión Rápida
          </span>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              id="btn-barber-quick-booking"
              onClick={onOpenQuickBooking}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-red-700 active:scale-95 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5 stroke-[3]" />
              <span>Cita Presencial</span>
            </button>
            <button
              id="btn-barber-open-schedule-top"
              onClick={() => setActiveTab('abrir_agenda')}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-blue-700 active:scale-95 cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Abrir Agenda</span>
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Subtabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab('citas')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'citas'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'border border-stone-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-stone-50'
            }`}
          >
            <CalendarIcon className="h-4 w-4" />
            <span>Mis Citas ({filteredBookings.length})</span>
          </button>

          <button
            id="tab-abrir-agenda"
            onClick={() => setActiveTab('abrir_agenda')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'abrir_agenda'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'border border-stone-200 bg-white text-blue-700 hover:bg-blue-50'
            }`}
          >
            <Sparkles className="h-4 w-4 text-blue-600" />
            <span>⚡ Abrir Horarios</span>
          </button>

          <button
            onClick={() => setActiveTab('live_slots')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'live_slots'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'border border-stone-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-stone-50'
            }`}
          >
            <Table className="h-4 w-4" />
            <span>Horarios Activos ({liveSlots.length})</span>
          </button>

          <button
            id="tab-mi-perfil"
            onClick={() => setActiveTab('perfil')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'perfil'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'border border-stone-200 bg-white text-slate-700 hover:text-slate-900 hover:bg-stone-50'
            }`}
          >
            <Key className="h-4 w-4 text-blue-600" />
            <span>Mi Perfil & Clave</span>
          </button>

          {/* Admin-only Approvals Tab */}
          {activeBarber?.isAdmin && (
            <button
              id="tab-barberos-admin"
              onClick={() => setActiveTab('barberos')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeTab === 'barberos'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'border border-stone-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-stone-50'
              }`}
            >
              <ShieldCheck className="h-4 w-4 text-amber-500" />
              <span>Aprobaciones</span>
              {pendingBarbers.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500 text-white font-bold animate-pulse">
                  {pendingBarbers.length} pendiente{pendingBarbers.length > 1 ? 's' : ''}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Quick barber logout button */}
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700 transition cursor-pointer"
          title="Cerrar sesión del barbero actual"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Salir</span>
        </button>
      </div>

      {activeTab === 'citas' && (
        <div className="space-y-6">
          {/* Control Filters & Search Bar */}
          <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              
              {/* Date Selector Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  id="filter-date-today"
                  onClick={() => setSelectedFilterDate(todayStr)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                    selectedFilterDate === todayStr
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'border border-stone-200 bg-stone-50 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Hoy
                </button>
                <button
                  id="filter-date-tomorrow"
                  onClick={() => {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    setSelectedFilterDate(tomorrow.toISOString().split('T')[0]);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                    selectedFilterDate !== todayStr && selectedFilterDate !== 'todas'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'border border-stone-200 bg-stone-50 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Mañana / Fecha
                </button>
                <button
                  id="filter-date-all"
                  onClick={() => setSelectedFilterDate('todas')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                    selectedFilterDate === 'todas'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'border border-stone-200 bg-stone-50 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Todas las Citas
                </button>

                {/* Manual Date Input */}
                <input
                  type="date"
                  value={selectedFilterDate === 'todas' ? '' : selectedFilterDate}
                  onChange={e => setSelectedFilterDate(e.target.value)}
                  className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs text-slate-800 focus:border-blue-600 focus:outline-none"
                />
              </div>

              {/* Search & Export */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 md:w-56">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar cliente, tel..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full rounded-lg border border-stone-300 bg-white py-1.5 pl-9 pr-3 text-xs text-slate-900 placeholder-stone-400 focus:border-blue-600 focus:outline-none shadow-2xs"
                  />
                </div>


                {/* Status Filter */}
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-blue-600 focus:outline-none"
                >
                  <option value="todos">Todos los estados</option>
                  <option value="confirmada">Confirmadas</option>
                  <option value="completada">Completadas</option>
                  <option value="cancelada">Canceladas</option>
                  <option value="no_asistio">No Asistió</option>
                </select>

                {/* Export to CSV */}
                <button
                  id="btn-export-csv"
                  onClick={handleExportCsv}
                  title="Descargar citas en formato CSV para Excel o Hojas de Cálculo"
                  className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-blue-400 hover:text-blue-700 transition shadow-2xs cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5 text-blue-600" />
                  <span className="hidden sm:inline">Exportar CSV</span>
                </button>

                {/* Refresh */}
                <button
                  onClick={onRefreshBookings}
                  title="Actualizar agenda"
                  className="rounded-lg border border-stone-200 bg-white p-2 text-slate-500 hover:text-slate-900 transition shadow-2xs cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Bookings List */}
          <div className="space-y-3">
            {filteredBookings.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-300 p-12 text-center bg-white shadow-sm">
                <Scissors className="mx-auto h-8 w-8 text-slate-400 mb-2" />
                <h4 className="text-sm font-semibold text-slate-800">No hay citas registradas</h4>
                <p className="mt-1 text-xs text-slate-500">
                  No se encontraron reservas con los filtros seleccionados.
                </p>
              </div>
            ) : (
              filteredBookings.map(booking => {
                const isCompleted = booking.status === 'completada';
                const isCanceled = booking.status === 'cancelada';

                return (
                  <div
                    key={booking.id}
                    id={`booking-row-${booking.id}`}
                    className={`rounded-2xl border p-5 transition-all shadow-sm ${
                      isCompleted
                        ? 'border-stone-200 bg-stone-50/80 opacity-80'
                        : isCanceled
                        ? 'border-red-200 bg-red-50/50 opacity-70'
                        : 'border-stone-200 bg-white hover:border-blue-300'
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-center lg:justify-between">
                      
                      {/* Left: Time & Client */}
                      <div className="flex items-start gap-3 sm:gap-4 min-w-0 flex-1">
                        {/* Time Pill */}
                        <div className="flex flex-col items-center justify-center rounded-xl bg-stone-50 border border-stone-200 px-2.5 sm:px-3 py-2 text-center min-w-[65px] sm:min-w-[75px] shrink-0">
                          <span className="text-xs text-slate-500 font-mono">
                            {booking.date.split('-').slice(1).join('/')}
                          </span>
                          <span className="text-sm font-bold text-blue-700">
                            {booking.startTime}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {booking.endTime}
                          </span>
                        </div>

                        {/* Details */}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                            <span className="text-sm sm:text-base font-bold text-slate-900 break-words">
                              {booking.clientName}
                            </span>
                            <span className="font-mono text-xs text-slate-400">
                              #{booking.id}
                            </span>
                            {/* Status Badge */}
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                booking.status === 'confirmada'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : booking.status === 'completada'
                                  ? 'bg-stone-100 text-stone-700 border border-stone-200'
                                  : booking.status === 'cancelada'
                                  ? 'bg-red-50 text-red-700 border border-red-200'
                                  : 'bg-stone-100 text-stone-500'
                              }`}
                            >
                              {booking.status}
                            </span>

                            {booking.emailSent && (
                              <span className="flex items-center gap-1 text-[10px] text-blue-700 font-medium" title="Correo de confirmación enviado al cliente">
                                <Mail className="h-3 w-3" />
                                <span>Email enviado</span>
                              </span>
                            )}
                          </div>

                          {/* Services & Price */}
                          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                            <span className="text-slate-900 font-medium">
                              ✂️ {booking.serviceNames.join(' + ')}
                            </span>
                            <span className="text-stone-300">•</span>
                            <span className="text-slate-500">
                              {booking.totalDurationMinutes} min
                            </span>
                            <span className="text-stone-300">•</span>
                            <strong className="text-blue-700 font-bold">
                              ${booking.totalPrice.toLocaleString()} (en sitio)
                            </strong>
                          </div>

                          {/* Contact Info */}
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                            <a
                              href={`tel:${booking.clientPhone}`}
                              className="flex items-center gap-1 hover:text-blue-700"
                            >
                              <Phone className="h-3 w-3 text-slate-400" />
                              <span>{booking.clientPhone}</span>
                            </a>
                            <span className="text-stone-300">|</span>
                            <a
                              href={`mailto:${booking.clientEmail}`}
                              className="flex items-center gap-1 hover:text-blue-700"
                            >
                              <Mail className="h-3 w-3 text-slate-400" />
                              <span>{booking.clientEmail}</span>
                            </a>
                          </div>

                          {/* Notes */}
                          {(booking.clientNotes || booking.preferredStyle) && (
                            <div className="mt-2 rounded-lg bg-stone-50 border border-stone-200 px-3 py-1.5 text-xs text-slate-600">
                              <strong>Preferencia:</strong> {booking.preferredStyle || ''} {booking.clientNotes ? `• ${booking.clientNotes}` : ''}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: Action Buttons */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* WhatsApp Reminder */}
                        <a
                          href={generateReminderWhatsApp(booking, config)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 shadow-2xs cursor-pointer"
                          title="Enviar recordatorio automático de WhatsApp al cliente"
                        >
                          <Send className="h-3.5 w-3.5 text-emerald-700" />
                          <span>Recordatorio WhatsApp</span>
                        </a>

                        {/* Resend confirmation email */}
                        <button
                          onClick={() => handleResendEmail(booking.id)}
                          disabled={isResendingEmail === booking.id}
                          className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:text-slate-900 shadow-2xs cursor-pointer"
                          title="Reenviar correo electrónico de confirmación"
                        >
                          <Mail className="h-3 w-3 text-slate-400" />
                          <span>{isResendingEmail === booking.id ? 'Enviando...' : 'Reenviar Email'}</span>
                        </button>

                        {/* Status Toggle Actions */}
                        {booking.status !== 'completada' && (
                          <button
                            onClick={() => onUpdateStatus(booking.id, 'completada')}
                            className="flex items-center gap-1 rounded-lg bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100 transition shadow-2xs cursor-pointer"
                          >
                            <CheckCircle className="h-3.5 w-3.5 text-blue-600" />
                            <span>Completar</span>
                          </button>
                        )}

                        {booking.status !== 'cancelada' && (
                          <button
                            onClick={() => onUpdateStatus(booking.id, 'cancelada')}
                            className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition shadow-2xs cursor-pointer"
                          >
                            <XCircle className="h-3.5 w-3.5 text-red-600" />
                            <span>Cancelar</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* VIEW: ABRIR AGENDA / DEFINIR HORARIOS DESDE LA APP */}
      {activeTab === 'abrir_agenda' && (
        <ScheduleOpener
          config={config}
          selectedBarberId={activeBarber?.id}
          onSlotsUpdated={() => {
            const targetDate = selectedFilterDate === 'todas' ? todayStr : selectedFilterDate;
            fetchLiveSlots(targetDate, activeBarber?.id);
            onRefreshBookings();
          }}
          onViewLiveSlots={() => setActiveTab('live_slots')}
          onViewBookings={() => setActiveTab('citas')}
        />
      )}

      {/* VIEW 2: HORARIOS EN VIVO SQLITE */}
      {activeTab === 'live_slots' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Table className="h-5 w-5 text-blue-600" />
                  <span>Horarios Activos en Sistema ({selectedFilterDate === 'todas' ? todayStr : selectedFilterDate})</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Consulta y gestión en tiempo real de los horarios y cupos disponibles en la base de datos SQLite.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={selectedFilterDate === 'todas' ? todayStr : selectedFilterDate}
                  onChange={e => setSelectedFilterDate(e.target.value)}
                  className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-blue-600 focus:outline-none shadow-2xs"
                />
                <button
                  onClick={() => fetchLiveSlots(selectedFilterDate === 'todas' ? todayStr : selectedFilterDate)}
                  disabled={isLoadingLiveSlots}
                  className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-stone-50 transition disabled:opacity-50 shadow-2xs cursor-pointer"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isLoadingLiveSlots ? 'animate-spin' : ''}`} />
                  <span>Actualizar</span>
                </button>
                <button
                  onClick={() => {
                    setActiveTab('abrir_agenda');
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 transition shadow-sm cursor-pointer"
                  title="Modificar los horarios y disponibilidad de este día desde Abrir Agenda"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Modificar en Abrir Agenda</span>
                </button>
              </div>
            </div>

            {/* Slots List / Table */}
            <div className="mt-5 overflow-hidden rounded-xl border border-stone-200 bg-stone-50/50">
              {isLoadingLiveSlots ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  <RefreshCw className="mx-auto h-6 w-6 animate-spin text-blue-600 mb-2" />
                  Consultando disponibilidad en base de datos...
                </div>
              ) : liveSlots.length === 0 ? (
                <div className="p-8 text-center bg-white">
                  <Table className="mx-auto h-8 w-8 text-slate-400 mb-2" />
                  <p className="text-xs text-slate-500">
                    No se encontraron cupos registrados para esta fecha. Para habilitar o modificar los horarios disponibles, usa el botón "Abrir Agenda".
                  </p>
                  <button
                    onClick={() => setActiveTab('abrir_agenda')}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-blue-700 shadow-sm cursor-pointer"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>⚡ Abrir Agenda para esta Fecha</span>
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-stone-200">
                  {liveSlots.map((slot, index) => {
                    const isAvailable = slot.status === 'DISPONIBLE';
                    const isReserved = slot.status === 'RESERVADO';

                    return (
                      <div
                        key={`${slot.time}-${index}`}
                        className={`flex flex-col sm:flex-row sm:items-center sm:justify-between p-3.5 transition ${
                          isAvailable
                            ? 'bg-blue-50/30 hover:bg-blue-50/60'
                            : isReserved
                            ? 'bg-red-50/30 hover:bg-red-50/60'
                            : 'bg-stone-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                          <div className="flex h-10 w-14 sm:w-16 items-center justify-center rounded-lg border border-stone-200 bg-white font-mono text-xs sm:text-sm font-black text-slate-900 shadow-2xs shrink-0">
                            {slot.time}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  isAvailable
                                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                    : isReserved
                                    ? 'bg-red-50 text-red-700 border border-red-200'
                                    : slot.notes === 'Hora pasada'
                                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                    : 'bg-stone-100 text-stone-500 border border-stone-200'
                                }`}
                              >
                                {slot.notes === 'Hora pasada' ? 'Hora Pasada' : slot.status}
                              </span>

                              {isReserved && slot.client && (
                                <span className="text-xs font-bold text-slate-900">
                                  {slot.client}
                                </span>
                              )}
                            </div>

                            <div className="mt-1 text-xs text-slate-600 flex flex-wrap gap-2">
                              {slot.service && (
                                <span>✂️ {slot.service}</span>
                              )}
                              {slot.phone && (
                                <span>📞 {slot.phone}</span>
                              )}
                              {slot.price && (
                                <span className="text-blue-700 font-semibold">${slot.price}</span>
                              )}
                              {slot.notes && (
                                <span className="text-slate-400 italic">({slot.notes})</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="mt-2 sm:mt-0 flex items-center gap-2">
                          {!isAvailable && (
                            <button
                              onClick={() => handleReleaseSlot(slot.time)}
                              disabled={releasingSlotTime === slot.time}
                              className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100 transition disabled:opacity-50 shadow-2xs cursor-pointer"
                              title="Cambia el estado de esta franja a DISPONIBLE"
                            >
                              <RefreshCw className={`h-3 w-3 ${releasingSlotTime === slot.time ? 'animate-spin' : ''}`} />
                              <span>Liberar Cupo</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VIEW: MI PERFIL & SEGURIDAD */}
      {activeTab === 'perfil' && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            
            {/* Left Col: Edit personal profile */}
            <div className="lg:col-span-2 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3 border-b border-stone-200 pb-4 mb-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <Key className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Mi Perfil y Seguridad</h3>
                  <p className="text-xs text-slate-500">
                    Edita tu nombre público, el nombre de tu barbería, especialidad, teléfono y contraseña personal.
                  </p>
                </div>
              </div>

              {profileMessage && (
                <div className={`mb-5 rounded-xl p-3 text-xs border ${
                  profileMessage.success 
                    ? 'border-blue-200 bg-blue-50 text-blue-900' 
                    : 'border-red-200 bg-red-50 text-red-900'
                }`}>
                  {profileMessage.text}
                </div>
              )}

              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nombre Público *
                    </label>
                    <input
                      type="text"
                      required
                      value={profileName}
                      onChange={e => setProfileName(e.target.value)}
                      className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none shadow-2xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                      <Store className="h-3.5 w-3.5 text-blue-600" />
                      <span>Nombre de tu Barbería / Estudio</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. Alejo Barber Studio"
                      value={profileShopName}
                      onChange={e => setProfileShopName(e.target.value)}
                      className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder-stone-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none shadow-2xs"
                    />
                    <p className="mt-1 text-[10px] text-slate-400">
                      Aparece en el banner: "Estás por reservar con {profileName || 'el barbero'} de {profileShopName || 'su barbería'}"
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Cargo o Especialidad
                    </label>
                    <input
                      type="text"
                      value={profileRole}
                      onChange={e => setProfileRole(e.target.value)}
                      className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none shadow-2xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Teléfono / WhatsApp
                    </label>
                    <input
                      type="tel"
                      value={profilePhone}
                      onChange={e => setProfilePhone(e.target.value)}
                      placeholder="+57 300 000 0000"
                      className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none shadow-2xs"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nueva Contraseña Personal
                    </label>
                    <input
                      type="password"
                      placeholder="Dejar vacío para no cambiarla"
                      value={profilePassword}
                      onChange={e => setProfilePassword(e.target.value)}
                      className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder-stone-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none shadow-2xs"
                    />
                  </div>
                </div>

                {/* Biometrics Section */}
                <div className="mt-6 pt-5 border-t border-stone-200">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <Fingerprint className="h-4 w-4" />
                      </span>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                          Acceso Biométrico (Huella / Face ID)
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Inicia sesión instantáneamente con el sensor de huellas, Face ID o Windows Hello de tu dispositivo
                        </p>
                      </div>
                    </div>
                  </div>

                  {biometricMessage && (
                    <div className={`mb-3 rounded-xl p-3 text-xs border ${
                      biometricMessage.success 
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-900' 
                        : 'border-red-200 bg-red-50 text-red-900'
                    }`}>
                      {biometricMessage.text}
                    </div>
                  )}

                  {/* Device registration button & status */}
                  <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-slate-800">
                          Sensor Biométrico en este dispositivo
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {isBiometricsAvailable 
                            ? '✅ Tu dispositivo cuenta con sensor biométrico compatible.' 
                            : '⚠️ Se requiere conexión segura (HTTPS o localhost) y un dispositivo con sensor biométrico.'}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleRegisterBiometrics}
                        disabled={isRegisteringBiometrics || !isBiometricsAvailable}
                        className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 text-xs transition shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                      >
                        <Fingerprint className="h-4 w-4" />
                        <span>{isRegisteringBiometrics ? 'Vinculando...' : 'Vincular Este Dispositivo'}</span>
                      </button>
                    </div>

                    {/* List of registered authenticators */}
                    {registeredDevices.length > 0 && (
                      <div className="pt-3 border-t border-stone-200">
                        <span className="text-[11px] font-bold text-slate-600 block mb-2">
                          Dispositivos biométricos vinculados ({registeredDevices.length}):
                        </span>
                        <div className="space-y-2">
                          {registeredDevices.map(dev => (
                            <div key={dev.id} className="flex items-center justify-between bg-white rounded-lg border border-stone-200 px-3 py-2 text-xs">
                              <div className="flex items-center gap-2">
                                <Fingerprint className="h-3.5 w-3.5 text-emerald-600" />
                                <div>
                                  <span className="font-semibold text-slate-800">{dev.deviceName || 'Sensor Biométrico'}</span>
                                  <span className="text-[10px] text-slate-400 block">
                                    Registrado: {new Date(dev.createdAt).toLocaleDateString('es-CO')}
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeleteDevice(dev.id)}
                                className="text-slate-400 hover:text-red-600 transition p-1 cursor-pointer"
                                title="Desvincular este dispositivo"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-stone-200 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">
                    Tus cambios se aplican de inmediato en tu cuenta y reservas.
                  </span>
                  <button
                    type="submit"
                    disabled={isUpdatingProfile}
                    className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition shadow-sm cursor-pointer"
                  >
                    {isUpdatingProfile ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                </div>
              </form>
            </div>

            {/* Right Col: Personal booking link card */}
            <div className="rounded-2xl border border-stone-200 bg-white p-6 flex flex-col justify-between shadow-sm">
              <div>
                <div className="flex items-center gap-2 text-blue-700 mb-3">
                  <Link className="h-4 w-4" />
                  <h4 className="text-xs font-bold uppercase tracking-wider">Tu Enlace Exclusivo</h4>
                </div>

                <p className="text-xs text-slate-500 mb-3">
                  Comparte este enlace con tus clientes por WhatsApp o redes sociales. Al abrirlo, el cliente agendará exclusivamente contigo:
                </p>

                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 mb-4">
                  <p className="font-mono text-xs text-red-600 break-all select-all font-semibold">
                    {typeof window !== 'undefined' ? window.location.origin : ''}/?barber={encodeURIComponent(activeBarber?.slug || activeBarber?.id || '')}
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => handleCopyBarberLink(activeBarber?.slug || activeBarber?.id || '')}
                    className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-red-700 transition shadow-sm cursor-pointer"
                  >
                    {copiedBarberSlug === (activeBarber?.slug || activeBarber?.id) ? (
                      <>
                        <Check className="h-4 w-4 stroke-[3]" />
                        <span>¡Enlace Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        <span>Copiar Mi Enlace</span>
                      </>
                    )}
                  </button>

                  {activeBarber && (
                    <button
                      onClick={() => handleShareBarberWhatsApp(activeBarber)}
                      className="flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition shadow-2xs cursor-pointer"
                    >
                      <Send className="h-4 w-4 text-emerald-700" />
                      <span>Enviar por WhatsApp</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-stone-200 flex items-center justify-between text-[11px] text-slate-500">
                <span>ID: {activeBarber?.id}</span>
                <span className="text-blue-700 font-semibold">Cuenta Activa</span>
              </div>
            </div>

          </div>

          {/* Bottom Grid: Live Push Notifications & Centralized Email System */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Card 1: Web Push Notifications for Barbers */}
            <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 border-b border-stone-200 pb-4 mb-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                    <BellRing className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Notificaciones Push en Vivo</h3>
                    <p className="text-[11px] text-slate-500">
                      Avisos instantáneos en pantalla cuando un cliente reserve un turno contigo.
                    </p>
                  </div>
                </div>

                {pushStatusMessage && (
                  <div className={`mb-4 rounded-xl p-3 text-xs border ${
                    pushStatusMessage.success
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                      : 'border-red-200 bg-red-50 text-red-900'
                  }`}>
                    {pushStatusMessage.text}
                  </div>
                )}

                <div className="space-y-3 mb-5">
                  <div className="flex items-center justify-between rounded-xl bg-stone-50 border border-stone-200 p-3 text-xs">
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4 text-slate-500" />
                      <span className="font-semibold text-slate-700">Estado en este dispositivo:</span>
                    </div>
                    {isPushSubscribed ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-800 font-bold px-2.5 py-1 text-[11px]">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        Activas
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-200 text-stone-700 font-semibold px-2.5 py-1 text-[11px]">
                        Inactivas
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    Al activar las notificaciones, este celular o navegador quedará enlazado a tu cuenta (<strong>{activeBarber?.name}</strong>). Cuando cualquier cliente agende un turno contigo, recibirás una notificación emergente con sonido y vibración con los datos del cliente, la hora y el servicio.
                  </p>

                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-[11px] text-indigo-900">
                    <p className="font-semibold mb-0.5">💡 Consejo de uso en el celular:</p>
                    <p className="text-indigo-800">
                      Para recibir notificaciones aun con el celular bloqueado, instala la app tocando <em>"Agregar a la pantalla principal"</em> y activa el interruptor a continuación.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-stone-200 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleTogglePush}
                  disabled={isSubscribingPush || !isPushSupportedDevice}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    isPushSubscribed
                      ? 'border border-stone-300 bg-stone-100 text-stone-700 hover:bg-stone-200'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  <Bell className="h-4 w-4" />
                  <span>
                    {isSubscribingPush
                      ? 'Procesando...'
                      : isPushSubscribed
                        ? 'Desactivar en este Dispositivo'
                        : '🔔 Activar Notificaciones Push'}
                  </span>
                </button>

                {isPushSubscribed && (
                  <button
                    type="button"
                    onClick={handleSendTestPush}
                    disabled={isSendingTestPush}
                    className="flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 py-2.5 px-3.5 text-xs font-bold transition cursor-pointer shadow-2xs disabled:opacity-50"
                    title="Enviar notificación de prueba"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>{isSendingTestPush ? 'Probando...' : 'Probar Notificación'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Card 2: Centralized Email Service */}
            <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 border-b border-stone-200 pb-4 mb-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-100">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Correo Electrónico Centralizado</h3>
                    <p className="text-[11px] text-slate-500">
                      Confirmaciones automáticas emitidas desde la cuenta oficial de la plataforma.
                    </p>
                  </div>
                </div>

                {emailStatusMessage && (
                  <div className={`mb-4 rounded-xl p-3 text-xs border ${
                    emailStatusMessage.success
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                      : 'border-red-200 bg-red-50 text-red-900'
                  }`}>
                    {emailStatusMessage.text}
                  </div>
                )}

                <div className="space-y-2.5 mb-5 text-xs">
                  <div className="flex items-center justify-between rounded-xl bg-stone-50 border border-stone-200 p-2.5">
                    <span className="text-slate-600 font-semibold">Estado del Servicio:</span>
                    {emailServiceStatus?.mode === 'smtp' ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 text-[11px]">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        Conectado a SMTP Real
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-800 font-bold px-2.5 py-0.5 text-[11px]">
                        Modo Simulación / Logs
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between py-1 border-b border-stone-100 text-slate-600">
                    <span>Remitente Central (FROM):</span>
                    <strong className="text-slate-900 font-mono text-[11px]">
                      {emailServiceStatus?.from || `"${config.shopName}" <${config.email}>`}
                    </strong>
                  </div>

                  <div className="flex items-center justify-between py-1 border-b border-stone-100 text-slate-600">
                    <span>Tu correo de recepción:</span>
                    <strong className="text-slate-900 font-mono text-[11px]">
                      {activeBarber?.email || 'Sin correo asociado'}
                    </strong>
                  </div>

                  <div className="flex items-center justify-between py-1 text-slate-600">
                    <span>Servidor SMTP Saliente:</span>
                    <span className="text-slate-700 font-medium">
                      {emailServiceStatus?.host || 'smtp.gmail.com'}
                    </span>
                  </div>

                  <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-[11px] text-slate-600">
                    <p className="font-semibold text-slate-800 mb-0.5">ℹ️ ¿Cómo funciona el envío centralizado?</p>
                    <p>
                      Los barberos no necesitan configurar contraseñas ni cuentas de correo individuales. Todos los correos a clientes y avisos al barbero son despachados desde la cuenta central configurada en el servidor (Render).
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-stone-200 flex items-center justify-between">
                <span className="text-[11px] text-slate-500">
                  {emailServiceStatus?.recentLogsCount || 0} correo(s) registrados en historial
                </span>
                <button
                  type="button"
                  onClick={handleSendTestEmail}
                  disabled={isSendingTestEmail}
                  className="flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 px-4 text-xs transition shadow-sm cursor-pointer disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>{isSendingTestEmail ? 'Enviando prueba...' : 'Enviar Correo de Prueba'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 4: ADMINISTRACIÓN Y APROBACIONES (SUPERUSUARIO ÚNICAMENTE) */}
      {activeTab === 'barberos' && activeBarber?.isAdmin && (
        <div className="space-y-6">
          {/* Header & New Barber CTA */}
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
                    <ShieldCheck className="h-5 w-5 text-amber-600" />
                  </span>
                  <h3 className="text-lg font-bold text-slate-900 font-serif">
                    Administración de Cuentas y Aprobaciones
                  </h3>
                </div>
                <p className="mt-1 text-xs text-slate-500 max-w-2xl">
                  Panel de superusuario para validar solicitudes de activación de nuevos barberos y supervisar las cuentas registradas en la plataforma.
                </p>
              </div>

              <button
                id="btn-add-barber-open"
                onClick={() => setShowAddBarberModal(true)}
                className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-red-700 active:scale-95 cursor-pointer"
              >
                <Plus className="h-4 w-4 stroke-[3]" />
                <span>Registrar Nuevo Barbero</span>
              </button>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-3.5">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-700 mb-1">
                  <span>1. Enlace Personal</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Copia o envía el link por WhatsApp a tus clientes o colócalo en el perfil de Instagram de cada barbero.
                </p>
              </div>

              <div className="rounded-xl border border-stone-200 bg-stone-50 p-3.5">
                <div className="flex items-center gap-2 text-xs font-bold text-red-600 mb-1">
                  <span>2. Reserva Directa</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Al entrar al link, el cliente ve los cupos y la agenda correspondiente exclusivamente a ese barbero.
                </p>
              </div>

              <div className="rounded-xl border border-stone-200 bg-stone-50 p-3.5">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-700 mb-1">
                  <span>3. Filtros y Notificación</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Puedes filtrar citas y horarios por cada barbero con un solo clic desde este panel.
                </p>
              </div>
            </div>
          </div>

          {/* Admin Pending Approvals Section (Superuser only) */}
          {activeBarber?.isAdmin && (
            <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/50 p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800 border border-amber-300">
                    <ShieldCheck className="h-5 w-5 text-amber-700" />
                  </span>
                  <div>
                    <h4 className="text-base font-bold text-slate-900 font-serif">
                      Panel de Aprobación de Barberos (Superusuario)
                    </h4>
                    <p className="text-xs text-slate-600">
                      Como administrador tienes la potestad exclusiva para validar y habilitar nuevas cuentas de barberos.
                    </p>
                  </div>
                </div>
                <span className="self-start sm:self-auto px-3 py-1 rounded-full text-xs font-bold bg-amber-200 text-amber-900 border border-amber-300">
                  {pendingBarbers.length} {pendingBarbers.length === 1 ? 'solicitud pendiente' : 'solicitudes pendientes'}
                </span>
              </div>

              {pendingBarbers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-amber-200 bg-white/70 p-4 text-center text-xs text-slate-500">
                  ✅ No hay solicitudes pendientes de aprobación en este momento. Todos los barberos están al día.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {pendingBarbers.map(barber => (
                    <div
                      key={barber.id}
                      className="rounded-xl border border-amber-200 bg-white p-4 shadow-xs flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <h5 className="text-sm font-bold text-slate-900">{barber.name}</h5>
                            <p className="text-xs text-slate-500 font-medium">{barber.shopName || `${barber.name} Studio`}</p>
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 shrink-0">
                            ⏳ Por Validar
                          </span>
                        </div>
                        <div className="space-y-1 text-xs text-slate-600 mb-3 bg-stone-50 rounded-lg p-2.5">
                          <p><strong>Correo:</strong> <span className="font-mono">{barber.email || 'N/A'}</span></p>
                          <p><strong>Teléfono:</strong> {barber.phone || 'N/A'}</p>
                          <p><strong>Especialidad:</strong> {barber.role || 'Barbero'}</p>
                          {barber.createdAt && (
                            <p className="text-[10px] text-slate-400 pt-1">
                              Registrado: {new Date(barber.createdAt).toLocaleString('es-CO')}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t border-stone-100">
                        <button
                          type="button"
                          onClick={() => handleApproveBarber(barber.id)}
                          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-3 text-xs transition shadow-xs cursor-pointer"
                        >
                          <Check className="h-3.5 w-3.5 stroke-[3]" />
                          <span>Aprobar Barbero</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRejectBarber(barber.id)}
                          className="flex items-center justify-center gap-1 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-bold py-2 px-3 text-xs transition cursor-pointer"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          <span>Rechazar</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Barber List Grid */}
          <div className="grid gap-4 sm:grid-cols-2">
            {approvedBarbers.map(barber => {
              const origin = typeof window !== 'undefined' ? window.location.origin : '';
              const linkUrl = `${origin}/?barber=${encodeURIComponent(barber.slug || barber.id)}`;
              const isCopied = copiedBarberSlug === (barber.slug || barber.id);
              const barberBookingsCount = bookings.filter(b => b.barberId === barber.id).length;

              const isPaused = barber.status === 'pausado' || barber.active === false;
              const isPrimaryAdmin = barber.id === 'alejandro' || barber.isAdmin;

              return (
                <div
                  key={barber.id}
                  className={`rounded-2xl border p-5 shadow-sm transition flex flex-col justify-between ${
                    isPaused ? 'border-amber-300 bg-amber-50/40' : 'border-stone-200 bg-white hover:border-blue-300'
                  }`}
                >
                  <div>
                    {/* Top: Avatar & Info */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {barber.photoUrl ? (
                          <img
                            src={barber.photoUrl}
                            alt={barber.name}
                            className={`h-12 w-12 rounded-2xl object-cover border shadow-xs ring-2 ${
                              isPaused ? 'border-amber-300 ring-amber-200 grayscale' : 'border-stone-200 ring-blue-100'
                            }`}
                          />
                        ) : (
                          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl font-bold text-base border shadow-xs ${
                            isPaused ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}>
                            {barber.name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="text-base font-bold text-slate-900">{barber.name}</h4>
                            {barber.isAdmin && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                👑 Superusuario
                              </span>
                            )}
                            {isPaused ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                <Pause className="h-2.5 w-2.5 fill-amber-700" />
                                Pausado
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                ✅ Activo
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-600 font-medium">{barber.role}</p>
                          <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500">
                            {barber.phone && <span>📞 {barber.phone}</span>}
                            <span>🗓️ {barberBookingsCount} citas</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Notice if Paused */}
                    {isPaused && (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-100/70 p-2.5 text-xs text-amber-900 flex items-center gap-2">
                        <Pause className="h-4 w-4 text-amber-700 shrink-0" />
                        <span>Este barbero tiene su acceso y agenda temporalmente pausados. No puede iniciar sesión ni recibir reservas.</span>
                      </div>
                    )}

                    {/* Unique Link Box */}
                    <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1">
                          <Link className="h-3 w-3 text-blue-600" />
                          <span>Enlace Único de Reserva</span>
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          slug: {barber.slug}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={linkUrl}
                          className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 font-mono text-[11px] text-red-600 select-all focus:outline-none"
                        />
                      </div>

                      {/* Action buttons for this barber link */}
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopyBarberLink(barber.slug || barber.id)}
                          className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                            isCopied
                              ? 'bg-blue-600 text-white'
                              : 'bg-red-600 text-white hover:bg-red-700'
                          }`}
                        >
                          {isCopied ? (
                            <>
                              <Check className="h-3.5 w-3.5 stroke-[3]" />
                              <span>¡Enlace Copiado!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" />
                              <span>Copiar Enlace</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleShareBarberWhatsApp(barber)}
                          className="flex items-center justify-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition shadow-2xs cursor-pointer"
                          title="Compartir link directo por WhatsApp"
                        >
                          <Send className="h-3.5 w-3.5 text-emerald-700" />
                          <span>WhatsApp</span>
                        </button>

                        <a
                          href={linkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-stone-50 transition shadow-2xs"
                          title="Abrir enlace de reserva como lo vería un cliente"
                        >
                          <ExternalLink className="h-3 w-3 text-slate-400" />
                          <span>Probar</span>
                        </a>
                      </div>
                    </div>

                    {/* Superuser Management Controls (Pause / Unpause / Delete) */}
                    {!isPrimaryAdmin && (
                      <div className="mt-3 pt-3 border-t border-dashed border-stone-200 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleTogglePauseBarber(barber)}
                          className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition cursor-pointer ${
                            isPaused
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                              : 'border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800'
                          }`}
                          title={isPaused ? 'Reanudar acceso y activar agenda' : 'Pausar temporalmente acceso y agenda'}
                        >
                          {isPaused ? (
                            <>
                              <Play className="h-3.5 w-3.5 fill-current" />
                              <span>Reanudar Acceso</span>
                            </>
                          ) : (
                            <>
                              <Pause className="h-3.5 w-3.5 fill-current" />
                              <span>Pausar Acceso</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteBarber(barber)}
                          className="flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-bold px-2.5 py-1.5 text-xs transition cursor-pointer"
                          title="Eliminar cuenta y cancelar sus horarios"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Eliminar</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Footer of card */}
                  <div className="mt-4 pt-3 border-t border-stone-200 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500 font-medium">
                      {barber.shopName ? `💈 ${barber.shopName}` : '💈 BarberTurno'}
                    </span>
                    <a
                      href={`/?barber=${encodeURIComponent(barber.slug || barber.id)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-bold text-blue-700 hover:text-blue-800 underline cursor-pointer"
                    >
                      Ver vista cliente →
                    </a>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Modal to Add Barber */}
          {showAddBarberModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
              <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl">
                <div className="flex items-center justify-between border-b border-stone-200 pb-3 mb-4">
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Users className="h-5 w-5 text-blue-600" />
                    <span>Registrar Nuevo Barbero</span>
                  </h3>
                  <button
                    onClick={() => setShowAddBarberModal(false)}
                    className="rounded-lg p-1 text-slate-400 hover:bg-stone-100 hover:text-slate-900 cursor-pointer"
                  >
                    <XCircle className="h-5 w-5" />
                  </button>
                </div>

                <form onSubmit={handleCreateBarber} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nombre Completo *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. Mateo Gómez"
                      value={newBarberName}
                      onChange={e => setNewBarberName(e.target.value)}
                      className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder-stone-400 focus:border-blue-600 focus:outline-none shadow-2xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                      <Store className="h-3.5 w-3.5 text-blue-600" />
                      <span>Nombre de su Barbería / Estudio (Opcional)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. Mateo Barber Club"
                      value={newBarberShopName}
                      onChange={e => setNewBarberShopName(e.target.value)}
                      className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder-stone-400 focus:border-blue-600 focus:outline-none shadow-2xs"
                    />
                    <p className="mt-1 text-[10px] text-slate-400">
                      Identificará su local de forma independiente en su enlace de reserva exclusivo.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Especialidad / Cargo
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. Barbero Master - Fade y Barbas"
                      value={newBarberRole}
                      onChange={e => setNewBarberRole(e.target.value)}
                      className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder-stone-400 focus:border-blue-600 focus:outline-none shadow-2xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Teléfono / WhatsApp
                    </label>
                    <input
                      type="tel"
                      placeholder="+57 300 000 0000"
                      value={newBarberPhone}
                      onChange={e => setNewBarberPhone(e.target.value)}
                      className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder-stone-400 focus:border-blue-600 focus:outline-none shadow-2xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Contraseña de Ingreso *
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="Mínimo 4 caracteres (ej. clave2026)"
                      value={newBarberPassword}
                      onChange={e => setNewBarberPassword(e.target.value)}
                      className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder-stone-400 focus:border-blue-600 focus:outline-none shadow-2xs"
                    />
                    <p className="mt-1 text-[10px] text-slate-400">
                      Esta contraseña le permitirá a este barbero ingresar únicamente a su panel y su agenda.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Correo Electrónico (Opcional)
                    </label>
                    <input
                      type="email"
                      placeholder="barbero@ejemplo.com"
                      value={newBarberEmail}
                      onChange={e => setNewBarberEmail(e.target.value)}
                      className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder-stone-400 focus:border-blue-600 focus:outline-none shadow-2xs"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200">
                    <button
                      type="button"
                      onClick={() => setShowAddBarberModal(false)}
                      className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-stone-50 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isAddingBarber}
                      className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                    >
                      {isAddingBarber ? 'Guardando...' : 'Crear Barbero y Generar Enlace'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
