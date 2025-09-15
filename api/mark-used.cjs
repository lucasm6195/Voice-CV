module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { uid } = req.body || {};
    if (!uid) return res.status(400).json({ error: 'uid requerido' });

    const fs = require('fs');
    const path = require('path');
    const STORE_FILE = path.join('/tmp', 'payments.json');

    let store = {};
    try { store = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')); } catch {}

    const prev = store[uid] || { paid: false, used: false, canRecord: false };
    store[uid] = { ...prev, used: true, canRecord: false };
    fs.writeFileSync(STORE_FILE, JSON.stringify(store), 'utf8');

    return res.json({ ok: true });
  } catch (e) {
    console.error('mark-used error:', e);
    return res.status(500).json({ error: 'No se pudo marcar como usado' });
  }
};
