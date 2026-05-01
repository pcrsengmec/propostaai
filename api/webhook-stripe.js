import Stripe from "stripe";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Inicializa Firebase Admin (só uma vez)
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = getFirestore();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const config = { api: { bodyParser: false } };

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  const sig = req.headers["stripe-signature"];
  const buf = await buffer(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      buf,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Pagamento confirmado — ativa assinatura
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const email = session.customer_details?.email || session.metadata?.email;
    const customerId = session.customer;
    const subscriptionId = session.subscription;

    if (email) {
      await db.collection("assinaturas").doc(email).set({
        email,
        ativo: true,
        plano: "pro",
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        ativadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
      }, { merge: true });

      console.log(`✅ Assinatura ativada para: ${email}`);
    }
  }

  // Assinatura cancelada ou pagamento falhou — desativa
  if (
    event.type === "customer.subscription.deleted" ||
    event.type === "invoice.payment_failed"
  ) {
    const obj = event.data.object;
    const customerId = obj.customer;

    // Busca email pelo customerId
    const snap = await db.collection("assinaturas")
      .where("stripeCustomerId", "==", customerId)
      .limit(1)
      .get();

    if (!snap.empty) {
      const doc = snap.docs[0];
      await doc.ref.update({
        ativo: false,
        atualizadoEm: new Date().toISOString(),
      });
      console.log(`❌ Assinatura desativada para: ${doc.data().email}`);
    }
  }

  // Renovação de assinatura — mantém ativo
  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object;
    const customerId = invoice.customer;

    const snap = await db.collection("assinaturas")
      .where("stripeCustomerId", "==", customerId)
      .limit(1)
      .get();

    if (!snap.empty) {
      await snap.docs[0].ref.update({
        ativo: true,
        atualizadoEm: new Date().toISOString(),
      });
    }
  }

  res.status(200).json({ received: true });
}
