const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { session_id, uid } = req.query || {};
  if (!session_id || !uid) return res.status(400).json({ error: 'session_id y uid requeridos' });

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    const paid = session && (session.payment_status === 'paid' || session.status === 'complete');
    if (!paid) return res.json({ paid: false });

    // Marca como pagado en un KV sencillo en /tmp (igual que status.js)
    const fs = require('fs');
    const path = require('path');
    const STORE_FILE = path.join('/tmp', 'payments.json');
    let store = {};
    try { store = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')); } catch {}
    store[uid] = { ...(store[uid] || {}), paid: true, used: store[uid]?.used || false, canRecord: true };
    fs.writeFileSync(STORE_FILE, JSON.stringify(store), 'utf8');

    return res.json({ paid: true });
  } catch (e) {
    console.error('verify-payment error:', e);
    return res.status(500).json({ error: 'No se pudo verificar el pago' });
  }
};
