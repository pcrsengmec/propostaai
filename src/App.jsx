import { useState, useEffect } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, signOut,
} from "firebase/auth";
import { getFirestore, collection, query, where, getDocs } from "firebase/firestore";

const CONFIG = {
  FIREBASE_API_KEY: "AIzaSyDnOuaD4TZ-iyhT5lw2JR_gd8ZYIJQK0Jg",
  FIREBASE_AUTH_DOMAIN: "propostaai.firebaseapp.com",
  FIREBASE_PROJECT_ID: "propostaai",
  STRIPE_PAYMENT_LINK: "https://buy.stripe.com/aFa8wO0CqfdicZ96j7dby01",
  STRIPE_PORTAL_LINK: "https://billing.stripe.com/p/login/bJe7sKgBo4yEaR15f3dby00",
  LIMITE_GRATUITO: 3,
  PRECO: "R$ 22/mês",
};

const firebaseConfig = {
  apiKey: CONFIG.FIREBASE_API_KEY,
  authDomain: CONFIG.FIREBASE_AUTH_DOMAIN,
  projectId: CONFIG.FIREBASE_PROJECT_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const isMobile = () => /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);

// ============================================================
// Auth Hook
// ============================================================
const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  useEffect(() => {
    getRedirectResult(auth).then((result) => {
      if (result?.user) {
        const u = result.user;
        setUser({ name: u.displayName || u.email, email: u.email, photo: u.photoURL });
      }
    }).catch((e) => console.error("Redirect error:", e));

    const unsub = onAuthStateChanged(auth, (fu) => {
      if (fu) setUser({ name: fu.displayName || fu.email, email: fu.email, photo: fu.photoURL });
      else setUser(null);
      setLoadingAuth(false);
    });
    return unsub;
  }, []);

  const loginGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      if (isMobile()) await signInWithRedirect(auth, provider);
      else {
        const result = await signInWithPopup(auth, provider);
        if (result?.user) {
          const u = result.user;
          setUser({ name: u.displayName || u.email, email: u.email, photo: u.photoURL });
        }
      }
    } catch (e) { console.error("Login error:", e); }
  };

  return { user, loadingAuth, loginGoogle, logout: () => signOut(auth) };
};

// ============================================================
// Usage Hook
// ============================================================
const useUsage = (user) => {
  const key = user ? `usage_${user.email}` : null;
  const getCount = () => !key ? 0 : parseInt(localStorage.getItem(key) || "0");
  const [count, setCount] = useState(getCount);
  const [subscribed, setSubscribed] = useState(false);
  const [loadingSubscription, setLoadingSubscription] = useState(false);

  useEffect(() => {
    setCount(getCount());
    setSubscribed(false);
    if (!user) return;
    const check = async () => {
      setLoadingSubscription(true);
      try {
        const snap = await getDocs(query(collection(db, "assinaturas"), where("email", "==", user.email)));
        setSubscribed(!snap.empty && snap.docs[0].data().plano === "pro");
      } catch (e) { console.error(e); setSubscribed(false); }
      finally { setLoadingSubscription(false); }
    };
    check();
  }, [user]);

  const increment = () => { const n = count + 1; localStorage.setItem(key, n); setCount(n); };
  const remaining = subscribed ? Infinity : Math.max(0, CONFIG.LIMITE_GRATUITO - count);
  const canGenerate = subscribed || count < CONFIG.LIMITE_GRATUITO;
  return { count, subscribed, remaining, canGenerate, increment, loadingSubscription };
};

// ============================================================
// Fields
// ============================================================
const fields = [
  { key: "seuNome", label: "Seu nome / empresa", placeholder: "Ex: João Silva Consultoria", required: true },
  { key: "seuCnpj", label: "Seu CNPJ/CPF", placeholder: "Ex: 12.345.678/0001-99", required: false },
  { key: "seuContato", label: "Seu telefone e email", placeholder: "Ex: (21) 99999-9999 | joao@email.com", required: false },
  { key: "clienteNome", label: "Nome do cliente", placeholder: "Ex: Empresa ABC Ltda", required: true },
  { key: "clienteCnpj", label: "CNPJ do cliente", placeholder: "Ex: 98.765.432/0001-11", required: false },
  { key: "clienteContato", label: "Contato do cliente", placeholder: "Ex: Maria Silva | (21) 98888-8888", required: false },
  { key: "clienteEndereco", label: "Endereço do cliente", placeholder: "Ex: Av. Paulista, 1000 - São Paulo/SP", required: false },
  { key: "servico", label: "Serviço ou produto", placeholder: "Ex: Desenvolvimento de site institucional", required: true },
  { key: "valor", label: "Valor da proposta", placeholder: "Ex: R$ 5.000,00", required: true },
  { key: "prazo", label: "Prazo de entrega", placeholder: "Ex: 30 dias úteis", required: true },
  { key: "validade", label: "Validade da proposta", placeholder: "Ex: 15 dias", required: false },
  { key: "diferenciais", label: "Seus diferenciais (opcional)", placeholder: "Ex: 5 anos de experiência, suporte incluso...", required: false },
];

// ============================================================
// Markdown Renderer — corrigido
// ============================================================
function markdownToHtml(text, theme) {
  const colors = {
    escuro: { h2: "#c8a96e", h3: "#f0e8d8", h4: "#c8a96e", text: "#d8d0c0", bold: "#f0e8d8", hr: "#2a2a3a", td: "#d8d0c0", tdBorder: "#2a2a3a", bullet: "#c8a96e" },
    claro:  { h2: "#8B6914", h3: "#1a1a1a", h4: "#8B6914", text: "#333", bold: "#111", hr: "#ddd", td: "#333", tdBorder: "#ddd", bullet: "#8B6914" },
    azul:   { h2: "#2563eb", h3: "#1e3a5f", h4: "#2563eb", text: "#334155", bold: "#1e3a5f", hr: "#bfdbfe", td: "#334155", tdBorder: "#bfdbfe", bullet: "#2563eb" },
  };
  const c = colors[theme] || colors.escuro;

  const lines = text.split("\n");
  let html = "";
  let inTable = false;
  let tableRows = [];

  const flushTable = () => {
    if (tableRows.length === 0) return;
    html += `<table style="width:100%;border-collapse:collapse;margin:16px 0">`;
    tableRows.forEach((row, i) => {
      if (row.includes("---")) return;
      const cells = row.split("|").map(c => c.trim()).filter(c => c !== "");
      const tag = i === 0 ? "th" : "td";
      html += "<tr>" + cells.map(cell => `<${tag} style="padding:8px 12px;border:1px solid ${c.tdBorder};color:${c.td};font-size:13px;${tag==="th"?"font-weight:bold;background:rgba(200,169,110,0.1)":""}">${processInline(cell, c)}</${tag}>`).join("") + "</tr>";
    });
    html += "</table>";
    tableRows = [];
    inTable = false;
  };

  const processInline = (line, c) => line
    .replace(/\*\*(.+?)\*\*/g, `<strong style="color:${c.bold}">$1</strong>`)
    .replace(/\*(.+?)\*/g, `<em>$1</em>`);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("|")) {
      inTable = true;
      tableRows.push(line);
      continue;
    } else if (inTable) {
      flushTable();
    }

    if (line.match(/^---+$/)) {
      html += `<hr style="border:none;border-top:1px solid ${c.hr};margin:24px 0"/>`;
    } else if (line.startsWith("#### ")) {
      html += `<h4 style="font-size:13px;color:${c.h4};margin:16px 0 6px;font-weight:bold;font-family:Georgia,serif">${processInline(line.slice(5), c)}</h4>`;
    } else if (line.startsWith("### ")) {
      html += `<h3 style="font-size:15px;color:${c.h3};margin:20px 0 8px;font-weight:bold;font-family:Georgia,serif">${processInline(line.slice(4), c)}</h3>`;
    } else if (line.startsWith("## ")) {
      html += `<h2 style="font-size:13px;color:${c.h2};letter-spacing:2px;text-transform:uppercase;margin:32px 0 10px;font-weight:normal;font-family:Georgia,serif">${processInline(line.slice(3), c)}</h2>`;
    } else if (line.startsWith("# ")) {
      html += `<h1 style="font-size:18px;color:${c.h3};margin:0 0 24px;font-weight:normal;font-family:Georgia,serif">${processInline(line.slice(2), c)}</h1>`;
    } else if (line.match(/^[\-\*] /)) {
      html += `<div style="display:flex;gap:8px;margin:4px 0;color:${c.text};font-family:Georgia,serif"><span style="color:${c.bullet};flex-shrink:0">✓</span><span>${processInline(line.slice(2), c)}</span></div>`;
    } else if (line.trim() === "") {
      html += "<br/>";
    } else {
      html += `<p style="margin:4px 0;color:${c.text};font-family:Georgia,serif;line-height:1.8">${processInline(line, c)}</p>`;
    }
  }
  if (inTable) flushTable();
  return html;
}

// ============================================================
// Layout themes
// ============================================================
const LAYOUTS = [
  {
    id: "escuro",
    nome: "Elegante Escuro",
    bg: "#0a0a0f",
    boxBg: "rgba(255,255,255,0.03)",
    boxBorder: "#2a2a3a",
    headerBg: "linear-gradient(135deg, #1a1a2e 0%, #0a0a0f 100%)",
    headerAccent: "#c8a96e",
    headerText: "#f0e8d8",
  },
  {
    id: "claro",
    nome: "Profissional Claro",
    bg: "#f5f5f0",
    boxBg: "#ffffff",
    boxBorder: "#e0d8c8",
    headerBg: "linear-gradient(135deg, #1a1a2e 0%, #2d2d4e 100%)",
    headerAccent: "#c8a96e",
    headerText: "#ffffff",
  },
  {
    id: "azul",
    nome: "Corporativo Azul",
    bg: "#f0f4ff",
    boxBg: "#ffffff",
    boxBorder: "#bfdbfe",
    headerBg: "linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)",
    headerAccent: "#60a5fa",
    headerText: "#ffffff",
  },
];

// ============================================================
// PDF Export
// ============================================================
function exportarPDF(proposta, layout) {
  const win = window.open("", "_blank");
  const hoje = new Date().toLocaleDateString("pt-BR");

  const themeStyles = {
    escuro: { bg: "#fff", text: "#1a1a1a", accent: "#8B6914", headerBg: "#1a1a2e", headerText: "#f0e8d8" },
    claro:  { bg: "#fff", text: "#1a1a1a", accent: "#8B6914", headerBg: "#1a1a2e", headerText: "#ffffff" },
    azul:   { bg: "#fff", text: "#1a1a1a", accent: "#1e3a5f", headerBg: "#1e3a5f", headerText: "#ffffff" },
  };
  const t = themeStyles[layout] || themeStyles.escuro;

  // Convert markdown to clean HTML for PDF (light theme)
  const htmlContent = markdownToHtml(proposta, "claro");

  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <title>Proposta Comercial</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Georgia, serif; max-width: 800px; margin: 0 auto; padding: 0; color: ${t.text}; background: ${t.bg}; }
    .header { background: ${t.headerBg}; color: ${t.headerText}; padding: 40px 60px; margin-bottom: 40px; }
    .header .logo { font-size: 10px; letter-spacing: 4px; color: ${t.accent === "#8B6914" ? "#c8a96e" : "#60a5fa"}; text-transform: uppercase; margin-bottom: 8px; font-family: Georgia, serif; }
    .header .titulo { font-size: 24px; font-weight: normal; }
    .header .data { font-size: 11px; opacity: 0.6; margin-top: 8px; }
    .content { padding: 0 60px 60px; }
    h1 { font-size: 18px; color: ${t.text}; margin-bottom: 24px; font-weight: normal; }
    h2 { font-size: 12px; color: ${t.accent}; letter-spacing: 2px; text-transform: uppercase; margin: 32px 0 10px; font-weight: normal; border-bottom: 1px solid #eee; padding-bottom: 6px; }
    h3 { font-size: 14px; color: ${t.text}; margin: 16px 0 8px; font-weight: bold; }
    h4 { font-size: 13px; color: ${t.accent}; margin: 12px 0 6px; font-weight: bold; }
    p { font-size: 13px; line-height: 1.9; color: #333; margin: 6px 0; }
    hr { border: none; border-top: 1px solid #eee; margin: 24px 0; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th { padding: 10px 12px; border: 1px solid #ddd; font-size: 12px; background: #f5f5f0; text-align: left; }
    td { padding: 8px 12px; border: 1px solid #ddd; font-size: 12px; }
    .bullet { display: flex; gap: 8px; margin: 4px 0; font-size: 13px; color: #333; }
    .bullet span:first-child { color: ${t.accent}; flex-shrink: 0; }
    .footer { margin-top: 60px; padding: 20px 60px; border-top: 2px solid ${t.accent}; text-align: center; font-size: 10px; color: #999; letter-spacing: 2px; text-transform: uppercase; }
    strong { color: ${t.text}; }
    @media print { body { padding: 0; } .header { margin-bottom: 30px; } }
  </style>
  </head><body>
  <div class="header">
    <div class="logo">PropostaAI</div>
    <div class="titulo">Proposta Comercial</div>
    <div class="data">Gerada em ${hoje}</div>
  </div>
  <div class="content">${htmlContent}</div>
  <div class="footer">Gerado por PropostaAI · fecharproposta.com.br</div>
  <script>window.onload=function(){window.print();}<\/script>
  </body></html>`);
  win.document.close();
}

// ============================================================
// Tela Login
// ============================================================
function TelaLogin({ onLogin, loading }) {
  return (
    <div style={css.loginWrap}>
      <div style={css.loginCard}>
        <div style={css.badge}>Produto Digital</div>
        <h1 style={css.loginTitle}>Propostas comerciais<br /><em style={{ color: "#c8a96e" }}>profissionais em segundos</em></h1>
        <p style={css.loginSub}>IA cria propostas persuasivas para você fechar mais negócios. Comece grátis — {CONFIG.LIMITE_GRATUITO} propostas sem cartão.</p>
        <div style={css.beneficios}>
          {["✦ Proposta completa em &lt;30 segundos", "✦ Tom profissional e persuasivo", "✦ 3 propostas grátis para testar"].map((b, i) => (
            <div key={i} style={css.beneficioItem} dangerouslySetInnerHTML={{ __html: b }} />
          ))}
        </div>
        <button onClick={onLogin} disabled={loading} style={css.btnGoogle}>
          {loading ? <span>Entrando...</span> : (<>
            <svg width="18" height="18" viewBox="0 0 18 18" style={{ marginRight: 10 }}>
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
              <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" />
            </svg>
            Entrar com Google
          </>)}
        </button>
        <p style={{ color: "#444", fontSize: "11px", marginTop: "16px", textAlign: "center" }}>Sem cartão. Sem compromisso. Cancele quando quiser.</p>
      </div>
    </div>
  );
}

// ============================================================
// Tela Paywall
// ============================================================
function TelaPaywall({ onAssinar }) {
  return (
    <div style={css.paywallWrap}>
      <div style={css.paywallCard}>
        <div style={{ fontSize: "32px", marginBottom: "16px" }}>🔒</div>
        <div style={css.badge}>Limite atingido</div>
        <h2 style={{ fontSize: "26px", fontWeight: "normal", color: "#f0e8d8", margin: "16px 0 8px" }}>Você usou suas <em style={{ color: "#c8a96e" }}>3 propostas grátis</em></h2>
        <p style={{ color: "#888", fontSize: "14px", marginBottom: "32px", lineHeight: 1.7 }}>Assine o plano Pro e gere propostas ilimitadas.</p>
        <div style={css.planoCard}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <div>
              <div style={{ fontSize: "13px", color: "#c8a96e", letterSpacing: "2px", textTransform: "uppercase" }}>Plano Pro</div>
              <div style={{ fontSize: "32px", fontWeight: "bold", color: "#f0e8d8" }}>{CONFIG.PRECO}</div>
            </div>
            <div style={{ fontSize: "11px", color: "#888", textAlign: "right" }}>Cancele<br />quando quiser</div>
          </div>
          {["Propostas ilimitadas", "Todos os templates", "Histórico completo", "Suporte prioritário"].map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", color: "#d8d0c0", fontSize: "14px" }}>
              <span style={{ color: "#c8a96e" }}>✓</span> {f}
            </div>
          ))}
        </div>
        <button onClick={onAssinar} style={css.btnPro}>Assinar por {CONFIG.PRECO} →</button>
      </div>
    </div>
  );
}

// ============================================================
// Tela App
// ============================================================
function TelaApp({ user, usage, onLogout }) {
  const [form, setForm] = useState({});
  const [step, setStep] = useState("dados");
  const [proposta, setProposta] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [layoutIdx, setLayoutIdx] = useState(0);
  const layout = LAYOUTS[layoutIdx];

  const isValid = fields.filter(f => f.required).every(f => form[f.key]);

  const hoje = new Date().toLocaleDateString("pt-BR");

  const gerar = async () => {
    if (!usage.canGenerate) return;
    setStep("gerando");
    setError("");
    try {
      const prompt = `Você é um especialista em vendas B2B brasileiro. Gere uma proposta comercial profissional, persuasiva e completa em português do Brasil. Use formatação markdown com ## para seções principais, ### para subseções, #### para itens numerados, - para listas e **negrito** para destaques.

Dados do Fornecedor:
- Nome/Empresa: ${form.seuNome}
- CNPJ/CPF: ${form.seuCnpj || "[Não informado]"}
- Contato: ${form.seuContato || "[Não informado]"}

Dados do Cliente:
- Nome/Empresa: ${form.clienteNome}
- CNPJ: ${form.clienteCnpj || "[Não informado]"}
- Contato: ${form.clienteContato || "[Não informado]"}
- Endereço: ${form.clienteEndereco || "[Não informado]"}

Proposta:
- Serviço: ${form.servico}
- Valor: ${form.valor}
- Prazo: ${form.prazo}
- Validade: ${form.validade || "30 dias"}
- Data: ${hoje}
- Diferenciais: ${form.diferenciais || "não informado — omita seção de diferenciais"}

A proposta deve ter as seções: ## IDENTIFICAÇÃO (com todos os dados acima preenchidos), ## APRESENTAÇÃO, ## ENTENDIMENTO DA NECESSIDADE, ## ESCOPO DETALHADO (com ### e #### para subitens), ## INVESTIMENTO E FORMAS DE PAGAMENTO (com tabela e opções de pagamento), ## PRAZO E CRONOGRAMA (com tabela de fases)${form.diferenciais ? ", ## NOSSOS DIFERENCIAIS" : ""}, ## PRÓXIMOS PASSOS, ## ASSINATURA. Separe seções com ---. IMPORTANTE: preencha os campos de identificação com os dados reais fornecidos acima, não use placeholders como [Inserir].`;

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

  const proximoLayout = () => setLayoutIdx((layoutIdx + 1) % LAYOUTS.length);

  const isDark = layout.id === "escuro";
  const textColor = isDark ? "#f0e8d8" : "#1a1a1a";
  const subColor = isDark ? "#666" : "#888";

  if (usage.loadingSubscription) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0f", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}><div style={css.spinner} /><p style={{ color: "#555", marginTop: "16px", fontSize: "13px" }}>Verificando assinatura...</p></div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", fontFamily: "Georgia, serif" }}>
      {/* Topbar */}
      <div style={css.topbar}>
        <span style={{ fontSize: "11px", letterSpacing: "3px", color: "#c8a96e", textTransform: "uppercase" }}>PropostaAI</span>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          {!usage.subscribed && (
            <div style={{ fontSize: "12px", color: "#888" }}>
              <span style={{ color: usage.remaining <= 1 ? "#e05555" : "#c8a96e", fontWeight: "bold" }}>{usage.remaining}</span> proposta{usage.remaining !== 1 ? "s" : ""} restante{usage.remaining !== 1 ? "s" : ""}
            </div>
          )}
          {usage.subscribed && (
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ fontSize: "11px", color: "#c8a96e", letterSpacing: "1px" }}>✓ PRO</div>
              <button onClick={() => window.open(CONFIG.STRIPE_PORTAL_LINK, "_blank")} style={css.btnGerenciar}>Gerenciar assinatura</button>
            </div>
          )}
          <div style={css.avatar}>{user.name[0]}</div>
          <button onClick={onLogout} style={css.btnSair}>Sair</button>
        </div>
      </div>

      <div style={{ maxWidth: "760px", margin: "0 auto", padding: "48px 24px" }}>

        {/* FORMULÁRIO */}
        {step === "dados" && (
          <div>
            <h2 style={{ fontSize: "28px", fontWeight: "normal", color: "#f0e8d8", marginBottom: "8px" }}>Nova proposta</h2>
            <p style={{ color: "#666", fontSize: "14px", marginBottom: "36px" }}>Preencha os dados e a IA cria uma proposta profissional.</p>

            {/* Seção Fornecedor */}
            <div style={css.sectionLabel}>Seus dados</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "8px" }}>
              {fields.slice(0, 3).map(f => (
                <div key={f.key} style={{ gridColumn: f.key === "seuNome" ? "1/-1" : "auto" }}>
                  <label style={css.label}>{f.label} {f.required && <span style={{ color: "#e05555" }}>*</span>}</label>
                  <input value={form[f.key] || ""} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} style={css.input} onFocus={e => e.target.style.borderColor = "#c8a96e"} onBlur={e => e.target.style.borderColor = "#2a2a3a"} />
                </div>
              ))}
            </div>

            {/* Seção Cliente */}
            <div style={{ ...css.sectionLabel, marginTop: "24px" }}>Dados do cliente</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "8px" }}>
              {fields.slice(3, 7).map(f => (
                <div key={f.key} style={{ gridColumn: f.key === "clienteNome" || f.key === "clienteEndereco" ? "1/-1" : "auto" }}>
                  <label style={css.label}>{f.label} {f.required && <span style={{ color: "#e05555" }}>*</span>}</label>
                  <input value={form[f.key] || ""} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} style={css.input} onFocus={e => e.target.style.borderColor = "#c8a96e"} onBlur={e => e.target.style.borderColor = "#2a2a3a"} />
                </div>
              ))}
            </div>

            {/* Seção Proposta */}
            <div style={{ ...css.sectionLabel, marginTop: "24px" }}>Detalhes da proposta</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              {fields.slice(7).map(f => (
                <div key={f.key} style={{ gridColumn: f.key === "servico" || f.key === "diferenciais" ? "1/-1" : "auto" }}>
                  <label style={css.label}>{f.label} {f.required && <span style={{ color: "#e05555" }}>*</span>}</label>
                  {f.key === "diferenciais"
                    ? <textarea value={form[f.key] || ""} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} rows={3} style={{ ...css.input, resize: "vertical", minHeight: "80px" }} />
                    : <input value={form[f.key] || ""} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} style={css.input} onFocus={e => e.target.style.borderColor = "#c8a96e"} onBlur={e => e.target.style.borderColor = "#2a2a3a"} />
                  }
                </div>
              ))}
            </div>

            {error && <div style={{ marginTop: "12px", color: "#e05555", fontSize: "13px" }}>{error}</div>}
            <button onClick={gerar} disabled={!isValid} style={{ ...css.btnPrimary, marginTop: "32px", opacity: isValid ? 1 : 0.4, cursor: isValid ? "pointer" : "not-allowed" }}>
              Gerar Proposta com IA →
            </button>
          </div>
        )}

        {/* LOADING */}
        {step === "gerando" && (
          <div style={css.loadingWrap}>
            <div style={css.spinner} />
            <div style={{ fontSize: "18px", color: "#f0e8d8" }}>Criando sua proposta...</div>
            <div style={{ fontSize: "13px", color: "#555" }}>A IA está elaborando um documento persuasivo</div>
          </div>
        )}

        {/* PROPOSTA */}
        {step === "proposta" && (
          <div>
            {/* Header de ações */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <div style={{ fontSize: "11px", letterSpacing: "2px", color: "#c8a96e", textTransform: "uppercase", marginBottom: "4px" }}>✓ Gerada com sucesso</div>
                <h2 style={{ fontSize: "24px", fontWeight: "normal", color: "#f0e8d8", margin: 0 }}>Sua proposta está pronta</h2>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                {/* Botão layout */}
                <button onClick={proximoLayout} style={{ ...css.btnOutline, display: "flex", alignItems: "center", gap: "6px", fontSize: "11px" }}>
                  🎨 {layout.nome}
                </button>
                <button onClick={copiar} style={{ ...css.btnPrimary, padding: "10px 18px", fontSize: "11px", width: "auto" }}>
                  {copied ? "✓ Copiado!" : "Copiar"}
                </button>
                <button onClick={() => exportarPDF(proposta, layout.id)} style={{ ...css.btnPrimary, padding: "10px 18px", fontSize: "11px", width: "auto", background: "#1a5c1a" }}>
                  📄 Exportar PDF
                </button>
                <button onClick={() => { setStep("dados"); setProposta(""); }} style={css.btnOutline}>Nova</button>
              </div>
            </div>

            {/* Preview da proposta com layout selecionado */}
            <div style={{
              background: layout.bg,
              border: `1px solid ${layout.boxBorder}`,
              borderRadius: "8px",
              overflow: "hidden",
              boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
            }}>
              {/* Header do documento */}
              <div style={{
                background: layout.headerBg,
                padding: "32px 40px",
                borderBottom: `2px solid ${layout.headerAccent}`,
              }}>
                <div style={{ fontSize: "10px", letterSpacing: "4px", color: layout.headerAccent, textTransform: "uppercase", marginBottom: "6px" }}>PropostaAI</div>
                <div style={{ fontSize: "20px", fontWeight: "normal", color: layout.headerText, fontFamily: "Georgia, serif" }}>Proposta Comercial</div>
                <div style={{ fontSize: "11px", color: layout.headerText, opacity: 0.6, marginTop: "6px" }}>Gerada em {hoje}</div>
              </div>

              {/* Conteúdo */}
              <div
                style={{ padding: "36px 40px", lineHeight: 1.8, fontSize: "14px" }}
                dangerouslySetInnerHTML={{ __html: markdownToHtml(proposta, layout.id) }}
              />
            </div>

            <div style={css.dica}>💡 Revise valores e personalize antes de enviar. Use o botão 🎨 para trocar o layout do PDF.</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// App Principal
// ============================================================
export default function App() {
  const { user, loadingAuth, loginGoogle, logout } = useAuth();
  const usage = useUsage(user);
  const [showPaywall, setShowPaywall] = useState(false);

  useEffect(() => {
    if (user && !usage.loadingSubscription && !usage.canGenerate) setShowPaywall(true);
    else setShowPaywall(false);
  }, [usage.canGenerate, usage.loadingSubscription, user]);

  if (loadingAuth) return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={css.spinner} />
    </div>
  );

  if (!user) return <TelaLogin onLogin={loginGoogle} loading={loadingAuth} />;
  if (showPaywall) return <TelaPaywall onAssinar={() => window.open(CONFIG.STRIPE_PAYMENT_LINK, "_blank")} />;
  return <TelaApp user={user} usage={usage} onLogout={logout} />;
}

// ============================================================
// Estilos
// ============================================================
const css = {
  loginWrap: { minHeight: "100vh", background: "#0a0a0f", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", fontFamily: "Georgia, serif" },
  loginCard: { maxWidth: "460px", width: "100%", background: "rgba(255,255,255,0.03)", border: "1px solid #1e1e2e", borderRadius: "8px", padding: "48px 40px", textAlign: "center" },
  badge: { display: "inline-block", fontSize: "10px", letterSpacing: "3px", textTransform: "uppercase", color: "#c8a96e", border: "1px solid rgba(200,169,110,0.3)", padding: "4px 12px", borderRadius: "2px", marginBottom: "24px" },
  loginTitle: { fontSize: "clamp(22px,4vw,32px)", fontWeight: "normal", color: "#f0e8d8", lineHeight: 1.3, marginBottom: "16px" },
  loginSub: { color: "#888", fontSize: "14px", lineHeight: 1.7, marginBottom: "28px" },
  beneficios: { textAlign: "left", marginBottom: "32px", background: "rgba(200,169,110,0.05)", borderRadius: "4px", padding: "16px 20px" },
  beneficioItem: { color: "#b0a890", fontSize: "13px", marginBottom: "8px" },
  btnGoogle: { width: "100%", padding: "14px", background: "#fff", color: "#222", border: "none", borderRadius: "4px", fontSize: "14px", fontWeight: "bold", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Georgia, serif" },
  paywallWrap: { minHeight: "100vh", background: "#0a0a0f", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", fontFamily: "Georgia, serif" },
  paywallCard: { maxWidth: "440px", width: "100%", textAlign: "center", background: "rgba(255,255,255,0.03)", border: "1px solid #1e1e2e", borderRadius: "8px", padding: "48px 36px" },
  planoCard: { background: "rgba(200,169,110,0.06)", border: "1px solid rgba(200,169,110,0.2)", borderRadius: "6px", padding: "24px", marginBottom: "20px", textAlign: "left" },
  btnPro: { width: "100%", padding: "16px", background: "#c8a96e", color: "#0a0a0f", border: "none", borderRadius: "4px", fontSize: "13px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontWeight: "bold", fontFamily: "Georgia, serif", marginBottom: "10px" },
  topbar: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 32px", borderBottom: "1px solid #1a1a2a", background: "rgba(255,255,255,0.02)", fontFamily: "Georgia, serif" },
  avatar: { width: "30px", height: "30px", background: "#c8a96e", color: "#0a0a0f", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: "bold" },
  btnSair: { background: "none", border: "none", color: "#555", fontSize: "12px", cursor: "pointer", fontFamily: "Georgia, serif" },
  btnGerenciar: { background: "none", border: "1px solid #2a2a3a", color: "#888", fontSize: "11px", padding: "4px 10px", borderRadius: "4px", cursor: "pointer", fontFamily: "Georgia, serif" },
  sectionLabel: { fontSize: "10px", letterSpacing: "3px", textTransform: "uppercase", color: "#c8a96e", marginBottom: "14px", paddingBottom: "8px", borderBottom: "1px solid #1a1a2a" },
  label: { display: "block", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "#c8a96e", marginBottom: "8px", fontFamily: "Georgia, serif" },
  input: { width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid #2a2a3a", borderRadius: "4px", padding: "13px 15px", color: "#e8e0d0", fontSize: "14px", fontFamily: "Georgia, serif", outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" },
  btnPrimary: { width: "100%", padding: "16px", background: "#c8a96e", color: "#0a0a0f", border: "none", borderRadius: "4px", fontSize: "12px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", fontWeight: "bold", fontFamily: "Georgia, serif" },
  btnOutline: { padding: "10px 18px", background: "transparent", color: "#888", border: "1px solid #2a2a3a", borderRadius: "4px", fontSize: "11px", letterSpacing: "1px", textTransform: "uppercase", cursor: "pointer", fontFamily: "Georgia, serif" },
  loadingWrap: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "400px", gap: "20px", textAlign: "center" },
  spinner: { width: "44px", height: "44px", border: "2px solid #1e1e2e", borderTop: "2px solid #c8a96e", borderRadius: "50%", animation: "spin 1s linear infinite" },
  dica: { marginTop: "20px", padding: "14px 18px", background: "rgba(200,169,110,0.07)", border: "1px solid rgba(200,169,110,0.15)", borderRadius: "4px", fontSize: "13px", color: "#c8a96e", fontFamily: "Georgia, serif" },
};

if (typeof document !== "undefined") {
  const s = document.createElement("style");
  s.textContent = `
    @keyframes spin { to { transform: rotate(360deg); } }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0a0a0f; }
    input::placeholder, textarea::placeholder { color: #383838; }
    ::-webkit-scrollbar { width: 5px; }
    ::-webkit-scrollbar-track { background: #0a0a0f; }
    ::-webkit-scrollbar-thumb { background: #2a2a3a; border-radius: 3px; }
  `;
  document.head.appendChild(s);
}
