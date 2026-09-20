import React, { useState } from 'react';
import { X, Scissors } from 'lucide-react';
import { BarberShopConfig } from '../types';

interface QuickBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: BarberShopConfig;
  barberId?: string;
  onBookingCreated: () => void;
}

export const QuickBookingModal: React.FC<QuickBookingModalProps> = ({
  isOpen,
  onClose,
  config,
  barberId,
  onBookingCreated
}) => {
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('14:00');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('corte_clasico');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) {
      setError('Por favor indica el nombre del cliente.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const email = clientEmail.trim() || `cliente.${Date.now()}@presencial.local`;
      const phone = clientPhone.trim() || 'Presencial / Sin teléfono';

      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: `${clientName.trim()} (Presencial)`,
          clientEmail: email,
          clientPhone: phone,
          clientNotes: 'Agendado manualmente por el barbero en el sillón.',
          date,
          startTime,
          serviceIds: [selectedServiceId],
          barberId: barberId || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo agendar el turno.');
      }

      onBookingCreated();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Error al agendar cita.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-2xl border border-stone-200 bg-white shadow-2xl">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3.5 sm:px-6 sm:py-4 bg-stone-50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-600 border border-red-200 shrink-0">
              <Scissors className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                Bloquear Turno / Cita Presencial
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500">
                Registra un cliente que llegó al local para bloquear el horario.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-stone-100 hover:text-slate-800 transition cursor-pointer shrink-0"
          >
            <X className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-3.5 sm:space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block mb-1 text-xs font-semibold text-slate-700">
              Nombre del Cliente *
            </label>
            <input
              type="text"
              required
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              placeholder="Ej. Juan Pérez"
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none shadow-2xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1 text-xs font-semibold text-slate-700">
                Teléfono (Opcional)
              </label>
              <input
                type="tel"
                value={clientPhone}
                onChange={e => setClientPhone(e.target.value)}
                placeholder="+57 300 000 0000"
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none shadow-2xs"
              />
            </div>
            <div>
              <label className="block mb-1 text-xs font-semibold text-slate-700">
                Correo (Opcional)
              </label>
              <input
                type="email"
                value={clientEmail}
                onChange={e => setClientEmail(e.target.value)}
                placeholder="cliente@ejemplo.com"
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none shadow-2xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1 text-xs font-semibold text-slate-700">
                Fecha *
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none shadow-2xs"
              />
            </div>
            <div>
              <label className="block mb-1 text-xs font-semibold text-slate-700">
                Hora Inicio *
              </label>
              <input
                type="time"
                required
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none shadow-2xs"
              />
            </div>
          </div>

          <div>
            <label className="block mb-1 text-xs font-semibold text-slate-700">
              Servicio a Realizar *
            </label>
            <select
              value={selectedServiceId}
              onChange={e => setSelectedServiceId(e.target.value)}
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none shadow-2xs"
            >
              {config.services.filter(s => s.active).map(service => (
                <option key={service.id} value={service.id}>
                  {service.name} ({service.durationMinutes} min) - ${service.price.toLocaleString()}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-200">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-stone-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50 shadow-sm cursor-pointer"
            >
              {isSubmitting ? 'Guardando...' : 'Bloquear Turno'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
