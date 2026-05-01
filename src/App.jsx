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
      const result = await signInWithPopup(auth, provider);
      if (result?.user) setUser({ name: result.user.displayName || result.user.email, email: result.user.email });
    } catch (e) {
      // Fallback para redirect se popup for bloqueado
      if (e.code === "auth/popup-blocked" || e.code === "auth/popup-closed-by-user") {
        await signInWithRedirect(auth, provider);
      } else {
        console.error(e);
      }
    }
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
// Hook de Depoimentos — busca avaliações reais do Firestore
// ============================================================
const useDepoimentos = () => {
  const [depoimentos, setDepoimentos] = useState([]);

  useEffect(() => {
    const buscar = async () => {
      try {
        const snap = await getDocs(collection(db, "avaliacoes"));
        const todos = snap.docs
          .map(d => d.data())
          .filter(d => d.estrelas >= 4 && d.comentario && d.comentario.trim().length > 10)
          .sort((a, b) => (b.criadoEm?.seconds || 0) - (a.criadoEm?.seconds || 0))
          .slice(0, 3);
        setDepoimentos(todos);
      } catch (e) { console.error(e); }
    };
    buscar();
  }, []);

  return depoimentos;
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
    .replace(/\*(.+?)\*/g, `<em>$1</em>`)
    .replace(/\\_/g, "_")
    .replace(/_{3,}/g, '<span style="display:inline-block;border-bottom:1px solid currentColor;min-width:min(260px,60%);margin:0 4px">&nbsp;</span>');

  // Strip leading #### from a string (when IA mixes bullet + heading)
  const stripHashes = (s) => s.replace(/^#{1,4}\s*/, "");

  const lines = text.replace(/\r\n/g,"\n").replace(/\r/g,"\n").split("\n");
  let html = "";
  let tbl = [];

  const flushTable = () => {
    if (!tbl.length) return;
    // Filter separator rows: pure --- lines and rows where ALL cells are --- or ---:
    const rows = tbl.filter(r => {
      if (/^\|[\s\-|:]+\|$/.test(r.trim())) return false;
      const cells = r.split("|").slice(1,-1).map(c=>c.trim());
      if (cells.every(c => /^-+:?$/.test(c))) return false;
      return true;
    });
    if (!rows.length) { tbl = []; return; }
    html += `<table style="width:100%;border-collapse:collapse;margin:16px 0;font-family:Georgia,serif;word-break:normal">`;
    rows.forEach((row, idx) => {
      const cells = row.split("|").slice(1,-1).map(c=>c.trim());
      if (!cells.length) return;
      const isH = idx === 0;
      const tag = isH ? "th" : "td";
      if (isH) html += "<thead>";
      html += `<tr>${cells.map(cell=>
        `<${tag} style="padding:9px 13px;border:1px solid ${c.tdb};color:${c.txt};font-size:13px;text-align:left;word-wrap:break-word;white-space:normal;${isH?`background:${c.tdhBg};font-weight:bold`:""}">${inline(stripHashes(cell))}</${tag}>`
      ).join("")}</tr>`;
      if (isH) html += "</thead><tbody>";
    });
    html += `</tbody></table>`;
    tbl = [];
  };

  for (const line of lines) {
    if (/^\s*\|/.test(line)) { tbl.push(line); continue; }
    else if (tbl.length) flushTable();

    // Clean line — strip leading hashes that appear mid-list (e.g. "- #### text")
    const trimmed = line.trim();

    if (/^---+$/.test(trimmed)) {
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
      const txt = stripHashes(line.replace(/^\d+\.\s*/,""));
      html += `<div style="display:flex;gap:8px;margin:5px 0"><span style="color:${c.bullet};flex-shrink:0;min-width:18px;font-family:Georgia,serif">${num}.</span><span style="color:${c.txt};font-size:13px;line-height:1.7;font-family:Georgia,serif">${inline(txt)}</span></div>`;
    } else if (/^[-*] /.test(line)) {
      const txt = stripHashes(line.slice(2));
      html += `<div style="display:flex;gap:8px;margin:5px 0"><span style="color:${c.bullet};flex-shrink:0;font-family:Georgia,serif">✓</span><span style="color:${c.txt};font-size:13px;line-height:1.7;font-family:Georgia,serif">${inline(txt)}</span></div>`;
    } else if (trimmed === "") {
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
  const hoje = new Date().toLocaleDateString("pt-BR");
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (mobile) {
    alert("Para exportar o PDF com melhor qualidade, acesse pelo computador. No celular, use o botão 📋 Copiar para Word e cole em um editor de texto.");
    return;
  }
  const PT = {
    escuro:{ accent:"#7a5c14", hBg:"#1a1228", hText:"#f0e8d8", aLight:"#c8a96e" },
    claro: { accent:"#7a5c14", hBg:"#1a1228", hText:"#ffffff",  aLight:"#c8a96e" },
    azul:  { accent:"#1e3a5f", hBg:"#1e3a5f", hText:"#ffffff",  aLight:"#60a5fa" },
  };
  const t = PT[layoutId] || PT.claro;
  const html = markdownToHtml(proposta, "claro");

  const htmlStr = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Proposta Comercial</title>
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
    table{width:100%;border-collapse:collapse;margin:14px 0;table-layout:fixed}
    thead{display:table-header-group}
    th{padding:9px 12px;border:1px solid #ddd;font-size:12px;background:#f5f5f0;text-align:left;font-weight:bold;word-wrap:break-word;white-space:normal}
    td{padding:8px 12px;border:1px solid #ddd;font-size:12px;word-wrap:break-word;white-space:normal}
    strong{color:#111}
    .sig-line{display:inline-block;border-bottom:1px solid #333;min-width:280px;margin:0 4px}
    ${!isPro?`.wm{position:fixed;bottom:16px;left:0;right:0;text-align:center;font-size:9px;color:#ccc;letter-spacing:2px;text-transform:uppercase}`:""}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body>
  <div class="hdr"><div class="hdr-title">Proposta Comercial</div><div class="hdr-date">${hoje}</div></div>
  <div class="body">${html}</div>
  ${!isPro?`<div class="wm">Gerado com PropostaAI · Upgrade para PRO e remova esta marca</div>`:""}
  <script>
    window.onload = function() {
      window.print();
    };
    window.onafterprint = function() { window.close(); };
  <\/script>
  </body></html>`;
  const win = window.open("", "_blank");
  win.document.write(htmlStr);
  win.document.close();
}


// ============================================================
// Modal de Termos de Uso
// ============================================================
function TermosModal({ onAceitar, onRecusar }) {
  const [lido, setLido] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const handleScroll = (e) => {
    const el = e.target;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) setScrolled(true);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:"24px",fontFamily:"Georgia,serif"}}>
      <div style={{maxWidth:"600px",width:"100%",background:"#0d0d14",border:"1px solid #2a2a3a",borderRadius:"8px",display:"flex",flexDirection:"column",maxHeight:"90vh"}}>
        
        {/* Header */}
        <div style={{padding:"28px 32px 20px",borderBottom:"1px solid #1a1a2a"}}>
          <div style={{fontSize:"10px",letterSpacing:"3px",color:"#c8a96e",textTransform:"uppercase",marginBottom:"8px"}}>PropostaAI</div>
          <h2 style={{fontSize:"20px",fontWeight:"normal",color:"#f0e8d8",margin:0}}>Termos de Uso e Política de Privacidade</h2>
          <p style={{color:"#666",fontSize:"12px",marginTop:"6px"}}>Leia com atenção antes de continuar</p>
        </div>

        {/* Conteúdo rolável */}
        <div onScroll={handleScroll} style={{overflowY:"auto",padding:"24px 32px",flex:1,scrollbarWidth:"thin",scrollbarColor:"#2a2a3a #0d0d14"}}>
          {[
            {titulo:"1. Aceitação dos Termos", texto:"Ao utilizar o PropostaAI (fecharproposta.com.br), você declara ter lido, compreendido e aceito integralmente os presentes Termos de Uso. Caso não concorde com qualquer disposição, interrompa imediatamente o uso da plataforma."},
            {titulo:"2. Coleta e Uso de Informações", texto:"O PropostaAI coleta informações fornecidas voluntariamente pelo usuário, incluindo nome, e-mail, dados da empresa, dados do cliente e demais informações inseridas nos formulários. Essas informações são utilizadas exclusivamente para geração das propostas comerciais solicitadas e melhoria dos serviços oferecidos."},
            {titulo:"3. Responsabilidade pelo Conteúdo", texto:"O usuário é o único e exclusivo responsável pelo conteúdo das informações inseridas na plataforma, bem como pelas propostas geradas. O PropostaAI não se responsabiliza pela veracidade, precisão, legalidade ou adequação das informações fornecidas pelo usuário, nem pelo uso que este fizer das propostas geradas."},
            {titulo:"4. Isenção de Responsabilidade", texto:"O PropostaAI não garante que as propostas geradas pela inteligência artificial sejam adequadas para qualquer finalidade específica, negociação ou contexto jurídico. O conteúdo gerado é de caráter orientativo e não substitui assessoria jurídica, contábil ou comercial especializada. O usuário assume total responsabilidade pelo uso e envio das propostas geradas."},
            {titulo:"5. Dados de Terceiros", texto:"Ao inserir dados de terceiros (clientes, parceiros, colaboradores) na plataforma, o usuário declara possuir autorização para tal e assume total responsabilidade pelo tratamento dessas informações, em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018)."},
            {titulo:"6. Propriedade Intelectual", texto:"As propostas geradas pertencem ao usuário que as criou. O PropostaAI retém direitos sobre a plataforma, interface, algoritmos e tecnologia empregada, não concedendo ao usuário qualquer direito sobre esses elementos."},
            {titulo:"7. Pagamentos e Assinatura", texto:"Os planos pagos são processados de forma segura pela plataforma Stripe. O PropostaAI não armazena dados de cartão de crédito. O cancelamento pode ser realizado a qualquer momento pelo usuário, sem multa, com efeito ao final do período contratado."},
            {titulo:"8. Limitação de Responsabilidade", texto:"Em nenhuma hipótese o PropostaAI será responsável por danos diretos, indiretos, incidentais, especiais ou consequentes decorrentes do uso ou impossibilidade de uso da plataforma, mesmo que previamente advertido sobre tal possibilidade."},
            {titulo:"9. Alterações nos Termos", texto:"O PropostaAI reserva-se o direito de modificar estes Termos a qualquer momento. As alterações entrarão em vigor imediatamente após sua publicação na plataforma. O uso continuado após as alterações implica aceitação dos novos termos."},
            {titulo:"10. Contato", texto:"Em caso de dúvidas sobre estes Termos, entre em contato pelo e-mail: paulocesar2582@gmail.com"},
          ].map((item, i) => (
            <div key={i} style={{marginBottom:"20px"}}>
              <h3 style={{fontSize:"13px",color:"#c8a96e",fontWeight:"bold",marginBottom:"8px",fontFamily:"Georgia,serif"}}>{item.titulo}</h3>
              <p style={{fontSize:"12px",color:"#999",lineHeight:"1.8",fontFamily:"Georgia,serif"}}>{item.texto}</p>
            </div>
          ))}
          {!scrolled && (
            <div style={{textAlign:"center",color:"#555",fontSize:"11px",letterSpacing:"1px",padding:"8px 0"}}>▼ Role para baixo para continuar</div>
          )}
        </div>

        {/* Checkbox + Botões */}
        <div style={{padding:"20px 32px 28px",borderTop:"1px solid #1a1a2a"}}>
          <label style={{display:"flex",alignItems:"flex-start",gap:"12px",cursor:"pointer",marginBottom:"20px"}}>
            <input
              type="checkbox"
              checked={lido}
              onChange={e=>setLido(e.target.checked)}
              style={{width:"16px",height:"16px",marginTop:"2px",accentColor:"#c8a96e",cursor:"pointer",flexShrink:0}}
            />
            <span style={{fontSize:"12px",color:"#888",lineHeight:"1.7",fontFamily:"Georgia,serif"}}>
              Li e concordo com os Termos de Uso e Política de Privacidade do PropostaAI, incluindo a coleta de informações e a isenção de responsabilidade pelo conteúdo gerado.
            </span>
          </label>
          <div style={{display:"flex",gap:"12px"}}>
            <button
              onClick={onAceitar}
              disabled={!lido}
              style={{flex:1,padding:"14px",background:lido?"#c8a96e":"#2a2a3a",color:lido?"#0a0a0f":"#555",border:"none",borderRadius:"4px",fontSize:"12px",letterSpacing:"2px",textTransform:"uppercase",cursor:lido?"pointer":"not-allowed",fontWeight:"bold",fontFamily:"Georgia,serif",transition:"all 0.2s"}}
            >
              Concordo
            </button>
            <button
              onClick={onRecusar}
              style={{flex:1,padding:"14px",background:"transparent",color:"#555",border:"1px solid #2a2a3a",borderRadius:"4px",fontSize:"12px",letterSpacing:"2px",textTransform:"uppercase",cursor:"pointer",fontFamily:"Georgia,serif"}}
            >
              Não concordo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Tela Recusou Termos
// ============================================================
function TelaTermosRecusados({ onVoltar }) {
  return (
    <div style={{minHeight:"100vh",background:"#0a0a0f",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px",fontFamily:"Georgia,serif"}}>
      <div style={{maxWidth:"440px",width:"100%",textAlign:"center"}}>
        <div style={{fontSize:"48px",marginBottom:"24px"}}>🔒</div>
        <h2 style={{fontSize:"22px",fontWeight:"normal",color:"#f0e8d8",marginBottom:"12px"}}>Acesso não autorizado</h2>
        <p style={{color:"#666",fontSize:"14px",lineHeight:"1.8",marginBottom:"32px"}}>
          Para utilizar o PropostaAI é necessário aceitar os Termos de Uso e Política de Privacidade.<br/><br/>
          Se mudar de ideia, clique no botão abaixo para rever os termos.
        </p>
        <button onClick={onVoltar} style={{padding:"14px 32px",background:"transparent",color:"#c8a96e",border:"1px solid #c8a96e",borderRadius:"4px",fontSize:"12px",letterSpacing:"2px",textTransform:"uppercase",cursor:"pointer",fontFamily:"Georgia,serif"}}>
          Rever os termos
        </button>
      </div>
    </div>
  );
}


const Depoimento = () => (
  <div style={{background:"rgba(200,169,110,0.06)",border:"1px solid rgba(200,169,110,0.15)",borderRadius:"6px",padding:"16px 20px",marginBottom:"24px",textAlign:"left"}}>
    <div style={{display:"flex",gap:"2px",marginBottom:"8px"}}>
      {[1,2,3,4,5].map(i=><span key={i} style={{color:"#f5c518",fontSize:"14px"}}>★</span>)}
    </div>
    <p style={{fontSize:"13px",color:"#b0a890",lineHeight:"1.8",fontStyle:"italic",marginBottom:"10px",fontFamily:"Georgia,serif"}}>
      "Eu costumava gastar horas montando propostas no Word. Com o PropostaAI fechei um contrato de <strong style={{color:"#c8a96e",fontStyle:"normal"}}>R$ 18.000 em menos de 24 horas</strong>. Gerei a proposta em 30 segundos, exportei o PDF e enviei direto. O cliente disse que foi a proposta mais profissional que já recebeu."
    </p>
    <div style={{fontSize:"11px",color:"#555",letterSpacing:"1px",fontFamily:"Georgia,serif"}}>
      — Paulo César Rezende · Consultor de Negócios
    </div>
  </div>
);


// ============================================================
// Seção de Depoimentos Reais
// ============================================================
function DepoimentosReais({ depoimentos }) {
  const [atual, setAtual] = useState(0);

  useEffect(() => {
    if (depoimentos.length <= 1) return;
    const t = setInterval(() => setAtual(i => (i + 1) % depoimentos.length), 4000);
    return () => clearInterval(t);
  }, [depoimentos.length]);

  if (!depoimentos.length) return null;

  const LABELS = ["", "Péssimo", "Ruim", "Médio", "Bom", "Excelente"];
  const d = depoimentos[atual];

  return (
    <div style={{marginBottom:"28px"}}>
      <div style={{fontSize:"10px",letterSpacing:"3px",color:"#555",textTransform:"uppercase",textAlign:"center",marginBottom:"16px",fontFamily:"Georgia,serif"}}>
        O que dizem nossos usuários
      </div>

      {/* Card principal */}
      <div style={{background:"rgba(200,169,110,0.06)",border:"1px solid rgba(200,169,110,0.2)",borderRadius:"8px",padding:"20px 22px",position:"relative",minHeight:"120px",transition:"all 0.4s"}}>
        {/* Aspas decorativas */}
        <div style={{position:"absolute",top:"12px",left:"18px",fontSize:"48px",color:"rgba(200,169,110,0.15)",lineHeight:1,fontFamily:"Georgia,serif",userSelect:"none"}}>"</div>

        {/* Estrelas */}
        <div style={{display:"flex",gap:"2px",marginBottom:"10px",justifyContent:"center"}}>
          {[1,2,3,4,5].map(i => (
            <span key={i} style={{fontSize:"15px",color:i<=d.estrelas?"#f5c518":"#333"}}>★</span>
          ))}
          <span style={{fontSize:"11px",color:"#c8a96e",marginLeft:"6px",fontFamily:"Georgia,serif",letterSpacing:"1px"}}>{LABELS[d.estrelas]}</span>
        </div>

        {/* Comentário */}
        <p style={{fontSize:"13px",color:"#b0a890",lineHeight:"1.8",fontStyle:"italic",textAlign:"center",fontFamily:"Georgia,serif",padding:"0 12px",marginBottom:"12px"}}>
          "{d.comentario}"
        </p>

        {/* Nome */}
        <div style={{textAlign:"center",fontSize:"11px",color:"#555",letterSpacing:"1px",fontFamily:"Georgia,serif"}}>
          — {d.nome || d.email?.split("@")[0] || "Usuário PropostaAI"}
          {d.plano === "pro" && <span style={{marginLeft:"8px",color:"#c8a96e",fontSize:"10px",border:"1px solid rgba(200,169,110,0.3)",padding:"1px 6px",borderRadius:"2px",letterSpacing:"1px"}}>PRO</span>}
        </div>
      </div>

      {/* Indicadores de navegação */}
      {depoimentos.length > 1 && (
        <div style={{display:"flex",justifyContent:"center",gap:"6px",marginTop:"12px"}}>
          {depoimentos.map((_, i) => (
            <div
              key={i}
              onClick={() => setAtual(i)}
              style={{width:i===atual?"20px":"6px",height:"6px",borderRadius:"3px",background:i===atual?"#c8a96e":"#2a2a3a",cursor:"pointer",transition:"all 0.3s"}}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Tela Login
// ============================================================
function TelaLogin({ onLogin, loading, depoimentos }) {
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
        <DepoimentosReais depoimentos={depoimentos}/>
        <Depoimento/>
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
        <Depoimento/>
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
7. Na seção ASSINATURA, deixe os campos de nome, cargo e data como linhas em branco (use underscores: _______________) — NUNCA use [A completar], [Data], [Nome] ou qualquer placeholder entre colchetes

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
  const depoimentos = useDepoimentos();
  const [showPaywall,setShowPaywall] = useState(false);
  const [termosStatus, setTermosStatus] = useState(() => {
    // "pendente" | "aceito" | "recusado"
    return localStorage.getItem("termos_aceito") === "true" ? "aceito" : "pendente";
  });

  useEffect(()=>{
    if (user && !usage.loadingSubscription && !usage.canGenerate) setShowPaywall(true);
    else setShowPaywall(false);
  },[usage.canGenerate,usage.loadingSubscription,user]);

  const handleAceitarTermos = () => {
    localStorage.setItem("termos_aceito", "true");
    setTermosStatus("aceito");
  };

  const handleRecusarTermos = () => {
    localStorage.removeItem("termos_aceito");
    setTermosStatus("recusado");
  };

  if (loadingAuth) return (
    <div style={{minHeight:"100vh",background:"#0a0a0f",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={S.spinner}/>
    </div>
  );

  // Termos não aceitos ainda
  if (termosStatus === "pendente") return (
    <>
      <div style={{minHeight:"100vh",background:"#0a0a0f"}}/>
      <TermosModal onAceitar={handleAceitarTermos} onRecusar={handleRecusarTermos}/>
    </>
  );

  // Recusou os termos
  if (termosStatus === "recusado") return (
    <TelaTermosRecusados onVoltar={()=>setTermosStatus("pendente")}/>
  );

  if (!user)        return <TelaLogin onLogin={loginGoogle} loading={loadingAuth} depoimentos={depoimentos}/>;
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
  s.textContent = `
    @keyframes spin{to{transform:rotate(360deg)}}
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0a0a0f}
    input::placeholder,textarea::placeholder{color:#383838}
    ::-webkit-scrollbar{width:5px}
    ::-webkit-scrollbar-track{background:#0a0a0f}
    ::-webkit-scrollbar-thumb{background:#2a2a3a;border-radius:3px}
    @media(max-width:600px){
      table{display:block;overflow-x:auto;-webkit-overflow-scrolling:touch;white-space:nowrap;font-size:11px}
      th,td{min-width:80px;padding:6px 8px!important;white-space:nowrap}
    }
  `;
  document.head.appendChild(s);
}
