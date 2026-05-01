import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  const { email } = req.body;
  if (!email) return res.status(400).json({ ativo: false, error: "Email obrigatório" });

  try {
    const doc = await db.collection("assinaturas").doc(email).get();
    if (!doc.exists) return res.status(200).json({ ativo: false });
    const data = doc.data();
    return res.status(200).json({ ativo: data.ativo === true, plano: data.plano || null });
  } catch (err) {
    console.error("Erro ao verificar assinatura:", err);
    return res.status(500).json({ ativo: false, error: "Erro interno" });
  }
}
