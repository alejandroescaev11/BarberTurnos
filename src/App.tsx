import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { BookingWizard } from './components/BookingWizard';
import { BarberDashboard } from './components/BarberDashboard';
import { BarberAuthModal } from './components/BarberAuthModal';
import { WhatsAppShareModal } from './components/WhatsAppShareModal';
import { QuickBookingModal } from './components/QuickBookingModal';
import { NetworkShareModal } from './components/NetworkShareModal';
import { BarberShopConfig, BarberProfile, Booking, BookingStatus } from './types';
import { Scissors, Lock, UserCheck, Share2 } from 'lucide-react';

export default function App() {
  const [config, setConfig] = useState<BarberShopConfig | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Barber authentication state & current logged-in barber
  const [isBarberAuthenticated, setIsBarberAuthenticated] = useState<boolean>(() => {
    return Boolean(sessionStorage.getItem('barber_auth_token'));
  });

  const [currentBarber, setCurrentBarber] = useState<BarberProfile | null>(() => {
    try {
      const raw = sessionStorage.getItem('barber_current_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const [currentView, setCurrentView] = useState<'booking' | 'dashboard'>(() => {
    return sessionStorage.getItem('barber_auth_token') ? 'dashboard' : 'booking';
  });

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Modals state
  const [isWhatsAppShareOpen, setIsWhatsAppShareOpen] = useState(false);
  const [isQuickBookingOpen, setIsQuickBookingOpen] = useState(false);
  const [isNetworkShareOpen, setIsNetworkShareOpen] = useState(false);

  // Fetch initial config & bookings
  const fetchData = useCallback(async () => {
    try {
      const [cfgRes, bkgRes] = await Promise.all([
        fetch('/api/config'),
        fetch('/api/bookings')
      ]);

      if (cfgRes.ok) {
        const cfgData = await cfgRes.json();
        setConfig(cfgData);
      }
      if (bkgRes.ok) {
        const bkgData = await bkgRes.json();
        setBookings(bkgData);
      }
    } catch (err) {
      console.error('Error loading initial data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Verify / restore barber session if token exists
    const token = sessionStorage.getItem('barber_auth_token');
    if (token) {
      // If a barber is already logged in, redirect URL cleanly to root '/'
      if (typeof window !== 'undefined' && window.location.search) {
        window.history.replaceState({}, '', '/');
      }

      let fallbackBarberId = '';
      const savedUser = sessionStorage.getItem('barber_current_user');
      if (savedUser) {
        try { fallbackBarberId = JSON.parse(savedUser)?.id || ''; } catch {}
      }

      fetch('/api/barber/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
          ...(fallbackBarberId ? { 'x-barber-id': fallbackBarberId } : {})
        }
      })
        .then(res => res.json())
        .then(data => {
          if (data && data.barber) {
            setCurrentBarber(data.barber);
            sessionStorage.setItem('barber_current_user', JSON.stringify(data.barber));
            setIsBarberAuthenticated(true);
            setCurrentView('dashboard');
          }
        })
        .catch(() => {});
    }

    // Discreet access via URL query parameter: ?admin=1 or ?login=1 or /admin
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('admin') === '1' || urlParams.get('login') === '1' || window.location.pathname === '/admin') {
      window.history.replaceState({}, '', '/');
      setIsAuthModalOpen(true);
    }
  }, []);

  // When clicking "Acceso Barberos": clean URL to root '/' and open auth modal
  const handleOpenBarberAccess = () => {
    if (typeof window !== 'undefined' && window.location.search) {
      window.history.replaceState({}, '', '/');
    }
    setIsAuthModalOpen(true);
  };

  // When barber authenticates: clean URL to root '/' and enter private dashboard
  const handleBarberAuthenticated = (barber: BarberProfile) => {
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/');
    }
    setCurrentBarber(barber);
    setIsBarberAuthenticated(true);
    setCurrentView('dashboard');
  };

  // When barber logs out: clean session, return to root '/' and show clean booking view
  const handleLogoutBarber = () => {
    sessionStorage.removeItem('barber_auth_token');
    sessionStorage.removeItem('barber_current_user');
    setCurrentBarber(null);
    setIsBarberAuthenticated(false);
    setCurrentView('booking');
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/');
    }
  };

  const handleUpdateCurrentBarber = (updated: BarberProfile, updatedConfig?: BarberShopConfig) => {
    setCurrentBarber(updated);
    sessionStorage.setItem('barber_current_user', JSON.stringify(updated));
    if (updatedConfig) {
      setConfig(updatedConfig);
    } else if (config) {
      setConfig({
        ...config,
        barbers: (config.barbers || []).map(b => b.id === updated.id ? updated : b)
      });
    }
  };

  // Update booking status from barber dashboard
  const handleUpdateStatus = async (bookingId: string, newStatus: BookingStatus) => {
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: newStatus } : b));
      }
    } catch (err) {
      console.error('Error updating booking status:', err);
    }
  };

  // When a new booking is created
  const handleBookingSuccess = (newBooking: Booking) => {
    setBookings(prev => [newBooking, ...prev]);
  };

  if (isLoading || !config) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf8f5] text-slate-700">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20 animate-pulse">
            <Scissors className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-slate-500">Cargando sistema de turnos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-[#faf8f5] text-slate-800 flex flex-col font-sans selection:bg-red-600 selection:text-white">
      
      {/* Top Navigation */}
      <Navbar
        config={config}
        currentView={currentView}
        isBarberAuthenticated={isBarberAuthenticated}
        currentBarber={currentBarber}
        onLogoutBarber={handleLogoutBarber}
        onOpenWhatsAppShare={() => setIsWhatsAppShareOpen(true)}
        onOpenNetworkShare={() => setIsNetworkShareOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-full px-3 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl w-full">
          
          {/* Informative Banner (Only for the private barber dashboard) */}
          {isBarberAuthenticated && currentBarber && (
            <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-blue-200 bg-white p-3.5 sm:p-4 sm:flex-row sm:items-center sm:justify-between shadow-sm">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <UserCheck className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-900 flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <span className="truncate">Sesión Iniciada: {currentBarber.name}</span>
                    <span className="rounded-full bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 text-[10px] font-semibold shrink-0">
                      {currentBarber.shopName || currentBarber.role}
                    </span>
                  </p>
                  <p className="text-[11px] text-slate-500 truncate sm:whitespace-normal">
                    Tu agenda personal y reservas se gestionan de forma 100% independiente en tu cuenta.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <button
                  onClick={() => setIsWhatsAppShareOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition shadow-2xs cursor-pointer"
                >
                  <Share2 className="h-3.5 w-3.5 text-emerald-700" />
                  <span>Mensaje WhatsApp</span>
                </button>
              </div>
            </div>
          )}

          {/* Views: If authenticated as barber, ALWAYS show BarberDashboard (no client view) */}
          {isBarberAuthenticated && currentBarber ? (
            <BarberDashboard
              config={config}
              bookings={bookings}
              currentBarber={currentBarber}
              onUpdateStatus={handleUpdateStatus}
              onRefreshBookings={fetchData}
              onOpenQuickBooking={() => setIsQuickBookingOpen(true)}
              onLogout={handleLogoutBarber}
              onUpdateCurrentBarber={handleUpdateCurrentBarber}
            />
          ) : currentView === 'dashboard' ? (
            <div className="mx-auto max-w-md w-full rounded-2xl border border-stone-200 bg-white p-6 sm:p-8 text-center shadow-md">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <Lock className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 font-serif">Ingreso Privado para Barberos</h3>
              <p className="mt-1 text-xs text-slate-500">
                Cada barbero cuenta con sus propias credenciales para gestionar su agenda y disponibilidad de forma independiente.
              </p>
              <button
                onClick={handleOpenBarberAccess}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-blue-700 transition shadow-sm cursor-pointer"
              >
                <span>Iniciar Sesión o Registrarse</span>
              </button>
            </div>
          ) : (
            <BookingWizard
              config={config}
              existingBookings={bookings}
              onBookingSuccess={handleBookingSuccess}
            />
          )}
        </div>
      </main>

      {/* Footer with Discreet Barber Access */}
      <footer className="border-t border-stone-200 bg-white py-5 text-xs text-slate-500 w-full overflow-hidden">
        <div className="mx-auto max-w-7xl px-3 sm:px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 sm:gap-2">
            <span className="font-bold text-slate-800">Barber<span className="text-red-600">Turno</span></span>
            <span>•</span>
            <span className="text-slate-500">Gestión de citas para barberías</span>
          </div>
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 sm:gap-4 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Disponibilidad en tiempo real
            </span>
            <span>•</span>
            {/* Discreet link for barbers: cleans URL to root and opens auth modal */}
            <button
              onClick={handleOpenBarberAccess}
              className="inline-flex items-center gap-1 text-slate-400 hover:text-blue-600 transition cursor-pointer"
              title="Acceso exclusivo para barberos"
            >
              <Lock className="h-3 w-3" />
              <span>Acceso Barberos</span>
            </button>
          </div>
        </div>
      </footer>

      {/* Barber Auth Modal (Login / Register) */}
      {isAuthModalOpen && (
        <BarberAuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          onAuthenticated={handleBarberAuthenticated}
          adminPhone={config.phoneWhatsapp}
        />
      )}

      {/* WhatsApp Message Generator Modal */}
      {isWhatsAppShareOpen && (
        <WhatsAppShareModal
          isOpen={isWhatsAppShareOpen}
          onClose={() => setIsWhatsAppShareOpen(false)}
          config={config}
          currentBarber={currentBarber}
        />
      )}

      {/* Quick Booking Modal */}
      {isQuickBookingOpen && (
        <QuickBookingModal
          isOpen={isQuickBookingOpen}
          onClose={() => setIsQuickBookingOpen(false)}
          config={config}
          barberId={currentBarber?.id}
          onBookingCreated={fetchData}
        />
      )}

      {/* Network & Mobile Sharing Modal */}
      {isNetworkShareOpen && (
        <NetworkShareModal
          isOpen={isNetworkShareOpen}
          onClose={() => setIsNetworkShareOpen(false)}
        />
      )}
    </div>
  );
}
