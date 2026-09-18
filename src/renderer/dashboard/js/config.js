// dashboard/js/config.js — histórico rápido, atalho, API key, config, orbe, pareamento, controles da janela.
//
// Era um trecho do <script> único do dashboard.html (bloco 76). Scripts clássicos, não
// módulos: o escopo global é um só, e a ORDEM dos <script> no HTML é a ordem em que o
// código estava. Função declarada aqui pode ser chamada de qualquer arquivo em tempo de
// execução; chamada SÍNCRONA no nível do arquivo só pode apontar para arquivo anterior.

// ─────────────────────────────────────────────────
// QUICK / HISTORY
// ─────────────────────────────────────────────────
const quickWrap = document.getElementById("quick-wrap");

async function loadHistory() {
  try {
    const history = await window.nx.getHistory();
    quickWrap.innerHTML = "";
    (history || []).slice(0, 5).forEach(h => {
      const pill = document.createElement("span");
      pill.className = "quick-pill";
      pill.textContent = (h.icon ?? "") + " " + (h.label ?? h.text ?? "");
      pill.title = h.text ?? "";
      pill.addEventListener("click", () => {
        const text = h.text ?? pill.textContent.trim();
        addBubble("user", text);
        window.nx.chatSend(text);
      });
      quickWrap.appendChild(pill);
    });
  } catch { /* ignore */ }
}

// ─────────────────────────────────────────────────
// SHORTCUT CAPTURE
// ─────────────────────────────────────────────────
const shortcutInput = document.getElementById("shortcut-input");
const shortcutHint  = document.getElementById("shortcut-hint");

shortcutInput.addEventListener("focus", () => {
  shortcutInput.value = "";
  shortcutHint.textContent = "Pressione a combinação de teclas…";
});
shortcutInput.addEventListener("blur", () => {
  shortcutHint.textContent = "Clique e pressione a combinação";
});
shortcutInput.addEventListener("keydown", async (e) => {
  e.preventDefault();
  if (e.key === "Escape") { shortcutInput.blur(); return; }
  const parts = [];
  if (e.ctrlKey)  parts.push("Control");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey)   parts.push("Alt");
  const k = e.key;
  if (!["Control","Shift","Alt","Meta"].includes(k)) {
    parts.push(k.length === 1 ? k.toUpperCase() : k);
  }
  if (parts.length < 2) return;
  const combo = parts.join("+");
  shortcutInput.value = combo;
  shortcutInput.blur();
  shortcutHint.textContent = "Salvo: " + combo;
  try { await window.nx.setConfig({ shortcut: combo }); } catch { /* ignore */ }
});

// ─────────────────────────────────────────────────
// API KEY
// ─────────────────────────────────────────────────
const apikeyInput = document.getElementById("apikey-input");
const apikeySave  = document.getElementById("apikey-save");

async function loadApiKey() {
  try {
    const k = await window.nx.getApiKey();
    if (k) apikeyInput.value = k.slice(0, 8) + "…";
  } catch { /* ignore */ }
}

apikeySave.addEventListener("click", async () => {
  const k = apikeyInput.value.trim();
  if (!k || k.endsWith("…")) return;
  try {
    await window.nx.setApiKey(k);
    apikeyInput.value = k.slice(0, 8) + "…";
    addBubble("system", "API key salva.");
  } catch { addBubble("error", "Falha ao salvar API key."); }
});

// ─────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────
async function loadConfig() {
  try {
    const cfg = await window.nx.getConfig();
    document.documentElement.dataset.movimento = cfg.movimento ?? "auto";
    desenharAjustes(cfg);
    const cidade = document.getElementById("clima-atual");
    if (cidade) cidade.textContent = cfg.climaCidade || "não definida";
    if (cfg.shortcut) shortcutInput.value = cfg.shortcut;
    applyTheme(cfg.theme);
  } catch {
    applyTheme(FALLBACK_THEME);
  }
}

// ─────────────────────────────────────────────────
// GAVETA DA DIREITA
// ─────────────────────────────────────────────────
//
// Sobrou só o backdrop, que a navegação por abas mantém escondido. As gavetas deslizantes
// morreram no bloco 18; a esquerda morreu de vez no 35, junto com os widgets de sistema.
const drawerRight    = document.getElementById("drawer-right");
const drawerBackdrop = document.getElementById("drawer-backdrop");

// ─────────────────────────────────────────────────
// ORBE DE CONEXÃO
// ─────────────────────────────────────────────────
//
// O estado do celular ao lado da saudação, e o pareamento atrás dele. Era uma sub-aba
// inteira de Ajustes — que ninguém abre por vontade própria depois do primeiro dia, e que
// mesmo assim ocupava metade da barra de navegação de lá.

const orbe = document.getElementById("orbe");
const orbePop = document.getElementById("orbe-pop");

function abrirOrbe(abrir) {
  if (!orbePop) return;
  const estaAberto = orbePop.classList.contains("aberto");
  const alvo = abrir ?? !estaAberto;
  if (alvo === estaAberto) return;

  if (alvo) {
    const r = orbe.getBoundingClientRect();
    orbePop.style.top = `${r.bottom + 10}px`;
    orbePop.style.left = `${r.left}px`;
    orbePop.classList.add("aberto");
    loadPairing();
    orbe.setAttribute("aria-expanded", "true");
  } else {
    orbePop.classList.remove("aberto");
    orbe.setAttribute("aria-expanded", "false");
  }
}

orbe?.addEventListener("click", (e) => { e.stopPropagation(); abrirOrbe(); });
orbePop?.addEventListener("click", (e) => e.stopPropagation());
document.addEventListener("click", () => abrirOrbe(false));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && orbePop?.classList.contains("aberto")) { e.stopPropagation(); abrirOrbe(false); }
}, true);

/**
 * O ponto verde. "Pareado" não basta: o token pode estar gravado e o celular fora de
 * alcance. O que interessa é se ele apareceu recentemente — e é o próprio servidor que
 * sabe disso, porque é ele quem responde ao app.
 */
async function atualizarOrbe() {
  if (!orbe) return;
  try {
    const r = await window.nx.rpc("pairing.endpoints");
    orbe.classList.toggle("online", (r.result?.conectados ?? 0) > 0);
    orbe.title = (r.result?.conectados ?? 0) > 0
      ? "Celular conectado"
      : "Celular fora de alcance — clique para parear";
  } catch { orbe.classList.remove("online"); }
}

// ─────────────────────────────────────────────────
// PAREAMENTO (ELYSIUM-M mobile)
// ─────────────────────────────────────────────────
function renderPairing(info) {
  const qr    = document.getElementById("pairing-qr");
  const empty = document.getElementById("pairing-empty");
  const addr  = document.getElementById("pairing-addr");
  const token = document.getElementById("pairing-token");

  if (info && info.ip && info.qrDataUrl) {
    qr.src = info.qrDataUrl;
    qr.classList.add("show");
    empty.classList.add("hide");
    // O QR carrega todos os endereços; aqui mostramos o principal e, quando existe
    // um túnel (Tailscale/ZeroTier), avisamos que dá pra usar fora de casa.
    const tunnel = (info.endpoints || []).find(e => e.tunnel);
    addr.textContent = tunnel
      ? `${info.ip}:${info.port}  ·  túnel ${tunnel.address}`
      : `${info.ip}:${info.port}`;
  } else {
    qr.classList.remove("show");
    empty.classList.remove("hide");
    addr.textContent = "—";
  }
  // O token é a ÚNICA barreira do servidor da porta 4200 — não há TLS, e quem o tem
  // controla o PC pela rede local. Ele saiu de uma sub-aba de Ajustes para um popover a um
  // clique da tela inicial, então passa a nascer coberto: quem está compartilhando tela ou
  // gravando não o expõe sem querer.
  const bruto = (info && info.token) ? info.token : "";
  token.dataset.valor = bruto;
  token.textContent = bruto ? "•".repeat(24) : "—";
  token.classList.remove("revelado");
}

/** Alterna entre coberto e à mostra. Clicar de novo cobre. */
document.getElementById("pairing-token")?.addEventListener("click", (e) => {
  const el = e.currentTarget;
  const v = el.dataset.valor;
  if (!v) return;
  const mostrando = el.classList.toggle("revelado");
  el.textContent = mostrando ? v : "•".repeat(24);
});

async function loadPairing() {
  try {
    const info = await window.nx.getPairingInfo();
    renderPairing(info);
    renderRemoteAccess(info);
  } catch { renderPairing(null); renderRemoteAccess(null); }
}

/**
 * Estado do acesso fora de casa.
 *
 * O servidor já escuta em todas as interfaces, então "funcionar fora" depende de
 * existir uma interface alcançável de fora — o que na prática significa uma VPN mesh
 * instalada. Sem ela o app fica preso à rede local, e o motivo não é óbvio pra quem
 * só vê "PC fora do ar" no celular.
 */
function renderRemoteAccess(info) {
  const dot   = document.getElementById("remote-dot");
  const label = document.getElementById("remote-label");
  const body  = document.getElementById("remote-body");

  const tunnels = (info?.endpoints ?? []).filter(e => e.tunnel);

  if (tunnels.length > 0) {
    dot.className = "on";
    label.textContent = "Ativo";
    body.replaceChildren();

    const p = document.createElement("div");
    p.textContent = "O celular já consegue alcançar este PC de qualquer lugar, por:";
    body.appendChild(p);

    for (const t of tunnels) {
      const line = document.createElement("div");
      const code = document.createElement("code");
      code.textContent = `${t.address}  (${t.iface})`;
      line.appendChild(code);
      body.appendChild(line);
    }

    const note = document.createElement("div");
    note.style.marginTop = "6px";
    note.textContent = "Se o app já estava pareado, basta abri-lo uma vez em casa: ele aprende este endereço sozinho.";
    body.appendChild(note);
    return;
  }

  dot.className = "off";
  label.textContent = "Só na rede de casa";
  body.replaceChildren();

  const intro = document.createElement("div");
  intro.textContent = "Nenhuma interface alcançável de fora. Para usar o app na rua, instale o Tailscale nos dois aparelhos — é gratuito para uso pessoal e cria um túnel direto, sem expor nada na internet:";
  body.appendChild(intro);

  const ol = document.createElement("ol");
  [
    "No PC: baixe em tailscale.com/download e entre com sua conta.",
    "No celular: instale o app Tailscale e entre com a MESMA conta.",
    "Volte aqui — o endereço aparece sozinho, e o Portal o absorve na próxima vez que abrir em casa.",
  ].forEach(step => {
    const li = document.createElement("li");
    li.textContent = step;
    ol.appendChild(li);
  });
  body.appendChild(ol);

  const warn = document.createElement("div");
  warn.style.marginTop = "6px";
  warn.textContent = "Não abra a porta 4200 no roteador: o token é a única barreira e o tráfego não tem TLS. O túnel resolve isso sem expor o PC.";
  body.appendChild(warn);
}

document.getElementById("pairing-regen-btn").addEventListener("click", async () => {
  try {
    const info = await window.nx.regenerateToken();
    renderPairing(info);
    addBubble("system", "Token regenerado. Pareamentos antigos do Portal precisam escanear o QR de novo.");
  } catch {
    addBubble("error", "Falha ao regenerar o token.");
  }
});

// ─────────────────────────────────────────────────
// OPEN FULL CONFIG WINDOW
// ─────────────────────────────────────────────────

// ─────────────────────────────────────────────────
// WINDOW CONTROLS
// ─────────────────────────────────────────────────
document.getElementById("btnClose").addEventListener("click", () => window.close());
// Minimizar minimiza; fechar esconde para a bandeja (o handler de `close` no main).
document.getElementById("btnMin").addEventListener("click", () => window.nx.minimizar());
