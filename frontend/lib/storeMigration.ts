/**
 * Store Migration Utilities
 * 
 * This file contains utilities for migrating Zustand persisted store data
 * between versions to ensure backward compatibility and prevent data corruption.
 */

import { StateStorage } from 'zustand/middleware';

/**
 * Create a versioned persist storage decorator
 * @param version Current version of the store schema
 * @param migrations Migration functions for each version
 * @param options Storage options
 * @returns A storage object with migration capability
 */
export function createVersionedStorage<T>(
  version: number,
  migrations: Record<number, (state: any) => any>,
  options: {
    name: string;
    storage?: StateStorage;
  }
): {
  storage: StateStorage;
  onRehydrateStorage: () => (state: T | undefined) => void;
} {
  const storage = options.storage || getDefaultStorage();
  const storageKey = options.name;
  
  return {
    storage: {
      getItem: (name: string): string | null => {
        const storedData = storage.getItem(name);
        
        if (!storedData) {
          return null;
        }
        
        try {
          const parsedData = JSON.parse(storedData);
          
          // Check if stored data has a version
          if (!hasVersion(parsedData)) {
            return migrateUnversioned(parsedData, version);
          }
          
          // Check if stored version matches current version
          if (parsedData._version !== version) {
            return migrateVersioned(parsedData, parsedData._version, version, migrations);
          }
          
          return storedData;
        } catch (e) {
          console.error(`Error parsing stored data for ${name}:`, e);
          return null;
        }
      },
      setItem: (name: string, value: string): void => {
        try {
          const parsedValue = JSON.parse(value);
          
          // Ensure value has version
          if (!hasVersion(parsedValue)) {
            const versionedValue = {
              ...parsedValue,
              _version: version,
            };
            storage.setItem(name, JSON.stringify(versionedValue));
          } else {
            storage.setItem(name, value);
          }
        } catch (e) {
          console.error(`Error setting item in storage for ${name}:`, e);
          storage.setItem(name, value);
        }
      },
      removeItem: (name: string): void => {
        storage.removeItem(name);
      },
    },
    onRehydrateStorage: () => (state) => {
      if (!state) {
        console.warn(`Failed to rehydrate state for ${storageKey}`);
        return;
      }
      
      // Validate the state after rehydration
      if (!validateState(state)) {
        console.error(`Invalid state detected for ${storageKey}, clearing storage`);
        storage.removeItem(storageKey);
      }
    },
  };
}

/**
 * Check if a state object has version information
 */
function hasVersion(state: any): boolean {
  return state && typeof state === 'object' && '_version' in state;
}

/**
 * Migrate an unversioned state to the current version
 */
function migrateUnversioned(state: any, currentVersion: number): string {
  console.info('Migrating unversioned state to current version');
  
  const migratedState = {
    ...state,
    _version: currentVersion,
  };
  
  return JSON.stringify(migratedState);
}

/**
 * Migrate a versioned state to the current version using migration functions
 */
function migrateVersioned(
  state: any,
  fromVersion: number,
  toVersion: number,
  migrations: Record<number, (state: any) => any>
): string {
  console.info(`Migrating state from version ${fromVersion} to ${toVersion}`);
  
  let migratedState = { ...state };
  
  // Apply migrations sequentially
  for (let v = fromVersion; v < toVersion; v++) {
    if (migrations[v + 1]) {
      try {
        migratedState = migrations[v + 1](migratedState);
      } catch (e) {
        console.error(`Error during migration from v${v} to v${v + 1}:`, e);
        // Reset to initial state if migration fails
        return JSON.stringify({ _version: toVersion });
      }
    }
  }
  
  // Update version
  migratedState._version = toVersion;
  
  return JSON.stringify(migratedState);
}

/**
 * Validate a state object after rehydration
 */
function validateState(state: any): boolean {
  // Simple validation - ensure state is an object
  return state && typeof state === 'object';
}

/**
 * Get the default storage mechanism (localStorage or in-memory)
 */
function getDefaultStorage(): StateStorage {
  if (typeof window !== 'undefined' && window.localStorage) {
    return localStorage;
  }
  
  // Fallback to in-memory storage
  const inMemoryStorage: Record<string, string> = {};
  return {
    getItem: (name) => inMemoryStorage[name] || null,
    setItem: (name, value) => {
      inMemoryStorage[name] = value;
    },
    removeItem: (name) => {
      delete inMemoryStorage[name];
    },
  };
}
