import React from 'react';

interface BarberLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  withBackground?: boolean;
}

export const BarberLogo: React.FC<BarberLogoProps> = ({
  size = 'md',
  className = '',
  withBackground = false
}) => {
  const sizeClasses = {
    xs: 'h-6 w-6',
    sm: 'h-8 w-8 sm:h-9 sm:w-9',
    md: 'h-10 w-10 sm:h-11 sm:w-11',
    lg: 'h-14 w-14 sm:h-16 sm:w-16',
    xl: 'h-20 w-20 sm:h-24 sm:w-24'
  };

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 select-none ${sizeClasses[size]} ${
        withBackground
          ? 'rounded-2xl border border-stone-200 bg-slate-900 p-1.5 shadow-md'
          : ''
      } ${className}`}
      title="BarberTurno - Bastón de Barbería & Cuchilla"
    >
      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full overflow-visible drop-shadow-xs"
      >
        <defs>
          {/* Blade Steel Metallic Gradient */}
          <linearGradient id="navBladeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="30%" stopColor="#e2e8f0" />
            <stop offset="60%" stopColor="#94a3b8" />
            <stop offset="100%" stopColor="#cbd5e1" />
          </linearGradient>

          {/* Brass / Gold Finial Gradient */}
          <linearGradient id="navBrassGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="40%" stopColor="#fbbf24" />
            <stop offset="80%" stopColor="#d97706" />
            <stop offset="100%" stopColor="#92400e" />
          </linearGradient>

          {/* Blade Edge Sharp Highlight */}
          <linearGradient id="navEdgeHighlight" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="50%" stopColor="#cbd5e1" />
            <stop offset="100%" stopColor="#ffffff" />
          </linearGradient>

          {/* Barber Pole Cylinder Clip */}
          <clipPath id="navPoleClip">
            <rect x="42" y="24" width="16" height="52" rx="3" />
          </clipPath>
        </defs>

        {/* 1. LA CUCHILLA CLÁSICA DE AFEITAR (Razor Blade - Crossed Diagonally Behind Pole) */}
        <g transform="translate(50, 50) rotate(-32) translate(-36, -17)">
          {/* Blade Outer Body with Notched Corners */}
          <path
            d="
              M 5 0 
              L 67 0 
              A 3 3 0 0 1 70 3 
              L 70 6.5 
              A 2 2 0 0 0 72 8.5 
              L 72 25.5 
              A 2 2 0 0 0 70 27.5 
              L 70 31 
              A 3 3 0 0 1 67 34 
              L 5 34 
              A 3 3 0 0 1 2 31 
              L 2 27.5 
              A 2 2 0 0 0 0 25.5 
              L 0 8.5 
              A 2 2 0 0 0 2 6.5 
              L 2 3 
              A 3 3 0 0 1 5 0 
              Z"
            fill="url(#navBladeGrad)"
            stroke="#475569"
            strokeWidth="0.8"
          />

          {/* Top Sharp Honed Edge */}
          <rect x="6" y="0.8" width="60" height="2" rx="0.5" fill="url(#navEdgeHighlight)" />
          {/* Bottom Sharp Honed Edge */}
          <rect x="6" y="31.2" width="60" height="2" rx="0.5" fill="url(#navEdgeHighlight)" />

          {/* Characteristic Razor Blade Geometric Center Slot */}
          <g fill="#1e293b" stroke="#475569" strokeWidth="0.5">
            {/* Long Slot */}
            <rect x="15" y="15.5" width="42" height="3" rx="1" />
            {/* Center Circle */}
            <circle cx="36" cy="17" r="5" />
            {/* Center Keyway Notch */}
            <rect x="34" y="11" width="4" height="12" rx="0.5" />
            {/* Left & Right Holes */}
            <circle cx="22" cy="17" r="2.8" />
            <circle cx="50" cy="17" r="2.8" />
          </g>

          {/* Subtle Blade Detail Lines */}
          <line x1="8" y1="10" x2="16" y2="10" stroke="#64748b" strokeWidth="0.5" strokeLinecap="round" />
          <line x1="56" y1="10" x2="64" y2="10" stroke="#64748b" strokeWidth="0.5" strokeLinecap="round" />
        </g>

        {/* 2. EL BASTÓN DE BARBERÍA (Barber Pole) */}
        <g>
          {/* Top Ball / Sphere (Gold/Brass) */}
          <circle cx="50" cy="14" r="6.5" fill="url(#navBrassGrad)" stroke="#92400e" strokeWidth="0.6" />
          <circle cx="48" cy="12" r="2" fill="#ffffff" fillOpacity="0.75" />

          {/* Top Brass Cap */}
          <path
            d="
              M 41 24 
              L 39 21.5 
              C 39 19 44 18 50 18 
              C 56 18 61 19 61 21.5 
              L 59 24 
              Z"
            fill="url(#navBrassGrad)"
            stroke="#92400e"
            strokeWidth="0.6"
          />
          <ellipse cx="50" cy="24" rx="9" ry="1.8" fill="#fef08a" stroke="#d97706" strokeWidth="0.5" />

          {/* Glass Cylinder Base & Outline */}
          <rect x="41.5" y="24" width="17" height="52" rx="3" fill="#ffffff" stroke="#64748b" strokeWidth="0.8" />

          {/* Rotating or Static Classic Helical Stripes (Red, White, Blue) */}
          <g clipPath="url(#navPoleClip)">
            <rect x="40" y="20" width="20" height="60" fill="#ffffff" />
            {/* Helical Ribbons */}
            <polygon points="36,20 64,6 64,13 36,27" fill="#dc2626" />
            <polygon points="36,30 64,16 64,23 36,37" fill="#1d4ed8" />
            <polygon points="36,40 64,26 64,33 36,47" fill="#dc2626" />
            <polygon points="36,50 64,36 64,43 36,57" fill="#1d4ed8" />
            <polygon points="36,60 64,46 64,53 36,67" fill="#dc2626" />
            <polygon points="36,70 64,56 64,63 36,77" fill="#1d4ed8" />
            <polygon points="36,80 64,66 64,73 36,87" fill="#dc2626" />

            {/* Glass 3D Highlight & Shadow */}
            <rect x="43" y="24" width="2" height="52" fill="#ffffff" fillOpacity="0.8" />
            <rect x="56" y="24" width="1.5" height="52" fill="#000000" fillOpacity="0.25" />
          </g>

          {/* Bottom Brass Cap & Mount */}
          <ellipse cx="50" cy="76" rx="9" ry="1.8" fill="#fef08a" stroke="#d97706" strokeWidth="0.5" />
          <path
            d="
              M 41 76 
              L 39 79 
              C 39 82 44 83 50 83 
              C 56 83 61 82 61 79 
              L 59 76 
              Z"
            fill="url(#navBrassGrad)"
            stroke="#92400e"
            strokeWidth="0.6"
          />

          {/* Bottom Finial Acorn Drop */}
          <circle cx="50" cy="85.5" r="2.8" fill="url(#navBrassGrad)" stroke="#92400e" strokeWidth="0.5" />
        </g>
      </svg>
    </div>
  );
};
