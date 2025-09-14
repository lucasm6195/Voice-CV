const fs = require('fs');
const path = require('path');

// Store sencillo en archivo (demo)
const STORE_FILE = path.join('/tmp', 'payments.json');

function loadStore() {
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  // Configurar CORS para ambos dominios
  const allowedOrigins = [
    'https://voice-cv.com',
    'https://www.voice-cv.com',
    'http://localhost:5173'
  ];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { uid } = req.query;
  if (!uid) {
    return res.status(400).json({ error: 'uid requerido' });
  }

  const store = loadStore();
  const record = store[uid];
  
  if (!record) {
    return res.json({ paid: false, used: false });
  }
  
  res.json({ 
    paid: record.paid || false, 
    used: record.used || false 
  });
}