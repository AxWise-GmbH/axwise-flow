import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { DOCUMENTATION_PIN_STORAGE_KEY } from '../../config/pinAccess';

export default function DocumentationPinRoute({ children }) {
  const location = useLocation();
  const [verifiedThisVisit] = useState(() => {
    try {
      const granted = window.sessionStorage.getItem(DOCUMENTATION_PIN_STORAGE_KEY) === '1';
      if (granted) {
        window.sessionStorage.removeItem(DOCUMENTATION_PIN_STORAGE_KEY);
        return true;
      }
    } catch {
      return false;
    }
    return false;
  });

  if (!verifiedThisVisit) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/pin?mode=documentation&next=${next}`} replace />;
  }

  return children;
}
