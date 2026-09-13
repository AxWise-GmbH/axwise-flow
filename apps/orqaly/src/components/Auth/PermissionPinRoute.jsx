import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { PERMISSIONS_PIN_STORAGE_KEY } from '../../config/pinAccess';

export default function PermissionPinRoute({ children }) {
  const location = useLocation();
  const [verifiedThisVisit] = useState(() => {
    try {
      const hasPermissionPin = window.sessionStorage.getItem(PERMISSIONS_PIN_STORAGE_KEY) === '1';
      if (hasPermissionPin) {
        window.sessionStorage.removeItem(PERMISSIONS_PIN_STORAGE_KEY);
        return true;
      }
    } catch {
      return false;
    }
    return false;
  });

  if (!verifiedThisVisit) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/pin?mode=permissions&next=${next}`} replace />;
  }

  return children;
}
