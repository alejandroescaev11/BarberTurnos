import React, { useState, useEffect } from 'react';
import { 
  X, 
  Smartphone, 
  Wifi, 
  Copy, 
  Check, 
  ExternalLink, 
  ShieldCheck, 
  Fingerprint, 
  QrCode, 
  Terminal,
  Globe 
} from 'lucide-react';

interface NetworkShareModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NetworkShareModal: React.FC<NetworkShareModalProps> = ({ isOpen, onClose }) => {
  const [networkInfo, setNetworkInfo] = useState<{
    localIp: string;
    port: number;
    localUrl: string;
    publicUrl?: string;
    currentUrl: string;
    isSecureContext: boolean;
  } | null>(null);
  const [shareMode, setShareMode] = useState<'public' | 'local'>('public');
  const [isCopied, setIsCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;

    fetch('/api/network-info')
      .then(res => res.json())
      .then(data => {
        setNetworkInfo(data);
        if (data.publicUrl) {
          setShareMode('public');
        } else {
          setShareMode('local');
        }
      })
      .catch(() => {
        const port = window.location.port || '3000';
        setNetworkInfo({
          localIp: window.location.hostname,
          port: Number(port),
          localUrl: window.location.origin,
          currentUrl: window.location.origin,
          isSecureContext: window.isSecureContext
        });
      })
      .finally(() => setIsLoading(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const publicUrl = networkInfo?.publicUrl;
  const localUrl = networkInfo?.localUrl || `http://localhost:3000`;
  const accessUrl = (shareMode === 'public' && publicUrl) ? publicUrl : localUrl;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(accessUrl)}&margin=10`;

  const handleCopy = () => {
    navigator.clipboard.writeText(accessUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-2xl sm:rounded-3xl border border-stone-200 bg-white p-4 sm:p-6 shadow-2xl transition-all"
        onClick={e => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 sm:top-5 sm:right-5 rounded-full p-1.5 text-slate-400 hover:bg-stone-100 hover:text-slate-600 transition cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4 pr-8">
          <div className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 border border-blue-200 shadow-xs shrink-0">
            <Smartphone className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 font-serif">
              Probar en Celular o Tablet
            </h3>
            <p className="text-xs text-slate-500">
              Prueba la app en cualquier dispositivo móvil dentro o fuera de la red local
            </p>
          </div>
        </div>

        {/* Tab Switcher: Public Internet vs Local Wi-Fi */}
        <div className="flex rounded-xl bg-stone-100 p-1 mb-4">
          <button
            type="button"
            onClick={() => setShareMode('public')}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition cursor-pointer ${
              shareMode === 'public'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Globe className="h-3.5 w-3.5 text-blue-600" />
            <span>🌐 En la Web (Internet / 4G)</span>
          </button>
          <button
            type="button"
            onClick={() => setShareMode('local')}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition cursor-pointer ${
              shareMode === 'local'
                ? 'bg-white text-emerald-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Wifi className="h-3.5 w-3.5 text-emerald-600" />
            <span>📶 Wi-Fi Local</span>
          </button>
        </div>

        {/* QR Code & Direct URL Box */}
        <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-3.5 sm:p-4 mb-5 flex flex-col sm:flex-row items-center gap-4">
          <div className="bg-white p-2.5 rounded-xl border border-stone-200 shadow-xs shrink-0 text-center">
            {isLoading ? (
              <div className="h-32 w-32 flex items-center justify-center text-xs text-slate-400">
                Cargando QR...
              </div>
            ) : (
              <img
                src={qrUrl}
                alt="QR de acceso"
                className="h-32 w-32 object-contain rounded-lg"
              />
            )}
            <span className="text-[10px] text-slate-400 font-medium flex items-center justify-center gap-1 mt-1">
              <QrCode className="h-3 w-3" />
              Escanear con la cámara
            </span>
          </div>

          <div className="flex-1 w-full min-w-0 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                {shareMode === 'public' ? (
                  <>
                    <Globe className="h-4 w-4 text-blue-600" />
                    <span>Enlace Web Público (HTTPS):</span>
                  </>
                ) : (
                  <>
                    <Wifi className="h-4 w-4 text-emerald-600" />
                    <span>Dirección en tu red Wi-Fi:</span>
                  </>
                )}
              </div>
              {shareMode === 'public' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  En Línea
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <input
                type="text"
                readOnly
                value={accessUrl}
                className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2 font-mono text-xs text-blue-700 font-bold select-all focus:outline-none shadow-2xs"
              />
              <button
                type="button"
                onClick={handleCopy}
                className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition shadow-xs cursor-pointer shrink-0 ${
                  isCopied
                    ? 'bg-emerald-600 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {isCopied ? (
                  <>
                    <Check className="h-3.5 w-3.5 stroke-[3]" />
                    <span>¡Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copiar</span>
                  </>
                )}
              </button>
            </div>

            <p className="text-[11px] text-slate-500 leading-snug">
              {shareMode === 'public'
                ? 'Puedes abrir este enlace desde cualquier celular (4G/5G) o computador fuera de tu casa/local sin estar conectado a tu Wi-Fi. Soporta Face ID y huella digital.'
                : 'Tu celular o tablet debe estar conectado a la misma red Wi-Fi que este computador para abrir esta dirección.'}
            </p>
          </div>
        </div>

        {/* Biometric Notice & HTTPS Tunnel Info */}
        <div className="space-y-3 text-xs">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 flex items-start gap-3">
            <Fingerprint className="h-5 w-5 text-emerald-700 shrink-0 mt-0.5" />
            <div>
              <h5 className="font-bold text-emerald-950 mb-0.5">
                Autenticación Biométrica (Face ID / Huella Digital)
              </h5>
              <p className="text-[11px] text-emerald-800 leading-relaxed">
                El enlace público web cuenta con certificado seguro SSL/HTTPS, por lo que puedes activar y utilizar Face ID, Touch ID o huella digital directamente en tu smartphone.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-5 text-xs transition shadow-sm cursor-pointer"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
