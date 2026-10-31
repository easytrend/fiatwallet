import { createClient } from '@supabase/supabase-js';
import { fetchRemotePajConfig } from './pajcashService';

let activeSupabase = null;

export function getSupabase() {
  if (activeSupabase) return activeSupabase;
  const url = import.meta.env.VITE_SUPABASE_URL || (typeof localStorage !== 'undefined' ? localStorage.getItem('fiatwallet_supabase_url') : null);
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY || (typeof localStorage !== 'undefined' ? localStorage.getItem('fiatwallet_supabase_anon_key') : null);
  if (url && key) {
    try {
      activeSupabase = createClient(url, key);
    } catch (e) {
      console.warn('Failed to initialize Supabase client:', e);
    }
  }
  return activeSupabase;
}

export async function getSupabaseAsync() {
  let client = getSupabase();
  if (client) return client;
  try {
    await fetchRemotePajConfig();
  } catch (e) {}
  return getSupabase();
}

if (typeof window !== 'undefined') {
  window.addEventListener('fiatwallet:config_updated', (e) => {
    if (e.detail?.supabaseUrl && e.detail?.supabaseAnonKey) {
      try {
        activeSupabase = createClient(e.detail.supabaseUrl, e.detail.supabaseAnonKey);
      } catch (err) {}
    }
  });
}

export const supabase = new Proxy({}, {
  get(target, prop) {
    const client = getSupabase();
    if (!client) return undefined;
    const val = client[prop];
    return typeof val === 'function' ? val.bind(client) : val;
  }
});

/**
 * Log a general on-chain transaction (send, swap, bulk_send, claims).
 */
export async function logTransaction({ signature, userAddress, type, symbol, tokenAmount, usdValue }) {
  const client = (await getSupabaseAsync()) || getSupabase();
  if (!client || !signature) return;

  try {
    const { error } = await client
      .from('transactions')
      .upsert(
        {
          signature,
          user_address: userAddress,
          transaction_type: type,
          token_symbol: symbol,
          token_amount: parseFloat(tokenAmount) || 0,
          usd_value: parseFloat(usdValue) || 0,
        },
        { onConflict: 'signature' }
      );

    if (error) console.warn('[Supabase] logTransaction failed:', error.message);
  } catch (err) {
    console.warn('[Supabase] logTransaction error:', err.message);
  }
}

/**
 * Strict status normalizer for Supabase p2p_transactions table.
 * Strictly guarantees status is only one of: 'INIT', 'PENDING', 'COMPLETED', 'ERROR'.
 */
export function normalizeSupabaseStatus(rawStatus) {
  if (!rawStatus) return 'PENDING';
  const s = String(rawStatus).toUpperCase().trim();
  if (['COMPLETED', 'SUCCESSFUL', 'CONFIRMED', 'FORWARDED_SUCCESS', 'DONE'].includes(s)) return 'COMPLETED';
  if (['FAILED', 'ERROR', 'CANCELLED', 'EXPIRED', 'REJECTED'].includes(s)) return 'ERROR';
  if (['INIT', 'INITIALIZED', 'WAITING'].includes(s)) return 'INIT';
  return 'PENDING'; // PAID, PENDING, PROCESSING, SWAPPING, FORWARDING, etc.
}

/**
 * Log a live P2P transaction (onramp or offramp) with full metadata.
 */
export async function logP2PTransaction({
  signature,
  userAddress,
  orderId,
  tokenSymbol,
  cryptoAmount,
  fiatCurrency,
  fiatAmount,
  usdValue,
  bankName,
  accountNumber,
  accountName,
  status = 'INIT',
  userEmail,
  depositAddress,
  recipientTag,
  type = 'p2p_offramp',
}) {
  const client = (await getSupabaseAsync()) || getSupabase();
  if (!client || !orderId) return;

  const actualSignature = signature || `pending_${type}_${orderId}`;
  const storedReferrer = (typeof window !== 'undefined' && window.localStorage)
    ? (window.localStorage.getItem('fw_referrer') || null)
    : null;

  const payload = {
    signature: actualSignature,
    user_address: userAddress,
    order_id: String(orderId),
    transaction_type: type,
    token_symbol: tokenSymbol,
    crypto_amount: parseFloat(cryptoAmount) || 0,
    fiat_currency: fiatCurrency || 'NGN',
    fiat_amount: parseFloat(fiatAmount) || 0,
    usd_value: parseFloat(usdValue) || 0,
    bank_name: bankName || null,
    account_number: accountNumber || null,
    account_name: accountName || null,
    status: normalizeSupabaseStatus(status),
    user_email: userEmail || null,
    deposit_address: depositAddress || null,
    recipient_tag: recipientTag || null,
    referrer_address: storedReferrer,
    updated_at: new Date().toISOString(),
  };

  try {
    // --- p2p_transactions ---
    // Check if a record with this order_id already exists; update it, otherwise insert fresh.
    const { data: existingP2P } = await client
      .from('p2p_transactions')
      .select('id')
      .eq('order_id', String(orderId))
      .maybeSingle();

    let p2pError;
    if (existingP2P?.id) {
      ({ error: p2pError } = await client
        .from('p2p_transactions')
        .update(payload)
        .eq('order_id', String(orderId)));
    } else {
      ({ error: p2pError } = await client
        .from('p2p_transactions')
        .insert(payload));
    }

    // Graceful fallback if referrer_address column does not exist yet in database
    if (p2pError && p2pError.message && p2pError.message.includes('referrer_address')) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.referrer_address;
      if (existingP2P?.id) {
        ({ error: p2pError } = await client
          .from('p2p_transactions')
          .update(fallbackPayload)
          .eq('order_id', String(orderId)));
      } else {
        ({ error: p2pError } = await client
          .from('p2p_transactions')
          .insert(fallbackPayload));
      }
    }

    // --- transactions (secondary ledger table) ---
    const txPayload = {
      signature: actualSignature,
      user_address: userAddress,
      transaction_type: type,
      token_symbol: tokenSymbol,
      token_amount: parseFloat(cryptoAmount) || 0,
      usd_value: parseFloat(usdValue) || 0,
    };
    const { data: existingTx } = await client
      .from('transactions')
      .select('id')
      .eq('signature', actualSignature)
      .maybeSingle();

    let txError;
    if (existingTx?.id) {
      ({ error: txError } = await client
        .from('transactions')
        .update(txPayload)
        .eq('signature', actualSignature));
    } else {
      ({ error: txError } = await client
        .from('transactions')
        .insert(txPayload));
    }


    if (p2pError) console.warn('[Supabase] logP2PTransaction failed:', p2pError.message);
    if (txError) console.warn('[Supabase] logP2PTransaction (transactions) failed:', txError.message);
  } catch (err) {
    console.warn('[Supabase] logP2PTransaction error:', err.message);
  }
}

/**
 * Update P2P transaction status (and optional actual signature) in Supabase.
 */
export async function updateP2PTransactionStatus(orderId, status, signature = null) {
  const client = (await getSupabaseAsync()) || getSupabase();
  if (!client || !orderId) return;
  try {
    // Guard against overwriting terminal forwarded status or completed status
    const { data: current } = await client
      .from('p2p_transactions')
      .select('status, signature')
      .eq('order_id', String(orderId))
      .maybeSingle();
      
    if (current?.status === 'FORWARDED_SUCCESS' || current?.status === 'COMPLETED') {
      return; // Do not overwrite completed or relayer forward status
    }

    // Safety guard: If an on-chain signature is present, never downgrade to 'ERROR' on client timeouts.
    // Keep it as 'PENDING' so on-chain reconciliation can finalize it to 'COMPLETED'.
    const effectiveSig = signature || current?.signature;
    const hasRealOnChainSig = effectiveSig && !effectiveSig.startsWith('pending_') && effectiveSig.length >= 60;
    let targetStatus = normalizeSupabaseStatus(status);
    if (targetStatus === 'ERROR' && hasRealOnChainSig) {
      console.warn(`[Supabase] Preserving PENDING for order ${orderId} because real on-chain signature exists: ${effectiveSig.slice(0, 8)}...`);
      targetStatus = 'PENDING';
    }

    const patch = { updated_at: new Date().toISOString() };
    if (targetStatus) {
      patch.status = targetStatus;
    }
    if (signature) {
      patch.signature = signature;
    }

    const { error } = await client
      .from('p2p_transactions')
      .update(patch)
      .eq('order_id', String(orderId));

    if (error) console.warn('[Supabase] updateP2PTransactionStatus failed:', error.message);
  } catch (err) {
    console.warn('[Supabase] updateP2PTransactionStatus error:', err.message);
  }
}

/**
 * Sync PajCash API status back to Supabase for tracked P2P orders.
 */
export async function syncP2PTransactionStatuses(orders = [], walletAddress = null) {
  const client = (await getSupabaseAsync()) || getSupabase();
  if (!client || !Array.isArray(orders) || orders.length === 0) return;

  try {
    for (const order of orders) {
      const orderId = String(order.id || order._id || order.orderId || '');
      if (!orderId) continue;

      const rawStatus = order.status || order.state || 'PENDING';
      const status = normalizeSupabaseStatus(rawStatus);
      const signature = order.signature || order.sig || order.txSignature || order.tx_hash || order.txHash || null;
      const userAddr = order.userAddress || order.user_address || walletAddress || null;

      // Check if order already exists in Supabase
      const { data: existing } = await client
        .from('p2p_transactions')
        .select('id, status, signature')
        .eq('order_id', orderId)
        .maybeSingle();

      if (existing) {
        // Update status or signature if it changed
        const patch = {};
        if (existing.status !== 'FORWARDED_SUCCESS' && existing.status !== status) {
          patch.status = status;
        }
        if (signature && (!existing.signature || existing.signature.startsWith('pending_')) && signature !== existing.signature) {
          patch.signature = signature;
        }
        if (Object.keys(patch).length > 0) {
          patch.updated_at = new Date().toISOString();
          await client.from('p2p_transactions').update(patch).eq('order_id', orderId);
        }
      } else if (userAddr) {
        // Order is missing from Supabase! Auto-backfill/insert it now.
        const txType = order.type || order.transaction_type || (order.depositAddress || order.deposit_address ? 'p2p_offramp' : 'p2p_onramp');
        const payload = {
          order_id: orderId,
          signature: signature || `pending_${txType}_${orderId}`,
          user_address: userAddr,
          transaction_type: txType,
          token_symbol: order.tokenSymbol || order.token_symbol || 'USDC',
          crypto_amount: parseFloat(order.cryptoAmount || order.amount || order.crypto_amount) || 0,
          fiat_currency: order.fiatCurrency || order.fiat_currency || 'NGN',
          fiat_amount: parseFloat(order.fiatAmount || order.fiat_amount) || 0,
          usd_value: parseFloat(order.usdValue || order.usd_value) || 0,
          bank_name: order.bankName || order.bank_name || order.bank || null,
          account_number: order.accountNumber || order.account_number || order.account || null,
          account_name: order.accountName || order.account_name || order.name || null,
          recipient_tag: order.recipientTag || order.recipient_tag || null,
          status,
          user_email: order.userEmail || order.user_email || order.email || null,
          deposit_address: order.depositAddress || order.deposit_address || order.address || null,
          updated_at: new Date().toISOString(),
        };

        await client.from('p2p_transactions').insert(payload);
        console.log(`[Supabase] Auto-backfilled missing historical order ${orderId} into p2p_transactions`);
      }
    }
  } catch (err) {
    console.warn('[Supabase] syncP2PTransactionStatuses error:', err.message);
  }
}

/**
 * Proactively check Supabase for any P2P orders currently stuck in 'INIT' or 'PENDING',
 * verify their live status directly with PajCash API, and update Supabase to 'COMPLETED' or 'ERROR'.
 */
export async function reconcilePendingP2PTransactions(walletAddress, authToken) {
  const client = (await getSupabaseAsync()) || getSupabase();
  if (!client) return [];
  try {
    let query = client
      .from('p2p_transactions')
      .select('id, order_id, status, signature, transaction_type, crypto_amount, usd_value')
      .in('status', ['INIT', 'PENDING', 'ERROR', 'FORWARD_FAILED', 'FORWARDING'])
      .order('created_at', { ascending: false })
      .limit(30);

    if (walletAddress) {
      query = query.eq('user_address', walletAddress);
    }

    const { data: pendingOrders, error } = await query;
    if (error || !pendingOrders || pendingOrders.length === 0) return [];

    const reconciled = [];

    // Phase 1: On-Chain verification for orders with Solana signatures
    const ordersWithSigs = pendingOrders.filter(row =>
      row.signature && !row.signature.startsWith('pending_') && row.signature.length >= 60
    );

    if (ordersWithSigs.length > 0) {
      try {
        const { Connection } = await import('@solana/web3.js');
        const rpcUrl = (typeof process !== 'undefined' && (process.env.VITE_RPC_URL || process.env.RPC_URL)) || 'https://api.mainnet-beta.solana.com';
        const connection = new Connection(rpcUrl, 'confirmed');
        const sigs = ordersWithSigs.map(o => o.signature);
        const statuses = await connection.getSignatureStatuses(sigs, { searchTransactionHistory: true });

        if (statuses?.value) {
          for (let i = 0; i < ordersWithSigs.length; i++) {
            const st = statuses.value[i];
            const orderRow = ordersWithSigs[i];
            if (st && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized') && !st.err) {
              if (orderRow.status !== 'COMPLETED') {
                await client
                  .from('p2p_transactions')
                  .update({
                    status: 'COMPLETED',
                    updated_at: new Date().toISOString(),
                  })
                  .eq('order_id', orderRow.order_id);

                reconciled.push({ orderId: orderRow.order_id, status: 'COMPLETED', reason: 'onchain_verified' });
                console.log(`[Supabase] Reconciled order ${orderRow.order_id} -> COMPLETED via on-chain confirmation`);
              }
            }
          }
        }
      } catch (onChainErr) {
        console.warn('[Supabase] On-chain signature reconciliation check skipped:', onChainErr.message);
      }
    }

    // Phase 2: PajCash API check if authToken is provided
    const token = authToken;
    if (token) {
      const baseUrls = ['https://api.paj.cash', 'https://api-staging.paj.cash'];
      for (const row of pendingOrders) {
        const orderId = row.order_id;
        if (!orderId || reconciled.some(r => r.orderId === orderId)) continue;

        let pajData = null;
        for (const baseUrl of baseUrls) {
          try {
            const resp = await fetch(`${baseUrl}/pub/transactions/${orderId}`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (resp.ok) {
              pajData = await resp.json();
              break;
            }
          } catch (e) {}
        }

        if (pajData) {
          const rawStatus = (pajData.status || pajData.state || '').toUpperCase();
          if (['COMPLETED', 'SUCCESSFUL', 'CONFIRMED', 'DONE', 'SUCCESS', 'SETTLED', 'PAID_OUT'].includes(rawStatus)) {
            const patch = {
              status: 'COMPLETED',
              updated_at: new Date().toISOString()
            };
            const sig = pajData.txHash || pajData.signature || pajData.tx_hash;
            if (sig) patch.signature = sig;

            await client.from('p2p_transactions').update(patch).eq('order_id', orderId);
            reconciled.push({ orderId, status: 'COMPLETED', reason: 'pajcash_verified' });
            console.log(`[Supabase] Reconciled pending order ${orderId} -> COMPLETED`);
          } else if (['FAILED', 'CANCELLED', 'EXPIRED', 'REJECTED'].includes(rawStatus)) {
            const hasSig = row.signature && !row.signature.startsWith('pending_') && row.signature.length >= 60;
            if (!hasSig) {
              await client.from('p2p_transactions').update({
                status: 'ERROR',
                updated_at: new Date().toISOString()
              }).eq('order_id', orderId);
              reconciled.push({ orderId, status: 'ERROR' });
              console.log(`[Supabase] Reconciled pending order ${orderId} -> ERROR`);
            }
          }
        }
      }
    }

    // Phase 3: Onramp reconciliation via /api/relay_onramp_fee
    const pendingOnramps = pendingOrders.filter(row =>
      (row.transaction_type === 'p2p_onramp' || row.transaction_type === 'onramp') &&
      ['INIT', 'PENDING', 'ERROR', 'FORWARD_FAILED', 'FORWARDING'].includes((row.status || '').toUpperCase())
    );

    for (const onramp of pendingOnramps) {
      const orderId = onramp.order_id;
      if (!orderId || reconciled.some(r => r.orderId === orderId)) continue;

      try {
        const relayEndpoint = typeof window !== 'undefined' && window.location.origin
          ? `${window.location.origin}/api/relay_onramp_fee`
          : 'https://www.fiatwallet.app/api/relay_onramp_fee';

        const relayRes = await fetch(relayEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId,
            sessionToken: authToken || undefined,
            destinationAddress: onramp.user_address || walletAddress || undefined
          })
        });

        if (relayRes.ok) {
          const relayData = await relayRes.json();
          if (relayData.signature || relayData.alreadyForwarded) {
            reconciled.push({ orderId, status: 'COMPLETED', reason: 'onramp_forwarded' });
            console.log(`[Supabase] Reconciled onramp order ${orderId} -> COMPLETED`);
          }
        }
      } catch (onrampErr) {
        // Continue silently
      }
    }

    return reconciled;
  } catch (err) {
    console.warn('[Supabase] reconcilePendingP2PTransactions error:', err.message);
    return [];
  }
}

// ── Cross-device PajCash session helpers ─────────────────────────────────────

/**
 * Save (upsert) a PajCash session to Supabase after successful OTP verification.
 * Called once per verification so any other device the user connects to can
 * restore the session automatically without re-verifying.
 *
 * @param {string} walletAddress - User's Solana public key (base58)
 * @param {string} email         - Verified email address
 * @param {string} token         - PajCash JWT session token
 * @param {number} expiryMs      - Expiry timestamp in milliseconds (Date.now() based)
 */
export async function saveSession(walletAddress, email, token, expiryMs) {
  const client = (await getSupabaseAsync()) || getSupabase();
  if (!client || !walletAddress || !token) return;
  const row = {
    wallet_address: walletAddress,
    email,
    session_token: token,
    expires_at: new Date(expiryMs).toISOString(),
    updated_at: new Date().toISOString(),
  };
  try {
    // Strategy 1: upsert (works if wallet_address has a UNIQUE constraint)
    const { error: upsertErr } = await client
      .from('paj_sessions')
      .upsert(row, { onConflict: 'wallet_address' });

    if (!upsertErr) {
      console.log('[Supabase] saveSession: upsert OK for', walletAddress.slice(0, 8));
      return;
    }
    console.warn('[Supabase] saveSession: upsert failed, trying delete+insert:', upsertErr.message);

    // Strategy 2: delete all old rows then insert fresh (works if NO unique constraint)
    await client.from('paj_sessions').delete().eq('wallet_address', walletAddress);
    const { error: insertErr } = await client.from('paj_sessions').insert(row);
    if (insertErr) {
      console.warn('[Supabase] saveSession: insert also failed:', insertErr.message);
    } else {
      console.log('[Supabase] saveSession: delete+insert OK for', walletAddress.slice(0, 8));
    }
  } catch (err) {
    console.warn('[Supabase] saveSession error:', err.message);
  }
}

/**
 * Load a PajCash session from Supabase for a given wallet address.
 * Returns the row object or null if not found / expired.
 * Works regardless of whether 0, 1, or multiple rows exist for this wallet.
 *
 * @param {string} walletAddress - User's Solana public key (base58)
 * @returns {{ email: string, session_token: string, expires_at: string } | null}
 */
export async function loadSession(walletAddress) {
  const client = (await getSupabaseAsync()) || getSupabase();
  if (!client || !walletAddress) return null;
  try {
    // 1. Try exact match first
    let { data, error } = await client
      .from('paj_sessions')
      .select('email, session_token, expires_at')
      .eq('wallet_address', walletAddress)
      .order('updated_at', { ascending: false })
      .limit(1);

    // 2. Fallback to case-insensitive match (handles minor casing differences)
    if (!data || data.length === 0) {
      const ilikeRes = await client
        .from('paj_sessions')
        .select('email, session_token, expires_at')
        .ilike('wallet_address', walletAddress)
        .order('updated_at', { ascending: false })
        .limit(1);
      if (ilikeRes.data && ilikeRes.data.length > 0) {
        data = ilikeRes.data;
      }
    }

    if (error) {
      console.warn('[Supabase] loadSession query error:', error.message);
      return null;
    }

    if (!data || data.length === 0) {
      console.log('[Supabase] loadSession: no session found for', walletAddress.slice(0, 8));
      return null;
    }

    const session = data[0];

    // Check if token has expired
    if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
      console.log('[Supabase] loadSession: session expired for', walletAddress.slice(0, 8));
      return null;
    }

    console.log('[Supabase] loadSession: session found for', walletAddress.slice(0, 8), '- auto-authenticating');
    return session;
  } catch (err) {
    console.warn('[Supabase] loadSession error:', err.message);
    return null;
  }
}

/**
 * Delete a PajCash session from Supabase on logout.
 *
 * @param {string} walletAddress - User's Solana public key (base58)
 */
export async function deleteSession(walletAddress) {
  const client = (await getSupabaseAsync()) || getSupabase();
  if (!client || !walletAddress) return;
  try {
    const { error } = await client
      .from('paj_sessions')
      .delete()
      .ilike('wallet_address', walletAddress);
    if (error) console.warn('[Supabase] deleteSession failed:', error.message);
  } catch (err) {
    console.warn('[Supabase] deleteSession error:', err.message);
  }
}

/**
 * Get all order IDs and signatures associated with a specific user's wallet address.
 */
export async function getP2PTransactionIdsByUser(walletAddress) {
  const client = (await getSupabaseAsync()) || getSupabase();
  if (!client || !walletAddress) return { orderIds: new Set(), signatures: new Set() };
  try {
    const { data, error } = await client
      .from('p2p_transactions')
      .select('order_id, signature')
      .eq('user_address', walletAddress);

    if (error) {
      console.warn('[Supabase] getP2PTransactionIdsByUser failed:', error.message);
      return { orderIds: new Set(), signatures: new Set() };
    }

    const orderIds = new Set(data.map(r => String(r.order_id)));
    const signatures = new Set(data.map(r => String(r.signature)).filter(s => s && s !== 'null'));
    return { orderIds, signatures };
  } catch (err) {
    console.warn('[Supabase] getP2PTransactionIdsByUser error:', err.message);
    return { orderIds: new Set(), signatures: new Set() };
  }
}

/**
 * Get all full P2P transaction records associated with a specific user's wallet address.
 */
export async function getP2PTransactionsByUser(walletAddress) {
  const client = (await getSupabaseAsync()) || getSupabase();
  if (!client || !walletAddress) return [];
  try {
    const { data, error } = await client
      .from('p2p_transactions')
      .select('*')
      .eq('user_address', walletAddress)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[Supabase] getP2PTransactionsByUser failed:', error.message);
      return [];
    }

    return data || [];
  } catch (err) {
    console.warn('[Supabase] getP2PTransactionsByUser error:', err.message);
    return [];
  }
}

/**
 * ── Fiat Tag (P2P Tag) Database API ──────────────────────────────────────────
 */

/**
 * Get registered Fiat Tag for a specific wallet address.
 */
export async function getFiatTagByWallet(walletAddress) {
  const client = (await getSupabaseAsync()) || getSupabase();
  if (!client || !walletAddress) return null;
  try {
    let { data, error } = await client
      .from('fiat_tags')
      .select('*')
      .eq('wallet_address', walletAddress)
      .maybeSingle();

    if (!data) {
      const ilikeRes = await client
        .from('fiat_tags')
        .select('*')
        .ilike('wallet_address', walletAddress)
        .maybeSingle();
      if (ilikeRes.data) {
        data = ilikeRes.data;
      }
    }

    if (error && error.code !== 'PGRST116') {
      console.warn('[Supabase] getFiatTagByWallet warning:', error.message);
    }
    return data || null;
  } catch (err) {
    console.warn('[Supabase] getFiatTagByWallet error:', err.message);
    return null;
  }
}

/**
 * Resolve a Fiat Tag name (e.g. "$johndoe" or "johndoe") to recipient bank details.
 */
export async function getFiatTagByName(tagName) {
  const client = (await getSupabaseAsync()) || getSupabase();
  if (!client || !tagName) return null;
  try {
    const cleanTag = String(tagName).trim().toLowerCase();
    const formattedTag = cleanTag.startsWith('$') ? cleanTag : `$${cleanTag}`;

    const { data, error } = await client
      .from('fiat_tags')
      .select('*')
      .or(`tag_name.eq.${formattedTag},tag_name.eq.${cleanTag}`)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.warn('[Supabase] getFiatTagByName warning:', error.message);
    }
    return data || null;
  } catch (err) {
    console.warn('[Supabase] getFiatTagByName error:', err.message);
    return null;
  }
}

/**
 * Create or update a user's Fiat Tag and linked bank account details.
 */
export async function registerFiatTag({ walletAddress, tagName, bankName, bankCode, accountNumber, accountName }) {
  const client = (await getSupabaseAsync()) || getSupabase();
  if (!client || !walletAddress || !tagName || !accountNumber || !bankName) {
    throw new Error('Missing required fields for Fiat Tag registration.');
  }

  const cleanTag = String(tagName).trim().toLowerCase();
  const formattedTag = cleanTag.startsWith('$') ? cleanTag : `$${cleanTag}`;

  // 1. Check if tag is already taken by another wallet
  const existing = await getFiatTagByName(formattedTag);
  if (existing && existing.wallet_address?.toLowerCase() !== walletAddress?.toLowerCase()) {
    throw new Error(`Tag ${formattedTag} is already taken by another user. Please choose a different tag.`);
  }

  const payload = {
    wallet_address: walletAddress,
    tag_name: formattedTag,
    bank_name: bankName,
    bank_code: bankCode || null,
    account_number: String(accountNumber).trim(),
    account_name: String(accountName).trim(),
    updated_at: new Date().toISOString(),
  };

  // 2. If this wallet already has a tag, update it; otherwise insert a new one.
  let { data: existingOwn } = await client
    .from('fiat_tags')
    .select('id')
    .eq('wallet_address', walletAddress)
    .maybeSingle();

  if (!existingOwn?.id) {
    const ilikeOwn = await client
      .from('fiat_tags')
      .select('id')
      .ilike('wallet_address', walletAddress)
      .maybeSingle();
    if (ilikeOwn.data?.id) {
      existingOwn = ilikeOwn.data;
    }
  }

  let data, error;

  if (existingOwn?.id) {
    // UPDATE the existing row for this wallet
    ({ data, error } = await client
      .from('fiat_tags')
      .update(payload)
      .eq('id', existingOwn.id)
      .select()
      .single());
  } else {
    // INSERT a brand new row
    ({ data, error } = await client
      .from('fiat_tags')
      .insert(payload)
      .select()
      .single());
  }

  if (error) {
    console.error('[Supabase] registerFiatTag error:', error.message);
    throw new Error(error.message);
  }

// Also sync fiat_tag into wallets table if it exists
  try {
    await client
      .from('wallets')
      .update({ fiat_tag: formattedTag, last_active_at: new Date().toISOString() })
      .eq('wallet_address', walletAddress);
  } catch (_) {}

  return data;
}

/**
 * Record a newly created or active wallet in Supabase.
 * If the wallet already exists, updates last_active_at without resetting created_at or trade stats.
 */
export async function recordWalletRegistration(walletAddress, walletType = 'created', fiatTag = null) {
  const client = (await getSupabaseAsync()) || getSupabase();
  if (!client || !walletAddress) return null;

  try {
    const { data: existing } = await client
      .from('wallets')
      .select('wallet_address, fiat_tag')
      .eq('wallet_address', walletAddress)
      .maybeSingle();

    if (existing) {
      const updatePayload = { last_active_at: new Date().toISOString() };
      if (fiatTag && !existing.fiat_tag) {
        updatePayload.fiat_tag = fiatTag;
      }
      await client
        .from('wallets')
        .update(updatePayload)
        .eq('wallet_address', walletAddress);
      return existing;
    }

    // STRICT: Only log wallets that were directly created on FiatWallet
    if (walletType !== 'created') {
      return null;
    }

    const insertPayload = {
      wallet_address: walletAddress,
      wallet_type: walletType || 'created',
      created_at: new Date().toISOString(),
      last_active_at: new Date().toISOString(),
      trade_count: 0,
      total_volume_usd: 0.00,
      fiat_tag: fiatTag || null,
    };

    const { data, error } = await client
      .from('wallets')
      .insert(insertPayload)
      .select()
      .maybeSingle();

    if (error) {
      console.warn('[Supabase] recordWalletRegistration note:', error.message);
    }
    return data;
  } catch (err) {
    console.warn('[Supabase] recordWalletRegistration error:', err.message);
    return null;
  }
}

/**
 * Fetch wallet statistics (creation timestamp, trade count, volume, fiat tag).
 */
export async function getWalletStats(walletAddress) {
  const client = (await getSupabaseAsync()) || getSupabase();
  if (!client || !walletAddress) return null;

  try {
    const { data, error } = await client
      .from('wallets')
      .select('*')
      .eq('wallet_address', walletAddress)
      .maybeSingle();

    if (error) return null;
    return data;
  } catch (err) {
    return null;
  }
}


/**
 * Log or update a cross-chain bridge transaction in the dedicated bridge_transactions table.
 */
export async function logBridgeTransaction({
  depositAddress,
  userAddress,
  originChain,
  originSymbol,
  destinationSymbol = 'USDT',
  depositAmount = 0,
  grossAmount = 0,
  netAmount = 0,
  protocolFee = 0,
  nearFee = '0.27',
  refundTo = null,
  status = 'PENDING',
  signature = null,
  correlationId = null,
  timeEstimate = 25,
}) {
  const client = (await getSupabaseAsync()) || getSupabase();
  if (!client || !depositAddress) return null;

  const payload = {
    deposit_address: String(depositAddress),
    user_address: userAddress,
    origin_chain: originChain || 'unknown',
    origin_symbol: originSymbol || 'UNKNOWN',
    destination_symbol: destinationSymbol || 'USDT',
    deposit_amount: parseFloat(depositAmount) || 0,
    gross_amount: parseFloat(grossAmount) || 0,
    net_amount: parseFloat(netAmount) || 0,
    protocol_fee: parseFloat(protocolFee) || 0,
    near_fee: String(nearFee || '0.27'),
    refund_to: refundTo || null,
    status: String(status || 'PENDING').toUpperCase(),
    signature: signature || null,
    correlation_id: correlationId || null,
    time_estimate: parseInt(timeEstimate, 10) || 25,
    updated_at: new Date().toISOString(),
  };

  try {
    const { data: existing } = await client
      .from('bridge_transactions')
      .select('id')
      .eq('deposit_address', String(depositAddress))
      .maybeSingle();

    if (existing?.id) {
      const { data, error } = await client
        .from('bridge_transactions')
        .update(payload)
        .eq('deposit_address', String(depositAddress))
        .select()
        .maybeSingle();
      if (error) console.warn('[Supabase] update bridge_transactions note:', error.message);
      return data;
    } else {
      const { data, error } = await client
        .from('bridge_transactions')
        .insert(payload)
        .select()
        .maybeSingle();
      if (error) console.warn('[Supabase] insert bridge_transactions note:', error.message);
      return data;
    }
  } catch (err) {
    console.warn('[Supabase] logBridgeTransaction error:', err.message);
    return null;
  }
}

/**
 * Update the status and on-chain signature of a bridge transaction.
 */
export async function updateBridgeTransactionStatus({
  depositAddress,
  status,
  signature = null,
  netAmount = null,
  protocolFee = null,
}) {
  const client = (await getSupabaseAsync()) || getSupabase();
  if (!client || !depositAddress) return false;

  const patch = {
    status: String(status).toUpperCase(),
    updated_at: new Date().toISOString(),
  };
  if (signature) patch.signature = signature;
  if (netAmount != null) patch.net_amount = parseFloat(netAmount) || 0;
  if (protocolFee != null) patch.protocol_fee = parseFloat(protocolFee) || 0;

  try {
    const { error } = await client
      .from('bridge_transactions')
      .update(patch)
      .eq('deposit_address', String(depositAddress));

    if (error) {
      console.warn('[Supabase] updateBridgeTransactionStatus error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Supabase] updateBridgeTransactionStatus failed:', err.message);
    return false;
  }
}

/**
 * Fetch bridge transactions for a user wallet from bridge_transactions table.
 */
export async function getBridgeTransactionsByUser(walletAddress) {
  const client = (await getSupabaseAsync()) || getSupabase();
  if (!client || !walletAddress) return [];

  try {
    const { data, error } = await client
      .from('bridge_transactions')
      .select('*')
      .eq('user_address', walletAddress)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[Supabase] getBridgeTransactionsByUser query error:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn('[Supabase] getBridgeTransactionsByUser failed:', err.message);
    return [];
  }
}
