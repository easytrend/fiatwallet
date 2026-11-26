/**
 * api/test_alert.js — Vercel Serverless Function
 *
 * Simple health check and test endpoint to verify your Telegram Bot
 * integration is working and receiving alerts.
 *
 * Usage: Visit /api/test_alert in your browser.
 */

import { sendTelegramAlert } from './_telegram.js';

export default async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const hasToken = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  const hasChatId = Boolean(process.env.TELEGRAM_CHAT_ID);

  if (!hasToken || !hasChatId) {
    return res.status(400).json({
      success: false,
      error: 'Telegram environment variables missing in Vercel.',
      details: {
        TELEGRAM_BOT_TOKEN: hasToken ? 'Configured' : 'MISSING',
        TELEGRAM_CHAT_ID: hasChatId ? 'Configured' : 'MISSING',
      },
      hint: 'After adding them in Vercel Project Settings, you must Redeploy your latest deployment for them to take effect.'
    });
  }

  try {
    const sent = await sendTelegramAlert({
      level: 'SUCCESS',
      title: 'Telegram Alert System Online',
      source: 'Fiatwallet Health Check',
      message: 'Your Fiatwallet monitoring bot is connected and ready to send real-time alerts!',
      details: {
        status: 'Online & Actively Monitoring',
        time: new Date().toUTCString(),
      }
    });

    if (sent) {
      return res.status(200).json({
        success: true,
        message: 'Test message sent! Check your Telegram app for the notification.'
      });
    } else {
      return res.status(500).json({
        success: false,
        error: 'Telegram API rejected the request. Please verify your token and chat ID.'
      });
    }
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}
