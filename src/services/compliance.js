/**
 * src/services/compliance.js
 *
 * Exposes compliance blacklist checks to the client UI.
 * Imports directly from api/_compliance_blacklist.js to keep definitions unified.
 */

export {
  isBlacklisted,
  isBlacklistedEntityAsync,
  normalizeEmail,
  BLACKLISTED_EMAILS,
  BLACKLISTED_WALLETS,
} from '../../api/_compliance_blacklist.js';
