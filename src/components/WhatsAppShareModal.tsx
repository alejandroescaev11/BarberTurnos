import React, { useState } from 'react';
import { 
  X, 
  Share2, 
  Copy, 
  Check, 
  Send, 
  Phone, 
  Scissors 
} from 'lucide-react';
import { BarberShopConfig, BarberProfile } from '../types';
import { generateBarberInviteWhatsApp } from '../lib/whatsapp';

interface WhatsAppShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: BarberShopConfig;
  currentBarber?: BarberProfile | null;
}

export const WhatsAppShareModal: React.FC<WhatsAppShareModalProps> = ({
  isOpen,
  onClose,
  config,
  currentBarber
}) => {
  const [clientPhone, setClientPhone] = useState('');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const effectiveBarber = currentBarber || config.barbers?.[0] || {
    id: 'alejandro',
    slug: 'alejandro',
    name: 'Barbero',
    active: true
  };

  const currentUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const barberUrl = `${currentUrl}/?barber=${encodeURIComponent(effectiveBarber.slug || effectiveBarber.id)}`;

  const inviteMessage = 
    `¡Hola! 💈 Gracias por escribir a *${effectiveBarber.name}* (${effectiveBarber.shopName || config.shopName}).\n\n` +
    `Para que elijas con comodidad tus servicios y veas mis horarios libres disponibles en tiempo real, ingresa a mi enlace directo:\n` +
    `👉 ${barberUrl}\n\n` +
    `Solo te tomará 1 minuto y recibirás la confirmación automática a tu correo. ¡Te espero!`;

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenWhatsApp = () => {
    const url = generateBarberInviteWhatsApp(effectiveBarber, effectiveBarber.shopName || config.shopName, clientPhone);
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-xl max-h-[92dvh] overflow-y-auto rounded-2xl border border-stone-200 bg-white shadow-2xl">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3.5 sm:px-6 sm:py-4 bg-stone-50">
          <div className="flex items-center gap-2.5 sm:gap-3 pr-4">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
              <Share2 className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span>Respuesta Rápida WhatsApp</span>
                <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] text-emerald-800 font-semibold flex items-center gap-1 shrink-0">
                  <Scissors className="h-3 w-3" />
                  {effectiveBarber.name}
                </span>
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500">
                Envía este enlace al cliente para que reserve directamente en tu agenda personal.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-stone-100 hover:text-slate-800 transition cursor-pointer shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
          
          {/* Direct Phone Input to open WhatsApp */}
          <div>
            <label className="block mb-1 text-xs font-semibold text-slate-700">
              Número del cliente (Opcional, para abrir chat directo):
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Phone className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="tel"
                  value={clientPhone}
                  onChange={e => setClientPhone(e.target.value)}
                  placeholder="Ej. 3101234567"
                  className="w-full rounded-xl border border-stone-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder-stone-400 focus:border-blue-600 focus:outline-none shadow-2xs"
                />
              </div>
              <button
                type="button"
                onClick={handleOpenWhatsApp}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Abrir WhatsApp</span>
              </button>
            </div>
          </div>

          {/* Dedicated URL display */}
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-600">Tu Enlace Personal de Reserva:</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(barberUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="text-[11px] text-blue-700 hover:underline font-bold cursor-pointer"
              >
                Copiar solo link
              </button>
            </div>
            <p className="mt-1 font-mono text-xs text-red-600 font-semibold break-all">{barberUrl}</p>
          </div>

          {/* Message Box */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700">
                Mensaje predefinido con tu agenda:
              </label>
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:text-emerald-900 cursor-pointer"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-700" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? '¡Copiado al portapapeles!' : 'Copiar Mensaje Completo'}</span>
              </button>
            </div>

            <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 font-sans text-xs text-slate-700 whitespace-pre-line leading-relaxed">
              {inviteMessage}
            </div>
          </div>

          {/* Value tip */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-900">
            <span className="font-bold text-emerald-800">💡 Tip para el barbero:</span> Guarda este texto como una <em>Respuesta Rápida</em> en tu WhatsApp Business con el atajo <code>/turno</code>. Así, cada vez que un cliente te escriba solicitando corte, solo escribes <code>/turno</code> y se le envía tu enlace exclusivo en 1 segundo.
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-stone-200 px-6 py-3 bg-stone-50">
          <button
            onClick={onClose}
            className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-stone-100 cursor-pointer shadow-2xs"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
};
