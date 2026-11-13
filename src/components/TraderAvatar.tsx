import React, { useState, useEffect } from 'react';

interface TraderAvatarProps {
  src?: string | null;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  accentClass?: string;
}

const SIZE_CLASSES: Record<NonNullable<TraderAvatarProps['size']>, string> = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-9 h-9 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-12 h-12 text-base',
};

function getInitials(name: string): string {
  const cleaned = (name || '').trim();
  if (!cleaned) return 'TR';
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

export const TraderAvatar: React.FC<TraderAvatarProps> = ({
  src,
  name,
  size = 'md',
  accentClass = 'bg-[#161D26] border-[#232E3A] text-[#01BC8D]',
}) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  const sizeCls = SIZE_CLASSES[size];
  const validSrc = src && src.trim().length > 0 && !hasError;

  if (!validSrc) {
    return (
      <div
        aria-label={name}
        className={`${sizeCls} rounded-xl border ${accentClass} font-mono font-bold flex items-center justify-center shrink-0 select-none`}
      >
        {getInitials(name)}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setHasError(true)}
      className={`${sizeCls} rounded-xl object-cover border border-[#232E3A] bg-[#0B0E11] shrink-0`}
    />
  );
};
