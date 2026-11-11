// dashboard/js/esfera.js — a esfera 3D no fundo do Chat (fase 21, pedido do dono em 12/10).
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
  const proj = pontos.map(() => ({ x: 0, y: 0, z: 0, s: 0, b: 0 }));
  // Fase 22: de onde cada ponto parte quando a esfera "nasce" (espalhados ao acaso).
  // 22.1: partem de perto (eram 2,4 raios) — o nascer é um assentar, não uma explosão.
  const espalhado = pontos.map(() => ({ x: (Math.random() * 2 - 1) * 1.4, y: (Math.random() * 2 - 1) * 1.4, z: (Math.random() * 2 - 1) * 0.9 }));
  const L = window.EsferaLogica;
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
  let corDoTema = null, corDoTemaEm = 0;

  // ── mouse (fase 23) ───────────────────────────────────────────────────────
  // A esfera NÃO segue nem inclina para o cursor. O que ele faz é mexer nos pontos, um a um, como
  // num fluido: devagar, os pontos perto do cursor se afastam (abre um "buraco" que fecha quando
  // ele sai); rápido, os do caminho são jogados na direção do movimento; clique espalha todos e
  // eles voltam a formar a esfera. Cada ponto tem deslocamento e velocidade próprios, presos ao
  // lugar por uma mola. O canvas continua sem pegar clique; quem ouve é o #center.
  const mouse = { x: 0, y: 0, dentro: false, vx: 0, vy: 0, t: 0, dx: 0, dy: 0 };
  const fox = new Float32Array(N), foy = new Float32Array(N), fvx = new Float32Array(N), fvy = new Float32Array(N);
  let fluidoAte = 0, explodir = false, fisicaViva = false;
  let geom = { cx: 0, cy: 0, R: 1, dpr: 1 }; // do último quadro, em px do canvas
  const pulsos = []; // ondas: { t0, dentro } — clique sai de R a 2R; arquivo solto entra de 2R a R

  // ── pequenas interações (fase 22) ─────────────────────────────────────────
  let pedirNascer = true, nascerEm = 0;
  let teclaAmp = 0;
  let arrastoAte = 0; const arrasto = { x: 0, y: 0 };
  let noite = L.fatorNoturno(new Date().getHours());
  // Cada tecla no campo: micro-pulso e uma onda leve no lado de baixo (o do campo).
  window.addEventListener("ely:tecla", () => {
    if (movimentoReduzido()) return;
    nivel = L.pulsoDeTecla(nivel); teclaAmp = 1; acordar();
  });
  // Arquivo sendo arrastado sobre o chat: os pontos vão na direção do cursor; ao soltar, absorve.
  centro.addEventListener("dragover", (e) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    const r = centro.getBoundingClientRect();
    arrasto.x = e.clientX - r.left; arrasto.y = e.clientY - r.top;
    arrastoAte = performance.now() + 180;
  });
  centro.addEventListener("drop", (e) => {
    if (!e.dataTransfer?.files?.length) return;
    arrastoAte = 0;
    if (!movimentoReduzido()) pulsos.push({ t0: performance.now(), dentro: true });
    nivel = Math.min(1, nivel + 0.25);
    acordar();
  });

  function ignorarAlvo(el) {
    return !!(el && el.closest && el.closest(".bubble, input, textarea, button, select, a, .pop"));
  }
  function sobreEsfera() {
    if (!mouse.dentro) return false;
    const d = Math.hypot(mouse.x * geom.dpr - geom.cx, mouse.y * geom.dpr - geom.cy);
    return d <= geom.R;
  }
  centro.addEventListener("pointermove", (e) => {
    const r = centro.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (ignorarAlvo(e.target)) { mouse.dentro = false; centro.classList.remove("sobre-esfera"); return; }
    // Velocidade do cursor (px/s), suavizada; o deslocamento acumula até o próximo quadro.
    const agora = performance.now(), dtm = Math.max(1, agora - (mouse.t || agora - 16)) / 1000;
    if (mouse.dentro) {
      const ddx = x - mouse.x, ddy = y - mouse.y;
      mouse.dx += ddx; mouse.dy += ddy;
      mouse.vx = mouse.vx * 0.5 + (ddx / dtm) * 0.5;
      mouse.vy = mouse.vy * 0.5 + (ddy / dtm) * 0.5;
    }
    mouse.t = agora;
    mouse.x = x; mouse.y = y; mouse.dentro = true;
    centro.classList.toggle("sobre-esfera", vazio && ligada && sobreEsfera());
  });
  centro.addEventListener("pointerleave", () => {
    mouse.dentro = false; mouse.vx = mouse.vy = 0; centro.classList.remove("sobre-esfera");
  });
  centro.addEventListener("click", (e) => {
    if (!vazio || !ligada || ignorarAlvo(e.target) || !sobreEsfera()) return;
    // Clique: espalha como fluido (o impulso sai no próximo quadro, que sabe onde cada ponto está).
    if (!movimentoReduzido()) { explodir = true; fluidoAte = performance.now() + 1300; }
    nivel = Math.min(1, nivel + 0.15);
    acordar();
  });
  // Duplo clique na esfera: começa a ouvir, pelo mesmo caminho do botão do microfone.
  centro.addEventListener("dblclick", (e) => {
    if (!vazio || !ligada || ignorarAlvo(e.target) || !sobreEsfera()) return;
    document.getElementById("mic-btn")?.click();
  });

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
    // 25/10: sem foco e com a Ely parada, a esfera também para (volta no foco ou quando ela ouve/fala).
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
  window.addEventListener("ely-estado", acordar);

  // Congelada sem foco (25/10): ao voltar, continua de onde parou, sem nascer de novo.
  let congelada = false;
  function acordar() {
    if (rodando) return;
    rodando = true;
    if (!congelada) pedirNascer = true;
    congelada = false;
    ultimo = performance.now();
    requestAnimationFrame(quadro);
  }

  // Um erro num quadro não pode parar a esfera para sempre (o `rodando` ficaria preso em true).
  function quadro(agora) {
    try { passo(agora); }
    catch (e) { console.error("[esfera] quadro falhou:", e); requestAnimationFrame(quadro); }
  }

  function passo(agora) {
    lerConfig();
    if (!visivel()) { rodando = false; congelada = false; ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
    // 25/10: sem foco e com a Ely parada, congela no último quadro (volta no foco ou quando ela ouve/fala).
    if (!focoJanela && appState === "idle") { rodando = false; congelada = true; return; }
    const dt = Math.min(0.05, (agora - ultimo) / 1000);
    ultimo = agora;
    const lento = movimentoReduzido();
    // Primeiro quadro visível (app aberto, ou voltou para o Chat): a esfera nasce.
    if (pedirNascer) { pedirNascer = false; nascerEm = lento ? 0 : agora; }
    const kNascer = nascerEm ? (agora - nascerEm) / L.NASCER_MS : 1;
    if (kNascer >= 1) nascerEm = 0;
    const eNascer = nascerEm ? L.easeOutCubic(kNascer) : 1;
    const flash = nascerEm ? Math.sin(Math.PI * Math.min(1, kNascer)) * 0.12 : 0;
    teclaAmp *= 0.9;
    const arrastando = agora < arrastoAte && !lento;
    t += dt * (lento ? 0.35 : 1);

    // Nível: a voz dele (microfone), o envelope da Ely, ou um pulso de "pensando".
    const m = modo();
    if (fala) {
      const i = Math.floor((agora - fala.t0) / fala.passo);
      if (i >= fala.env.length) { fala = null; alvoNivel = 0; } else alvoNivel = fala.env[i] || 0;
    } else if (m === "falando") alvoNivel = 0.35 + 0.25 * Math.sin(t * 9);
    else if (m === "pensando") alvoNivel = 0.18 + 0.12 * Math.sin(t * L.RITMO_PENSANDO);
    else if (m === "parado") alvoNivel = 0;
    nivel += (alvoNivel - nivel) * (alvoNivel > nivel ? 0.35 : 0.08);
    const n = lento ? nivel * 0.5 : nivel;

    // Parada, a esfera é da cor de destaque do tema (ouro na Renascença, azul no Stark).
    if (agora - corDoTemaEm > 1000) {
      corDoTemaEm = agora;
      const v = getComputedStyle(document.documentElement).getPropertyValue("--purple-rgb").split(",").map(Number);
      if (v.length === 3 && v.every(Number.isFinite)) corDoTema = v.map(x => Math.min(255, x + 25));
      noite = L.fatorNoturno(new Date().getHours());
    }
    const alvoCor = m === "parado" && corDoTema ? corDoTema : CORES[m];
    for (let k = 0; k < 3; k++) cor[k] += (alvoCor[k] - cor[k]) * 0.08;
    const [cr, cg, cb] = cor.map(Math.round);

    const alvoOpac = (vazio ? 0.95 : 0.3) * noite.brilho;
    opac += (alvoOpac - opac) * 0.06;

    const dpr = ajustarTamanho();
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2;
    const cy = H * (vazio ? 0.32 : 0.45);
    const base = Math.min(W, H) * (vazio ? 0.17 : 0.26);
    const R = base * (1 + 0.03 * Math.sin(t * 1.4 * noite.respira) + n * 0.14);
    geom = { cx, cy, R, dpr };

    // Gira mais rápido quando há voz; inclina devagar.
    rotY += dt * (lento ? 0.12 : 0.28 + n * 1.6) * noite.giro;
    const rotX = 0.42 + Math.sin(t * 0.23) * 0.12;
    const sy = Math.sin(rotY), cyR = Math.cos(rotY), sx = Math.sin(rotX), cxR = Math.cos(rotX);

    // Física dos pontos (fase 23). Mola firme normalmente; mole por ~1,3 s depois do clique.
    const fluido = agora < fluidoAte;
    const kMola = fluido ? 14 : 55, cMola = fluido ? 3.2 : 11;
    const dtF = Math.min(dt, 1 / 30);
    const comMouse = mouse.dentro && vazio && !lento;
    const curX = mouse.x * dpr, curY = mouse.y * dpr;
    const velX = mouse.vx * dpr, velY = mouse.vy * dpr;
    const rapido = Math.hypot(mouse.vx, mouse.vy) > L.VEL_RAPIDA && (Math.abs(mouse.dx) + Math.abs(mouse.dy) > 0);
    mouse.dx = 0; mouse.dy = 0;
    if (!comMouse) { mouse.vx *= 0.8; mouse.vy *= 0.8; }
    const explodirAgora = explodir && !lento; explodir = false;
    const fisica = !lento && (comMouse || fluido || explodirAgora || fisicaViva);
    let energia = 0;

    // Núcleo e halo: a luz de dentro cresce com a voz.
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.25);
    g.addColorStop(0, `rgba(${cr},${cg},${cb},${Math.min(1, (0.22 + n * 0.4 + flash) * opac)})`);
    g.addColorStop(0.55, `rgba(${cr},${cg},${cb},${(0.07 + n * 0.12) * opac})`);
    g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.25, 0, Math.PI * 2); ctx.fill();

    for (let i = 0; i < N; i++) {
      const p = pontos[i];
      // A superfície: respiração lenta parada; ondas que correm por ela com a voz.
      const onda = 0.012 * Math.sin(4 * p.y * noite.respira + t * 1.8 * noite.respira)
        + n * (0.16 * Math.sin(3.1 * p.x + t * 5.3) * Math.sin(2.7 * p.y - t * 4.1) + 0.1 * Math.sin(5.3 * p.z + t * 7.2))
        + (teclaAmp > 0.01 && p.y < 0 ? teclaAmp * 0.02 * p.y * p.y * Math.sin(9 * p.x + t * 12) : 0);
      const r = 1 + onda;
      let x = p.x * r, y = p.y * r, z = p.z * r;
      if (eNascer < 1) {
        const s = espalhado[i];
        x = s.x + (x - s.x) * eNascer; y = s.y + (y - s.y) * eNascer; z = s.z + (z - s.z) * eNascer;
      }
      const x1 = x * cyR + z * sy, z1 = -x * sy + z * cyR;
      const y2 = y * cxR - z1 * sx, z2 = y * sx + z1 * cxR;
      const f = 2.8 / (2.8 - Math.min(2.2, z2)); // preso: no "nascer" os pontos partem de longe
      const q = proj[i];
      q.x = cx + x1 * R * f;
      q.y = cy + y2 * R * f;
      q.z = z2;
      q.s = f;
      q.b = 0;
      if (fisica) {
        const bx = q.x, by = q.y;
        let axp = 0, ayp = 0;
        if (explodirAgora) {
          // Para fora do centro, com um redemoinho e um pouco de acaso por ponto.
          const rx = bx - cx, ry = by - cy, rd = Math.hypot(rx, ry) || 1;
          const forca = R * (2.2 + ((i * 7919) % 100) / 100 * 2.4);
          const giro = R * 1.4 * Math.sin(i * 2.399);
          fvx[i] += (rx / rd) * forca - (ry / rd) * giro;
          fvy[i] += (ry / rd) * forca + (rx / rd) * giro;
        }
        if (comMouse) {
          const px = bx + fox[i], py = by + foy[i];
          const dx = px - curX, dy = py - curY, d = Math.hypot(dx, dy) || 0.001;
          if (rapido) {
            // Rápido: quem está no caminho é jogado na direção do movimento.
            const kq = L.quedaSuave(d, R * 0.38);
            if (kq > 0) { fvx[i] += velX * 0.55 * kq; fvy[i] += velY * 0.55 * kq; }
          } else {
            const a = L.aceleracaoRepulsao(d, R, kMola);
            axp = (dx / d) * a; ayp = (dy / d) * a;
            q.b = Math.max(q.b, L.quedaSuave(d, R * 0.32) * 0.6);
          }
        }
        const [nox, nvx] = L.passoMola(fox[i], fvx[i], kMola, cMola, axp, dtF);
        const [noy, nvy] = L.passoMola(foy[i], fvy[i], kMola, cMola, ayp, dtF);
        // Teto: ninguém foge mais que 1,3R do lugar.
        const lim = R * 1.3, m = Math.hypot(nox, noy);
        const esc = m > lim ? lim / m : 1;
        fox[i] = nox * esc; foy[i] = noy * esc; fvx[i] = nvx; fvy[i] = nvy;
        q.x += fox[i]; q.y += foy[i];
        const afast = Math.min(1, m / (R * 0.5));
        if (afast > q.b) q.b = afast * 0.5;
      }
      // Arquivo por cima: os pontos mais perto dele se inclinam de leve na direção dele.
      if (arrastando) {
        const ax = arrasto.x * dpr, ay = arrasto.y * dpr;
        const dx = ax - q.x, dy = ay - q.y, d = Math.hypot(dx, dy), alcance = R * 0.8;
        if (d < alcance && d > 0.001) {
          const k = 1 - d / alcance, suave = k * k * (3 - 2 * k);
          q.x += (dx / d) * suave * R * 0.05;
          q.y += (dy / d) * suave * R * 0.05;
          q.b = suave * 0.3;
        }
      }
    }
    // Enquanto algum ponto estiver fora do lugar, a física continua mesmo sem mouse.
    if (fisica) { for (let i = 0; i < N; i += 7) energia += Math.abs(fox[i]) + Math.abs(foy[i]) + Math.abs(fvx[i]) * 0.02; fisicaViva = energia > 0.5; }
    else if (lento && fisicaViva) { fox.fill(0); foy.fill(0); fvx.fill(0); fvy.fill(0); fisicaViva = false; }
    ordem.sort((a, b) => proj[a].z - proj[b].z);
    for (const i of ordem) {
      const q = proj[i];
      const prof = Math.max(0, Math.min(1, (q.z + 1) / 2)); // 0 atrás … 1 na frente
      const tam = Math.max(0.2, 0.45 + prof * 1.25) * q.s * dpr * (1 + n * 0.35) * (1 + q.b * 0.4);
      const a = Math.min(1, (0.08 + prof * prof * 0.85) * opac * (1 + q.b * 0.5));
      ctx.fillStyle = `rgba(${Math.min(255, cr + prof * 50)},${Math.min(255, cg + prof * 40)},${Math.min(255, cb + prof * 30)},${a})`;
      ctx.beginPath();
      ctx.arc(q.x, q.y, tam, 0, Math.PI * 2);
      ctx.fill();
    }

    // Anel fino em volta, como o reator — mais vivo com a voz.
    ctx.strokeStyle = `rgba(${cr},${cg},${cb},${(0.12 + n * 0.3) * opac})`;
    ctx.lineWidth = 1.2 * dpr;
    ctx.beginPath(); ctx.arc(cx, cy, R * (1.32 + n * 0.08), 0, Math.PI * 2); ctx.stroke();

    // Ondas: o clique sai de R até 1,4R; o arquivo solto entra de 1,4R até R. Finas e apagadas.
    for (let i = pulsos.length - 1; i >= 0; i--) {
      const k = (agora - pulsos[i].t0) / 700;
      if (k >= 1) { pulsos.splice(i, 1); continue; }
      const e = L.easeOutCubic(k);
      const raio = pulsos[i].dentro ? R * (1.4 - 0.4 * e) : R * (1 + 0.4 * e);
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${(1 - k) * 0.3 * opac})`;
      ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath(); ctx.arc(cx, cy, raio, 0, Math.PI * 2); ctx.stroke();
    }

    requestAnimationFrame(quadro);
  }

  acordar();
})();
