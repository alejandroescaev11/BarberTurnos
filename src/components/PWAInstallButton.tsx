import React, { useState } from 'react';
import { Download, Smartphone, X, CheckCircle2, Share } from 'lucide-react';
import { usePWAInstall } from '../lib/usePWAInstall';

export const PWAInstallButton: React.FC<{ variant?: 'compact' | 'full' }> = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);

  // If already running inside installed standalone PWA
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    const success = await install();
    if (success) {
      setInstallSuccess(true);
      setTimeout(() => setInstallSuccess(false), 4000);
    }
  };

  if (installSuccess) {
    return (
      <div className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800">
        <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" />
        <span>¡App instalada!</span>
      </div>
    );
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        id="btn-pwa-install"
        onClick={handleInstallClick}
        title="Instalar BarberTurno como App en tu teléfono o PC"
        className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 shadow-2xs transition hover:bg-blue-100 active:scale-95 cursor-pointer"
      >
        <Download className="h-3.5 w-3.5 text-blue-600" />
        <span>Instalar App</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          id="btn-pwa-install-ios"
          onClick={() => setShowIOSGuide(true)}
          title="Instalar en tu iPhone / iPad"
          className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-stone-100 active:scale-95 cursor-pointer shadow-2xs"
        >
          <Smartphone className="h-3.5 w-3.5 text-blue-600" />
          <span>Instalar en iPhone</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-stone-200 pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <Smartphone className="h-4 w-4" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">Instalar en iPhone / iPad</h3>
                </div>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-stone-100 hover:text-slate-800 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 space-y-3 text-xs text-slate-600">
                <div className="flex items-start gap-2.5 rounded-xl bg-stone-50 p-3 border border-stone-200">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 font-bold text-blue-700 border border-blue-200">
                    1
                  </div>
                  <div>
                    Toca el botón <strong className="text-slate-900">Compartir</strong> (<Share className="inline h-3.5 w-3.5 text-blue-600 mx-0.5" />) en la barra inferior de Safari.
                  </div>
                </div>

                <div className="flex items-start gap-2.5 rounded-xl bg-stone-50 p-3 border border-stone-200">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 font-bold text-blue-700 border border-blue-200">
                    2
                  </div>
                  <div>
                    Desliza hacia abajo y pulsa <strong className="text-slate-900">"Agregar a pantalla de inicio"</strong>.
                  </div>
                </div>

                <div className="flex items-start gap-2.5 rounded-xl bg-stone-50 p-3 border border-stone-200">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 font-bold text-blue-700 border border-blue-200">
                    3
                  </div>
                  <div>
                    Pulsa <strong className="text-slate-900">"Agregar"</strong> arriba a la derecha. ¡Listo! La app aparecerá en tu inicio como una aplicación nativa.
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white transition hover:bg-blue-700 shadow-sm cursor-pointer"
              >
                Entendido
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
