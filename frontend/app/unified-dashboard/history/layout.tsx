import React from 'react';

/**
 * Layout for the history page
 * Minimal layout since it inherits from the parent unified-dashboard layout
 */
export default function HistoryLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element { // Moved return type
  return (
    <>
      {children}
    </>
  );
} 