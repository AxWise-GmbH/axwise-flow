// Fix for "message channel closed" errors in Chrome DevTools
(function() {
  if (typeof window !== 'undefined') {
    // Save original console methods
    const originalConsoleLog = console.log;
    const originalConsoleWarn = console.warn;
    const originalConsoleError = console.error;
    
    // Safely stringify objects to prevent circular references
    function safeStringify(obj) {
      if (obj === null || obj === undefined) return String(obj);
      if (typeof obj !== 'object') return String(obj);
      
      try {
        // For objects, only show type and limited properties
        const type = obj.constructor ? obj.constructor.name : 'Object';
        return `[${type}]`;
      } catch (e) {
        return '[Object]';
      }
    }
    
    // Override console methods
    console.log = function() {
      try {
        // Convert complex objects to simple strings
        const args = Array.from(arguments).map(arg => {
          if (typeof arg === 'object' && arg !== null) {
            return safeStringify(arg);
          }
          return arg;
        });
        originalConsoleLog.apply(console, args);
      } catch (e) {
        originalConsoleLog('Error in console.log', e.message);
      }
    };
    
    console.warn = function() {
      try {
        const args = Array.from(arguments).map(arg => {
          if (typeof arg === 'object' && arg !== null) {
            return safeStringify(arg);
          }
          return arg;
        });
        originalConsoleWarn.apply(console, args);
      } catch (e) {
        originalConsoleWarn('Error in console.warn', e.message);
      }
    };
    
    console.error = function() {
      try {
        const args = Array.from(arguments).map(arg => {
          if (typeof arg === 'object' && arg !== null) {
            return safeStringify(arg);
          }
          return arg;
        });
        originalConsoleError.apply(console, args);
      } catch (e) {
        originalConsoleError('Error in console.error', e.message);
      }
    };
    
    // Add a flag to indicate this patch is active
    window.__CONSOLE_PATCHED__ = true;
  }
})(); 