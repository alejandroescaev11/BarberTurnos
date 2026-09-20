import React from 'react';
import { Share2, LogOut, UserCheck, Smartphone } from 'lucide-react';
import { BarberShopConfig, BarberProfile } from '../types';
import { PWAInstallButton } from './PWAInstallButton';
import { BarberLogo } from './BarberLogo';

interface NavbarProps {
  config: BarberShopConfig;
  currentView?: 'booking' | 'dashboard';
  isBarberAuthenticated: boolean;
  currentBarber?: BarberProfile | null;
  onViewChange?: (view: 'booking' | 'dashboard') => void;
  onLogoutBarber: () => void;
  onOpenWhatsAppShare: () => void;
  onOpenNetworkShare?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  isBarberAuthenticated,
  currentBarber,
  onLogoutBarber,
  onOpenWhatsAppShare,
  onOpenNetworkShare
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-stone-200 bg-white/95 backdrop-blur-md shadow-xs">
      {/* Decorative Barber Pole Animated Top Ribbon */}
      <div className="h-1.5 w-full barber-pole-animated opacity-95" />

      <div className="mx-auto flex max-w-7xl w-full items-center justify-between px-3 py-2.5 sm:px-6 sm:py-3">
        
        {/* Brand: BarberTurno with Barber Pole & Razor Blade Logo */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          <div className="relative flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl border border-stone-800 bg-slate-900 p-1 shadow-xs shrink-0">
            <BarberLogo size="sm" />
          </div>

          <div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h1 className="text-base sm:text-xl font-black tracking-tight text-slate-900 font-serif">
                Barber<span className="text-red-600">Turno</span>
              </h1>
              <span className="rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold text-blue-700 hidden xs:inline-block sm:inline-block">
                Turnos Online
              </span>
            </div>
            <p className="hidden text-[11px] text-slate-500 sm:block">
              Gestión de citas para barberías
            </p>
          </div>
        </div>

        {/* Navigation & Controls */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* Mobile / Local Network QR Button */}
          {onOpenNetworkShare && (
            <button
              onClick={onOpenNetworkShare}
              title="Abrir en celular o tablet (Red Wi-Fi / QR)"
              className="flex items-center gap-1 sm:gap-1.5 rounded-xl border border-stone-200 bg-white px-2 py-1.5 sm:px-2.5 text-xs text-slate-700 hover:text-blue-700 hover:border-blue-300 transition shadow-2xs cursor-pointer font-medium"
            >
              <Smartphone className="h-3.5 w-3.5 text-blue-600" />
              <span className="hidden sm:inline">Móvil / Red</span>
            </button>
          )}

          {/* PWA Install Button */}
          <PWAInstallButton />

          {/* If Barber is Authenticated: Private session badge, WhatsApp link and logout */}
          {isBarberAuthenticated ? (
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="flex items-center gap-1 rounded-lg sm:rounded-xl border border-blue-200 bg-blue-50 px-2 sm:px-3 py-1 sm:py-1.5 text-xs font-bold text-blue-800 shadow-2xs max-w-[110px] sm:max-w-none">
                <UserCheck className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                <span className="truncate">{currentBarber ? currentBarber.name : 'Mi Panel'}</span>
              </div>

              <button
                id="nav-share-whatsapp-btn"
                onClick={onOpenWhatsAppShare}
                title="Generar enlace de WhatsApp para tu agenda"
                className="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition shadow-2xs cursor-pointer"
              >
                <Share2 className="h-3.5 w-3.5 text-emerald-700" />
                <span className="hidden md:inline">Link WhatsApp</span>
              </button>

              <button
                onClick={onLogoutBarber}
                title="Cerrar sesión de mi cuenta"
                className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 text-xs text-slate-500 hover:text-red-600 hover:border-red-200 transition cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">Salir</span>
              </button>
            </div>
          ) : (
            /* Cliente normal: Vista limpia */
            <div className="flex items-center gap-2">
              <span className="hidden text-xs text-slate-600 md:inline-flex items-center gap-1.5 bg-emerald-50/80 border border-emerald-200 px-2.5 py-1 rounded-full font-medium">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Disponibilidad en tiempo real
              </span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
