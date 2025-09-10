// server/index.js
// Backend mínimo para paywall con Stripe Checkout + Webhook
// Requisitos: npm i express cors stripe body-parser dotenv

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");

const app = express();

// --------- Config ---------
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
const PORT = process.env.PORT || 4242;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

// --------- CORS ---------
app.use(
  cors({
    origin: CLIENT_URL,
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  })
);

// ⚠️ El endpoint de webhook debe recibir el raw body (antes que json)
app.use("/api/stripe/webhook", bodyParser.raw({ type: "application/json" }));

// El resto puede ir con JSON normal
app.use(bodyParser.json());

// --------- Store sencillo en archivo (demo). En producción: DB ---------
const STORE_FILE = path.join(__dirname, "payments.json");
function loadStore() {
  try {
    const raw = fs.readFileSync(STORE_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
function saveStore(store) {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf8");
  } catch (e) {
    console.error("❌ Error guardando payments.json:", e);
  }
}
let store = loadStore(); // { [uid]: { paid: true, sessionId, customerId, when } }

// --------- Health (útil para comprobar que corre) ---------
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// --------- Crear sesión de pago ---------
app.post("/api/create-checkout-session", async (req, res) => {
  try {
    const { uid, email } = req.body || {};
    if (!uid) return res.status(400).json({ error: "uid requerido" });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: { name: "Acceso CV por voz (pago único)" },
            unit_amount: 100, // 1,00 €
          },
          quantity: 1,
        },
      ],
      success_url: `${CLIENT_URL}/?success=1&uid=${encodeURIComponent(uid)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${CLIENT_URL}/?canceled=1`,
      customer_email: email || undefined,
      metadata: { uid },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error("❌ Error creando Checkout Session:", err);
    res.status(500).json({ error: "No se pudo crear la sesión de pago" });
  }
});

// --------- Verificar pago por session_id (alternativa al webhook) ---------
app.get("/api/verify-payment", async (req, res) => {
  try {
    const { session_id, uid } = req.query;
    if (!session_id || !uid) {
      return res.status(400).json({ error: "session_id y uid requeridos" });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);
    
    if (session.payment_status === 'paid' && session.metadata?.uid === uid) {
      // Marcar como pagado en nuestro store
      store[uid] = {
        paid: true,
        sessionId: session.id,
        customerId: session.customer || null,
        when: new Date().toISOString(),
      };
      saveStore(store);
      console.log("✅ Pago verificado para uid:", uid);
      
      res.json({ paid: true, verified: true });
    } else {
      res.json({ paid: false, verified: false });
    }
  } catch (err) {
    console.error("❌ Error verificando pago:", err);
    res.status(500).json({ error: "Error verificando pago" });
  }
});

// --------- Webhook: marca pago como completado ---------
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.log(`❌ Webhook signature verification failed.`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`✅ Evento recibido: ${event.type}`);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const uid = session.metadata?.uid;
    const email = session.customer_details?.email;

    if (uid) {
      // Crear un nuevo registro de pago (permitir múltiples pagos)
      const paymentId = `payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      store[uid] = {
        paid: true,
        used: false, // Resetear el estado usado para el nuevo pago
        email: email || null,
        sessionId: session.id,
        paymentId: paymentId,
        paidAt: new Date().toISOString(),
        usedAt: null
      };
      
      saveStore(store);
      console.log(`💰 Pago confirmado para uid: ${uid}, paymentId: ${paymentId}`);
      console.log("🔓 Acceso activado (nuevo pago)");
    }
  }

  if (event.type === "payment_intent.succeeded") {
    console.log("💳 PaymentIntent succeeded:", event.data.object.id);
  }

  if (event.type === "payment_intent.created") {
    console.log("🔄 PaymentIntent created:", event.data.object.id);
  }

  res.json({ received: true });
});

// --------- Marcar como usado después de grabar ---------
app.post("/api/mark-used", (req, res) => {
  const { uid } = req.body;
  
  if (!uid) {
    return res.status(400).json({ error: "uid requerido" });
  }
  
  const record = store[uid];
  if (!record || !record.paid) {
    return res.status(403).json({ error: "No hay pago válido para este uid" });
  }
  
  // Marcar como usado
  store[uid] = {
    ...record,
    used: true,
    usedAt: new Date().toISOString()
  };
  
  saveStore(store);
  console.log("🔒 Acceso marcado como usado para uid:", uid);
  
  res.json({ success: true, message: "Acceso marcado como usado" });
});

// --------- Consultar estado de pago (server-side) ---------
app.get("/api/status", (req, res) => {
  const uid = String(req.query.uid || "");
  if (!uid) return res.status(400).json({ error: "uid requerido" });

  const record = store[uid];
  res.json({ 
    paid: Boolean(record?.paid),
    used: Boolean(record?.used), // Nuevo campo en la respuesta
    canRecord: Boolean(record?.paid && !record?.used) // Puede grabar solo si pagó y no ha usado
  });
});

// --------- Arrancar ---------
app.listen(PORT, () => {
  console.log(`Server listo en http://localhost:${PORT}`);
  console.log(`CORS origin: ${CLIENT_URL}`);
});
