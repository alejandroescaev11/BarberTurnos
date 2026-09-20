import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  Check, 
  X, 
  Sparkles, 
  Save, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Sun, 
  Moon, 
  Coffee, 
  CalendarCheck,
  Database
} from 'lucide-react';
import { BarberShopConfig, BarberSlot } from '../types';

interface ScheduleOpenerProps {
  config: BarberShopConfig;
  selectedBarberId?: string;
  onSelectBarber?: (barberId: string) => void;
  onSlotsUpdated?: () => void;
  onViewLiveSlots?: () => void;
  onViewBookings?: () => void;
}

// All 30-minute intervals between 07:00 AM and 08:00 PM (27 slots)
export const ALL_30MIN_SLOTS = [
  '07:00', '07:30', '08:00', '08:30', '09:00', '09:30',
  '10:00', '10:30', '11:00', '11:30', '12:00', '12:30',
  '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30', '18:00', '18:30',
  '19:00', '19:30', '20:00'
];

function formatTime12h(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function formatDateLong(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  return dateObj.toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function formatDayBadge(dateStr: string): { dayName: string; dayNumber: number; monthShort: string } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const dayName = dateObj.toLocaleDateString('es-CO', { weekday: 'short' });
  const monthShort = dateObj.toLocaleDateString('es-CO', { month: 'short' });
  return {
    dayName: dayName.charAt(0).toUpperCase() + dayName.slice(1).replace('.', ''),
    dayNumber: d,
    monthShort: monthShort.replace('.', '')
  };
}

export const ScheduleOpener: React.FC<ScheduleOpenerProps> = ({
  config,
  selectedBarberId,
  onSelectBarber,
  onSlotsUpdated,
  onViewLiveSlots,
  onViewBookings
}) => {
  const barbersList = config.barbers || [];
  const [internalBarberId, setInternalBarberId] = useState<string>(() => {
    return selectedBarberId || (barbersList[0]?.id || 'alejandro');
  });

  const activeBarberId = selectedBarberId || internalBarberId;
  const currentBarber = barbersList.find(b => b.id === activeBarberId) || barbersList[0];

  // Compute today and tomorrow strings
  const today = useMemo(() => new Date(), []);
  const tomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  }, []);

  const todayStr = useMemo(() => today.toISOString().split('T')[0], [today]);
  const tomorrowStr = useMemo(() => tomorrow.toISOString().split('T')[0], [tomorrow]);

  // Selected date default: tomorrow
  const [selectedDate, setSelectedDate] = useState<string>(tomorrowStr);

  // Next 14 upcoming days for quick visual picker
  const upcomingDays = useMemo(() => {
    const days: { dateStr: string; label: string; isToday: boolean; isTomorrow: boolean }[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const str = d.toISOString().split('T')[0];
      days.push({
        dateStr: str,
        label: i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : '',
        isToday: i === 0,
        isTomorrow: i === 1
      });
    }
    return days;
  }, []);

  // Set of selected times for the chosen date
  const [selectedTimes, setSelectedTimes] = useState<Set<string>>(() => new Set(ALL_30MIN_SLOTS));

  // Multi-day selection mode
  const [multiDayMode, setMultiDayMode] = useState(false);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(() => new Set([tomorrowStr]));

  // Existing slots check for the selected date
  const [existingSlots, setExistingSlots] = useState<BarberSlot[]>([]);
  const [isCheckingExisting, setIsCheckingExisting] = useState(false);

  // Saving state
  const [isPublishing, setIsPublishing] = useState(false);
  const [availableDatesList, setAvailableDatesList] = useState<Array<{ date: string; label?: string; availableSlots: number; totalSlots: number }>>([]);
  const [publishResult, setPublishResult] = useState<{
    success: boolean;
    message: string;
    totalSlots?: number;
  } | null>(null);

  // When selectedDate or activeBarberId changes, check existing slots in database
  useEffect(() => {
    let isCancelled = false;
    const checkSlots = async () => {
      setIsCheckingExisting(true);
      try {
        const bQuery = activeBarberId ? `&barberId=${encodeURIComponent(activeBarberId)}` : '';
        const res = await fetch(`/api/slots?date=${selectedDate}&nocache=1${bQuery}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!isCancelled && data) {
          if (Array.isArray(data.slots)) {
            const valid = data.slots.filter((s: BarberSlot) => !s.status.includes('DESHABILITADO'));
            const map = new Map<string, BarberSlot>();
            for (const s of valid) {
              if (!map.has(s.time) || s.status === 'RESERVADO') {
                map.set(s.time, s);
              }
            }
            const deduped = Array.from(map.values()).sort((a, b) => a.time.localeCompare(b.time));
            setExistingSlots(deduped);

            const activeSlots = deduped.filter((s: BarberSlot) => s.status === 'DISPONIBLE').map((s: BarberSlot) => s.time);
            if (activeSlots.length > 0) {
              setSelectedTimes(new Set(activeSlots));
            }
          }
          if (Array.isArray(data.availableDates)) {
            setAvailableDatesList(data.availableDates);
          }
        }
      } catch (err) {
        console.error('Error checking existing slots:', err);
      } finally {
        if (!isCancelled) setIsCheckingExisting(false);
      }
    };

    checkSlots();
    return () => {
      isCancelled = true;
    };
  }, [selectedDate, activeBarberId]);

  // Handle single time toggle
  const toggleTime = (time: string) => {
    setSelectedTimes(prev => {
      const next = new Set(prev);
      if (next.has(time)) {
        next.delete(time);
      } else {
        next.add(time);
      }
      return next;
    });
  };

  // Helper to check if a slot is in the past for today's date
  const isTimeSlotPassed = (time: string, dateStr: string = selectedDate) => {
    if (dateStr !== todayStr) return false;
    const now = new Date();
    const currentH = String(now.getHours()).padStart(2, '0');
    const currentM = String(now.getMinutes()).padStart(2, '0');
    return time <= `${currentH}:${currentM}`;
  };

  // Bulk actions (respecting past hours for today)
  const selectAll = () => {
    if (selectedDate === todayStr && !multiDayMode) {
      setSelectedTimes(new Set(ALL_30MIN_SLOTS.filter(t => !isTimeSlotPassed(t))));
    } else {
      setSelectedTimes(new Set(ALL_30MIN_SLOTS));
    }
  };

  const deselectAll = () => setSelectedTimes(new Set());

  const deselectLunch = () => {
    setSelectedTimes(prev => {
      const next = new Set(prev);
      next.delete('13:00');
      next.delete('13:30');
      return next;
    });
  };

  const selectMorningOnly = () => {
    const morning = ALL_30MIN_SLOTS.filter(t => {
      const [h] = t.split(':').map(Number);
      if (selectedDate === todayStr && !multiDayMode && isTimeSlotPassed(t)) return false;
      return h < 13;
    });
    setSelectedTimes(new Set(morning));
  };

  const selectAfternoonOnly = () => {
    const afternoon = ALL_30MIN_SLOTS.filter(t => {
      const [h] = t.split(':').map(Number);
      if (selectedDate === todayStr && !multiDayMode && isTimeSlotPassed(t)) return false;
      return h >= 14;
    });
    setSelectedTimes(new Set(afternoon));
  };

  // Handle saving schedule to database
  const handleSaveSchedule = async () => {
    const datesArray = multiDayMode ? Array.from(selectedDates) : [selectedDate];

    if (selectedTimes.size === 0) {
      if (existingSlots.length > 0) {
        if (!window.confirm(`Has desmarcado todos los horarios para ${multiDayMode ? 'los días seleccionados' : selectedDate}.\n\n¿Deseas guardar y cerrar la disponibilidad para que no aparezcan cupos para reserva?`)) {
          return;
        }
        setIsPublishing(true);
        setPublishResult(null);
        try {
          for (const d of datesArray) {
            await fetch('/api/slots/clear-day', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ date: d, barberId: activeBarberId })
            });
          }
          setExistingSlots([]);
          setSelectedTimes(new Set());
          setPublishResult({
            success: true,
            message: `Disponibilidad cerrada exitosamente. Ya no hay horarios libres para reservar en ${multiDayMode ? 'los días seleccionados' : selectedDate}.`
          });
          if (onSlotsUpdated) onSlotsUpdated();
          const refRes = await fetch(`/api/slots?date=${selectedDate}&nocache=1`);
          if (refRes.ok) {
            const refData = await refRes.json();
            if (Array.isArray(refData.availableDates)) setAvailableDatesList(refData.availableDates);
          }
        } catch (err: any) {
          setPublishResult({
            success: false,
            message: err.message || 'Error al actualizar la disponibilidad.'
          });
        } finally {
          setIsPublishing(false);
        }
        return;
      }

      alert('Debes tener al menos un horario habilitado para abrir la agenda.');
      return;
    }

    const timesArray = ALL_30MIN_SLOTS.filter(t => {
      if (!selectedTimes.has(t)) return false;
      if (selectedDate === todayStr && !multiDayMode && isTimeSlotPassed(t)) return false;
      return true;
    });

    setIsPublishing(true);
    setPublishResult(null);

    try {
      if (!multiDayMode && existingSlots.length > 0) {
        const slotsToRemove = existingSlots
          .filter(s => s.status === 'DISPONIBLE' && !selectedTimes.has(s.time))
          .map(s => s.time);

        for (const remTime of slotsToRemove) {
          try {
            await fetch('/api/slots/delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ date: selectedDate, time: remTime, barberId: activeBarberId })
            });
          } catch (e) {
            console.warn('Error removing deselected slot:', remTime, e);
          }
        }
      }

      const res = await fetch('/api/slots/batch-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dates: datesArray,
          times: timesArray,
          barberId: activeBarberId,
          replaceDayMode: true
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setPublishResult({
          success: true,
          message: data.message || `¡Agenda guardada! ${timesArray.length} horarios publicados y listos para reservas.`,
          totalSlots: data.totalSlots
        });

        const bParam = activeBarberId ? `&barberId=${encodeURIComponent(activeBarberId)}` : '';
        const refRes = await fetch(`/api/slots?date=${selectedDate}&nocache=1${bParam}`);
        if (refRes.ok) {
          const refData = await refRes.json();
          if (Array.isArray(refData.slots)) {
            const valid = refData.slots.filter((s: BarberSlot) => !s.status.includes('DESHABILITADO'));
            const map = new Map<string, BarberSlot>();
            for (const s of valid) {
              if (!map.has(s.time) || s.status === 'RESERVADO') {
                map.set(s.time, s);
              }
            }
            setExistingSlots(Array.from(map.values()).sort((a, b) => a.time.localeCompare(b.time)));
          }
          if (Array.isArray(refData.availableDates)) setAvailableDatesList(refData.availableDates);
        }

        if (onSlotsUpdated) onSlotsUpdated();
      } else {
        setPublishResult({
          success: false,
          message: data.error || 'No se pudieron guardar los horarios en la agenda.'
        });
      }
    } catch (err: any) {
      setPublishResult({
        success: false,
        message: err.message || 'Error de conexión al guardar los horarios.'
      });
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-700">
              <Sparkles className="h-4 w-4" />
              <span>Generador de Agenda del Barbero</span>
            </div>
            <h2 className="mt-1 text-lg font-bold text-slate-900 md:text-xl font-serif">
              Apertura y Publicación de Horarios Disponibles
            </h2>
            <p className="mt-1 text-xs text-slate-600 max-w-2xl">
              Selecciona el día que vas a atender y personaliza tus turnos de 30 minutos (7:00 AM a 8:00 PM).
              Desmarca los horarios que tomarás de descanso y guarda para publicar tus turnos disponibles para los clientes.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-800 px-3 py-1.5 text-xs font-semibold shadow-xs">
              <Database className="h-3.5 w-3.5 text-blue-600" />
              <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" />
              <span>Base de Datos SQLite Activa</span>
            </span>
          </div>
        </div>
      </div>

      {/* Success Notification Alert */}
      {publishResult && (
        <div className={`rounded-2xl border p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 ${
          publishResult.success 
            ? 'border-blue-200 bg-blue-50 text-blue-900' 
            : 'border-red-200 bg-red-50 text-red-900'
        }`}>
          <div className="flex items-start gap-3">
            {publishResult.success ? (
              <CheckCircle2 className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            )}
            <div>
              <h4 className="text-sm font-bold text-slate-900">
                {publishResult.success ? '¡Agenda Abierta y Publicada con Éxito!' : 'Error al guardar agenda'}
              </h4>
              <p className="text-xs text-slate-600 mt-0.5">
                {publishResult.message}
              </p>
            </div>
          </div>

          {publishResult.success && (
            <div className="flex items-center gap-2 shrink-0">
              {onViewLiveSlots && (
                <button
                  onClick={onViewLiveSlots}
                  className="rounded-xl border border-stone-200 bg-white hover:bg-stone-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Clock className="h-3.5 w-3.5 text-blue-600" />
                  <span>Ver Horarios Activos</span>
                </button>
              )}
              {onViewBookings && (
                <button
                  onClick={onViewBookings}
                  className="rounded-xl bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-xs font-bold text-white transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <CalendarCheck className="h-3.5 w-3.5" />
                  <span>Ir a Agenda de Citas</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Barber Identity Badge */}
      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src={currentBarber?.avatar || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80'}
              alt={currentBarber?.name || 'Barbero'}
              referrerPolicy="no-referrer"
              className="h-10 w-10 rounded-xl object-cover border border-stone-200 shadow-xs ring-2 ring-blue-100"
            />
            <div>
              <span className="text-[11px] font-semibold text-slate-500 block">
                Agenda Personal de Atención:
              </span>
              <span className="text-sm font-bold text-slate-900 flex items-center gap-2 mt-0.5">
                <span>{currentBarber?.name || 'Barbero'}</span>
                <span className="text-xs font-medium text-blue-700">({currentBarber?.shopName || currentBarber?.role || 'Barbero Profesional'})</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800">
              🔒 Gestión Exclusiva de tu Cuenta
            </span>
          </div>
        </div>
      </div>

      {/* STEP 1: Date Selection */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-200 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
              1
            </span>
            <h3 className="text-sm font-bold text-slate-900">
              Elige el día a habilitar en tu agenda
            </h3>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={multiDayMode}
                onChange={e => setMultiDayMode(e.target.checked)}
                className="rounded border-stone-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Habilitar múltiples días simultáneos</span>
            </label>
          </div>
        </div>

        {/* Quick Date Cards Carousel / Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
          {upcomingDays.map(day => {
            const { dayName, dayNumber, monthShort } = formatDayBadge(day.dateStr);
            const isSelected = multiDayMode ? selectedDates.has(day.dateStr) : selectedDate === day.dateStr;

            return (
              <button
                key={day.dateStr}
                type="button"
                onClick={() => {
                  if (multiDayMode) {
                    setSelectedDates(prev => {
                      const next = new Set(prev);
                      if (next.has(day.dateStr)) {
                        if (next.size > 1) next.delete(day.dateStr);
                      } else {
                        next.add(day.dateStr);
                      }
                      return next;
                    });
                  } else {
                    setSelectedDate(day.dateStr);
                  }
                }}
                className={`relative flex flex-col items-center justify-center rounded-xl p-3 text-center transition cursor-pointer ${
                  isSelected
                    ? 'border-2 border-red-600 bg-red-50 text-red-700 shadow-sm'
                    : 'border border-stone-200 bg-stone-50 hover:border-blue-400 hover:bg-blue-50/50 text-slate-600 hover:text-slate-900'
                }`}
              >
                {day.label && (
                  <span className={`absolute -top-2 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                    day.isToday ? 'bg-blue-600 text-white' : 'bg-red-600 text-white'
                  }`}>
                    {day.label}
                  </span>
                )}
                <span className="text-[11px] font-semibold uppercase">{dayName}</span>
                <span className="text-xl font-black text-slate-900">{dayNumber}</span>
                <span className="text-[10px] text-slate-500">{monthShort}</span>
              </button>
            );
          })}
        </div>

        {/* Manual Date Input Picker */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-600">O ingresa otra fecha del calendario:</span>
            <input
              type="date"
              value={selectedDate}
              min={todayStr}
              onChange={e => {
                if (e.target.value) {
                  setSelectedDate(e.target.value);
                  if (multiDayMode) {
                    setSelectedDates(new Set([e.target.value]));
                  }
                }
              }}
              className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:border-blue-600 focus:outline-none shadow-2xs"
            />
          </div>

          <div className="text-xs font-medium text-slate-700">
            Día seleccionado: <span className="font-bold text-red-600 capitalize">{formatDateLong(selectedDate)}</span>
          </div>
        </div>

        {/* Existing Status in DB indicator */}
        {isCheckingExisting ? (
          <div className="text-xs text-slate-500 flex items-center gap-2 pt-1">
            <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-600" />
            <span>Verificando estado actual de la fecha...</span>
          </div>
        ) : existingSlots.length > 0 ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3.5 text-xs text-blue-900 flex items-center gap-2.5">
            <CalendarCheck className="h-4 w-4 text-blue-600 shrink-0" />
            <div>
              <span className="font-bold text-slate-900">Esta fecha tiene turnos registrados:</span>{' '}
              <span>
                {existingSlots.length} horarios ({existingSlots.filter(s => s.status === 'DISPONIBLE').length} disponibles, {existingSlots.filter(s => s.status === 'RESERVADO').length} reservados).
              </span>
              <p className="text-[11px] text-blue-700 mt-0.5">
                Selecciona o desmarca los horarios abajo y haz clic en Guardar para actualizar tu disponibilidad.
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs text-slate-600 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-blue-600 shrink-0" />
            <span>Esta fecha aún no tiene turnos abiertos. ¡Será creada al guardar!</span>
          </div>
        )}

        {/* List of other published dates */}
        {availableDatesList.length > 0 && (
          <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <CalendarCheck className="h-3.5 w-3.5 text-blue-600" />
                <span>Días con Agenda Activa ({availableDatesList.length})</span>
              </span>
              <span className="text-[10px] text-slate-500">Haz clic en una fecha para ver o modificar sus turnos</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {availableDatesList.map(ad => {
                const isCurrent = ad.date === selectedDate;
                return (
                  <button
                    key={ad.date}
                    type="button"
                    onClick={() => setSelectedDate(ad.date)}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition border font-semibold cursor-pointer ${
                      isCurrent
                        ? 'border-red-600 bg-red-50 text-red-700 ring-1 ring-red-200'
                        : 'border-stone-200 bg-white text-slate-700 hover:border-blue-400 hover:text-blue-700 shadow-2xs'
                    }`}
                  >
                    <span>{ad.label || ad.date}</span>
                    <span className="text-blue-700 font-bold">({ad.availableSlots} cupos)</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* STEP 2: Time Slots Selection (30 min ranges from 7:00 am to 8:00 pm) */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-200 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
              2
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Horarios en rangos de 30 min (7:00 AM a 8:00 PM)
              </h3>
              <p className="text-[11px] text-slate-500">
                Por defecto todos vienen habilitados. Haz clic en cualquier horario para desmarcarlo si no estarás disponible.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-bold">
            <span className="text-red-600 text-sm">{selectedTimes.size}</span>
            <span className="text-slate-500">de {ALL_30MIN_SLOTS.length} horarios habilitados</span>
          </div>
        </div>

        {/* Quick Batch Filter Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">
            Accesos Rápidos:
          </span>
          <button
            type="button"
            onClick={selectAll}
            className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-blue-500 hover:text-blue-700 transition shadow-2xs cursor-pointer"
          >
            Habilitar Todos ({ALL_30MIN_SLOTS.length})
          </button>
          <button
            type="button"
            onClick={deselectLunch}
            className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition flex items-center gap-1 cursor-pointer"
          >
            <Coffee className="h-3 w-3" />
            <span>Quitar Almuerzo (13:00 y 13:30)</span>
          </button>
          <button
            type="button"
            onClick={selectMorningOnly}
            className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-blue-500 hover:text-blue-700 transition flex items-center gap-1 shadow-2xs cursor-pointer"
          >
            <Sun className="h-3 w-3 text-blue-600" />
            <span>Solo Mañana (7am - 12:30pm)</span>
          </button>
          <button
            type="button"
            onClick={selectAfternoonOnly}
            className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-blue-500 hover:text-blue-700 transition flex items-center gap-1 shadow-2xs cursor-pointer"
          >
            <Moon className="h-3 w-3 text-blue-600" />
            <span>Solo Tarde (2pm - 8pm)</span>
          </button>
          <button
            type="button"
            onClick={deselectAll}
            className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-semibold text-slate-500 hover:text-red-600 transition cursor-pointer"
          >
            Desmarcar Todos
          </button>
        </div>

        {/* 30-minute Slots Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 pt-2">
          {ALL_30MIN_SLOTS.map(time => {
            const isSelected = selectedTimes.has(time);
            const time12 = formatTime12h(time);

            const existingMatch = existingSlots.find(s => s.time === time);
            const isAlreadyBooked = existingMatch && existingMatch.status === 'RESERVADO';

            return (
              <button
                key={time}
                type="button"
                onClick={() => toggleTime(time)}
                className={`relative flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-bold transition select-none cursor-pointer ${
                  isSelected
                    ? 'border-2 border-blue-600 bg-blue-50 text-blue-950 shadow-xs'
                    : 'border border-stone-200 bg-stone-50 text-slate-400 hover:border-stone-300 hover:text-slate-600'
                }`}
              >
                <div className="flex flex-col text-left">
                  <span className="font-mono text-xs">{time}</span>
                  <span className="text-[10px] font-medium text-slate-500">{time12}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  {isAlreadyBooked ? (
                    <span className="rounded bg-red-100 text-red-800 border border-red-200 px-1 py-0.5 text-[9px] font-bold">
                      Cita
                    </span>
                  ) : isTimeSlotPassed(time) ? (
                    <span className="rounded bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 text-[9px] font-bold">
                      Pasado
                    </span>
                  ) : isSelected ? (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white">
                      <Check className="h-3.5 w-3.5 stroke-[3]" />
                    </div>
                  ) : (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full border border-stone-300 text-stone-400">
                      <X className="h-3 w-3" />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* STEP 3: Summary & Save Action */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-blue-600" />
              <span>Resumen de Apertura</span>
            </h4>
            <p className="text-xs text-slate-600 mt-1">
              {multiDayMode ? (
                <>Se habilitarán <strong>{selectedTimes.size} horarios</strong> para <strong>{selectedDates.size} días seleccionados</strong> ({selectedTimes.size * selectedDates.size} cupos totales).</>
              ) : selectedTimes.size === 0 && existingSlots.length > 0 ? (
                <span className="text-red-600 font-semibold">Has desmarcado todos los horarios. Al guardar, se cerrará la disponibilidad de este día.</span>
              ) : (
                <>Se abrirán <strong>{selectedTimes.size} horarios</strong> para el <strong>{formatDateLong(selectedDate)}</strong>.</>
              )}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Al guardar los horarios, la información se almacena en el sistema y los clientes podrán reservar inmediatamente en la página web.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              id="btn-save-schedule-opener"
              type="button"
              disabled={isPublishing || (selectedTimes.size === 0 && existingSlots.length === 0)}
              onClick={handleSaveSchedule}
              className={`flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold transition shadow-md cursor-pointer ${
                isPublishing || (selectedTimes.size === 0 && existingSlots.length === 0)
                  ? 'bg-stone-200 text-stone-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20 active:scale-95'
              }`}
            >
              {isPublishing ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Guardando agenda...</span>
                </>
              ) : selectedTimes.size === 0 && existingSlots.length > 0 ? (
                <>
                  <Save className="h-4 w-4" />
                  <span>Cerrar Disponibilidad</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>Guardar y Publicar Horarios</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
