import { useState, useEffect } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore, collection, query, where, getDocs } from "firebase/firestore";

// ============================================================
// CONFIGURAÇÃO — substitua com suas chaves reais
// ============================================================
const CONFIG = {
  FIREBASE_API_KEY: "AIzaSyDnOuaD4TZ-iyhT5lw2JR_gd8ZYIJQK0Jg",
  FIREBASE_AUTH_DOMAIN: "propostaai.firebaseapp.com",
  FIREBASE_PROJECT_ID: "propostaai",
  STRIPE_PAYMENT_LINK: "https://buy.stripe.com/aFa8wO0CqfdicZ96j7dby01",
  STRIPE_PORTAL_LINK: "https://billing.stripe.com/p/login/bJe7sKgBo4yEaR15f3dby00",
  LIMITE_GRATUITO: 3,
  PRECO: "R$ 22/mês",
};

// ============================================================
// Firebase init
// ============================================================
const firebaseConfig = {
  apiKey: CONFIG.FIREBASE_API_KEY,
  authDomain: CONFIG.FIREBASE_AUTH_DOMAIN,
  projectId: CONFIG.FIREBASE_PROJECT_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);

// ============================================================
// Hook de Auth (Firebase real)
// ============================================================
const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser({
          name: firebaseUser.displayName || firebaseUser.email,
          email: firebaseUser.email,
          photo: firebaseUser.photoURL,
        });
      } else {
        setUser(null);
      }
      setLoadingAuth(false);
    });
    return unsub;
  }, []);

  const loginGoogle = async () => {
    setLoadingAuth(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (e) {
      console.error(e);
      setLoadingAuth(false);
    }
  };

  const logout = () => signOut(auth);

  return { user, loadingAuth, loginGoogle, logout };
};

// ============================================================
// Hook de uso/assinatura — CORRIGIDO: busca no Firestore
// ============================================================
const useUsage = (user) => {
  const key = user ? `usage_${user.email}` : null;

  const getCount = () => {
    if (!key) return 0;
    return parseInt(localStorage.getItem(key) || "0");
  };

  const [count, setCount] = useState(getCount);
  const [subscribed, setSubscribed] = useState(false);
  const [loadingSubscription, setLoadingSubscription] = useState(false);

  useEffect(() => {
    setCount(getCount());
    setSubscribed(false);

    if (!user) return;

    // Busca a assinatura no Firestore
    const checkSubscription = async () => {
      setLoadingSubscription(true);
      try {
        const q = query(
          collection(db, "assinaturas"),
          where("email", "==", user.email)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const data = snap.docs[0].data();
          setSubscribed(data.plano === "pro");
        } else {
          setSubscribed(false);
        }
      } catch (e) {
        console.error("Erro ao verificar assinatura:", e);
        setSubscribed(false);
      } finally {
        setLoadingSubscription(false);
      }
    };

    checkSubscription();
  }, [user]);

  const increment = () => {
    const next = count + 1;
    localStorage.setItem(key, next);
    setCount(next);
  };

  const remaining = subscribed ? Infinity : Math.max(0, CONFIG.LIMITE_GRATUITO - count);
  const canGenerate = subscribed || count < CONFIG.LIMITE_GRATUITO;

  return { count, subscribed, remaining, canGenerate, increment, loadingSubscription };
};

// ---- Campos do formulário ----
const fields = [
  { key: "seuNome", label: "Seu nome / empresa", placeholder: "Ex: João Silva Consultoria", required: true },
  { key: "clienteNome", label: "Nome do cliente", placeholder: "Ex: Empresa ABC Ltda", required: true },
  { key: "servico", label: "Serviço ou produto", placeholder: "Ex: Desenvolvimento de site institucional", required: true },
  { key: "valor", label: "Valor da proposta", placeholder: "Ex: R$ 5.000,00", required: true },
  { key: "prazo", label: "Prazo de entrega", placeholder: "Ex: 30 dias úteis", required: true },
  { key: "diferenciais", label: "Seus diferenciais (opcional)", placeholder: "Ex: 5 anos de experiência, suporte incluso, garantia de satisfação...", required: false },
];

// ---- Renderizador de Markdown para HTML ----
function renderProposta(texto) {
  const html = texto
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #2a2a3a;margin:24px 0"/>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:15px;color:#c8a96e;letter-spacing:2px;text-transform:uppercase;margin:32px 0 10px;font-weight:normal;font-family:Georgia,serif">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 style="font-size:14px;color:#f0e8d8;margin:20px 0 8px;font-weight:bold;font-family:Georgia,serif">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#f0e8d8">$1</strong>')
    .replace(/^✓ (.+)$/gm, '<div style="display:flex;gap:10px;margin:6px 0;color:#d8d0c0;font-family:Georgia,serif"><span style="color:#c8a96e;flex-shrink:0">✓</span><span>$1</span></div>')
    .replace(/^\| (.+) \|$/gm, (match) => {
      const cells = match.split('|').filter(c => c.trim() !== '');
      const isHeader = cells.some(c => c.includes('---'));
      if (isHeader) return '';
      const tag = 'td';
      return '<tr>' + cells.map(c => `<${tag} style="padding:8px 12px;border:1px solid #2a2a3a;color:#d8d0c0;font-size:13px">${c.trim()}</${tag}>`).join('') + '</tr>';
    })
    .replace(/(<tr>.*<\/tr>)/gs, '<table style="width:100%;border-collapse:collapse;margin:16px 0">$1</table>')
    .replace(/\n/g, '<br/>');
  return { __html: html };
}

// ================================================================
//  TELAS
// ================================================================

function TelaLogin({ onLogin, loading }) {
  return (
    <div style={css.loginWrap}>
      <div style={css.loginCard}>
        <div style={css.badge}>Produto Digital</div>
        <h1 style={css.loginTitle}>
          Propostas comerciais<br />
          <em style={{ color: "#c8a96e" }}>profissionais em segundos</em>
        </h1>
        <p style={css.loginSub}>
          IA cria propostas persuasivas para você fechar mais negócios.
          Comece grátis — {CONFIG.LIMITE_GRATUITO} propostas sem cartão.
        </p>

        <div style={css.beneficios}>
          {["✦ Proposta completa em &lt;30 segundos", "✦ Tom profissional e persuasivo", "✦ 3 propostas grátis para testar"].map((b, i) => (
            <div key={i} style={css.beneficioItem} dangerouslySetInnerHTML={{ __html: b }} />
          ))}
        </div>

        <button onClick={onLogin} disabled={loading} style={css.btnGoogle}>
          {loading ? (
            <span>Entrando...</span>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 18 18" style={{ marginRight: 10 }}>
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
                <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" />
              </svg>
              Entrar com Google
            </>
          )}
        </button>
        <p style={{ color: "#444", fontSize: "11px", marginTop: "16px", textAlign: "center" }}>
          Sem cartão. Sem compromisso. Cancele quando quiser.
        </p>
      </div>
    </div>
  );
}

function TelaPaywall({ user, onAssinar }) {
  return (
    <div style={css.paywallWrap}>
      <div style={css.paywallCard}>
        <div style={{ fontSize: "32px", marginBottom: "16px" }}>🔒</div>
        <div style={css.badge}>Limite atingido</div>
        <h2 style={{ fontSize: "26px", fontWeight: "normal", color: "#f0e8d8", margin: "16px 0 8px", letterSpacing: "-0.5px" }}>
          Você usou suas <em style={{ color: "#c8a96e" }}>3 propostas grátis</em>
        </h2>
        <p style={{ color: "#888", fontSize: "14px", marginBottom: "32px", lineHeight: 1.7 }}>
          Assine o plano Pro e gere propostas ilimitadas, com histórico e templates exclusivos.
        </p>

        <div style={css.planoCard}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <div>
              <div style={{ fontSize: "13px", color: "#c8a96e", letterSpacing: "2px", textTransform: "uppercase" }}>Plano Pro</div>
              <div style={{ fontSize: "32px", fontWeight: "bold", color: "#f0e8d8" }}>{CONFIG.PRECO}</div>
            </div>
            <div style={{ fontSize: "11px", color: "#888", textAlign: "right" }}>
              Cancele<br />quando quiser
            </div>
          </div>
          {["Propostas ilimitadas", "Todos os templates", "Histórico completo", "Suporte prioritário"].map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", color: "#d8d0c0", fontSize: "14px" }}>
              <span style={{ color: "#c8a96e" }}>✓</span> {f}
            </div>
          ))}
        </div>

        <button onClick={onAssinar} style={css.btnPro}>
          Assinar por {CONFIG.PRECO} →
        </button>

        <p style={{ color: "#333", fontSize: "11px", marginTop: "16px", textAlign: "center" }}>
          Pagamento seguro via Stripe · Cancele a qualquer momento
        </p>
      </div>
    </div>
  );
}

function TelaApp({ user, usage, onLogout }) {
  const [form, setForm] = useState({});
  const [step, setStep] = useState("dados");
  const [proposta, setProposta] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const isValid = fields.filter((f) => f.required).every((f) => form[f.key]);

  const gerar = async () => {
    if (!usage.canGenerate) return;
    setStep("gerando");
    setError("");
    try {
      const prompt = `Você é um especialista em vendas B2B brasileiro. Gere uma proposta comercial profissional, persuasiva e completa em português do Brasil. Use formatação markdown com ## para seções, ### para subseções e **negrito** para destacar pontos importantes.

Dados:
- Fornecedor: ${form.seuNome}
- Cliente: ${form.clienteNome}
- Serviço: ${form.servico}
- Valor: ${form.valor}
- Prazo: ${form.prazo}
- Diferenciais do fornecedor: ${form.diferenciais ? form.diferenciais : "não informado — omita a seção de diferenciais"}

A proposta deve ter as seguintes seções usando ## como título: IDENTIFICAÇÃO, APRESENTAÇÃO, ENTENDIMENTO DA NECESSIDADE, ESCOPO DETALHADO, INVESTIMENTO E FORMAS DE PAGAMENTO, PRAZO E CRONOGRAMA${form.diferenciais ? ", NOSSOS DIFERENCIAIS" : ""}, PRÓXIMOS PASSOS e ASSINATURA. Use linguagem profissional e calorosa. Separe as seções com ---.`;

      const res = await fetch("/api/gerar-proposta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      const text = data.text || "";
      if (!text) throw new Error("vazio");
      usage.increment();
      setProposta(text);
      setStep("proposta");
    } catch {
      setError("Erro ao gerar. Tente novamente.");
      setStep("dados");
    }
  };

  const copiar = () => {
    navigator.clipboard.writeText(proposta);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const exportarPDF = () => {
    const win = window.open("", "_blank");
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Proposta Comercial</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: Georgia, serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 60px 60px;
            color: #1a1a1a;
            line-height: 1.8;
          }
          .header {
            text-align: center;
            margin-bottom: 48px;
            padding-bottom: 24px;
            border-bottom: 2px solid #c8a96e;
          }
          .logo {
            font-size: 11px;
            letter-spacing: 4px;
            color: #c8a96e;
            text-transform: uppercase;
            margin-bottom: 8px;
          }
          .titulo {
            font-size: 22px;
            font-weight: normal;
            color: #1a1a1a;
            letter-spacing: -0.5px;
          }
          h2 {
            font-size: 13px;
            color: #c8a96e;
            letter-spacing: 2px;
            text-transform: uppercase;
            margin: 32px 0 10px;
            font-weight: normal;
          }
          h3 {
            font-size: 14px;
            color: #1a1a1a;
            margin: 20px 0 8px;
            font-weight: bold;
          }
          hr {
            border: none;
            border-top: 1px solid #ddd;
            margin: 24px 0;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 16px 0;
          }
          td {
            padding: 8px 12px;
            border: 1px solid #ddd;
            font-size: 13px;
          }
          .proposta {
            font-size: 14px;
            line-height: 1.9;
            color: #222;
          }
          .footer {
            margin-top: 60px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            text-align: center;
            font-size: 10px;
            color: #999;
            letter-spacing: 2px;
            text-transform: uppercase;
          }
          @media print {
            body { padding: 40px; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">PropostaAI</div>
          <div class="titulo">Proposta Comercial</div>
        </div>
        <div class="proposta">${proposta
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/^---$/gm, '<hr/>')
          .replace(/^## (.+)$/gm, '<h2>$1</h2>')
          .replace(/^### (.+)$/gm, '<h3>$1</h3>')
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\n/g, '<br/>')
        }</div>
        <div class="footer">Gerado por PropostaAI · fecharproposta.com.br</div>
        <script>window.onload = function() { window.print(); };<\/script>
      </body>
      </html>
    `);
    win.document.close();
  };

  // Tela de carregamento enquanto verifica assinatura
  if (usage.loadingSubscription) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0f", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", fontFamily: "Georgia, serif" }}>
          <div style={css.spinner} />
          <p style={{ color: "#555", marginTop: "16px", fontSize: "13px" }}>Verificando assinatura...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f" }}>
      {/* Topbar */}
      <div style={css.topbar}>
        <div>
          <span style={{ fontSize: "11px", letterSpacing: "3px", color: "#c8a96e", textTransform: "uppercase" }}>PropostaAI</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          {!usage.subscribed && (
            <div style={{ fontSize: "12px", color: "#888" }}>
              <span style={{ color: usage.remaining <= 1 ? "#e05555" : "#c8a96e", fontWeight: "bold" }}>
                {usage.remaining}
              </span> proposta{usage.remaining !== 1 ? "s" : ""} restante{usage.remaining !== 1 ? "s" : ""}
            </div>
          )}

          {usage.subscribed && (
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ fontSize: "11px", color: "#c8a96e", letterSpacing: "1px" }}>✓ PRO</div>
              <button
                onClick={() => window.open(CONFIG.STRIPE_PORTAL_LINK, "_blank")}
                style={css.btnGerenciar}
              >
                Gerenciar assinatura
              </button>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={css.avatar}>{user.name[0]}</div>
            <button onClick={onLogout} style={css.btnSair}>Sair</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "700px", margin: "0 auto", padding: "48px 24px" }}>

        {step === "dados" && (
          <div>
            <h2 style={{ fontSize: "28px", fontWeight: "normal", color: "#f0e8d8", marginBottom: "8px", letterSpacing: "-0.5px" }}>
              Nova proposta
            </h2>
            <p style={{ color: "#666", fontSize: "14px", marginBottom: "36px" }}>
              Preencha os dados e a IA cria uma proposta profissional para você.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              {fields.map((f) => (
                <div key={f.key}>
                  <label style={css.label}>
                    {f.label} {f.required && <span style={{ color: "#e05555" }}>*</span>}
                  </label>
                  {f.key === "diferenciais" ? (
                    <textarea
                      value={form[f.key] || ""}
                      onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      rows={3}
                      style={{ ...css.input, resize: "vertical", minHeight: "80px" }}
                    />
                  ) : (
                    <input
                      value={form[f.key] || ""}
                      onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      style={css.input}
                      onFocus={(e) => (e.target.style.borderColor = "#c8a96e")}
                      onBlur={(e) => (e.target.style.borderColor = "#2a2a3a")}
                    />
                  )}
                </div>
              ))}
            </div>

            {error && <div style={{ marginTop: "12px", color: "#e05555", fontSize: "13px" }}>{error}</div>}
            <button
              onClick={gerar}
              disabled={!isValid}
              style={{ ...css.btnPrimary, marginTop: "32px", opacity: isValid ? 1 : 0.4, cursor: isValid ? "pointer" : "not-allowed" }}
            >
              Gerar Proposta com IA →
            </button>
          </div>
        )}

        {step === "gerando" && (
          <div style={css.loadingWrap}>
            <div style={css.spinner} />
            <div style={{ fontSize: "18px", color: "#f0e8d8" }}>Criando sua proposta...</div>
            <div style={{ fontSize: "13px", color: "#555" }}>A IA está elaborando um documento persuasivo</div>
          </div>
        )}

        {step === "proposta" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <div style={{ fontSize: "11px", letterSpacing: "2px", color: "#c8a96e", textTransform: "uppercase", marginBottom: "4px" }}>✓ Gerada com sucesso</div>
                <h2 style={{ fontSize: "24px", fontWeight: "normal", color: "#f0e8d8", margin: 0 }}>Sua proposta está pronta</h2>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button onClick={copiar} style={{ ...css.btnPrimary, padding: "10px 18px", fontSize: "11px", width: "auto" }}>
                  {copied ? "✓ Copiado!" : "Copiar"}
                </button>
                <button onClick={exportarPDF} style={{ ...css.btnPrimary, padding: "10px 18px", fontSize: "11px", width: "auto", background: "#1a5c1a" }}>
                  📄 Exportar PDF
                </button>
                <button onClick={() => { setStep("dados"); setProposta(""); setForm({}); }} style={css.btnOutline}>
                  Nova
                </button>
              </div>
            </div>

            <div
              style={css.propostaBox}
              dangerouslySetInnerHTML={renderProposta(proposta)}
            />

            <div style={css.dica}>
              💡 Revise valores e personalize antes de enviar. Propostas revisadas convertem mais.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================
//  APP PRINCIPAL
// ================================================================
export default function App() {
  const { user, loadingAuth, loginGoogle, logout } = useAuth();
  const usage = useUsage(user);
  const [showPaywall, setShowPaywall] = useState(false);

  useEffect(() => {
    if (user && !usage.loadingSubscription && !usage.canGenerate) {
      setShowPaywall(true);
    } else {
      setShowPaywall(false);
    }
  }, [usage.canGenerate, usage.loadingSubscription, user]);

  if (loadingAuth) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0f", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", fontFamily: "Georgia, serif" }}>
          <div style={css.spinner} />
        </div>
      </div>
    );
  }

  if (!user) return <TelaLogin onLogin={loginGoogle} loading={loadingAuth} />;

  if (showPaywall)
    return (
      <TelaPaywall
        user={user}
        onAssinar={() => window.open(CONFIG.STRIPE_PAYMENT_LINK, "_blank")}
      />
    );

  return <TelaApp user={user} usage={usage} onLogout={logout} />;
}

// ================================================================
//  ESTILOS
// ================================================================
const css = {
  loginWrap: {
    minHeight: "100vh", background: "#0a0a0f",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "24px", fontFamily: "'Georgia', serif",
  },
  loginCard: {
    maxWidth: "460px", width: "100%",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid #1e1e2e", borderRadius: "8px",
    padding: "48px 40px", textAlign: "center",
  },
  badge: {
    display: "inline-block", fontSize: "10px", letterSpacing: "3px",
    textTransform: "uppercase", color: "#c8a96e",
    border: "1px solid rgba(200,169,110,0.3)", padding: "4px 12px",
    borderRadius: "2px", marginBottom: "24px",
  },
  loginTitle: {
    fontSize: "clamp(22px,4vw,32px)", fontWeight: "normal",
    color: "#f0e8d8", lineHeight: 1.3, marginBottom: "16px",
    letterSpacing: "-0.5px",
  },
  loginSub: { color: "#888", fontSize: "14px", lineHeight: 1.7, marginBottom: "28px" },
  beneficios: { textAlign: "left", marginBottom: "32px", background: "rgba(200,169,110,0.05)", borderRadius: "4px", padding: "16px 20px" },
  beneficioItem: { color: "#b0a890", fontSize: "13px", marginBottom: "8px" },
  btnGoogle: {
    width: "100%", padding: "14px", background: "#fff", color: "#222",
    border: "none", borderRadius: "4px", fontSize: "14px", fontWeight: "bold",
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "'Georgia', serif", transition: "opacity 0.2s",
  },
  paywallWrap: {
    minHeight: "100vh", background: "#0a0a0f",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "24px", fontFamily: "'Georgia', serif",
  },
  paywallCard: {
    maxWidth: "440px", width: "100%", textAlign: "center",
    background: "rgba(255,255,255,0.03)", border: "1px solid #1e1e2e",
    borderRadius: "8px", padding: "48px 36px",
  },
  planoCard: {
    background: "rgba(200,169,110,0.06)", border: "1px solid rgba(200,169,110,0.2)",
    borderRadius: "6px", padding: "24px", marginBottom: "20px", textAlign: "left",
  },
  btnPro: {
    width: "100%", padding: "16px", background: "#c8a96e", color: "#0a0a0f",
    border: "none", borderRadius: "4px", fontSize: "13px", letterSpacing: "2px",
    textTransform: "uppercase", cursor: "pointer", fontWeight: "bold",
    fontFamily: "'Georgia', serif", marginBottom: "10px",
  },
  topbar: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "16px 32px", borderBottom: "1px solid #1a1a2a",
    background: "rgba(255,255,255,0.02)", fontFamily: "'Georgia', serif",
  },
  avatar: {
    width: "30px", height: "30px", background: "#c8a96e", color: "#0a0a0f",
    borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "13px", fontWeight: "bold",
  },
  btnSair: {
    background: "none", border: "none", color: "#555", fontSize: "12px",
    cursor: "pointer", letterSpacing: "1px", fontFamily: "'Georgia', serif",
  },
  btnGerenciar: {
    background: "none",
    border: "1px solid #2a2a3a",
    color: "#888",
    fontSize: "11px",
    padding: "4px 10px",
    borderRadius: "4px",
    cursor: "pointer",
    fontFamily: "'Georgia', serif",
    letterSpacing: "1px",
  },
  label: {
    display: "block", fontSize: "10px", letterSpacing: "2px",
    textTransform: "uppercase", color: "#c8a96e", marginBottom: "8px",
    fontFamily: "'Georgia', serif",
  },
  input: {
    width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid #2a2a3a",
    borderRadius: "4px", padding: "13px 15px", color: "#e8e0d0", fontSize: "14px",
    fontFamily: "'Georgia', serif", outline: "none", boxSizing: "border-box",
    transition: "border-color 0.2s",
  },
  btnPrimary: {
    width: "100%", padding: "16px", background: "#c8a96e", color: "#0a0a0f",
    border: "none", borderRadius: "4px", fontSize: "12px", letterSpacing: "2px",
    textTransform: "uppercase", cursor: "pointer", fontWeight: "bold",
    fontFamily: "'Georgia', serif", transition: "background 0.2s",
  },
  btnOutline: {
    padding: "10px 18px", background: "transparent", color: "#888",
    border: "1px solid #2a2a3a", borderRadius: "4px", fontSize: "11px",
    letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer",
    fontFamily: "'Georgia', serif",
  },
  loadingWrap: {
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", minHeight: "400px", gap: "20px", textAlign: "center",
    fontFamily: "'Georgia', serif",
  },
  spinner: {
    width: "44px", height: "44px", border: "2px solid #1e1e2e",
    borderTop: "2px solid #c8a96e", borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  propostaBox: {
    background: "rgba(255,255,255,0.03)", border: "1px solid #2a2a3a",
    borderRadius: "6px", padding: "36px",
    lineHeight: 1.8, fontSize: "14px", color: "#d8d0c0",
    fontFamily: "'Georgia', serif",
  },
  dica: {
    marginTop: "20px", padding: "14px 18px",
    background: "rgba(200,169,110,0.07)", border: "1px solid rgba(200,169,110,0.15)",
    borderRadius: "4px", fontSize: "13px", color: "#c8a96e",
    fontFamily: "'Georgia', serif",
  },
};

// inject keyframes
if (typeof document !== "undefined") {
  const s = document.createElement("style");
  s.textContent = `
    @keyframes spin { to { transform: rotate(360deg); } }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0a0a0f; }
    input::placeholder { color: #383838; }
    textarea::placeholder { color: #383838; }
    ::-webkit-scrollbar { width: 5px; }
    ::-webkit-scrollbar-track { background: #0a0a0f; }
    ::-webkit-scrollbar-thumb { background: #2a2a3a; border-radius: 3px; }
  `;
  document.head.appendChild(s);
}
