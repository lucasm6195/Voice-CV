const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
});

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

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { uid, email } = req.body || {};
    if (!uid) {
      return res.status(400).json({ error: 'uid requerido' });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: { name: 'Acceso CV por voz (pago único)' },
            unit_amount: 100, // 1,00 €
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.CLIENT_URL}/?success=1&uid=${encodeURIComponent(uid)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/?canceled=1`,
      customer_email: email || undefined,
      metadata: { uid },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('❌ Error creando Checkout Session:', err);
    res.status(500).json({ error: 'No se pudo crear la sesión de pago' });
  }
}