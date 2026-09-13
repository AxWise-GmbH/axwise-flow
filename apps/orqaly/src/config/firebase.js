// Local auth service — works without any external provider.
// Replace with Firebase / Supabase / Clerk when ready for production auth.

const STORAGE_KEY_USERS = 'orch_auth_users';
const STORAGE_KEY_SESSION = 'orch_auth_session';
const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_PBKDF2_ITERATIONS = 120000;

const REGISTER_RATE_LIMIT_MAX = 5;
const REGISTER_RATE_LIMIT_WINDOW_MS = 60_000;
const registerAttempts = new Map();

const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

const toBase64 = (bytes) => {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
};

const fromBase64 = (base64) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const passwordMeetsPolicy = (password) => {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) return false;
  return (
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
};

async function derivePasswordHash(password, saltBase64, iterations = PASSWORD_PBKDF2_ITERATIONS) {
  if (!window.crypto?.subtle || !textEncoder) {
    throw new Error('Secure password hashing is unavailable in this browser environment.');
  }
  const key = await window.crypto.subtle.importKey(
    'raw',
    textEncoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const saltBytes = fromBase64(saltBase64);
  const bits = await window.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: saltBytes,
      iterations,
    },
    key,
    256
  );
  return toBase64(new Uint8Array(bits));
}

async function hashPassword(password) {
  if (!window.crypto?.getRandomValues) {
    throw new Error('Secure password hashing is unavailable in this browser environment.');
  }
  const salt = new Uint8Array(16);
  window.crypto.getRandomValues(salt);
  const saltBase64 = toBase64(salt);
  const hashBase64 = await derivePasswordHash(password, saltBase64, PASSWORD_PBKDF2_ITERATIONS);
  return {
    passwordHash: hashBase64,
    passwordSalt: saltBase64,
    passwordIterations: PASSWORD_PBKDF2_ITERATIONS,
    passwordAlgo: 'PBKDF2-SHA256',
  };
}

async function verifyPassword(user, password) {
  if (!user || !password) return false;
  if (user.passwordHash && user.passwordSalt) {
    const iterations = Number(user.passwordIterations || PASSWORD_PBKDF2_ITERATIONS);
    const derived = await derivePasswordHash(password, user.passwordSalt, iterations);
    return derived === user.passwordHash;
  }
  // No plaintext fallback — legacy users must reset their password
  return false;
}

const getUsers = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_USERS)) || [];
  } catch {
    return [];
  }
};

const saveUsers = (users) => localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));

const getSession = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_SESSION)) || null;
  } catch {
    return null;
  }
};

const saveSession = (user) => localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(user));
const clearSession = () => localStorage.removeItem(STORAGE_KEY_SESSION);

export const localAuth = {
  /** Get the currently stored session (or null). */
  getCurrentUser() {
    return getSession();
  },

  /** Register a new user with email + password. Returns the user object. */
  async register(email, password, displayName) {
    await new Promise((r) => setTimeout(r, 400)); // simulate latency
    const normalizedEmail = email.toLowerCase().trim();

    // Rate-limit registration attempts
    const now = Date.now();
    const attempts = registerAttempts.get(normalizedEmail) || [];
    const recent = attempts.filter((t) => now - t < REGISTER_RATE_LIMIT_WINDOW_MS);
    if (recent.length >= REGISTER_RATE_LIMIT_MAX) {
      const err = new Error('Too many registration attempts. Please try again later.');
      err.code = 'auth/too-many-requests';
      throw err;
    }
    recent.push(now);
    registerAttempts.set(normalizedEmail, recent);

    if (!passwordMeetsPolicy(password)) {
      const err = new Error(
        `Password must be at least ${PASSWORD_MIN_LENGTH} characters and include uppercase, lowercase, number, and symbol.`
      );
      err.code = 'auth/weak-password';
      throw err;
    }

    const users = getUsers();

    if (users.find((u) => u.email === normalizedEmail)) {
      const err = new Error('An account with this email already exists.');
      err.code = 'auth/email-already-in-use';
      throw err;
    }

    const passwordMaterial = await hashPassword(password);
    const user = {
      uid: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      email: normalizedEmail,
      displayName: displayName || normalizedEmail.split('@')[0],
      photoURL: null,
      ...passwordMaterial,
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    saveUsers(users);

    const session = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
    };
    saveSession(session);
    return session;
  },

  /** Sign in with email + password. Returns the user object. */
  async login(email, password) {
    await new Promise((r) => setTimeout(r, 400));
    const users = getUsers();
    const normalizedEmail = email.toLowerCase().trim();
    const user = users.find((u) => u.email === normalizedEmail);

    if (!user || !(await verifyPassword(user, password))) {
      const err = new Error('Invalid email or password.');
      err.code = 'auth/invalid-credential';
      throw err;
    }
    // Upgrade legacy plaintext users to hashed passwords on successful login.
    if (!user.passwordHash && user.password) {
      const idx = users.findIndex((u) => u.email === normalizedEmail);
      const upgradedMaterial = await hashPassword(password);
      users[idx] = {
        ...users[idx],
        ...upgradedMaterial,
      };
      delete users[idx].password;
      saveUsers(users);
    }

    const session = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
    };
    saveSession(session);
    return session;
  },

  /** Simulate Google sign-in — creates / signs in a demo Google user. */
  async loginWithGoogle() {
    await new Promise((r) => setTimeout(r, 600));
    const users = getUsers();
    const googleEmail = 'demo@gmail.com';
    let user = users.find((u) => u.email === googleEmail);

    if (!user) {
      user = {
        uid: `ggl_${Date.now()}`,
        email: googleEmail,
        displayName: 'Demo User',
        photoURL: 'https://ui-avatars.com/api/?name=Demo+User&background=4285F4&color=fff&size=128',
        password: null,
        createdAt: new Date().toISOString(),
        provider: 'google',
      };
      users.push(user);
      saveUsers(users);
    }

    const session = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
    };
    saveSession(session);
    return session;
  },

  /** Sign out. */
  async logout() {
    await new Promise((r) => setTimeout(r, 200));
    clearSession();
  },

  /** Change password for the current user. Verifies current password, then updates stored password. */
  async updatePassword(currentPassword, newPassword) {
    await new Promise((r) => setTimeout(r, 300));
    const session = getSession();
    if (!session?.email) {
      const err = new Error('Not signed in.');
      err.code = 'auth/not-signed-in';
      throw err;
    }
    const users = getUsers();
    const user = users.find((u) => u.email === session.email);
    if (!user) {
      const err = new Error('User not found.');
      err.code = 'auth/user-not-found';
      throw err;
    }
    if (!(await verifyPassword(user, currentPassword))) {
      const err = new Error('Current password is incorrect.');
      err.code = 'auth/invalid-credential';
      throw err;
    }
    if (!passwordMeetsPolicy(newPassword)) {
      const err = new Error(
        `New password must be at least ${PASSWORD_MIN_LENGTH} characters and include uppercase, lowercase, number, and symbol.`
      );
      err.code = 'auth/weak-password';
      throw err;
    }
    const passwordMaterial = await hashPassword(newPassword);
    const idx = users.findIndex((u) => u.email === session.email);
    users[idx] = { ...users[idx], ...passwordMaterial };
    delete users[idx].password;
    saveUsers(users);
  },

  /** Update profile fields (displayName, telegram) for current session. */
  updateProfile({ displayName, telegram } = {}) {
    const session = getSession();
    if (!session) throw new Error('Not signed in.');
    if (displayName !== undefined) session.displayName = displayName;
    if (telegram !== undefined) session.telegram = telegram;
    saveSession(session);
    const users = getUsers();
    const idx = users.findIndex((u) => u.uid === session.uid);
    if (idx >= 0) {
      if (displayName !== undefined) users[idx].displayName = displayName;
      if (telegram !== undefined) users[idx].telegram = telegram;
      saveUsers(users);
    }
  },

  /** Subscribe to auth state changes. Returns an unsubscribe function. */
  onAuthStateChanged(callback) {
    // Initial call with current session
    const session = getSession();
    callback(session);

    // Listen for storage changes from other tabs
    const handler = (e) => {
      if (e.key === STORAGE_KEY_SESSION) {
        callback(e.newValue ? JSON.parse(e.newValue) : null);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  },
};
