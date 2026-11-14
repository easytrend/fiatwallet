/**
 * api/paj_webhook.js — Vercel Serverless Function
 *
 * Webhook receiver for PajCash order status updates.
 * Automatically called by PajCash server-to-server whenever an order status changes
 * (INIT -> PAID -> COMPLETED or FAILED).
 *
 * Guarantees that even if the user minimizes or closes the browser/app,
 * Supabase transaction status is updated to COMPLETED instantly.
 */

import { createClient } from '@supabase/supabase-js';
import { isBlacklisted, isBlacklistedEntityAsync } from './_compliance_blacklist.js';

// ---------------------------------------------------------------------------
// Transaction receipt email — fire-and-forget, never blocks webhook response
// ---------------------------------------------------------------------------
async function sendTransactionEmail({
  type, email, orderId,
  cryptoAmount, tokenSymbol, fiatAmount, fiatCurrency,
  bankName, accountNumber, accountName, recipientTag,
  walletAddress, signature,
}) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey || !email || !String(email).includes('@')) return;

  const isOnramp  = type === 'p2p_onramp';
  const displayCrypto = Number(cryptoAmount || 0).toFixed(2);
  const displayFiat   = Number(fiatAmount   || 0).toLocaleString('en-NG');
  const symbol        = tokenSymbol || 'USDC';
  const currency      = fiatCurrency || 'NGN';
  const shortWallet   = walletAddress
    ? `${String(walletAddress).slice(0, 6)}…${String(walletAddress).slice(-4)}`
    : '—';
  const solscanLink = signature && !signature.startsWith('pending_') && !signature.startsWith('held_')
    ? `https://solscan.io/tx/${signature}`
    : null;
  const maskedAcct = accountNumber
    ? `•••• ${String(accountNumber).slice(-4)}`
    : '—';

  const subject = isOnramp
    ? `✅ Your ${displayCrypto} ${symbol} deposit is ready — FiatWallet`
    : `✅ Your ₦${displayFiat} withdrawal is on its way — FiatWallet`;

  const logoBlock = `
    <div style="text-align:center;margin-bottom:28px;">
      <img src="https://fiatwallet.app/logo.png" width="64" height="64"
           alt="FiatWallet" style="border-radius:16px;display:inline-block;" />
      <div style="margin-top:10px;font-size:22px;font-weight:700;color:#a3e635;letter-spacing:-0.5px;">FiatWallet</div>
    </div>`;

  const ctaButton = `
    <div style="text-align:center;margin:28px 0 0;">
      <a href="https://fiatwallet.app" style="display:inline-block;padding:14px 32px;
         background:#a3e635;color:#050b14;border-radius:12px;font-weight:700;
         font-size:15px;text-decoration:none;letter-spacing:0.2px;">
        Open FiatWallet →
      </a>
    </div>`;

  const footer = `
    <div style="margin-top:36px;padding-top:20px;border-top:1px solid #1e2d1a;
         text-align:center;font-size:12px;color:#6b7280;">
      This receipt was sent automatically by FiatWallet.<br/>
      If you did not initiate this transaction, please
      <a href="mailto:support@fiatwallet.app" style="color:#a3e635;">contact support</a>.
    </div>`;

  const onrampHtml = `
    <div style="background:#050b14;color:#e5e7eb;font-family:'Inter',Arial,sans-serif;
         max-width:520px;margin:0 auto;border-radius:20px;padding:36px 32px;">
      ${logoBlock}
      <h2 style="color:#a3e635;font-size:20px;margin:0 0 6px;">Deposit Confirmed</h2>
      <p style="color:#9ca3af;margin:0 0 24px;font-size:14px;">
        Your on-ramp order <code style="color:#d1d5db;">#${orderId}</code> has been completed.
      </p>
      <div style="background:#0d1f0d;border-radius:14px;padding:20px 22px;margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
          <span style="color:#9ca3af;font-size:14px;">Amount received</span>
          <span style="color:#a3e635;font-weight:700;font-size:18px;">${displayCrypto} ${symbol}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
          <span style="color:#9ca3af;font-size:14px;">Equivalent paid</span>
          <span style="color:#e5e7eb;font-size:14px;">₦${displayFiat} ${currency}</span>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span style="color:#9ca3af;font-size:14px;">Wallet</span>
          <span style="color:#e5e7eb;font-size:14px;font-family:monospace;">${shortWallet}</span>
        </div>
      </div>
      ${solscanLink ? `
      <div style="text-align:center;margin-bottom:4px;">
        <a href="${solscanLink}" style="color:#a3e635;font-size:13px;text-decoration:none;">
          View on Solscan ↗
        </a>
      </div>` : ''}
      ${ctaButton}
      ${footer}
    </div>`;

  const offrampHtml = `
    <div style="background:#050b14;color:#e5e7eb;font-family:'Inter',Arial,sans-serif;
         max-width:520px;margin:0 auto;border-radius:20px;padding:36px 32px;">
      ${logoBlock}
      <h2 style="color:#a3e635;font-size:20px;margin:0 0 6px;">Withdrawal Initiated</h2>
      <p style="color:#9ca3af;margin:0 0 24px;font-size:14px;">
        Your off-ramp order <code style="color:#d1d5db;">#${orderId}</code> is being processed.
        Funds are on their way to your bank.
      </p>
      <div style="background:#0d1f0d;border-radius:14px;padding:20px 22px;margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
          <span style="color:#9ca3af;font-size:14px;">Bank payout</span>
          <span style="color:#a3e635;font-weight:700;font-size:18px;">₦${displayFiat} ${currency}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
          <span style="color:#9ca3af;font-size:14px;">Crypto debited</span>
          <span style="color:#e5e7eb;font-size:14px;">${displayCrypto} ${symbol}</span>
        </div>
        ${recipientTag ? `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="color:#9ca3af;font-size:14px;">Sent to</span>
          <span style="color:#a3e635;font-size:15px;font-weight:600;letter-spacing:0.3px;">$${String(recipientTag).replace(/^\$/, '')}</span>
        </div>` : `
        ${bankName ? `
        <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
          <span style="color:#9ca3af;font-size:14px;">Bank</span>
          <span style="color:#e5e7eb;font-size:14px;">${bankName}</span>
        </div>` : ''}
        <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
          <span style="color:#9ca3af;font-size:14px;">Account</span>
          <span style="color:#e5e7eb;font-size:14px;font-family:monospace;">${maskedAcct}</span>
        </div>
        ${accountName ? `
        <div style="display:flex;justify-content:space-between;">
          <span style="color:#9ca3af;font-size:14px;">Account name</span>
          <span style="color:#e5e7eb;font-size:14px;">${accountName}</span>
        </div>` : ''}`}
      </div>
      ${ctaButton}
      ${footer}
    </div>`;

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'FiatWallet <receipts@fiatwallet.app>',
        to: [email],
        subject,
        html: isOnramp ? onrampHtml : offrampHtml,
        tags: [
          { name: 'type',     value: type },
          { name: 'order_id', value: String(orderId) },
        ],
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.ok) {
      console.log(`[paj_webhook] Receipt email sent to ${email} (order ${orderId})`);
    } else {
      console.warn(`[paj_webhook] Resend error for order ${orderId}:`, data);
    }
  } catch (e) {
    console.warn('[paj_webhook] sendTransactionEmail exception:', e.message);
  }
}

export default async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-webhook-signature');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({ status: 'active', endpoint: 'paj_webhook' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let payload = req.body;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch (e) {
        return res.status(400).json({ error: 'Invalid JSON payload' });
      }
    } else if (Buffer.isBuffer(payload)) {
      try { payload = JSON.parse(payload.toString('utf-8')); } catch (e) {
        return res.status(400).json({ error: 'Invalid buffer payload' });
      }
    }

    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Empty or invalid payload' });
    }

    // PajCash may supply the order id under id, orderId, or order_id
    const orderId = String(payload.id || payload.orderId || payload.order_id || '').trim();
    if (!orderId) {
      console.warn('[paj_webhook] Received webhook with no orderId:', payload);
      return res.status(400).json({ error: 'Missing orderId' });
    }

    const rawStatus = String(payload.status || payload.state || '').toUpperCase().trim();
    const signature = payload.signature || payload.txHash || payload.tx_hash || payload.transactionHash || null;

    console.log(`[paj_webhook] Incoming update for order ${orderId}: rawStatus=${rawStatus}`);

    // Map PajCash status to Supabase enum ('INIT', 'PENDING', 'COMPLETED', 'ERROR')
    let supabaseStatus = 'PENDING';
    if (['COMPLETED', 'SUCCESSFUL', 'CONFIRMED', 'DONE', 'SUCCESS', 'SETTLED', 'PAID_OUT', 'PROCESSED', 'DELIVERED'].includes(rawStatus)) {
      supabaseStatus = 'COMPLETED';
    } else if (['FAILED', 'ERROR', 'CANCELLED', 'EXPIRED', 'REJECTED'].includes(rawStatus)) {
      supabaseStatus = 'ERROR';
    } else if (['INIT', 'INITIALIZED', 'WAITING'].includes(rawStatus)) {
      supabaseStatus = 'INIT';
    } else if (['PAID', 'PENDING', 'PROCESSING', 'FORWARDING'].includes(rawStatus)) {
      supabaseStatus = 'PENDING';
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      console.error('[paj_webhook] Supabase environment variables missing');
      return res.status(500).json({ error: 'Database configuration missing' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if the order is already present in Supabase
    const { data: existing, error: findError } = await supabase
      .from('p2p_transactions')
      .select('id, status, signature, transaction_type, crypto_amount, fiat_amount, usd_value, token_symbol, user_email, user_address, deposit_address, bank_name, account_number, account_name, recipient_tag')
      .eq('order_id', orderId)
      .maybeSingle();

    if (findError) {
      console.warn(`[paj_webhook] Error querying order ${orderId}:`, findError.message);
    }

    // If the row exists but has no user_email, try to resolve it from paj_sessions via wallet address
    let resolvedEmail = existing?.user_email
      || payload.userEmail || payload.email || payload.customer?.email || null;
    if (!resolvedEmail && existing?.user_address) {
      try {
        const { data: sRows } = await supabase
          .from('paj_sessions')
          .select('email')
          .eq('wallet_address', existing.user_address)
          .order('updated_at', { ascending: false })
          .limit(1);
        if (sRows?.[0]?.email) {
          resolvedEmail = sRows[0].email;
          console.log(`[paj_webhook] Resolved email from paj_sessions for order ${orderId}: ${resolvedEmail}`);
        }
      } catch (_) {}
    }

    const compliance = await isBlacklistedEntityAsync({
      email: resolvedEmail,
      walletAddress: existing?.user_address || payload.recipient || payload.wallet || payload.userAddress,
      supabase
    });

    if (compliance.blacklisted) {
      console.warn(`[paj_webhook] Order ${orderId} matches compliance blacklist (${compliance.reason}). Setting status to HELD_COMPLIANCE_REVIEW.`);
      supabaseStatus = 'HELD_COMPLIANCE_REVIEW';
    }

    const patch = {
      updated_at: new Date().toISOString(),
    };

    if (compliance.blacklisted) {
      patch.status = 'HELD_COMPLIANCE_REVIEW';
      patch.signature = `held_in_treasury_${orderId}`;
    }

    // Update status unless it is already finalized
    if (!existing || existing.status !== 'COMPLETED' || supabaseStatus === 'COMPLETED') {
      patch.status = supabaseStatus;
    }

    // Attach signature if newly discovered
    if (signature && (!existing?.signature || existing.signature.startsWith('pending_'))) {
      patch.signature = signature;
    }

    // Heal zero amounts or missing metadata if webhook provides them
    const webhookCrypto = Number(payload.amount || payload.cryptoAmount || payload.usdcAmount || 0);
    const webhookFiat = Number(payload.fiatAmount || 0);
    if ((!existing?.crypto_amount || Number(existing.crypto_amount) === 0) && webhookCrypto > 0) {
      patch.crypto_amount = webhookCrypto;
      if (!existing?.usd_value || Number(existing.usd_value) === 0) patch.usd_value = webhookCrypto;
    }
    if ((!existing?.fiat_amount || Number(existing.fiat_amount) === 0) && webhookFiat > 0) {
      patch.fiat_amount = webhookFiat;
    }
    if (payload.currency && payload.currency !== 'NGN' && (!existing?.token_symbol || existing.token_symbol === 'USDC')) {
      patch.token_symbol = payload.currency;
    }
    if (payload.mint && payload.mint.includes('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB')) {
      patch.token_symbol = 'USDT';
    }
    if (!existing?.deposit_address && (payload.recipient || payload.depositAddress)) {
      patch.deposit_address = payload.recipient || payload.depositAddress;
    }
    if (!existing?.user_email && resolvedEmail) {
      patch.user_email = resolvedEmail;
    }

    if (existing?.id) {
      const { error: updateError } = await supabase
        .from('p2p_transactions')
        .update(patch)
        .eq('order_id', orderId);

      if (updateError) {
        console.error(`[paj_webhook] Failed to update order ${orderId}:`, updateError.message);
        return res.status(500).json({ error: updateError.message });
      }
      console.log(`[paj_webhook] Successfully updated order ${orderId} -> ${supabaseStatus}`);
    } else {
      // Order record not found in Supabase (e.g. created on external portal or direct)
      // Auto-insert backfill so history matches PajCash
      const txType = (payload.transactionType === 'ON_RAMP' || payload.type === 'p2p_onramp') ? 'p2p_onramp' : 'p2p_offramp';
      const insertRecord = {
        order_id: orderId,
        signature: signature || `pending_${txType}_${orderId}`,
        transaction_type: txType,
        token_symbol: payload.currency || payload.tokenSymbol || 'USDC',
        crypto_amount: Number(payload.amount || payload.cryptoAmount || payload.usdcAmount || 0),
        usd_value: Number(payload.amount || payload.cryptoAmount || payload.usdcAmount || 0),
        fiat_currency: payload.fiatCurrency || 'NGN',
        fiat_amount: Number(payload.fiatAmount || 0),
        status: supabaseStatus,
        bank_name: payload.bank || payload.bankName || null,
        account_number: payload.accountNumber || null,
        account_name: payload.accountName || null,
        user_address: payload.recipient || payload.userAddress || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error: insertError } = await supabase.from('p2p_transactions').insert(insertRecord);
      if (insertError) {
        console.error(`[paj_webhook] Failed to insert missing order ${orderId}:`, insertError.message);
      } else {
        console.log(`[paj_webhook] Inserted backfilled order ${orderId} -> ${supabaseStatus}`);
      }
    }

    // Send transaction receipt email (fire-and-forget — never delays webhook response)
    const resolvedTxType = existing?.transaction_type || ((payload.transactionType === 'ON_RAMP' || payload.type === 'p2p_onramp') ? 'p2p_onramp' : 'p2p_offramp');
    if (supabaseStatus === 'COMPLETED' && !compliance.blacklisted) {
      const userEmail = resolvedEmail || patch.user_email;
      if (userEmail) {
        sendTransactionEmail({
          type: resolvedTxType,
          email: userEmail,
          orderId,
          cryptoAmount: existing?.crypto_amount ?? patch.crypto_amount ?? payload.amount ?? payload.cryptoAmount,
          tokenSymbol:  existing?.token_symbol  ?? patch.token_symbol  ?? payload.currency ?? 'USDC',
          fiatAmount:   existing?.fiat_amount   ?? patch.fiat_amount   ?? payload.fiatAmount,
          fiatCurrency: existing?.fiat_currency ?? payload.fiatCurrency ?? 'NGN',
          recipientTag: existing?.recipient_tag ?? payload.recipientTag ?? payload.fiatTag ?? null,
          bankName:     existing?.bank_name     ?? payload.bank    ?? payload.bankName,
          accountNumber:existing?.account_number ?? payload.accountNumber,
          accountName:  existing?.account_name  ?? payload.accountName,
          walletAddress:existing?.user_address  ?? payload.recipient ?? payload.userAddress,
          signature:    signature ?? existing?.signature,
        }).catch(e => console.warn('[paj_webhook] Email fire-and-forget error:', e.message));
      } else {
        console.warn(`[paj_webhook] No email found for COMPLETED order ${orderId} (type: ${resolvedTxType}) — skipping receipt`);
      }
    }

    // Automatically trigger relayer onramp forward so users receive funds even if browser is closed
    if (resolvedTxType === 'p2p_onramp' && supabaseStatus === 'COMPLETED' && !compliance.blacklisted) {
      const destinationAddress = existing?.user_address || payload.recipient || payload.userAddress;

      // Auto-resolve sessionToken from paj_sessions to pass along
      let sessionToken = null;
      if (destinationAddress) {
        try {
          const { data: sRows } = await supabase
            .from('paj_sessions')
            .select('session_token')
            .eq('wallet_address', destinationAddress)
            .order('updated_at', { ascending: false })
            .limit(1);
          if (sRows && sRows[0]?.session_token) {
            sessionToken = sRows[0].session_token;
          }
        } catch (sErr) {}
      }

      const host = 'https://www.fiatwallet.app';
      try {
        fetch(`${host}/api/relay_onramp_fee`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': supabaseKey,
          },
          body: JSON.stringify({
            orderId,
            destinationAddress,
            sessionToken
          })
        }).catch(fErr => console.warn('[paj_webhook] Auto-forward trigger background error:', fErr.message));
      } catch (fErr) {
        console.warn('[paj_webhook] Auto-forward trigger exception:', fErr.message);
      }
    }

    // Acknowledge receipt to PajCash
    return res.status(200).json({ received: true, orderId, status: supabaseStatus });
  } catch (err) {
    console.error('[paj_webhook] Unexpected error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
