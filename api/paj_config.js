/**
 * api/paj_config.js — Vercel Serverless Function
 *
 * Provides configured PajCash API credentials to client applications
 * (including mobile APK) so users do not need individual email verification.
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const apiKey = process.env.VITE_PAJCASH_API_KEY || process.env.PAJCASH_API_KEY || '';
  const env = process.env.VITE_PAJCASH_ENV || process.env.PAJCASH_ENV || 'production';

  return res.status(200).json({
    apiKey,
    env,
  });
}
