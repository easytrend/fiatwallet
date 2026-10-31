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
      .select('id, status, signature, transaction_type, crypto_amount, usd_value')
      .eq('order_id', orderId)
      .maybeSingle();

    if (findError) {
      console.warn(`[paj_webhook] Error querying order ${orderId}:`, findError.message);
    }

    const patch = {
      updated_at: new Date().toISOString(),
    };

    // Update status unless it is already finalized
    if (!existing || existing.status !== 'COMPLETED' || supabaseStatus === 'COMPLETED') {
      patch.status = supabaseStatus;
    }

    // Attach signature if newly discovered
    if (signature && (!existing?.signature || existing.signature.startsWith('pending_'))) {
      patch.signature = signature;
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

    // Acknowledge receipt to PajCash
    return res.status(200).json({ received: true, orderId, status: supabaseStatus });
  } catch (err) {
    console.error('[paj_webhook] Unexpected error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
