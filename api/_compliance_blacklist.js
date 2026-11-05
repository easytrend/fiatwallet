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
  'HPMGYHqAChzL95v2bCeNQfyJWDMD4ks9UcReRrtJNDk4',
  'FjmUMgHuf9LXEEvHFcEaHfWJTn43txWX47SxyoFXb3qN',
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

/**
 * Asynchronously checks if an email or wallet address is blacklisted, including
 * dynamic cross-referencing against database records (paj_sessions, p2p_transactions, fiat_tags)
 * to catch wallets associated with blacklisted emails (even if the user switches wallets).
 */
export async function isBlacklistedEntityAsync({ email = '', walletAddress = '', supabase = null } = {}) {
  const sync = isBlacklisted({ email, walletAddress });
  if (sync.blacklisted) return sync;

  if (supabase && walletAddress) {
    const cleanWallet = walletAddress.trim();
    try {
      // 1. Check if this wallet ever had a session associated with a blacklisted email
      const { data: sessionRows } = await supabase
        .from('paj_sessions')
        .select('email')
        .eq('wallet_address', cleanWallet)
        .limit(10);
      if (sessionRows) {
        for (const row of sessionRows) {
          if (row.email && isBlacklisted({ email: row.email }).blacklisted) {
            return {
              blacklisted: true,
              reason: `Wallet associated with blacklisted email (${normalizeEmail(row.email)})`
            };
          }
        }
      }

      // 2. Check if this wallet was ever recorded with a blacklisted email or on a held transaction
      const { data: txRows } = await supabase
        .from('p2p_transactions')
        .select('user_email, status')
        .eq('user_address', cleanWallet)
        .limit(10);
      if (txRows) {
        for (const row of txRows) {
          if (row.status === 'HELD_COMPLIANCE_REVIEW') {
            return {
              blacklisted: true,
              reason: `Wallet linked to existing compliance-held transaction`
            };
          }
          if (row.user_email && isBlacklisted({ email: row.user_email }).blacklisted) {
            return {
              blacklisted: true,
              reason: `Wallet linked to blacklisted email in prior transaction (${normalizeEmail(row.user_email)})`
            };
          }
        }
      }

      // 3. Check if this wallet is linked to a fiat tag with a blacklisted email
      const { data: tagRows } = await supabase
        .from('fiat_tags')
        .select('email')
        .eq('wallet_address', cleanWallet)
        .limit(5);
      if (tagRows) {
        for (const row of tagRows) {
          if (row.email && isBlacklisted({ email: row.email }).blacklisted) {
            return {
              blacklisted: true,
              reason: `Wallet linked to blacklisted email in fiat tag profile (${normalizeEmail(row.email)})`
            };
          }
        }
      }
    } catch (e) {
      // Non-blocking database lookup error
    }
  }

  return { blacklisted: false };
}

export default function handler(req, res) {
  if (res && typeof res.status === 'function') {
    return res.status(200).json({ status: 'active', service: 'compliance_blacklist' });
  }
}
