import { createContext, useContext } from 'react';

const NotificationContext = createContext(null);

export function NotificationProvider({ value, children }) {
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications must be used inside NotificationProvider');
  }
  return ctx;
}
