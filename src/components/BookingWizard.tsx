import React, { useState, useMemo, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  User, 
  Phone, 
  Mail, 
  Check, 
  CheckCircle2, 
  AlertCircle, 
  ArrowLeft, 
  Scissors, 
  Sparkles, 
  Send, 
  Download, 
  ExternalLink, 
  ChevronRight, 
  Store,
  Pause 
} from 'lucide-react';
import { BarberShopConfig, BarberProfile, Booking, BarberSlot, BarberDateOption } from '../types';
import { getGoogleCalendarUrl, downloadIcsFile } from '../lib/calendar';
import { generateClientConfirmationWhatsApp } from '../lib/whatsapp';

interface BookingWizardProps {
  config: BarberShopConfig;
  existingBookings: Booking[];
  onBookingSuccess: (newBooking: Booking) => void;
}

function normalizeSlotDate(rawDate: any): string {
  if (!rawDate) return '';
  const s = String(rawDate).trim();
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
  return s;
}

export const BookingWizard: React.FC<BookingWizardProps> = ({
  config,
  existingBookings,
  onBookingSuccess
}) => {
  // Wizard steps: 1 = Date & Time slot, 2 = Client info, 3 = Confirmation ticket
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Check if a barber slug was provided in the URL (e.g. ?barber=alejandro or ?b=alejandro)
  const urlBarberSlug = useMemo(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('barber') || params.get('b') || '';
    }
    return '';
  }, []);

  // Paused barber detection
  const [isBarberPaused, setIsBarberPaused] = useState<boolean>(() => {
    if (urlBarberSlug && config.barbers && config.barbers.length > 0) {
      const found = config.barbers.find(
        b => b.slug.toLowerCase() === urlBarberSlug.toLowerCase() || b.id.toLowerCase() === urlBarberSlug.toLowerCase()
      );
      if (found && (found.status === 'pausado' || found.active === false)) {
        return true;
      }
    }
    return false;
  });

  const [pausedBarberInfo, setPausedBarberInfo] = useState<Partial<BarberProfile> | null>(() => {
    if (urlBarberSlug && config.barbers && config.barbers.length > 0) {
      const found = config.barbers.find(
        b => b.slug.toLowerCase() === urlBarberSlug.toLowerCase() || b.id.toLowerCase() === urlBarberSlug.toLowerCase()
      );
      if (found && (found.status === 'pausado' || found.active === false)) {
        return found;
      }
    }
    return null;
  });

  const [selectedBarber, setSelectedBarber] = useState<BarberProfile | null>(() => {
    if (urlBarberSlug && config.barbers && config.barbers.length > 0) {
      const found = config.barbers.find(
        b => b.slug.toLowerCase() === urlBarberSlug.toLowerCase() || b.id.toLowerCase() === urlBarberSlug.toLowerCase()
      );
      if (found) {
        if (found.status === 'pausado' || found.active === false) {
          return null;
        }
        return found;
      }
    }
    return null;
  });

  // If barber was not in config.barbers initially, try to fetch it from API
  useEffect(() => {
    if (urlBarberSlug) {
      fetch(`/api/barber/profile/${encodeURIComponent(urlBarberSlug)}`)
        .then(async res => {
          const data = await res.json().catch(() => null);
          if (res.status === 403 && data && (data.isPaused || data.error?.includes('pausada'))) {
            setIsBarberPaused(true);
            setPausedBarberInfo(data.barber || { name: urlBarberSlug });
            setSelectedBarber(null);
            return;
          }
          if (res.ok && data && data.barber) {
            if (data.barber.status === 'pausado' || data.barber.active === false) {
              setIsBarberPaused(true);
              setPausedBarberInfo(data.barber);
              setSelectedBarber(null);
            } else {
              setIsBarberPaused(false);
              setPausedBarberInfo(null);
              setSelectedBarber(data.barber);
            }
          }
        })
        .catch(() => {});
    }
  }, [urlBarberSlug]);

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>('');

  // Live slots & dates strictly from SQLite DB
  const [serverSlots, setServerSlots] = useState<BarberSlot[] | null>(null);
  const [availableDates, setAvailableDates] = useState<BarberDateOption[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);

  // Client info state
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientNotes, setClientNotes] = useState('');

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);

  // Fetch slots for selected barber
  const fetchDateSlots = async (targetDate?: string, bId?: string) => {
    const activeBId = bId !== undefined ? bId : selectedBarber?.id;
    if (!activeBId) return;

    setIsLoadingSlots(true);
    try {
      const bQuery = `&barberId=${encodeURIComponent(activeBId)}`;
      const url = targetDate 
        ? `/api/slots?date=${encodeURIComponent(targetDate)}${bQuery}` 
        : `/api/slots?nocache=1${bQuery}`;
      
      const res = await fetch(url);
      if (res.status === 403) {
        const data = await res.json().catch(() => null);
        if (data && (data.isPaused || data.error?.includes('pausada'))) {
          setIsBarberPaused(true);
          setPausedBarberInfo(data.barber || selectedBarber || { name: activeBId });
          setSelectedBarber(null);
          return;
        }
      }

      if (res.ok) {
        const data = await res.json();
        if (data) {
          if (Array.isArray(data.availableDates)) {
            setAvailableDates(data.availableDates);
          }

          if (Array.isArray(data.slots)) {
            setServerSlots(data.slots);
          }

          if (data.barber && (!selectedBarber || selectedBarber.id !== data.barber.id)) {
            setSelectedBarber(data.barber);
          }

          if (data.selectedDate && (!targetDate || selectedDate !== data.selectedDate)) {
            setSelectedDate(data.selectedDate);
          }
        }
      }
    } catch (err) {
      console.warn('Error fetching slots from server:', err);
    } finally {
      setIsLoadingSlots(false);
    }
  };

  useEffect(() => {
    if (selectedBarber?.id) {
      fetchDateSlots(selectedDate, selectedBarber.id);
    }
  }, [selectedBarber?.id]);

  const handleSelectDate = (dateStr: string) => {
    setSelectedDate(dateStr);
    setSelectedTimeSlot('');
    fetchDateSlots(dateStr, selectedBarber?.id);
  };

  // Calendar dates list
  const activeDatesList = useMemo(() => {
    const now = new Date();
    const localYear = now.getFullYear();
    const localMonth = String(now.getMonth() + 1).padStart(2, '0');
    const localDay = String(now.getDate()).padStart(2, '0');
    const todayStr = `${localYear}-${localMonth}-${localDay}`;

    if (availableDates.length > 0) {
      return availableDates
        .map(d => ({
          ...d,
          date: normalizeSlotDate(d.date)
        }))
        .filter(d => d.date >= todayStr)
        .map(d => ({
          dateStr: d.date,
          dayName: d.dayName,
          formattedDisplay: d.label,
          isOpen: d.totalSlots > 0,
          totalSlots: d.totalSlots,
          availableSlots: d.availableSlots
        }));
    }

    // Default fallback 7 days
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(now.getDate() + i);

      const dayOfWeek = d.getDay();
      const scheduleDay = config.schedule.find(s => s.dayOfWeek === dayOfWeek);
      const isOpen = scheduleDay ? scheduleDay.isOpen : false;

      const dateYear = d.getFullYear();
      const dateMonth = String(d.getMonth() + 1).padStart(2, '0');
      const dateDay = String(d.getDate()).padStart(2, '0');
      const dateStr = `${dateYear}-${dateMonth}-${dateDay}`;

      const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const dayLabel = i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : dayNames[dayOfWeek];
      const formattedDisplay = `${dayLabel}, ${d.getDate()} ${monthNames[d.getMonth()]}`;

      dates.push({
        dateStr,
        dayName: dayNames[dayOfWeek],
        formattedDisplay,
        isOpen,
        totalSlots: 0,
        availableSlots: 0
      });
    }
    return dates;
  }, [availableDates, config.schedule]);

  // Helper to check if a slot time has already passed
  const isTimeSlotPassed = (slotDate: string, slotTime: string): boolean => {
    if (!slotDate || !slotTime) return false;
    const now = new Date();
    const todayYear = now.getFullYear();
    const todayMonth = String(now.getMonth() + 1).padStart(2, '0');
    const todayDay = String(now.getDate()).padStart(2, '0');
    const todayStr = `${todayYear}-${todayMonth}-${todayDay}`;

    const cleanDate = slotDate.trim();
    if (cleanDate < todayStr) return true;
    if (cleanDate > todayStr) return false;

    const currentH = String(now.getHours()).padStart(2, '0');
    const currentM = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${currentH}:${currentM}`;
    return slotTime <= currentTimeStr;
  };

  // Compute available time slots for the selected date
  const availableSlots = useMemo(() => {
    if (serverSlots && serverSlots.length > 0) {
      return serverSlots.map(s => {
        const isPast = isTimeSlotPassed(selectedDate, s.time);
        const isAvailable = s.status === 'DISPONIBLE' && !isPast;
        let reason = undefined;
        if (isPast) {
          reason = 'Hora pasada';
        } else if (s.status === 'RESERVADO') {
          reason = 'Reservado';
        } else if (s.status === 'BLOQUEADO') {
          reason = s.notes || 'No disponible';
        }

        return {
          time: s.time,
          available: isAvailable,
          reason
        };
      });
    }

    return [];
  }, [serverSlots, selectedDate]);

  // Submit booking
  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!clientName.trim() || !clientPhone.trim()) {
      setErrorMessage('Por favor ingresa tu nombre y número de teléfono o WhatsApp.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: clientName.trim(),
          clientEmail: clientEmail.trim() || undefined,
          clientPhone: clientPhone.trim(),
          clientNotes: clientNotes.trim() || undefined,
          date: selectedDate,
          startTime: selectedTimeSlot,
          serviceIds: ['turno_general'],
          barberId: selectedBarber?.id
        })
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403 && (data.isPaused || data.error?.includes('pausada'))) {
          setIsBarberPaused(true);
          setPausedBarberInfo(selectedBarber);
          setSelectedBarber(null);
        }
        throw new Error(data.error || 'Error al procesar la reserva.');
      }

      setConfirmedBooking(data.booking);
      onBookingSuccess(data.booking);
      fetchDateSlots(selectedDate, selectedBarber?.id);
      setStep(3);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Ocurrió un error inesperado. Por favor intenta de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // IF REQUESTED BARBER IS PAUSED: Do not show booking possibility, render clear paused state
  if (isBarberPaused) {
    const barberName = pausedBarberInfo?.name || 'El barbero';
    const shopName = pausedBarberInfo?.shopName || 'su barbería';
    const phone = pausedBarberInfo?.phone;

    return (
      <div className="mx-auto max-w-xl space-y-6">
        <div className="relative overflow-hidden rounded-3xl border border-amber-300 bg-white p-6 sm:p-8 shadow-sm">
          <div className="absolute top-0 bottom-0 left-0 w-2.5 bg-amber-400" />
          <div className="pl-3 sm:pl-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800 mb-3">
              <Pause className="h-3.5 w-3.5 fill-amber-700" />
              <span>Agenda Temporalmente No Disponible</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 font-serif tracking-tight">
              Agenda Pausada para {barberName}
            </h2>
            <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">
              La agenda y recepción de citas de <strong>{barberName}</strong> ({shopName}) se encuentra temporalmente en pausa por la administración. En este momento <strong>no es posible agendar citas</strong> con este barbero.
            </p>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              {phone && (
                <a
                  href={`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hola ${barberName}, vi tu agenda en BarberTurno y me gustaría consultar disponibilidad.`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 text-xs transition shadow-sm cursor-pointer"
                >
                  <Send className="h-4 w-4" />
                  <span>Consultar por WhatsApp</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.history.replaceState({}, '', '/');
                  }
                  setIsBarberPaused(false);
                  setPausedBarberInfo(null);
                  setSelectedBarber(null);
                }}
                className="flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-stone-50 hover:bg-stone-100 text-slate-700 font-bold py-2.5 px-4 text-xs transition cursor-pointer"
              >
                <span>Ver otros barberos disponibles</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // IF NO BARBER IS SELECTED YET: Show welcoming BarberTurno catalog (ONLY active and approved barbers)
  if (!selectedBarber) {
    const barbers = (config.barbers || []).filter(
      b => b.active && (b.status === 'aprobado' || !b.status)
    );

    if (barbers.length === 0) {
      return (
        <div className="mx-auto max-w-md rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-200">
            <Pause className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 font-serif">Sin Agendas Disponibles</h3>
          <p className="mt-2 text-xs text-slate-500">
            En este momento no hay barberos con agenda activa para recibir reservas. Por favor vuelve a consultar más tarde.
          </p>
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Welcome Hero with Animated Barber Pole Accent */}
        <div className="relative overflow-hidden rounded-3xl border border-stone-200 bg-white p-6 sm:p-8 shadow-sm">
          <div className="absolute top-0 bottom-0 left-0 w-2.5 barber-pole-v-animated" />
          <div className="pl-3 sm:pl-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 mb-3">
              <Sparkles className="h-3.5 w-3.5 text-blue-600" />
              <span>Plataforma BarberTurno</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 font-serif tracking-tight">
              Bienvenido a Barber<span className="text-red-600">Turno</span>
            </h2>
            <p className="mt-2 text-sm text-slate-600 max-w-xl">
              Selecciona a tu barbero para acceder a su agenda individual, ver sus horarios en tiempo real y reservar tu cita directamente.
            </p>
          </div>
        </div>

        {/* Barbers Catalog Grid */}
        <div className="grid gap-4 sm:grid-cols-2">
          {barbers.map(barber => (
            <div
              key={barber.id}
              className="relative overflow-hidden rounded-2xl border border-stone-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-blue-400 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center gap-3.5 mb-3">
                  <img
                    src={barber.avatar || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80'}
                    alt={barber.name}
                    className="h-14 w-14 rounded-2xl object-cover ring-2 ring-blue-100 shadow-sm"
                  />
                  <div>
                    <h3 className="font-bold text-slate-900 text-base sm:text-lg font-serif">{barber.name}</h3>
                    <p className="text-xs text-blue-700 font-medium flex items-center gap-1 mt-0.5">
                      <Store className="h-3.5 w-3.5" />
                      <span>{barber.shopName || 'Estudio Independiente'}</span>
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{barber.role || 'Barbero Profesional'}</p>
                  </div>
                </div>

                {barber.phone && (
                  <p className="text-xs text-emerald-800 font-mono mb-4 flex items-center gap-1.5 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 w-fit">
                    <Phone className="h-3 w-3 text-emerald-600" />
                    <span>WhatsApp: {barber.phone}</span>
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedBarber(barber);
                  fetchDateSlots(selectedDate, barber.id);
                }}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 px-4 text-xs transition shadow-sm cursor-pointer"
              >
                <span>Ver Agenda y Reservar</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (selectedBarber && (selectedBarber.status === 'pausado' || selectedBarber.active === false)) {
    setIsBarberPaused(true);
    setPausedBarberInfo(selectedBarber);
    setSelectedBarber(null);
    return null;
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Barber Identity Banner with Animated Barber Pole Accent */}
      <div className="mb-6 relative overflow-hidden rounded-2xl border border-blue-200 bg-white p-5 shadow-sm">
        <div className="absolute top-0 bottom-0 left-0 w-2.5 barber-pole-v-animated" />
        <div className="pl-3 sm:pl-4">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-blue-800 mb-2.5">
            <Scissors className="h-3.5 w-3.5 text-blue-600" />
            <span>Agenda Oficial de Barbería</span>
          </div>

          <h2 className="text-base sm:text-xl font-bold text-slate-900 font-serif tracking-tight leading-snug">
            Estás por reservar un turno con{' '}
            <span className="text-red-600 font-extrabold underline decoration-red-300 decoration-2 underline-offset-4">
              {selectedBarber.name}
            </span>{' '}
            de <span className="text-slate-900 font-semibold">{selectedBarber.shopName || 'su Barbería'}</span>
          </h2>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-stone-200">
            <div className="flex items-center gap-3">
              <img
                src={selectedBarber.avatar || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80'}
                alt={selectedBarber.name}
                className="h-11 w-11 rounded-xl object-cover ring-2 ring-blue-100 shadow-sm"
              />
              <div>
                <p className="text-xs font-semibold text-slate-900">{selectedBarber.role || 'Barbero Profesional'}</p>
                <p className="text-[11px] text-slate-500">{selectedBarber.shopName || config.shopName}</p>
              </div>
            </div>

            {selectedBarber.phone && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-800 font-mono bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl">
                <Phone className="h-3.5 w-3.5 text-emerald-600" />
                <span>WhatsApp: {selectedBarber.phone}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Progress Stepper: 1. Horario -> 2. Tus Datos -> 3. Confirmación */}
      <div className="mb-5 rounded-2xl border border-stone-200 bg-white p-3 sm:p-4 shadow-xs">
        <div className="flex items-center justify-between gap-1">
          {[
            { num: 1, label: 'Horario', icon: Clock },
            { num: 2, label: 'Tus Datos', icon: User },
            { num: 3, label: 'Confirmación', icon: CheckCircle2 }
          ].map((item, idx) => {
            const isCompleted = step > item.num;
            const isCurrent = step === item.num;

            return (
              <React.Fragment key={item.num}>
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  <div
                    className={`flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full text-xs font-bold transition-all shrink-0 ${
                      isCompleted
                        ? 'bg-blue-600 text-white shadow-xs'
                        : isCurrent
                        ? 'bg-red-600 text-white ring-2 sm:ring-4 ring-red-100 shadow-sm'
                        : 'bg-stone-100 text-stone-400'
                    }`}
                  >
                    {isCompleted ? <Check className="h-3.5 w-3.5 stroke-[3]" /> : item.num}
                  </div>
                  <span
                    className={`text-[11px] sm:text-xs font-semibold ${
                      isCurrent ? 'text-red-600 font-bold' : isCompleted ? 'text-slate-800' : 'text-stone-400'
                    } ${isCurrent ? 'inline' : 'hidden sm:inline'}`}
                  >
                    {item.label}
                  </span>
                </div>
                {idx < 2 && (
                  <div
                    className={`h-0.5 flex-1 mx-1.5 sm:mx-6 min-w-[8px] transition-colors ${
                      step > item.num ? 'bg-blue-300' : 'bg-stone-200'
                    }`}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* STEP 1: ESCOGER HORARIO */}
      {step === 1 && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="text-xl font-bold tracking-tight text-slate-900 font-serif sm:text-2xl">
                ¿A qué hora deseas tu cita?
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-slate-600">
                Selecciona la fecha y el horario disponible que más te convenga con {selectedBarber.name}.
              </p>
            </div>

            {/* Date Ribbon */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Días disponibles
                </label>
                {isLoadingSlots && (
                  <span className="text-[11px] text-blue-600 animate-pulse font-medium">
                    Consultando disponibilidad...
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {activeDatesList.map(item => {
                  const isSelected = selectedDate === item.dateStr;
                  const isFull = item.availableSlots === 0 && item.totalSlots > 0;

                  return (
                    <button
                      key={item.dateStr}
                      type="button"
                      id={`date-btn-${item.dateStr}`}
                      onClick={() => handleSelectDate(item.dateStr)}
                      className={`relative flex flex-col items-center justify-center rounded-xl border p-3 transition-all ${
                        isSelected
                          ? 'border-red-600 bg-red-600 text-white shadow-sm ring-2 ring-red-200'
                          : isFull
                          ? 'border-stone-200 bg-stone-100 text-stone-400 opacity-60 cursor-not-allowed'
                          : 'border-stone-200 bg-stone-50 text-slate-700 hover:border-blue-400 hover:bg-blue-50/50'
                      }`}
                    >
                      <span className={`text-xs font-medium ${isSelected ? 'text-red-100' : 'text-slate-500'}`}>
                        {item.formattedDisplay.split(',')[0]}
                      </span>
                      <span className={`text-sm font-bold mt-0.5 ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                        {item.formattedDisplay.split(',')[1] || item.dateStr}
                      </span>
                      {item.totalSlots > 0 && (
                        <span className={`mt-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          isSelected
                            ? 'bg-white/20 text-white'
                            : isFull
                            ? 'bg-stone-200 text-stone-500'
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}>
                          {isFull ? 'Completo' : `${item.availableSlots} libres`}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time Slots Grid */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Horarios para atención
                </label>
                <span className="text-xs text-slate-500">
                  {availableSlots.filter(s => s.available).length} turnos disponibles
                </span>
              </div>

              {availableSlots.length === 0 ? (
                <div className="rounded-xl border border-dashed border-stone-300 p-8 text-center text-slate-500">
                  <p>No hay turnos disponibles para esta fecha. Por favor selecciona otro día en la barra superior.</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6">
                  {availableSlots.map(slot => {
                    const isSelected = selectedTimeSlot === slot.time;

                    if (!slot.available) {
                      return (
                        <div
                          key={slot.time}
                          title={slot.reason}
                          className="flex flex-col items-center justify-center rounded-xl border border-stone-200 bg-stone-100 py-3 text-center opacity-45 cursor-not-allowed"
                        >
                          <span className="text-sm font-medium line-through text-stone-400">
                            {slot.time}
                          </span>
                          <span className="text-[10px] text-stone-500 truncate px-1 mt-0.5">
                            {slot.reason || 'Ocupado'}
                          </span>
                        </div>
                      );
                    }

                    return (
                      <button
                        key={slot.time}
                        type="button"
                        id={`slot-btn-${slot.time.replace(':', '-')}`}
                        onClick={() => setSelectedTimeSlot(slot.time)}
                        className={`group relative flex flex-col items-center justify-center rounded-xl border py-3 transition-all ${
                          isSelected
                            ? 'border-red-600 bg-red-600 text-white font-bold shadow-md shadow-red-600/20 scale-[1.03]'
                            : 'border-stone-200 bg-white text-slate-800 hover:border-blue-500 hover:bg-blue-50/40 shadow-2xs'
                        }`}
                      >
                        <span className="text-sm font-bold tracking-tight">
                          {slot.time}
                        </span>
                        <span className={`text-[10px] mt-0.5 font-semibold ${
                          isSelected ? 'text-red-100' : 'text-blue-600'
                        }`}>
                          Libre
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Action Button: Go to Step 2 */}
          <div className="flex justify-end">
            <button
              type="button"
              id="btn-next-step"
              disabled={!selectedTimeSlot}
              onClick={() => setStep(2)}
              className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-red-600 px-6 py-3 font-bold text-white shadow-md shadow-red-600/20 transition hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <span>Continuar con mis datos</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: DATOS DEL CLIENTE */}
      {step === 2 && (
        <form onSubmit={handleConfirmBooking} className="space-y-5">
          <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="text-xl font-bold tracking-tight text-slate-900 font-serif sm:text-2xl">
                Tus datos de contacto
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-slate-600">
                Para confirmar tu turno el día <strong>{selectedDate}</strong> a las <strong>{selectedTimeSlot} hrs</strong> con <strong>{selectedBarber.name}</strong>.
              </p>
            </div>

            {errorMessage && (
              <div className="mb-6 flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="space-y-4">
              {/* Nombre completo */}
              <div>
                <label className="block mb-1 text-xs font-semibold text-slate-700">
                  Nombre completo <span className="text-red-600">*</span>
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    id="input-client-name"
                    value={clientName}
                    onChange={e => setClientName(e.target.value)}
                    placeholder="Tu nombre y apellido"
                    className="w-full rounded-xl border border-stone-300 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder-stone-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none shadow-2xs"
                  />
                </div>
              </div>

              {/* Teléfono / WhatsApp */}
              <div>
                <label className="block mb-1 text-xs font-semibold text-slate-700">
                  Teléfono / WhatsApp <span className="text-red-600">*</span>
                </label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="tel"
                    required
                    id="input-client-phone"
                    value={clientPhone}
                    onChange={e => setClientPhone(e.target.value)}
                    placeholder="+57 300 123 4567"
                    className="w-full rounded-xl border border-stone-300 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder-stone-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none shadow-2xs"
                  />
                </div>
              </div>

              {/* Correo electrónico */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Correo electrónico
                  </label>
                  <span className="text-[10px] text-slate-400">
                    Para recibir ticket digital
                  </span>
                </div>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    id="input-client-email"
                    value={clientEmail}
                    onChange={e => setClientEmail(e.target.value)}
                    placeholder="ejemplo@gmail.com"
                    className="w-full rounded-xl border border-stone-300 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder-stone-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none shadow-2xs"
                  />
                </div>
              </div>

              {/* Notas opcionales */}
              <div>
                <label className="block mb-1 text-xs font-semibold text-slate-700">
                  Notas o comentarios (Opcional)
                </label>
                <textarea
                  id="input-client-notes"
                  rows={2}
                  value={clientNotes}
                  onChange={e => setClientNotes(e.target.value)}
                  placeholder="Ej. Llevaré una foto de referencia..."
                  className="w-full rounded-xl border border-stone-300 bg-white p-3 text-sm text-slate-900 placeholder-stone-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 focus:outline-none shadow-2xs"
                />
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white p-4 shadow-xs">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Atrás</span>
            </button>

            <button
              type="submit"
              id="btn-confirm-booking"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 px-6 py-3 font-bold text-white shadow-md shadow-red-600/20 transition disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Confirmando turno...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Confirmar Cita</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* STEP 3: TICKET CONFIRMADO */}
      {step === 3 && confirmedBooking && (
        <div className="space-y-6">
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl">
            
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 p-5 text-center text-white sm:p-8">
              <div className="mx-auto mb-3 flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-white text-blue-700 shadow-md">
                <Check className="h-7 w-7 sm:h-8 sm:w-8 stroke-[3]" />
              </div>
              <h2 className="text-xl sm:text-3xl font-black tracking-tight text-white font-serif">
                ¡Tu Turno está Confirmado!
              </h2>
              <p className="mt-1 text-xs sm:text-sm font-medium text-blue-100">
                Te esperamos el <strong>{confirmedBooking.date}</strong> a las <strong>{confirmedBooking.startTime} hs</strong>.
              </p>
            </div>

            {/* Ticket Details */}
            <div className="p-4 sm:p-8">
              <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-3.5 sm:p-5">
                <div className="flex items-center justify-between border-b border-stone-200 pb-3 mb-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Código de Turno
                  </span>
                  <span className="text-xl font-mono font-bold text-red-600">
                    #{confirmedBooking.id}
                  </span>
                </div>

                <div className="grid gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <span className="text-xs text-slate-500 block">Cliente</span>
                    <strong className="text-slate-900 text-base">{confirmedBooking.clientName}</strong>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">Fecha y Hora</span>
                    <strong className="text-blue-700 text-base">
                      {confirmedBooking.date} • {confirmedBooking.startTime} hs
                    </strong>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">Barbero Asignado</span>
                    <strong className="text-slate-900 text-base flex items-center gap-1.5">
                      <Scissors className="h-3.5 w-3.5 text-blue-600" />
                      <span>{selectedBarber.name}</span>
                    </strong>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">Barbería / Estudio</span>
                    <span className="text-slate-700 flex items-center gap-1 font-medium">
                      <Store className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                      <span>{selectedBarber.shopName || config.shopName}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Direct Actions: Calendar, WhatsApp */}
              <div className="mt-6 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Acciones para tu cita:
                </h3>

                <div className="grid gap-3 sm:grid-cols-2">
                  {/* Google Calendar */}
                  <a
                    id="btn-add-google-calendar"
                    href={getGoogleCalendarUrl(confirmedBooking, selectedBarber.shopName || config.shopName, config.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-3 text-xs font-bold text-slate-700 transition hover:border-blue-500 hover:bg-blue-50 shadow-2xs"
                  >
                    <CalendarIcon className="h-4 w-4 text-blue-600" />
                    <span>Agregar a Google Calendar</span>
                    <ExternalLink className="h-3 w-3 text-slate-400 ml-auto" />
                  </a>

                  {/* Apple / Outlook iCal */}
                  <button
                    id="btn-download-ics"
                    type="button"
                    onClick={() => downloadIcsFile(confirmedBooking, selectedBarber.shopName || config.shopName, config.address)}
                    className="flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-3 text-xs font-bold text-slate-700 transition hover:border-blue-500 hover:bg-blue-50 shadow-2xs cursor-pointer"
                  >
                    <Download className="h-4 w-4 text-blue-600" />
                    <span>Descargar archivo .ics</span>
                  </button>

                  {/* Send confirmation to barber WhatsApp */}
                  <a
                    id="btn-whatsapp-confirm-barber"
                    href={generateClientConfirmationWhatsApp(confirmedBooking, selectedBarber, config)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="sm:col-span-2 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-3.5 text-xs font-bold text-white transition shadow-md shadow-emerald-600/20 cursor-pointer"
                  >
                    <Send className="h-4 w-4" />
                    <span>Notificar a {selectedBarber.name.split(' ')[0]} por WhatsApp</span>
                  </a>
                </div>
              </div>
            </div>

            {/* Footer Reset */}
            <div className="border-t border-stone-200 bg-stone-50 p-4 text-center">
              <button
                type="button"
                id="btn-book-another"
                onClick={() => {
                  setConfirmedBooking(null);
                  setStep(1);
                  setSelectedTimeSlot('');
                }}
                className="text-xs font-semibold text-slate-500 hover:text-blue-700 cursor-pointer"
              >
                + Agendar otro turno
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
