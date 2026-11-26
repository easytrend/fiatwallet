/**
 * api/_telegram.js
 *
 * Lightweight, production-grade Telegram alerting service for Fiatwallet.
 * Sends instant notifications to an admin Telegram channel, group, or DM.
 * 
 * Supports:
 *  - 🚨 CRITICAL (Payment forward failure, relayer crash, server 500)
 *  - ⛽ RELAYER (Low SOL balance, gas warnings, payout success)
 *  - 🛡️ SECURITY (Attacker probe, blocked IP, webhook spoof attempt)
 *  - 💳 PAYMENT (Successful settlement, payment gateway sync)
 *  - 📱 FRONTEND (User client errors, React crashes)
 */

const recentAlerts = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute deduplication

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function sendTelegramAlert({
  level = 'INFO', // 'CRITICAL' | 'WARNING' | 'SECURITY' | 'RELAYER' | 'SUCCESS' | 'INFO'
  title = 'Fiatwallet System Alert',
  source = 'Backend',
  message = '',
  details = {},
} = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    // If not configured, fail silently so normal operations proceed uninterrupted
    return false;
  }

  // Deduplication to prevent alert storms / spamming
  const dedupKey = `${source}:${title}:${message.slice(0, 80)}`;
  const now = Date.now();
  if (recentAlerts.has(dedupKey)) {
    const lastSent = recentAlerts.get(dedupKey);
    if (now - lastSent < RATE_LIMIT_WINDOW_MS) {
      return false;
    }
  }
  recentAlerts.set(dedupKey, now);

  // Clean old entries from map periodically
  if (recentAlerts.size > 200) {
    for (const [k, time] of recentAlerts.entries()) {
      if (now - time > RATE_LIMIT_WINDOW_MS * 2) {
        recentAlerts.delete(k);
      }
    }
  }

  let badgeEmoji = 'ℹ️';
  if (level === 'CRITICAL') badgeEmoji = '🚨';
  else if (level === 'SECURITY') badgeEmoji = '🛡️';
  else if (level === 'RELAYER') badgeEmoji = '⛽';
  else if (level === 'WARNING') badgeEmoji = '⚠️';
  else if (level === 'SUCCESS') badgeEmoji = '✅';

  const timeStr = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  let text = `<b>${badgeEmoji} [${escapeHtml(level)}] ${escapeHtml(title)}</b>\n`;
  text += `📍 <b>Source:</b> <code>${escapeHtml(source)}</code>\n`;
  text += `⏰ <b>Time:</b> <code>${timeStr}</code>\n`;
  if (message) {
    text += `💬 <b>Message:</b> ${escapeHtml(message)}\n`;
  }

  const detailEntries = Object.entries(details).filter(([_, v]) => v !== undefined && v !== null && v !== '');
  if (detailEntries.length > 0) {
    text += `\n<b>📋 Details:</b>\n`;
    for (const [k, v] of detailEntries) {
      const valStr = typeof v === 'object' ? JSON.stringify(v) : String(v);
      if (k.toLowerCase().includes('signature') || k.toLowerCase() === 'tx') {
        text += `• <b>${escapeHtml(k)}:</b> <a href="https://solscan.io/tx/${escapeHtml(valStr)}">${escapeHtml(valStr.slice(0, 12))}...</a>\n`;
      } else if (k.toLowerCase().includes('wallet') || k.toLowerCase().includes('address')) {
        text += `• <b>${escapeHtml(k)}:</b> <code>${escapeHtml(valStr)}</code>\n`;
      } else {
        text += `• <b>${escapeHtml(k)}:</b> <code>${escapeHtml(valStr)}</code>\n`;
      }
    }
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.warn('[Telegram Alert] Failed to send alert:', errBody);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Telegram Alert] Network exception:', err.message);
    return false;
  }
}
