import React from 'react';

export default function Spinner({ size = 'md', className = '' }) {
  const sizes = { sm: 'w-4 h-4 border-2', md: 'w-6 h-6 border-2', lg: 'w-10 h-10 border-4' };
  return (
    <div
      className={`${sizes[size]} border-primary-700 border-t-transparent rounded-full animate-spin ${className}`}
    />
  );
}
