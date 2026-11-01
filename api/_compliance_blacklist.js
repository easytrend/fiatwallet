/**
 * api/compliance_blacklist.js
 *
 * Compliance & Anti-Fraud blacklist definitions and normalization utilities.
 * Ensures flagged emails and wallet addresses have their incoming transactions
 * intercepted and withheld on the treasury/relayer wallet without forwarding,
 * and blocks any offramps.
 */

export const BLACKLISTED_EMAILS = [
  'dbyoutubefamily@gmail.com',
];

export const BLACKLISTED_WALLETS = [
  '6obmHBMC5Qf2KrJmmVKjPZ8WY7Hq99wje3ZTwzuNqbDx',
  '95JKwZKEAgzj25USUFGJ7FgXT7fwu7H7mFS8a3BjvJRu',
  'GaZsMXHYSt9DMe5LQJr8DuBEmZpYMgXwkWuwwewkTe2x',
];

/**
 * Normalizes email addresses to prevent alias evasion (e.g., dots in Gmail or plus-addressing).
 * Example: 'dbyoutu.befamily@gmail.com' -> 'dbyoutubefamily@gmail.com'
 */
export function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return '';
  const clean = email.trim().toLowerCase();
  const atIndex = clean.lastIndexOf('@');
  if (atIndex === -1) return clean;

  let user = clean.slice(0, atIndex);
  const domain = clean.slice(atIndex + 1);

  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    // Strip dots and plus-addressing for Gmail
    user = user.replace(/\./g, '').split('+')[0];
    return `${user}@gmail.com`;
  }
  return `${user}@${domain}`;
}

const NORMALIZED_BLACKLISTED_EMAILS = new Set(
  BLACKLISTED_EMAILS.map(normalizeEmail)
);

const BLACKLISTED_WALLETS_SET = new Set(
  BLACKLISTED_WALLETS.map(w => w.trim())
);

/**
 * Checks if a given email or wallet address is flagged on the compliance blacklist.
 */
export function isBlacklisted({ email = '', walletAddress = '' } = {}) {
  if (email) {
    const normalized = normalizeEmail(email);
    if (NORMALIZED_BLACKLISTED_EMAILS.has(normalized)) {
      return { blacklisted: true, reason: `Blacklisted email: ${normalized}` };
    }
  }

  if (walletAddress && typeof walletAddress === 'string') {
    const cleanWallet = walletAddress.trim();
    if (BLACKLISTED_WALLETS_SET.has(cleanWallet)) {
      return { blacklisted: true, reason: `Blacklisted wallet address: ${cleanWallet}` };
    }
  }

  return { blacklisted: false };
}

export default function handler(req, res) {
  if (res && typeof res.status === 'function') {
    return res.status(200).json({ status: 'active', service: 'compliance_blacklist' });
  }
}
