// Browser-facing re-export of the shared, runtime-neutral persistence boundary.
export {
  isPersistedCredentialField,
  stripPersistedCredentials,
  _internal,
} from '../../lib/security/persisted-credential-sanitizer.js';
