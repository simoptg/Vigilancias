import React from 'react';

interface SchoolLogoProps {
  className?: string;
  variant?: 'full' | 'icon';
  color?: string;
}

export const SchoolShipIcon: React.FC<{ className?: string, color?: string }> = ({ 
  className = "h-8 w-8", 
  color = "currentColor" 
}) => {
  return (
    <svg 
      viewBox="0 0 500 400" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Column 1 (Aft/Left sail) */}
      <path 
        d="M165,160 C165,160 215,210 227,242 L165,242 Z" 
        fill={color} 
      />

      {/* Column 2 (Middle-Left sails) */}
      {/* Topmost flag/sail */}
      <path 
        d="M238,62 L238,20 C238,20 252,32 262,62 Z" 
        fill={color} 
      />
      {/* Middle sail */}
      <path 
        d="M238,142 L238,82 C238,82 268,98 274,142 Z" 
        fill={color} 
      />
      {/* Bottom sail */}
      <path 
        d="M238,242 L238,154 C238,154 282,174 286,242 Z" 
        fill={color} 
      />

      {/* Column 3 (Middle-Right sails) */}
      {/* Topmost flag/sail */}
      <path 
        d="M294,82 L294,40 C294,40 308,52 314,82 Z" 
        fill={color} 
      />
      {/* Middle sail */}
      <path 
        d="M294,148 L294,92 C294,92 322,106 326,148 Z" 
        fill={color} 
      />
      {/* Bottom sail */}
      <path 
        d="M294,242 L294,162 C294,162 334,178 338,242 Z" 
        fill={color} 
      />

      {/* Column 4 (Right/Bow sails) */}
      <path 
        d="M346,242 L346,140 C346,140 392,192 396,242 Z" 
        fill={color} 
      />

      {/* Hull */}
      <path 
        d="M188,253 L188,297 L346,297 C370,275 383,265 380,253 Z" 
        fill={color} 
      />

      {/* Waves */}
      {/* Top wave curve */}
      <path 
        d="M23,285 C23,285 24,310 130,290 C 236,270 330,340 475,285 C 490,280 475,340 400,340 C 300,340 200,380 130,320 C 110,300 23,285 23,285" 
        fill={color} 
      />
      {/* Left-most wave hook */}
      <path 
        d="M12,285 C12,305 45,310 60,325 C65,330 35,325 24,310 C12,295 12,285 12,285 Z" 
        fill={color} 
      />
      {/* Bottom sweeping main wave */}
      <path 
        d="M12,285 C15,315 50,335 125,330 C205,325 315,345 355,330 C415,310 470,350 488,350 C488,350 495,355 495,358 L495,372 C495,372 485,385 470,365 C410,295 290,365 140,365 C60,365 24,340 12,285 Z" 
        fill={color} 
      />
    </svg>
  );
};

export const SchoolLogo: React.FC<SchoolLogoProps> = ({ 
  className = "", 
  variant = "full", 
  color = "#008cd3" 
}) => {
  if (variant === 'icon') {
    return <SchoolShipIcon className={className} color={color} />;
  }

  return (
    <div className={`flex flex-col items-center justify-center text-center ${className}`}>
      <SchoolShipIcon className="w-40 h-32 md:w-56 md:h-44 transition" color={color} />
      <span 
        className="font-bold text-lg md:text-xl tracking-wide mt-2 font-display uppercase"
        style={{ color }}
      >
        Escola Secundária D. João II
      </span>
    </div>
  );
};
