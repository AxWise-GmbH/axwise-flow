'use client';

import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { ReactNode, useEffect, createContext } from 'react';

interface AuthContextType {
  userId: string | null;
  isAuthenticated: boolean;
}

export const DashboardAuthContext = createContext<AuthContextType>({ 
  userId: null, 
  isAuthenticated: false 
});

interface DashboardAuthProviderProps {
  children: ReactNode;
}

export const DashboardAuthProvider = ({ children }: DashboardAuthProviderProps) => {
  const { userId, isLoaded } = useAuth();
  const router = useRouter();
  
  // Handle authentication redirection
  useEffect(() => {
    if (isLoaded && !userId) {
      router.push('/sign-in');
    }
  }, [isLoaded, userId, router]);
  
  // If still loading auth, show minimal loading UI
  if (!isLoaded) {
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
  }
  
  return (
    <DashboardAuthContext.Provider value={{ 
      userId: userId || null, 
      isAuthenticated: !!userId 
    }}>
      {children}
    </DashboardAuthContext.Provider>
  );
}; 