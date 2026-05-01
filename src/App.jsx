import { useState, useEffect } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, signOut,
} from "firebase/auth";
import { getFirestore, collection, query, where, getDocs, addDoc, serverTimestamp } from "firebase/firestore";

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
        setUser({ name: u.displayName || u.email, email: u.email });
      }
    }).catch(console.error);

    const unsub = onAuthStateChanged(auth, (fu) => {
      if (fu) setUser({ name: fu.displayName || fu.email, email: fu.email });
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
        if (result?.user) setUser({ name: result.user.displayName || result.user.email, email: result.user.email });
      }
    } catch (e) { console.error(e); }
  };

  return { user, loadingAuth, loginGoogle, logout: () => signOut(auth) };
};

// ============================================================
// Usage Hook
// ============================================================
const useUsage = (user) => {
  const key = user ? `usage_${user.email}` : null;
  const [count, setCount] = useState(() => !key ? 0 : parseInt(localStorage.getItem(key) || "0"));
  const [subscribed, setSubscribed] = useState(false);
  const [loadingSubscription, setLoadingSubscription] = useState(false);

  useEffect(() => {
    setCount(!key ? 0 : parseInt(localStorage.getItem(key) || "0"));
    setSubscribed(false);
    if (!user) return;
    const check = async () => {
      setLoadingSubscription(true);
      try {
        const snap = await getDocs(query(collection(db, "assinaturas"), where("email", "==", user.email)));
        setSubscribed(!snap.empty && snap.docs[0].data().plano === "pro");
      } catch (e) { console.error(e); }
      finally { setLoadingSubscription(false); }
    };
    check();
  }, [user]);

  const increment = () => { const n = count + 1; localStorage.setItem(key, n); setCount(n); };
  const remaining = subscribed ? Infinity : Math.max(0, CONFIG.LIMITE_GRATUITO - count);
  const canGenerate = subscribed || count < CONFIG.LIMITE_GRATUITO;
  return { subscribed, remaining, canGenerate, increment, loadingSubscription };
};

// ============================================================
// Form field definitions
// ============================================================
// Each field: key, label, placeholder, required, section, col (span), textarea
const FIELDS = [
  // --- Seus dados ---
  { key:"seuNome",     label:"Seu nome / empresa",   placeholder:"Ex: João Silva Consultoria",           section:"seus",    col:"full", required:true  },
  { key:"seuCnpj",     label:"CNPJ / CPF",            placeholder:"Ex: 12.345.678/0001-99",               section:"seus",    col:"half", required:false },
  { key:"seuContato",  label:"Telefone e e-mail",     placeholder:"Ex: (21) 99999-9999 | joao@email.com", section:"seus",    col:"half", required:false },
  // --- Cliente ---
  { key:"clienteNome", label:"Nome do cliente",       placeholder:"Ex: Empresa ABC Ltda",                 section:"cliente", col:"full", required:true  },
  { key:"clienteCnpj", label:"CNPJ do cliente",       placeholder:"Ex: 98.765.432/0001-11",               section:"cliente", col:"half", required:false },
  { key:"clienteContato", label:"Contato do cliente", placeholder:"Ex: Maria | (21) 98888-8888",           section:"cliente", col:"half", required:false },
  // endereço dividido
  { key:"clienteRua",    label:"Rua / Av.",           placeholder:"Ex: Av. Paulista",                     section:"cliente", col:"full", required:false },
  { key:"clienteNumero", label:"Número / Apto",       placeholder:"Ex: 1000 - Apto 42",                   section:"cliente", col:"half", required:false },
  { key:"clienteBairro", label:"Bairro",              placeholder:"Ex: Bela Vista",                       section:"cliente", col:"half", required:false },
  { key:"clienteCep",    label:"CEP",                 placeholder:"Ex: 01310-100",                        section:"cliente", col:"third",required:false },
  { key:"clienteCidade", label:"Cidade",              placeholder:"Ex: São Paulo",                        section:"cliente", col:"third",required:false },
  { key:"clienteEstado", label:"Estado",              placeholder:"Ex: SP",                               section:"cliente", col:"third",required:false },
  // --- Proposta ---
  { key:"servico",     label:"Serviço ou produto",    placeholder:"Ex: Desenvolvimento de site",          section:"proposta",col:"full", required:true  },
  { key:"valor",       label:"Valor da proposta",     placeholder:"Ex: R$ 5.000,00",                      section:"proposta",col:"half", required:true  },
  { key:"prazo",       label:"Prazo de entrega",      placeholder:"Ex: 30 dias úteis",                    section:"proposta",col:"half", required:true  },
  { key:"validade",    label:"Validade da proposta",  placeholder:"Ex: 15 dias",                          section:"proposta",col:"half", required:false },
  { key:"diferenciais",label:"Seus diferenciais (opcional)", placeholder:"Ex: 5 anos de experiência, suporte incluso...", section:"proposta", col:"full", required:false, textarea:true },
];

// ============================================================
// Markdown → HTML renderer
// ============================================================
function markdownToHtml(text, themeId) {
  const T = {
    escuro:{ h2:"#c8a96e", h3:"#f0e8d8", h4:"#b8a070", txt:"#d8d0c0", bold:"#f0e8d8", hr:"#2a2a3a", tdb:"#3a3a4a", tdhBg:"rgba(200,169,110,0.1)", bullet:"#c8a96e" },
    claro: { h2:"#7a5c14", h3:"#1a1a1a", h4:"#7a5c14", txt:"#333",    bold:"#111",    hr:"#e0d8c8", tdb:"#ddd",    tdhBg:"#f5f0e8",              bullet:"#7a5c14" },
    azul:  { h2:"#1d4ed8", h3:"#1e3a5f", h4:"#1d4ed8", txt:"#334155", bold:"#1e3a5f", hr:"#bfdbfe", tdb:"#bfdbfe", tdhBg:"#eff6ff",              bullet:"#1d4ed8" },
  };
  const c = T[themeId] || T.escuro;
  const inline = (s) => (s||"")
    .replace(/\*\*(.+?)\*\*/g, `<strong style="color:${c.bold}">$1</strong>`)
    .replace(/\*(.+?)\*/g, `<em>$1</em>`);

  const lines = text.replace(/\r\n/g,"\n").replace(/\r/g,"\n").split("\n");
  let html = "";
  let tbl = [];

  const flushTable = () => {
    if (!tbl.length) return;
    const rows = tbl.filter(r => !/^\|[\s\-|]+\|$/.test(r.trim()));
    html += `<table style="width:100%;border-collapse:collapse;margin:16px 0;font-family:Georgia,serif">`;
    rows.forEach((row, idx) => {
      const cells = row.split("|").slice(1,-1).map(c=>c.trim());
      if (!cells.length) return;
      const isH = idx === 0;
      const tag = isH ? "th" : "td";
      html += `<tr>${cells.map(cell=>`<${tag} style="padding:9px 13px;border:1px solid ${c.tdb};color:${c.txt};font-size:13px;text-align:left;${isH?`background:${c.tdhBg};font-weight:bold`:""}">${inline(cell)}</${tag}>`).join("")}</tr>`;
    });
    html += `</table>`;
    tbl = [];
  };

  for (const line of lines) {
    if (/^\s*\|/.test(line)) { tbl.push(line); continue; }
    else if (tbl.length) flushTable();

    if (/^---+$/.test(line.trim())) {
      html += `<hr style="border:none;border-top:1px solid ${c.hr};margin:28px 0"/>`;
    } else if (/^#{4} /.test(line)) {
      html += `<h4 style="font-size:13px;color:${c.h4};margin:14px 0 6px;font-weight:bold;font-family:Georgia,serif">${inline(line.slice(5))}</h4>`;
    } else if (/^#{3} /.test(line)) {
      html += `<h3 style="font-size:15px;color:${c.h3};margin:20px 0 8px;font-weight:bold;font-family:Georgia,serif">${inline(line.slice(4))}</h3>`;
    } else if (/^#{2} /.test(line)) {
      html += `<h2 style="font-size:12px;color:${c.h2};letter-spacing:2px;text-transform:uppercase;margin:32px 0 10px;font-weight:normal;font-family:Georgia,serif;border-bottom:1px solid ${c.hr};padding-bottom:6px">${inline(line.slice(3))}</h2>`;
    } else if (/^# /.test(line)) {
      html += `<h1 style="font-size:18px;color:${c.h3};margin:0 0 20px;font-weight:normal;font-family:Georgia,serif">${inline(line.slice(2))}</h1>`;
    } else if (/^\d+\. /.test(line)) {
      const num = line.match(/^\d+/)[0];
      html += `<div style="display:flex;gap:8px;margin:5px 0"><span style="color:${c.bullet};flex-shrink:0;min-width:18px;font-family:Georgia,serif">${num}.</span><span style="color:${c.txt};font-size:13px;line-height:1.7;font-family:Georgia,serif">${inline(line.replace(/^\d+\.\s*/,""))}</span></div>`;
    } else if (/^[-*] /.test(line)) {
      html += `<div style="display:flex;gap:8px;margin:5px 0"><span style="color:${c.bullet};flex-shrink:0;font-family:Georgia,serif">✓</span><span style="color:${c.txt};font-size:13px;line-height:1.7;font-family:Georgia,serif">${inline(line.slice(2))}</span></div>`;
    } else if (line.trim() === "") {
      html += `<div style="height:8px"></div>`;
    } else {
      html += `<p style="margin:5px 0;color:${c.txt};font-family:Georgia,serif;font-size:13px;line-height:1.8">${inline(line)}</p>`;
    }
  }
  if (tbl.length) flushTable();
  return html;
}

// ============================================================
// Copy as HTML (Word-compatible)
// ============================================================
async function copiarParaWord(proposta) {
  const htmlContent = markdownToHtml(proposta, "claro");
  const full = `<html><body style="font-family:Georgia,serif;color:#1a1a1a;max-width:800px;margin:0 auto;padding:20px"><h1 style="font-size:20px;font-weight:normal;margin-bottom:24px">Proposta Comercial</h1>${htmlContent}</body></html>`;
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([full], { type:"text/html" }) })]);
      return true;
    }
  } catch {}
  await navigator.clipboard.writeText(proposta);
  return false;
}

// ============================================================
// Layouts
// ============================================================
const LAYOUTS = [
  { id:"escuro", nome:"Elegante Escuro",       bg:"#0d0d14", border:"#2a2a3a", hBg:"linear-gradient(135deg,#1a1228,#0d0d14)", hAccent:"#c8a96e", hText:"#f0e8d8" },
  { id:"claro",  nome:"Profissional Claro",    bg:"#f7f4ef", border:"#e0d8c8", hBg:"linear-gradient(135deg,#1a1228,#2d2040)", hAccent:"#c8a96e", hText:"#ffffff" },
  { id:"azul",   nome:"Corporativo Azul",      bg:"#f0f4ff", border:"#bfdbfe", hBg:"linear-gradient(135deg,#1e3a5f,#1d4ed8)", hAccent:"#60a5fa", hText:"#ffffff" },
];

// ============================================================
// PDF Export
// ============================================================
function exportarPDF(proposta, layoutId, isPro) {
  const win = window.open("", "_blank");
  const hoje = new Date().toLocaleDateString("pt-BR");
  const PT = {
    escuro:{ accent:"#7a5c14", hBg:"#1a1228", hText:"#f0e8d8", aLight:"#c8a96e" },
    claro: { accent:"#7a5c14", hBg:"#1a1228", hText:"#ffffff",  aLight:"#c8a96e" },
    azul:  { accent:"#1e3a5f", hBg:"#1e3a5f", hText:"#ffffff",  aLight:"#60a5fa" },
  };
  const t = PT[layoutId] || PT.claro;
  const html = markdownToHtml(proposta, "claro");

  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Proposta Comercial</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Georgia,serif;background:#fff;color:#1a1a1a}
    .hdr{background:${t.hBg};color:${t.hText};padding:36px 60px}
    .hdr-title{font-size:22px;font-weight:normal}
    .hdr-date{font-size:11px;opacity:.6;margin-top:6px}
    .body{max-width:800px;margin:0 auto;padding:40px 60px 60px}
    h1{font-size:17px;font-weight:normal;margin-bottom:20px}
    h2{font-size:11px;color:${t.accent};letter-spacing:2px;text-transform:uppercase;margin:28px 0 8px;font-weight:normal;border-bottom:1px solid #eee;padding-bottom:5px}
    h3{font-size:14px;margin:16px 0 6px;font-weight:bold}
    h4{font-size:13px;color:${t.accent};margin:12px 0 5px;font-weight:bold}
    p{font-size:13px;line-height:1.85;color:#333;margin:5px 0}
    hr{border:none;border-top:1px solid #eee;margin:20px 0}
    table{width:100%;border-collapse:collapse;margin:14px 0}
    th{padding:9px 12px;border:1px solid #ddd;font-size:12px;background:#f5f5f0;text-align:left;font-weight:bold}
    td{padding:8px 12px;border:1px solid #ddd;font-size:12px}
    strong{color:#111}
    ${!isPro?`.wm{position:fixed;bottom:16px;left:0;right:0;text-align:center;font-size:9px;color:#ccc;letter-spacing:2px;text-transform:uppercase}`:""}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{margin:0}}
  </style></head><body>
  <div class="hdr"><div class="hdr-title">Proposta Comercial</div><div class="hdr-date">${hoje}</div></div>
  <div class="body">${html}</div>
  ${!isPro?`<div class="wm">Gerado com PropostaAI · Upgrade para PRO e remova esta marca</div>`:""}
  <script>window.onload=function(){window.print()}<\/script>
  </body></html>`);
  win.document.close();
}

// ============================================================
// Tela Login
// ============================================================
function TelaLogin({ onLogin, loading }) {
  return (
    <div style={S.loginWrap}>
      <div style={S.loginCard}>
        <div style={S.badge}>Produto Digital</div>
        <h1 style={S.loginTitle}>Propostas comerciais<br /><em style={{color:"#c8a96e"}}>profissionais em segundos</em></h1>
        <p style={S.loginSub}>IA cria propostas persuasivas para você fechar mais negócios. Comece grátis — {CONFIG.LIMITE_GRATUITO} propostas sem cartão.</p>
        <div style={S.beneficios}>
          {["✦ Proposta completa em &lt;30 segundos","✦ Tom profissional e persuasivo","✦ 3 propostas grátis para testar"].map((b,i)=>(
            <div key={i} style={S.beneficioItem} dangerouslySetInnerHTML={{__html:b}}/>
          ))}
        </div>
        <button onClick={onLogin} disabled={loading} style={S.btnGoogle}>
          {loading ? "Entrando..." : (<><svg width="18" height="18" viewBox="0 0 18 18" style={{marginRight:10}}>
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
          </svg>Entrar com Google</>)}
        </button>
        <p style={{color:"#444",fontSize:"11px",marginTop:"16px",textAlign:"center"}}>Sem cartão. Sem compromisso. Cancele quando quiser.</p>
      </div>
    </div>
  );
}

// ============================================================
// Tela Paywall
// ============================================================
function TelaPaywall({ onAssinar }) {
  return (
    <div style={S.paywallWrap}>
      <div style={S.paywallCard}>
        <div style={{fontSize:"32px",marginBottom:"16px"}}>🔒</div>
        <div style={S.badge}>Limite atingido</div>
        <h2 style={{fontSize:"26px",fontWeight:"normal",color:"#f0e8d8",margin:"16px 0 8px"}}>
          Você usou suas <em style={{color:"#c8a96e"}}>3 propostas grátis</em>
        </h2>
        <p style={{color:"#888",fontSize:"14px",marginBottom:"32px",lineHeight:1.7}}>
          Assine o plano Pro e gere propostas ilimitadas, sem marca d'água.
        </p>
        <div style={S.planoCard}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"20px"}}>
            <div>
              <div style={{fontSize:"13px",color:"#c8a96e",letterSpacing:"2px",textTransform:"uppercase"}}>Plano Pro</div>
              <div style={{fontSize:"32px",fontWeight:"bold",color:"#f0e8d8"}}>{CONFIG.PRECO}</div>
            </div>
            <div style={{fontSize:"11px",color:"#888",textAlign:"right"}}>Cancele<br/>quando quiser</div>
          </div>
          {["Propostas ilimitadas","PDF sem marca d'água","3 layouts exclusivos","Histórico completo","Suporte prioritário"].map((f,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"10px",color:"#d8d0c0",fontSize:"14px"}}>
              <span style={{color:"#c8a96e"}}>✓</span> {f}
            </div>
          ))}
        </div>
        <button onClick={onAssinar} style={S.btnPro}>Assinar por {CONFIG.PRECO} →</button>
        <p style={{color:"#333",fontSize:"11px",marginTop:"16px",textAlign:"center"}}>Pagamento seguro via Stripe · Cancele a qualquer momento</p>
      </div>
    </div>
  );
}

// ============================================================
// Tela App
// ============================================================
function TelaApp({ user, usage, onLogout }) {
  const [form, setForm]   = useState({});
  const [step, setStep]   = useState("dados");
  const [proposta, setProposta] = useState("");
  const [error, setError] = useState("");
  const [copyMsg, setCopyMsg] = useState("");
  const [layoutIdx, setLayoutIdx] = useState(0);
  const [avaliacao, setAvaliacao] = useState(0);
  const [avaliacaoHover, setAvaliacaoHover] = useState(0);
  const [comentario, setComentario] = useState("");
  const [avaliacaoEnviada, setAvaliacaoEnviada] = useState(false);
  const [avaliacaoAberta, setAvaliacaoAberta] = useState(false);
  const layout = LAYOUTS[layoutIdx];
  const hoje = new Date().toLocaleDateString("pt-BR");

  const isValid = FIELDS.filter(f=>f.required).every(f=>form[f.key]?.trim());

  const buildEndereco = () => {
    const parts = [
      form.clienteRua,
      form.clienteNumero ? `nº ${form.clienteNumero}` : null,
      form.clienteBairro,
      form.clienteCep,
      form.clienteCidade && form.clienteEstado ? `${form.clienteCidade} - ${form.clienteEstado}` : form.clienteCidade || form.clienteEstado,
    ].filter(Boolean);
    return parts.length ? parts.join(", ") : null;
  };

  const buildPrompt = () => {
    const f = form;
    const endereco = buildEndereco();
    const linhasSeus = [
      `- Nome/Empresa: ${f.seuNome}`,
      f.seuCnpj    ? `- CNPJ/CPF: ${f.seuCnpj}`    : null,
      f.seuContato ? `- Contato: ${f.seuContato}`   : null,
    ].filter(Boolean).join("\n");

    const linhasCliente = [
      `- Nome/Empresa: ${f.clienteNome}`,
      f.clienteCnpj    ? `- CNPJ: ${f.clienteCnpj}`       : null,
      f.clienteContato ? `- Contato: ${f.clienteContato}`  : null,
      endereco          ? `- Endereço: ${endereco}`         : null,
    ].filter(Boolean).join("\n");

    return `Você é um especialista em vendas B2B brasileiro. Gere uma proposta comercial profissional e COMPLETA em português do Brasil.

REGRAS OBRIGATÓRIAS:
1. Use ## para seções, ### para subseções, #### para itens, - ou 1. para listas
2. NUNCA use placeholders como [Inserir...] ou similares — se o dado não foi informado, OMITA o campo
3. Preencha TODOS os dados reais de identificação abaixo
4. Use **negrito** para destaques
5. Separe seções com ---
6. Gere a proposta COMPLETA até o final, incluindo PRÓXIMOS PASSOS e ASSINATURA

DADOS DO FORNECEDOR:
${linhasSeus}

DADOS DO CLIENTE:
${linhasCliente}

DETALHES:
- Serviço/Produto: ${f.servico}
- Valor: ${f.valor}
- Prazo de entrega: ${f.prazo}
- Validade da proposta: ${f.validade || "30 dias"}
- Data: ${hoje}
${f.diferenciais ? `- Diferenciais: ${f.diferenciais}` : ""}

SEÇÕES (todas com ##):
1. IDENTIFICAÇÃO — todos os dados reais do fornecedor e cliente
2. APRESENTAÇÃO — texto persuasivo personalizado
3. ENTENDIMENTO DA NECESSIDADE
4. ESCOPO DETALHADO — com ### e #### para subitens
5. INVESTIMENTO E FORMAS DE PAGAMENTO — tabela + 3 opções de pagamento
6. PRAZO E CRONOGRAMA — tabela com fases${f.diferenciais ? "\n7. NOSSOS DIFERENCIAIS" : ""}
${f.diferenciais ? "8" : "7"}. PRÓXIMOS PASSOS
${f.diferenciais ? "9" : "8"}. ASSINATURA`;
  };

  const gerar = async () => {
    if (!usage.canGenerate) return;
    setStep("gerando"); setError("");
    try {
      const res  = await fetch("/api/gerar-proposta", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({prompt:buildPrompt()}) });
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

  const handleCopy = async () => {
    const ok = await copiarParaWord(proposta);
    setCopyMsg(ok ? "✓ Copiado com formatação!" : "✓ Copiado (texto simples)");
    setTimeout(()=>setCopyMsg(""), 2500);
  };

  const enviarAvaliacao = async () => {
    if (!avaliacao) return;
    try {
      await addDoc(collection(db, "avaliacoes"), {
        email: user.email,
        nome: user.name,
        estrelas: avaliacao,
        comentario: comentario.trim(),
        plano: usage.subscribed ? "pro" : "gratuito",
        criadoEm: serverTimestamp(),
      });
      setAvaliacaoEnviada(true);
    } catch (e) { console.error(e); }
  };

  const LABELS_ESTRELAS = ["", "Péssimo", "Ruim", "Médio", "Bom", "Excelente"];

  if (usage.loadingSubscription) return (
    <div style={{minHeight:"100vh",background:"#0a0a0f",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{textAlign:"center"}}><div style={S.spinner}/><p style={{color:"#555",marginTop:"16px",fontSize:"13px",fontFamily:"Georgia,serif"}}>Verificando assinatura...</p></div>
    </div>
  );

  // Render a single field
  const RF = (f) => {
    const colStyle = f.col === "full" ? {gridColumn:"1/-1"} : f.col === "third" ? {} : {};
    return (
      <div key={f.key} style={colStyle}>
        <label style={S.label}>{f.label}{f.required && <span style={{color:"#e05555"}}> *</span>}</label>
        {f.textarea
          ? <textarea value={form[f.key]||""} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.placeholder} rows={3} style={{...S.input,resize:"vertical",minHeight:"80px"}}/>
          : <input    value={form[f.key]||""} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.placeholder} style={S.input} onFocus={e=>e.target.style.borderColor="#c8a96e"} onBlur={e=>e.target.style.borderColor="#2a2a3a"}/>
        }
      </div>
    );
  };

  const seuF     = FIELDS.filter(f=>f.section==="seus");
  const clienteF = FIELDS.filter(f=>f.section==="cliente");
  const propostaF= FIELDS.filter(f=>f.section==="proposta");

  // Grid columns: thirds for state/city/cep, halves for rest, full for full
  const gridForSection = (fields) => {
    const hasThird = fields.some(f=>f.col==="third");
    return hasThird ? "1fr 1fr 1fr" : "1fr 1fr";
  };

  return (
    <div style={{minHeight:"100vh",background:"#0a0a0f",fontFamily:"Georgia,serif"}}>
      {/* Topbar */}
      <div style={S.topbar}>
        <span style={{fontSize:"11px",letterSpacing:"3px",color:"#c8a96e",textTransform:"uppercase"}}>PropostaAI</span>
        <div style={{display:"flex",alignItems:"center",gap:"16px"}}>
          {!usage.subscribed && (
            <div style={{fontSize:"12px",color:"#888"}}>
              <span style={{color:usage.remaining<=1?"#e05555":"#c8a96e",fontWeight:"bold"}}>{usage.remaining}</span> proposta{usage.remaining!==1?"s":""} restante{usage.remaining!==1?"s":""}
            </div>
          )}
          {usage.subscribed && (
            <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
              <div style={{fontSize:"11px",color:"#c8a96e",letterSpacing:"1px"}}>✓ PRO</div>
              <button onClick={()=>window.open(CONFIG.STRIPE_PORTAL_LINK,"_blank")} style={S.btnGerenciar}>Gerenciar assinatura</button>
            </div>
          )}
          <div style={S.avatar}>{user.name[0]}</div>
          <button onClick={onLogout} style={S.btnSair}>Sair</button>
        </div>
      </div>

      <div style={{maxWidth:"760px",margin:"0 auto",padding:"48px 24px"}}>

        {/* ---- FORMULÁRIO ---- */}
        {step==="dados" && (
          <div>
            <h2 style={{fontSize:"28px",fontWeight:"normal",color:"#f0e8d8",marginBottom:"6px"}}>Nova proposta</h2>
            <p style={{color:"#666",fontSize:"14px",marginBottom:"36px"}}>Preencha os dados e a IA cria uma proposta profissional para você.</p>

            <div style={S.sectionLabel}>Seus dados</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"16px",marginBottom:"28px"}}>
              {seuF.map(RF)}
            </div>

            <div style={S.sectionLabel}>Dados do cliente</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"16px",marginBottom:"28px"}}>
              {clienteF.map(f => {
                const span = f.col==="full" ? {gridColumn:"1/-1"} : f.col==="half" ? {gridColumn:"span 2"} : {};
                return <div key={f.key} style={span}>
                  <label style={S.label}>{f.label}{f.required&&<span style={{color:"#e05555"}}> *</span>}</label>
                  <input value={form[f.key]||""} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.placeholder} style={S.input} onFocus={e=>e.target.style.borderColor="#c8a96e"} onBlur={e=>e.target.style.borderColor="#2a2a3a"}/>
                </div>;
              })}
            </div>

            <div style={S.sectionLabel}>Detalhes da proposta</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"16px"}}>
              {propostaF.map(RF)}
            </div>

            {error && <div style={{marginTop:"12px",color:"#e05555",fontSize:"13px"}}>{error}</div>}
            <button onClick={gerar} disabled={!isValid} style={{...S.btnPrimary,marginTop:"32px",opacity:isValid?1:0.4,cursor:isValid?"pointer":"not-allowed"}}>
              Gerar Proposta com IA →
            </button>
          </div>
        )}

        {/* ---- LOADING ---- */}
        {step==="gerando" && (
          <div style={S.loadingWrap}>
            <div style={S.spinner}/>
            <div style={{fontSize:"18px",color:"#f0e8d8"}}>Criando sua proposta...</div>
            <div style={{fontSize:"13px",color:"#555"}}>A IA está elaborando um documento persuasivo</div>
          </div>
        )}

        {/* ---- PROPOSTA ---- */}
        {step==="proposta" && (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"16px",flexWrap:"wrap",gap:"12px"}}>
              <div>
                <div style={{fontSize:"11px",letterSpacing:"2px",color:"#c8a96e",textTransform:"uppercase",marginBottom:"4px"}}>✓ Gerada com sucesso</div>
                <h2 style={{fontSize:"24px",fontWeight:"normal",color:"#f0e8d8",margin:0}}>Sua proposta está pronta</h2>
              </div>
              <div style={{display:"flex",gap:"8px",flexWrap:"wrap",alignItems:"center"}}>
                <button onClick={()=>setLayoutIdx((layoutIdx+1)%LAYOUTS.length)} style={{...S.btnOutline,fontSize:"11px"}}>🎨 {layout.nome}</button>
                <button onClick={handleCopy} style={{...S.btnPrimary,padding:"10px 18px",fontSize:"11px",width:"auto"}}>{copyMsg||"📋 Copiar para Word"}</button>
                <button onClick={()=>exportarPDF(proposta,layout.id,usage.subscribed)} style={{...S.btnPrimary,padding:"10px 18px",fontSize:"11px",width:"auto",background:"#1a5c1a"}}>📄 Exportar PDF</button>
                <button onClick={()=>{setStep("dados");setProposta("");}} style={S.btnOutline}>Nova</button>
              </div>
            </div>

            {!usage.subscribed && (
              <div style={{marginBottom:"16px",padding:"12px 16px",background:"rgba(200,169,110,0.08)",border:"1px solid rgba(200,169,110,0.2)",borderRadius:"6px",fontSize:"12px",color:"#c8a96e",display:"flex",alignItems:"center",justifyContent:"space-between",gap:"12px",flexWrap:"wrap"}}>
                <span>📄 PDF com marca d'água. <strong>Upgrade PRO</strong> para remover.</span>
                <button onClick={()=>window.open(CONFIG.STRIPE_PAYMENT_LINK,"_blank")} style={{background:"#c8a96e",color:"#0a0a0f",border:"none",borderRadius:"4px",padding:"6px 14px",fontSize:"11px",cursor:"pointer",fontWeight:"bold",letterSpacing:"1px",textTransform:"uppercase",fontFamily:"Georgia,serif",whiteSpace:"nowrap"}}>Assinar PRO</button>
              </div>
            )}

            {/* Documento com layout */}
            <div style={{background:layout.bg,border:`1px solid ${layout.border}`,borderRadius:"8px",overflow:"hidden",boxShadow:"0 4px 32px rgba(0,0,0,0.4)"}}>
              <div style={{background:layout.hBg,padding:"28px 40px",borderBottom:`2px solid ${layout.hAccent}`}}>
                <div style={{fontSize:"20px",fontWeight:"normal",color:layout.hText,fontFamily:"Georgia,serif"}}>Proposta Comercial</div>
                <div style={{fontSize:"11px",color:layout.hText,opacity:.5,marginTop:"4px"}}>{hoje}</div>
              </div>
              <div style={{padding:"36px 40px"}} dangerouslySetInnerHTML={{__html:markdownToHtml(proposta,layout.id)}}/>
            </div>

            <div style={S.dica}>💡 Use 🎨 para trocar o layout · "Copiar para Word" preserva a formatação · PRO remove marca d'água do PDF.</div>

            {/* ---- AVALIAÇÃO ---- */}
            {!avaliacaoEnviada ? (
              <div style={{marginTop:"24px",background:"rgba(255,255,255,0.02)",border:"1px solid #1e1e2e",borderRadius:"8px",padding:"24px 28px"}}>
                {!avaliacaoAberta ? (
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:"12px"}}>
                    <span style={{fontSize:"14px",color:"#888",fontFamily:"Georgia,serif"}}>Como foi sua experiência com a proposta gerada?</span>
                    <button onClick={()=>setAvaliacaoAberta(true)} style={{background:"none",border:"1px solid #2a2a3a",color:"#c8a96e",borderRadius:"4px",padding:"8px 16px",cursor:"pointer",fontSize:"12px",letterSpacing:"1px",fontFamily:"Georgia,serif"}}>
                      Avaliar ★
                    </button>
                  </div>
                ) : (
                  <div>
                    <p style={{fontSize:"13px",color:"#888",fontFamily:"Georgia,serif",marginBottom:"16px"}}>Como foi sua experiência?</p>
                    {/* Estrelas */}
                    <div style={{display:"flex",gap:"8px",marginBottom:"8px"}}>
                      {[1,2,3,4,5].map(n => (
                        <span
                          key={n}
                          onClick={()=>setAvaliacao(n)}
                          onMouseEnter={()=>setAvaliacaoHover(n)}
                          onMouseLeave={()=>setAvaliacaoHover(0)}
                          style={{fontSize:"36px",cursor:"pointer",transition:"all 0.15s",transform:(avaliacaoHover||avaliacao)>=n?"scale(1.2)":"scale(1)",userSelect:"none",color:(avaliacaoHover||avaliacao)>=n?"#f5c518":"#555",textShadow:(avaliacaoHover||avaliacao)>=n?"0 0 8px rgba(245,197,24,0.5)":"none"}}
                        >
                          ★
                        </span>
                      ))}
                    </div>
                    {/* Label da estrela */}
                    {(avaliacaoHover || avaliacao) > 0 && (
                      <p style={{fontSize:"12px",color:"#c8a96e",fontFamily:"Georgia,serif",marginBottom:"16px",letterSpacing:"1px"}}>
                        {LABELS_ESTRELAS[avaliacaoHover || avaliacao]}
                      </p>
                    )}
                    {/* Comentário */}
                    {avaliacao > 0 && (
                      <div style={{marginBottom:"16px"}}>
                        <textarea
                          value={comentario}
                          onChange={e=>setComentario(e.target.value)}
                          placeholder="Deixe um comentário (opcional)..."
                          rows={3}
                          style={{...S.input,resize:"vertical",minHeight:"80px",marginTop:"8px"}}
                        />
                      </div>
                    )}
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:"12px"}}>
                      <button
                        onClick={enviarAvaliacao}
                        disabled={!avaliacao}
                        style={{...S.btnPrimary,width:"auto",padding:"10px 24px",fontSize:"12px",opacity:avaliacao?1:0.4,cursor:avaliacao?"pointer":"not-allowed"}}
                      >
                        Enviar avaliação
                      </button>
                      <a
                        href="mailto:paulocesar2582@gmail.com?subject=Sugestão PropostaAI"
                        style={{fontSize:"12px",color:"#555",fontFamily:"Georgia,serif",textDecoration:"none",borderBottom:"1px solid #333"}}
                      >
                        Tem sugestões? Envie um e-mail →
                      </a>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{marginTop:"24px",background:"rgba(200,169,110,0.06)",border:"1px solid rgba(200,169,110,0.2)",borderRadius:"8px",padding:"20px 28px",display:"flex",alignItems:"center",gap:"12px"}}>
                <span style={{fontSize:"24px"}}>🙏</span>
                <div>
                  <p style={{fontSize:"14px",color:"#c8a96e",fontFamily:"Georgia,serif",marginBottom:"4px"}}>Obrigado pela avaliação!</p>
                  <p style={{fontSize:"12px",color:"#555",fontFamily:"Georgia,serif"}}>Seu feedback nos ajuda a melhorar cada vez mais.</p>
                </div>
              </div>
            )}
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
  const {user,loadingAuth,loginGoogle,logout} = useAuth();
  const usage = useUsage(user);
  const [showPaywall,setShowPaywall] = useState(false);

  useEffect(()=>{
    if (user && !usage.loadingSubscription && !usage.canGenerate) setShowPaywall(true);
    else setShowPaywall(false);
  },[usage.canGenerate,usage.loadingSubscription,user]);

  if (loadingAuth) return (
    <div style={{minHeight:"100vh",background:"#0a0a0f",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={S.spinner}/>
    </div>
  );

  if (!user)        return <TelaLogin onLogin={loginGoogle} loading={loadingAuth}/>;
  if (showPaywall)  return <TelaPaywall onAssinar={()=>window.open(CONFIG.STRIPE_PAYMENT_LINK,"_blank")}/>;
  return <TelaApp user={user} usage={usage} onLogout={logout}/>;
}

// ============================================================
// Estilos
// ============================================================
const S = {
  loginWrap:    {minHeight:"100vh",background:"#0a0a0f",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px",fontFamily:"Georgia,serif"},
  loginCard:    {maxWidth:"460px",width:"100%",background:"rgba(255,255,255,0.03)",border:"1px solid #1e1e2e",borderRadius:"8px",padding:"48px 40px",textAlign:"center"},
  badge:        {display:"inline-block",fontSize:"10px",letterSpacing:"3px",textTransform:"uppercase",color:"#c8a96e",border:"1px solid rgba(200,169,110,0.3)",padding:"4px 12px",borderRadius:"2px",marginBottom:"24px"},
  loginTitle:   {fontSize:"clamp(22px,4vw,32px)",fontWeight:"normal",color:"#f0e8d8",lineHeight:1.3,marginBottom:"16px"},
  loginSub:     {color:"#888",fontSize:"14px",lineHeight:1.7,marginBottom:"28px"},
  beneficios:   {textAlign:"left",marginBottom:"32px",background:"rgba(200,169,110,0.05)",borderRadius:"4px",padding:"16px 20px"},
  beneficioItem:{color:"#b0a890",fontSize:"13px",marginBottom:"8px"},
  btnGoogle:    {width:"100%",padding:"14px",background:"#fff",color:"#222",border:"none",borderRadius:"4px",fontSize:"14px",fontWeight:"bold",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Georgia,serif"},
  paywallWrap:  {minHeight:"100vh",background:"#0a0a0f",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px",fontFamily:"Georgia,serif"},
  paywallCard:  {maxWidth:"440px",width:"100%",textAlign:"center",background:"rgba(255,255,255,0.03)",border:"1px solid #1e1e2e",borderRadius:"8px",padding:"48px 36px"},
  planoCard:    {background:"rgba(200,169,110,0.06)",border:"1px solid rgba(200,169,110,0.2)",borderRadius:"6px",padding:"24px",marginBottom:"20px",textAlign:"left"},
  btnPro:       {width:"100%",padding:"16px",background:"#c8a96e",color:"#0a0a0f",border:"none",borderRadius:"4px",fontSize:"13px",letterSpacing:"2px",textTransform:"uppercase",cursor:"pointer",fontWeight:"bold",fontFamily:"Georgia,serif",marginBottom:"10px"},
  topbar:       {display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 32px",borderBottom:"1px solid #1a1a2a",background:"rgba(255,255,255,0.02)",fontFamily:"Georgia,serif"},
  avatar:       {width:"30px",height:"30px",background:"#c8a96e",color:"#0a0a0f",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"13px",fontWeight:"bold"},
  btnSair:      {background:"none",border:"none",color:"#555",fontSize:"12px",cursor:"pointer",fontFamily:"Georgia,serif"},
  btnGerenciar: {background:"none",border:"1px solid #2a2a3a",color:"#888",fontSize:"11px",padding:"4px 10px",borderRadius:"4px",cursor:"pointer",fontFamily:"Georgia,serif"},
  sectionLabel: {fontSize:"10px",letterSpacing:"3px",textTransform:"uppercase",color:"#c8a96e",marginBottom:"14px",paddingBottom:"8px",borderBottom:"1px solid #1a1a2a"},
  label:        {display:"block",fontSize:"10px",letterSpacing:"2px",textTransform:"uppercase",color:"#c8a96e",marginBottom:"8px",fontFamily:"Georgia,serif"},
  input:        {width:"100%",background:"rgba(255,255,255,0.04)",border:"1px solid #2a2a3a",borderRadius:"4px",padding:"13px 15px",color:"#e8e0d0",fontSize:"14px",fontFamily:"Georgia,serif",outline:"none",boxSizing:"border-box",transition:"border-color 0.2s"},
  btnPrimary:   {width:"100%",padding:"16px",background:"#c8a96e",color:"#0a0a0f",border:"none",borderRadius:"4px",fontSize:"12px",letterSpacing:"2px",textTransform:"uppercase",cursor:"pointer",fontWeight:"bold",fontFamily:"Georgia,serif"},
  btnOutline:   {padding:"10px 18px",background:"transparent",color:"#888",border:"1px solid #2a2a3a",borderRadius:"4px",fontSize:"11px",letterSpacing:"1px",cursor:"pointer",fontFamily:"Georgia,serif"},
  loadingWrap:  {display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"400px",gap:"20px",textAlign:"center"},
  spinner:      {width:"44px",height:"44px",border:"2px solid #1e1e2e",borderTop:"2px solid #c8a96e",borderRadius:"50%",animation:"spin 1s linear infinite"},
  dica:         {marginTop:"20px",padding:"14px 18px",background:"rgba(200,169,110,0.07)",border:"1px solid rgba(200,169,110,0.15)",borderRadius:"4px",fontSize:"13px",color:"#c8a96e",fontFamily:"Georgia,serif"},
};

if (typeof document !== "undefined") {
  const s = document.createElement("style");
  s.textContent = `@keyframes spin{to{transform:rotate(360deg)}}*{box-sizing:border-box;margin:0;padding:0}body{background:#0a0a0f}input::placeholder,textarea::placeholder{color:#383838}::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:#0a0a0f}::-webkit-scrollbar-thumb{background:#2a2a3a;border-radius:3px}`;
  document.head.appendChild(s);
}
