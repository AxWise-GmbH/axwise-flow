/**
 * Fixes Chrome DevTools "message channel closed" error
 * 
 * This script patches console.log, console.warn, and console.error methods
 * to prevent circular references and complex objects from causing
 * "message channel closed" errors in Chrome DevTools.
 */

// Only patch once
if (!window.consolePatchApplied) {
  window.consolePatchApplied = true;
  
  // Keep references to the original methods
  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;
  
  // Track component mounting/unmounting state
  window.isUnmounting = false;
  
  // Track React warnings already shown to prevent duplicates
  window.reactWarningsShown = new Set();
  
  // Track if we're currently in a React lifecycle method
  window.__inReactLifecycle = false;
  
  // Save references to original React lifecycle methods we need to patch
  if (typeof window !== 'undefined') {
    // Add listener for page visibility changes
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'hidden') {
        window.isUnmounting = true;
        
        // Wait until next tick to turn off unmounting mode
        setTimeout(() => {
          window.isUnmounting = false;
        }, 100);
      }
    });
    
    // Also track page unload
    window.addEventListener('beforeunload', function() {
      window.isUnmounting = true;
    });
    
    // Track tab clicks to set unmounting mode proactively
    document.addEventListener('click', function(e) {
      // Check if clicking on a tab element (approximate detection)
      const target = e.target;
      const isTabClick = target && (
        target.getAttribute('role') === 'tab' || 
        target.getAttribute('data-state') === 'active' ||
        target.closest('[role="tab"]') ||
        (target.classList && target.classList.contains('TabsTrigger'))
      );
      
      if (isTabClick) {
        window.isUnmounting = true;
        setTimeout(() => { window.isUnmounting = false; }, 300);
      }
    }, true);
    
    // Track page transitions by intercepting history state changes
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = function() {
      window.isUnmounting = true;
      const result = originalPushState.apply(this, arguments);
      setTimeout(() => { window.isUnmounting = false; }, 100);
      return result;
    };
    
    history.replaceState = function() {
      window.isUnmounting = true;
      const result = originalReplaceState.apply(this, arguments);
      setTimeout(() => { window.isUnmounting = false; }, 100);
      return result;
    };
  }
  
  // Maximum string length to keep console output manageable
  const MAX_STRING_LENGTH = 10000;
  
  /**
   * Safely stringify data for console output
   * - Handles circular references
   * - Limits output size for large objects
   * - Avoids processing complex classes like React components
   */
  function safeStringify(obj, depth = 0) {
    if (depth > 2) return "[Object]"; // Limit recursion depth
    
    // Handle primitives and null directly
    if (obj === null) return "null";
    if (obj === undefined) return "undefined";
    if (typeof obj === "string") {
      return obj.length > MAX_STRING_LENGTH 
        ? obj.substring(0, MAX_STRING_LENGTH) + "... [truncated]" 
        : obj;
    }
    if (typeof obj !== "object") return String(obj);
    
    // Skip React elements and DOM nodes
    if (
      obj.$$typeof || // React elements
      (obj.nodeType && obj.nodeName) || // DOM nodes
      obj._reactInternals || // React instances
      obj._reactRootContainer || // React roots
      (obj.constructor && (
        obj.constructor.name === 'SyntheticEvent' || 
        obj.constructor.name === 'SyntheticBaseEvent'
      ))
    ) {
      return "[React Component]";
    }
    
    // Handle arrays
    if (Array.isArray(obj)) {
      if (obj.length > 20) {
        return `[Array(${obj.length})]`;
      }
      return "[" + obj.map(item => safeStringify(item, depth + 1)).join(", ") + "]";
    }
    
    // Handle objects
    try {
      const props = [];
      let count = 0;
      
      for (const key in obj) {
        if (count > 10) {
          props.push(`... ${Object.keys(obj).length - 10} more properties`);
          break;
        }
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          let value;
          try {
            value = obj[key];
            // Skip functions, symbols, and properties that might cause issues
            if (
              typeof value === 'function' || 
              typeof value === 'symbol' ||
              key === '__proto__' ||
              key === 'constructor' ||
              key === 'prototype'
            ) {
              value = `[${typeof value}]`;
            } else {
              value = safeStringify(value, depth + 1);
            }
            props.push(`${key}: ${value}`);
            count++;
          } catch (err) {
            props.push(`${key}: [Error during serialization]`);
          }
        }
      }
      
      return `{${props.join(", ")}}`;
    } catch (err) {
      return `[Object: serialization error - ${err.message}]`;
    }
  }
  
  /**
   * Check if a message is a React key warning
   * These appear often during development and can trigger message channel errors
   */
  function isReactKeyWarning(args) {
    if (!args || !args.length) return false;
    
    // Check for common patterns in React key warnings
    const firstArg = String(args[0] || '');
    const message = args.join(' ');
    
    return (
      // React key warnings
      firstArg.includes('Warning: Each child in a list should have a unique "key" prop') ||
      message.includes('Key should be unique') ||
      message.includes('encountered two children with the same key') ||
      // Similar development warnings
      message.includes('Invalid prop') ||
      message.includes('React does not recognize') ||
      message.includes('Unknown prop')
    );
  }

  /**
   * Get a simplified signature of the warning to avoid showing the same one repeatedly
   */
  function getWarningSignature(args) {
    if (!args || !args.length) return '';
    
    const message = String(args[0] || '');
    
    // For key warnings, extract just the component name
    if (message.includes('key prop')) {
      const match = message.match(/Check the render method of `([^`]+)`/);
      if (match) {
        return `key-warning-${match[1]}`;
      }
    }
    
    // For other warnings, use the first 50 chars
    return message.substring(0, 50);
  }
  
  /**
   * Monitor React component lifecycle through console logging behavior
   * This helps us detect when components are being unmounted
   */
  function patchConsole() {
    // Replace console.log with our safe version
    console.log = function() {
      if (window.isUnmounting) {
        // During unmounting, only allow string messages to avoid
        // asynchronous responses from DevTools
        const simpleArgs = Array.from(arguments).map(arg => {
          if (typeof arg === 'string') return arg;
          return '[Object during unmount]';
        });
        return originalConsoleLog.apply(console, simpleArgs);
      }
      
      try {
        // For normal operation, stringify complex objects but pass through strings
        const safeArgs = Array.from(arguments).map(arg => {
          if (typeof arg === 'string') return arg;
          if (typeof arg === 'number') return arg;
          if (typeof arg === 'boolean') return arg;
          return safeStringify(arg);
        });
        return originalConsoleLog.apply(console, safeArgs);
      } catch (err) {
        return originalConsoleLog.call(console, '[Error in console.log]', err.message);
      }
    };
    
    // Also patch console.warn and console.error with the same approach
    console.warn = function() {
      if (window.isUnmounting) {
        const simpleArgs = Array.from(arguments).map(arg => {
          if (typeof arg === 'string') return arg;
          return '[Object during unmount]';
        });
        return originalConsoleWarn.apply(console, simpleArgs);
      }
      
      try {
        // Check if this is a React warning we should deduplicate
        if (isReactKeyWarning(arguments)) {
          const warningSignature = getWarningSignature(arguments);
          
          // If we've already shown this warning, skip it
          if (window.reactWarningsShown.has(warningSignature)) {
            return;
          }
          
          // Otherwise, remember we've shown it
          window.reactWarningsShown.add(warningSignature);
        }
        
        const safeArgs = Array.from(arguments).map(arg => {
          if (typeof arg === 'string') return arg;
          if (typeof arg === 'number') return arg;
          if (typeof arg === 'boolean') return arg;
          return safeStringify(arg);
        });
        return originalConsoleWarn.apply(console, safeArgs);
      } catch (err) {
        return originalConsoleWarn.call(console, '[Error in console.warn]', err.message);
      }
    };
    
    console.error = function() {
      if (window.isUnmounting) {
        const simpleArgs = Array.from(arguments).map(arg => {
          if (typeof arg === 'string') return arg;
          return '[Object during unmount]';
        });
        return originalConsoleError.apply(console, simpleArgs);
      }
      
      try {
        // Check if this is a React warning we should deduplicate
        if (isReactKeyWarning(arguments)) {
          const warningSignature = getWarningSignature(arguments);
          
          // If we've already shown this warning, skip it
          if (window.reactWarningsShown.has(warningSignature)) {
            return;
          }
          
          // Otherwise, remember we've shown it
          window.reactWarningsShown.add(warningSignature);
        }
        
        const safeArgs = Array.from(arguments).map(arg => {
          if (typeof arg === 'string') return arg;
          if (typeof arg === 'number') return arg;
          if (typeof arg === 'boolean') return arg;
          return safeStringify(arg);
        });
        return originalConsoleError.apply(console, safeArgs);
      } catch (err) {
        return originalConsoleError.call(console, '[Error in console.error]', err.message);
      }
    };
  }
  
  // Apply our patches
  patchConsole();
  
  // Initialize reactWarningsShown if it doesn't exist
  if (!window.reactWarningsShown) {
    window.reactWarningsShown = new Set();
  }
  
  console.log('Console patched to fix message channel errors');
} 