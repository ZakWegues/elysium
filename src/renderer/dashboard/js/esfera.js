// dashboard/js/esfera.js — a esfera 3D no fundo do Chat (fase 21, pedido do Zak em 12/10).
//
// Fica PARADA no fundo da conversa, girando e respirando. Quando alguém fala, ela se mexe:
// a superfície ondula e se deforma com a voz — ciano com a voz dele (o nível do microfone que
// o gravador já manda), roxo com a da Ely (o tempo de cada palavra, `ely:fala`), âmbar enquanto
// ela pensa. É uma nuvem de ~700 pontos numa esfera de Fibonacci, girada e projetada em
// perspectiva num <canvas> 2D: os pontos da frente maiores e mais fortes, os de trás apagados —
// é o que dá o volume, sem WebGL nem biblioteca. Só desenha com o Chat à vista.

(() => {
  const centro = document.getElementById("center");
  const timeline = document.getElementById("timeline");
  if (!centro || !timeline) return;

  const canvas = document.createElement("canvas");
  canvas.id = "esfera";
  canvas.setAttribute("aria-hidden", "true");
  centro.prepend(canvas);
  const ctx = canvas.getContext("2d");

  // Esfera de Fibonacci: pontos espalhados por igual, sem polos amontoados.
  const N = 700;
  const pontos = [];
  const ouro = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = ouro * i;
    pontos.push({ x: Math.cos(th) * r, y, z: Math.sin(th) * r });
  }
  const proj = pontos.map(() => ({ x: 0, y: 0, z: 0, s: 0 }));
  const ordem = pontos.map((_, i) => i);

  const CORES = {
    parado:   [150, 120, 225],
    ouvindo:  [78, 205, 196],
    pensando: [240, 178, 64],
    falando:  [186, 140, 255],
  };
  let estadoApp = "idle";
  let falando = false;
  let cor = CORES.parado.slice();
  let alvoNivel = 0, nivel = 0;
  let fala = null; // { env, passo, t0 }
  let ligada = true;
  let vazio = true;
  let opac = 0.9;
  let rotY = 0;
  let t = 0;
  let ultimo = performance.now();
  let rodando = false;

  function modo() {
    if (estadoApp === "listening") return "ouvindo";
    if (estadoApp === "processing") return "pensando";
    if (falando || estadoApp === "speaking" || fala) return "falando";
    return "parado";
  }

  // ── entradas ──────────────────────────────────────────────────────────────
  window.nx.onState?.((s) => { estadoApp = s; if (s !== "listening") alvoNivel = 0; acordar(); });
  window.nx.onFalando?.((f) => { falando = f; if (!f) fala = null; acordar(); });
  window.nx.onAudioLevel?.((v) => { if (estadoApp === "listening") alvoNivel = Math.min(1, Number(v) * 6); });
  window.nx.onElyFala?.((f) => {
    if (!f || !Array.isArray(f.envelope)) return;
    fala = { env: f.envelope, passo: f.passoMs || 33, t0: performance.now() };
    acordar();
  });

  // Conversa vazia: a esfera aparece inteira, no lugar do "EL". Com mensagens, ela recua.
  const olharVazio = () => {
    vazio = !!document.getElementById("chat-vazio") || timeline.querySelectorAll(".bubble").length === 0;
  };
  new MutationObserver(olharVazio).observe(timeline, { childList: true });
  olharVazio();

  function lerConfig() {
    let v = true;
    try { v = (typeof cfgAtual !== "undefined" && cfgAtual && cfgAtual.esferaChat === false) ? false : true; } catch { /* sem config ainda */ }
    if (v !== ligada) { ligada = v; document.body.classList.toggle("com-esfera", ligada); }
  }
  window.nx.getConfig?.().then((c) => { ligada = c?.esferaChat !== false; document.body.classList.toggle("com-esfera", ligada); acordar(); }).catch(() => {});
  document.body.classList.add("com-esfera");

  function movimentoReduzido() {
    try {
      if (typeof cfgAtual !== "undefined" && cfgAtual?.movimento === "nunca") return true;
      if (typeof cfgAtual !== "undefined" && cfgAtual?.movimento === "sempre") return false;
    } catch { /* */ }
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function visivel() {
    return ligada && !document.hidden && centro.offsetParent !== null && !centro.classList.contains("modo-self");
  }

  function ajustarTamanho() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = centro.clientWidth, h = centro.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    return dpr;
  }
  new ResizeObserver(() => acordar()).observe(centro);
  document.addEventListener("visibilitychange", acordar);

  function acordar() {
    if (rodando) return;
    rodando = true;
    ultimo = performance.now();
    requestAnimationFrame(quadro);
  }

  function quadro(agora) {
    lerConfig();
    if (!visivel()) { rodando = false; ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
    const dt = Math.min(0.05, (agora - ultimo) / 1000);
    ultimo = agora;
    const lento = movimentoReduzido();
    t += dt * (lento ? 0.35 : 1);

    // Nível: a voz dele (microfone), o envelope da Ely, ou um pulso de "pensando".
    const m = modo();
    if (fala) {
      const i = Math.floor((agora - fala.t0) / fala.passo);
      if (i >= fala.env.length) { fala = null; alvoNivel = 0; } else alvoNivel = fala.env[i] || 0;
    } else if (m === "falando") alvoNivel = 0.35 + 0.25 * Math.sin(t * 9);
    else if (m === "pensando") alvoNivel = 0.18 + 0.12 * Math.sin(t * 4);
    else if (m === "parado") alvoNivel = 0;
    nivel += (alvoNivel - nivel) * (alvoNivel > nivel ? 0.35 : 0.08);
    const n = lento ? nivel * 0.5 : nivel;

    const alvoCor = CORES[m];
    for (let k = 0; k < 3; k++) cor[k] += (alvoCor[k] - cor[k]) * 0.08;
    const [cr, cg, cb] = cor.map(Math.round);

    const alvoOpac = vazio ? 0.95 : 0.3;
    opac += (alvoOpac - opac) * 0.06;

    const dpr = ajustarTamanho();
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2;
    const cy = H * (vazio ? 0.32 : 0.45);
    const base = Math.min(W, H) * (vazio ? 0.17 : 0.26);
    const R = base * (1 + 0.03 * Math.sin(t * 1.4) + n * 0.14);

    // Gira mais rápido quando há voz; inclina devagar.
    rotY += dt * (lento ? 0.12 : 0.28 + n * 1.6);
    const rotX = 0.42 + Math.sin(t * 0.23) * 0.12;
    const sy = Math.sin(rotY), cyR = Math.cos(rotY), sx = Math.sin(rotX), cxR = Math.cos(rotX);

    // Núcleo e halo: a luz de dentro cresce com a voz.
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.25);
    g.addColorStop(0, `rgba(${cr},${cg},${cb},${(0.22 + n * 0.4) * opac})`);
    g.addColorStop(0.55, `rgba(${cr},${cg},${cb},${(0.07 + n * 0.12) * opac})`);
    g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.25, 0, Math.PI * 2); ctx.fill();

    for (let i = 0; i < N; i++) {
      const p = pontos[i];
      // A superfície: respiração lenta parada; ondas que correm por ela com a voz.
      const onda = 0.012 * Math.sin(4 * p.y + t * 1.8)
        + n * (0.16 * Math.sin(3.1 * p.x + t * 5.3) * Math.sin(2.7 * p.y - t * 4.1) + 0.1 * Math.sin(5.3 * p.z + t * 7.2));
      const r = 1 + onda;
      let x = p.x * r, y = p.y * r, z = p.z * r;
      const x1 = x * cyR + z * sy, z1 = -x * sy + z * cyR;
      const y2 = y * cxR - z1 * sx, z2 = y * sx + z1 * cxR;
      const f = 2.8 / (2.8 - z2);
      const q = proj[i];
      q.x = cx + x1 * R * f;
      q.y = cy + y2 * R * f;
      q.z = z2;
      q.s = f;
    }
    ordem.sort((a, b) => proj[a].z - proj[b].z);
    for (const i of ordem) {
      const q = proj[i];
      const prof = (q.z + 1) / 2; // 0 atrás … 1 na frente
      const tam = (0.45 + prof * 1.25) * q.s * dpr * (1 + n * 0.35);
      const a = (0.08 + prof * prof * 0.85) * opac;
      ctx.fillStyle = `rgba(${Math.min(255, cr + prof * 50)},${Math.min(255, cg + prof * 40)},${Math.min(255, cb + prof * 30)},${a})`;
      ctx.beginPath();
      ctx.arc(q.x, q.y, tam, 0, Math.PI * 2);
      ctx.fill();
    }

    // Anel fino em volta, como o reator — mais vivo com a voz.
    ctx.strokeStyle = `rgba(${cr},${cg},${cb},${(0.12 + n * 0.3) * opac})`;
    ctx.lineWidth = 1.2 * dpr;
    ctx.beginPath(); ctx.arc(cx, cy, R * (1.32 + n * 0.08), 0, Math.PI * 2); ctx.stroke();

    requestAnimationFrame(quadro);
  }

  acordar();
})();
