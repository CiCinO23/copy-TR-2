import React from 'react';

export const WhaleIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {/* Whale body + arched back + belly + tail stem */}
    <path d="M2 15.5c0-4.2 3.4-7.5 8.2-7.5 3.6 0 6.2 1.8 7.8 4.2 1.1-0.4 2.2-1.4 2.8-2.7 0.4 1.8 0.1 3.7-1.1 5 1.2 0.5 2.1 1.6 2.3 2.9-1.5-0.4-3-0.3-4.3 0.4-1.7 0.9-3.8 1.2-6.5 1.2H4.5C3.1 19 2 17.5 2 15.5Z" />
    {/* Belly grooves / mouth line */}
    <path d="M2.4 15.5h5.1c1.3 0 2.4 0.8 2.9 2" />
    {/* Whale eye */}
    <circle cx="6.5" cy="12.5" r="0.9" fill="currentColor" stroke="none" />
    {/* Water spout at the top */}
    <path d="M9.5 5.5V3.5M9.5 3.5c-1-1-2.2-1-2.8-0.3M9.5 3.5c1-1 2.2-1 2.8-0.3" />
  </svg>
);

export default WhaleIcon;
