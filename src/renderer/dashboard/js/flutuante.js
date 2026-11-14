// dashboard/js/flutuante.js — a Ely flutuante (12/11; 13/11 no jeito do Roamies): a bolota que segue
// o cursor numa camada transparente da tela inteira, a fala ao vivo, o nível da voz, o que ela está
// fazendo, e os cartões soltos (arrastar, minimizar, fixar, fechar).
//
// Carregado SÓ pelo flutuante.html (não pelo dashboard), mas mora aqui para ir junto no build.
// Tudo dentro de uma função: os scripts do dashboard dividem um escopo global, e um nome solto
// daqui colidiria com o de lá (o teste de sintaxe carrega a pasta inteira junta).
//
// Fluidez acima de tudo: só `transform`/`opacity` animam, o nível do microfone entra uma vez por
// quadro, e cada cartão é desenhado uma vez (o texto que chega aos poucos só ganha um nó novo).
(() => {
  if (!window.ely) return;
  const $ = (id) => document.getElementById(id);
  const palco = $("palco"), ely = $("ely"), bola = $("bola"), estadoEl = $("estado"), campo = $("campo"), cartoes = $("cartoes");
  const falaEl = $("fala"), aoVivoEl = $("aovivo"), nivelEl = $("nivel");
  // 14/11 (o dono: "igual ao Roamies, sem botão de fechar nem de escrever"): a resposta vai num
  // balão colado na bolota; fechar = esperar; clique nela = escrever; segurar = arrastar.
  const balao = $("balao"), balaoTexto = $("balaoTexto");
  // 13/11 (pedido do dono): parada 7 s — sem ouvir, pensar, falar e sem o mouse em cima — some sozinha.
  const ESPERA_FECHAR_MS = 7_000;
  /**
   * O próximo quadro — com reserva de 50 ms: janela recém-mostrada (ou que o Windows acha
   * coberta) pode segurar o requestAnimationFrame, e aí a bolinha nem aparecia (medido em 12/11).
   */
  function noQuadro(fn) {
    let feito = false;
    const uma = () => { if (!feito) { feito = true; fn(); } };
    requestAnimationFrame(uma);
    setTimeout(uma, 50);
  }

  // ── movimento ──────────────────────────────────────────────────────────────────────────
  // 13/11, medido: com "Efeitos de animação" desligado no Windows, a bolota não espalhava e os
  // cartões não animavam — mas o ELYSIUM tem o ajuste dele (Movimento: sempre/nunca/sistema), que o
  // dashboard já respeita. A flutuante segue o mesmo ajuste (vem no `flutuante:abrir`).
  let movimento = "";
  function reduzir() {
    if (movimento === "sempre") return false;
    if (movimento === "nunca") return true;
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  // ── tema ────────────────────────────────────────────────────────────────────────────────
  const APOSENTADOS = { default: "dark-elisio", ocean: "dark-mare", ember: "dark-crepusculo", forest: "dark-elisio", ely: "dark-elisio",
    "ely-dusk": "dark-crepusculo", "ely-ether": "dark-mare", lg: "glass-crepusculo", "lg-tide": "glass-mare", "lg-amber": "glass-elisio",
    renascenca: "dark-elisio", "renascenca-veneza": "dark-mare", "renascenca-roma": "dark-crepusculo", minimal: "dark-mare", dark: "dark-elisio", glass: "glass-crepusculo" };
  let tema = THEMES["dark-elisio"];
  function aplicarTema(id) {
    tema = THEMES[id] || THEMES[APOSENTADOS[id]] || THEMES["dark-elisio"];
    const r = document.documentElement.style;
    r.setProperty("--a", tema.purple); r.setProperty("--a2", tema.purpleBright); r.setProperty("--b", tema.cyan);
    r.setProperty("--ink", tema.glassInk); r.setProperty("--bg", tema.bg);
  }
  const COR = { a: () => tema.purple, b: () => tema.cyan, ambar: () => "#f2b44e", coral: () => "#ff7a6b", lilas: () => "#b9a3ff", branco: () => "#f2f4f8", preto: () => "#05060b" };
  const cor = (t, reserva = "a") => (COR[t] || COR[reserva])();

  // ── o cursor, a bolota seguindo, e o que é clicável ─────────────────────────────────────
  // O main manda a posição do cursor ~60×/s (vale em cima de qualquer programa). A bolota vai até
  // o lado da ponta do cursor com atraso suave (mola criticamente amortecida, por quadro). Ela PARA
  // de seguir quando o cursor chega nela (para dar para passar o mouse e clicar) ou está em cima de
  // um cartão; volta a seguir quando o cursor se afasta.
  const cursor = { x: -999, y: -999 };
  let telaW = innerWidth, telaH = innerHeight;
  const pos = { x: -999, y: -999 }, vel = { x: 0, y: 0 };
  let parada = false, seguindo = false, ultimoQuadro = 0;
  /** "seguindo" | "parada" | "arrastando" — ver quadroSeguir. */
  let modo = "seguindo";
  const OFF = 34, RAIO_PEGA = 38, RAIO_SOLTA = 110;
  // Velocidade do cursor (px/s, suavizada): passar rápido por cima não "pega" a bolota (13/11, medido).
  let velCursor = 0, cursorEm = 0, velX = 0, velY = 0;

  function alvoDaBolota() {
    // Ao lado da ponta do cursor; perto da borda, do outro lado.
    let x = cursor.x + OFF, y = cursor.y + OFF;
    if (x > telaW - 60) x = cursor.x - OFF;
    if (y > telaH - 60) y = cursor.y - OFF;
    return { x: Math.max(30, Math.min(telaW - 30, x)), y: Math.max(30, Math.min(telaH - 30, y)) };
  }
  function moverEly() {
    ely.style.transform = `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0)`;
    // A fala e o estado vão para o lado que tem espaço.
    ely.classList.toggle("esq", pos.x > telaW - 380);
    ely.classList.toggle("cima", pos.y > telaH - 220);
  }
  /** A área clicável da bolota. */
  function areaDaBola() {
    const a = bola.getBoundingClientRect();
    return { l: a.left, t: a.top, r: a.right, b: a.bottom };
  }
  function quadroSeguir(agora) {
    if (!palco.classList.contains("aberto")) { seguindo = false; return; }
    const dt = Math.min(0.05, (agora - ultimoQuadro) / 1000 || 0.016);
    ultimoQuadro = agora;
    // Sem evento novo do cursor, a velocidade dele vai a zero (ele parou).
    if (agora - cursorEm > 60) { velX *= 0.8; velY *= 0.8; velCursor *= 0.8; }
    const d = Math.hypot(cursor.x - pos.x, cursor.y - pos.y);
    const sobre = sobreClicavel();
    // Dois jeitos: "seguindo" (abre assim, ao lado do cursor) e "parada" (onde ele arrastou; fica
    // ali até fechar). Seguindo, ela para quando o cursor chega nela ou vai para uma tela dela.
    if (modo === "seguindo") {
      // 14/11: em cima de uma tela/balão (algo clicável que não é a bolota), ela espera — senão
      // vinha atrás do cursor e ficava por cima do que ele queria clicar ou arrastar.
      if (sobre && ultimoSobre && ultimoSobre !== bola) parada = true;
      // Para quando o cursor vem NA DIREÇÃO dela (senão ela "foge" e não dá para clicar nos botões).
      const vv = Math.hypot(velX, velY);
      const indo = vv > 25 && d > 1 && (velX * (pos.x - cursor.x) + velY * (pos.y - cursor.y)) / (vv * d) > 0.82; // até ~35°
      // "Em cima" só vale com o cursor quase parado: correndo, a bolota fica para trás e passa por
      // baixo dele — isso não é ele querendo pegar (medido em 13/11).
      const quieto = vv < 120;
      // 14/11 (o dono: "os botões pararam de funcionar"): os botões ficam no canto de cima da bolota;
      // indo até eles o cursor não aponta para o centro dela, e ela seguia — o X fugia. Agora conta
      // a área da bolota + botões: o cursor vindo na direção dela, ou chegando perto, para a bolota.
      const area = areaDaBola();
      const qx = Math.min(Math.max(cursor.x, area.l), area.r), qy = Math.min(Math.max(cursor.y, area.t), area.b);
      const dArea = Math.hypot(qx - cursor.x, qy - cursor.y);
      const indoArea = vv > 25 && dArea > 1 && (velX * (qx - cursor.x) + velY * (qy - cursor.y)) / (vv * dArea) > 0.6;
      if (!parada && ((d < RAIO_PEGA && quieto) || (d < 80 && indo) || (sobre && quieto) || (dArea < 70 && indoArea) || (dArea < 14 && quieto))) parada = true;
      else if (parada && d > RAIO_SOLTA && dArea > 60 && !sobre && !arrastando && document.activeElement !== campo && !campo.classList.contains("ve")) parada = false;
    }
    if (modo === "seguindo" && !parada) {
      const alvo = alvoDaBolota();
      if (reduzir()) { pos.x = alvo.x; pos.y = alvo.y; }
      else {
        // Mola (k=170, c=2√k): chega em ~0,25 s sem passar do ponto.
        const k = 170, c = 2 * Math.sqrt(k);
        vel.x += ((alvo.x - pos.x) * k - vel.x * c) * dt; vel.y += ((alvo.y - pos.y) * k - vel.y * c) * dt;
        pos.x += vel.x * dt; pos.y += vel.y * dt;
      }
      moverEly();
    }
    marcarMouse(sobre);
    falaVisivel();
    requestAnimationFrame(quadroSeguir);
  }
  function comecarASeguir() {
    if (seguindo) return;
    seguindo = true;
    ultimoQuadro = performance.now();
    requestAnimationFrame(quadroSeguir);
    setTimeout(() => { if (seguindo && performance.now() - ultimoQuadro > 120) quadroSeguir(performance.now()); }, 120);
  }

  /** O cursor está em cima de algo clicável da camada (bolota, cartão, campo, fala)? */
  let ultimoSobre = null;
  function sobreClicavel() {
    if (arrastando) return true;
    const e = document.elementFromPoint(cursor.x, cursor.y);
    ultimoSobre = e && e.closest(".interativo");
    return !!ultimoSobre;
  }
  let dentro = false;
  function marcarMouse(v) { if (v !== dentro) { dentro = v; window.ely.mouse(v); } if (v) adiarFechar(); }

  // ── fechar sozinho ─────────────────────────────────────────────────────────────────────
  let timerFechar = null, ocupada = false, falando = false;
  function adiarFechar() {
    clearTimeout(timerFechar);
    timerFechar = setTimeout(() => {
      // Cartão fixado: a camada fica (com ele); a bolota some sozinha só sem nada fixado.
      if (dentro || ocupada || falando || document.activeElement === campo || cartoes.querySelector(".cartao.fixo")) { adiarFechar(); return; }
      window.ely.fechar();
    }, ESPERA_FECHAR_MS);
  }

  // ── a bolota (12/11): a mesma nuvem de pontos da esfera do Chat, em miniatura ──────────────
  // ~240 pontos numa esfera de Fibonacci, girando, num <canvas> 2D. Passar o mouse espalha os
  // pontos perto dele; clicar espalha todos (e abre o campo de digitar); eles voltam pela mola.
  // A cor vem do tema: parada, o destaque dele; ouvindo, a segunda cor; pensando, âmbar;
  // falando, o destaque claro. Física e curvas de `esfera-logica.js` (as mesmas da esfera).
  const Bolota = (() => {
    const L = window.EsferaLogica;
    const tela = $("bolota");
    const ctx = tela.getContext("2d");
    const N = 240, ouro = Math.PI * (3 - Math.sqrt(5));
    const pts = [], esp = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = ouro * i;
      pts.push([Math.cos(th) * r, y, Math.sin(th) * r]);
      esp.push([(Math.random() * 2 - 1) * 1.5, (Math.random() * 2 - 1) * 1.5, (Math.random() * 2 - 1) * 0.9]);
    }
    const qx = new Float32Array(N), qy = new Float32Array(N), qz = new Float32Array(N), qs = new Float32Array(N);
    const fox = new Float32Array(N), foy = new Float32Array(N), fvx = new Float32Array(N), fvy = new Float32Array(N);
    const ordem = [...Array(N).keys()];
    const mouse = { x: 0, y: 0, dentro: false };
    let estado = "idle", falando = false, mic = 0, nivel = 0, rotY = 0, t = 0, ultimo = 0, rodando = false;
    let nascerEm = 0, explodir = false, fluidoAte = 0, viva = false;
    // 13/11: a saída — um estouro pequeno (os pontos se afastam 12–36%, pouco maior que a bolota) e a implosão.
    const SUMIR_MS = 520;
    let sumirEm = 0, aoSumir = null;
    let cor = [200, 170, 110];
    const rgb = (hex) => { const h = String(hex || "").replace("#", ""); return h.length === 6 ? [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) : [200, 170, 110]; };
    function corAlvo() {
      if (estado === "listening") return rgb(tema.cyan);
      if (estado === "processing") return [242, 180, 78];
      if (falando || estado === "speaking") return rgb(tema.purpleBright);
      return rgb(tema.purple);
    }
    const lento = reduzir;
    /** O cursor (na coordenada da camada): perto da bolota, os pontos se afastam dele. */
    function cursorEm(cx, cy) {
      const r = tela.getBoundingClientRect();
      mouse.x = cx - r.left; mouse.y = cy - r.top;
      mouse.dentro = Math.hypot(mouse.x - r.width / 2, mouse.y - r.height / 2) < r.width * 0.42;
      if (mouse.dentro) ligar();
    }

    function passo(agora) {
      if (!palco.classList.contains("aberto")) { rodando = false; return; }
      const dt = Math.min(0.05, (agora - ultimo) / 1000 || 0.016);
      ultimo = agora;
      const devagar = lento();
      t += dt;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.round(tela.clientWidth * dpr), H = Math.round(tela.clientHeight * dpr);
      if (tela.width !== W || tela.height !== H) { tela.width = W; tela.height = H; }
      ctx.clearRect(0, 0, W, H);

      // Nível: o microfone dele, a fala dela (um vaivém), o "pensando" que respira.
      let alvo = 0;
      if (estado === "listening") alvo = Math.min(1, mic * 6);
      else if (estado === "processing") alvo = 0.18 + 0.12 * Math.sin(t * L.RITMO_PENSANDO);
      else if (falando || estado === "speaking") alvo = 0.35 + 0.25 * Math.sin(t * 9);
      nivel += (alvo - nivel) * (alvo > nivel ? 0.35 : 0.08);
      const n = devagar ? nivel * 0.5 : nivel;
      const ca = corAlvo();
      for (let k = 0; k < 3; k++) cor[k] += (ca[k] - cor[k]) * 0.1;
      const [cr, cg, cb] = cor.map(Math.round);

      // Saída: 0–30% estoura (cada ponto com o seu tanto), 30–100% implode até o centro e apaga.
      let fatorSaida = 1, alfaSaida = 1, estouro = 0;
      if (sumirEm) {
        const k = Math.min(1, (agora - sumirEm) / SUMIR_MS);
        if (k < 0.3) { const e = L.easeOutCubic(k / 0.3); estouro = e; fatorSaida = 1 + 0.06 * e; }
        else { const e = (k - 0.3) / 0.7, ein = e * e; estouro = 1 - e; fatorSaida = 1.06 * (1 - ein) + 0.02; alfaSaida = 1 - ein * 0.95; }
        if (k >= 1) { sumirEm = 0; ctx.clearRect(0, 0, W, H); rodando = false; const f = aoSumir; aoSumir = null; f?.(); return; }
      }
      ctx.globalAlpha = alfaSaida;
      const kN = nascerEm ? (agora - nascerEm) / L.NASCER_MS : 1;
      if (kN >= 1) nascerEm = 0;
      const eN = nascerEm ? L.easeOutCubic(kN) : 1;
      const cx = W / 2, cy = H / 2;
      const R = 22 * dpr * (1 + 0.03 * Math.sin(t * 1.4) + n * 0.16) * fatorSaida;
      rotY += dt * (devagar ? 0.15 : 0.5 + n * 2);
      const rotX = 0.42 + Math.sin(t * 0.3) * 0.14;
      const sy = Math.sin(rotY), cyR = Math.cos(rotY), sx = Math.sin(rotX), cxR = Math.cos(rotX);

      // Física: mola firme; mole por 1,3 s depois do clique.
      const fluido = agora < fluidoAte;
      const kM = fluido ? 14 : 55, cM = fluido ? 3.2 : 11, dtF = Math.min(dt, 1 / 30);
      const comMouse = mouse.dentro && !devagar;
      const exp = explodir && !devagar; explodir = false;
      const fisica = !devagar && (comMouse || fluido || exp || viva);
      const mx = mouse.x * dpr, my = mouse.y * dpr;

      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.5);
      g.addColorStop(0, `rgba(${cr},${cg},${cb},${0.3 + n * 0.35})`);
      g.addColorStop(0.5, `rgba(${cr},${cg},${cb},${0.09 + n * 0.12})`);
      g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.5, 0, Math.PI * 2); ctx.fill();

      let energia = 0;
      for (let i = 0; i < N; i++) {
        const p = pts[i];
        const onda = 0.015 * Math.sin(4 * p[1] + t * 1.8) + n * (0.18 * Math.sin(3.1 * p[0] + t * 5.3) * Math.sin(2.7 * p[1] - t * 4.1));
        const r = 1 + onda;
        // No estouro cada ponto sai um tanto diferente (0,12–0,36 do raio): parece explosão, não zoom.
        const r2 = r * (1 + estouro * (0.12 + 0.24 * (((i * 7919) % 97) / 97)));
        let x = p[0] * r2, y = p[1] * r2, z = p[2] * r2;
        if (eN < 1) { const e = esp[i]; x = e[0] + (x - e[0]) * eN; y = e[1] + (y - e[1]) * eN; z = e[2] + (z - e[2]) * eN; }
        const x1 = x * cyR + z * sy, z1 = -x * sy + z * cyR;
        const y2 = y * cxR - z1 * sx, z2 = y * sx + z1 * cxR;
        const f = 2.8 / (2.8 - Math.min(2.2, z2));
        qx[i] = cx + x1 * R * f; qy[i] = cy + y2 * R * f; qz[i] = z2; qs[i] = f;
        if (fisica) {
          let ax = 0, ay = 0;
          if (exp) {
            const rx = qx[i] - cx, ry = qy[i] - cy, rd = Math.hypot(rx, ry) || 1;
            const forca = R * (2.2 + ((i * 7919) % 100) / 100 * 2.4), giro = R * 1.4 * Math.sin(i * 2.399);
            fvx[i] += (rx / rd) * forca - (ry / rd) * giro; fvy[i] += (ry / rd) * forca + (rx / rd) * giro;
          }
          if (comMouse) {
            const dx = qx[i] + fox[i] - mx, dy = qy[i] + foy[i] - my, d = Math.hypot(dx, dy) || 0.001;
            // Na bolota pequena o "buraco" do mouse é maior que na esfera: senão quase não se nota.
            const a = L.aceleracaoRepulsao(d, R, kM, 0.42, 0.7);
            ax = (dx / d) * a; ay = (dy / d) * a;
          }
          const [nox, nvx] = L.passoMola(fox[i], fvx[i], kM, cM, ax, dtF);
          const [noy, nvy] = L.passoMola(foy[i], fvy[i], kM, cM, ay, dtF);
          const lim = R * 1.25, m = Math.hypot(nox, noy), esc = m > lim ? lim / m : 1;
          fox[i] = nox * esc; foy[i] = noy * esc; fvx[i] = nvx; fvy[i] = nvy;
          qx[i] += fox[i]; qy[i] += foy[i];
          if (i % 6 === 0) energia += Math.abs(fox[i]) + Math.abs(foy[i]) + Math.abs(fvx[i]) * 0.02;
        }
      }
      if (fisica) viva = energia > 0.4;
      ordem.sort((a, b) => qz[a] - qz[b]);
      for (const i of ordem) {
        const prof = Math.max(0, Math.min(1, (qz[i] + 1) / 2));
        const tam = Math.max(0.35, 0.5 + prof * 1.1) * qs[i] * dpr * (1 + n * 0.3);
        const a = Math.min(1, 0.12 + prof * prof * 0.88);
        ctx.fillStyle = `rgba(${Math.min(255, cr + prof * 55)},${Math.min(255, cg + prof * 45)},${Math.min(255, cb + prof * 35)},${a})`;
        ctx.beginPath(); ctx.arc(qx[i], qy[i], tam, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${0.16 + n * 0.3})`;
      ctx.lineWidth = 1.1 * dpr;
      ctx.beginPath(); ctx.arc(cx, cy, R * (1.3 + n * 0.08), 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      requestAnimationFrame(passo);
    }
    function ligar() {
      if (rodando || !palco.classList.contains("aberto")) return;
      rodando = true;
      ultimo = performance.now();
      requestAnimationFrame(passo);
      // Reserva: janela recém-mostrada pode segurar o primeiro quadro.
      setTimeout(() => { if (rodando && performance.now() - ultimo > 120) passo(performance.now()); }, 120);
    }
    return {
      ligar,
      cursorEm,
      nascer() { sumirEm = 0; aoSumir = null; if (!lento()) nascerEm = performance.now(); fox.fill(0); foy.fill(0); fvx.fill(0); fvy.fill(0); viva = false; ligar(); },
      /** Estoura e implode; `pronto` quando acabou (já sem nada desenhado). Sem animação: na hora. */
      sumir(pronto) {
        if (lento() || !palco.classList.contains("aberto")) { pronto(); return; }
        sumirEm = performance.now(); aoSumir = pronto; nascerEm = 0; ligar();
        setTimeout(() => { if (aoSumir === pronto) { aoSumir = null; sumirEm = 0; pronto(); } }, SUMIR_MS + 250);
      },
      espalhar() { explodir = true; fluidoAte = performance.now() + 1300; ligar(); },
      estado(s) { estado = s; if (s !== "listening") mic = 0; },
      microfone(v) { mic = v; },
      fala(f) { falando = f; },
    };
  })();

  // ── estado: o que ela está fazendo, o nível da voz e a fala ao vivo ────────────────────
  const ROTULOS = { listening: "Ouvindo…", processing: "Pensando…", speaking: "", idle: "" };
  let estadoAtual = "idle", ultimoStatus = "";
  /** Troca o texto do chip com um esmaecer curto (o texto novo entra por cima). */
  function mostrarStatus(texto) {
    if (texto === ultimoStatus) return;
    ultimoStatus = texto;
    estadoEl.classList.toggle("ve", !!texto && !campo.classList.contains("ve"));
    if (!texto) return;
    const novo = el("span", "st", texto);
    estadoEl.querySelector(".st:not(.sai)")?.classList.add("sai");
    estadoEl.appendChild(novo);
    setTimeout(() => { for (const v of estadoEl.querySelectorAll(".st.sai")) v.remove(); }, 260);
  }
  function mostrarEstado(s) {
    estadoAtual = s;
    ocupada = s === "listening" || s === "processing";
    Bolota.estado(s);
    nivelEl.classList.toggle("ve", s === "listening");
    falaEl.classList.toggle("ouvindo", s === "listening");
    if (s === "listening") aoVivoEl.textContent = "";
    // "Pensando…" não apaga um estado mais específico que acabou de chegar ("Pesquisando…").
    if (s === "listening" || (s === "processing" && !ultimoStatus) || s === "idle" || s === "speaking") mostrarStatus(ROTULOS[s] ?? "");
    adiarFechar();
  }

  // Nível da voz: 5 barrinhas, cada uma com um "jeito" (a do meio mais alta), subindo rápido e caindo devagar.
  const barras = [...nivelEl.children];
  const nivelBarras = new Float32Array(barras.length);
  let nivelAlvo = 0, nivelLigado = false;
  function quadroNivel() {
    if (!nivelEl.classList.contains("ve")) { nivelLigado = false; for (const b of barras) b.style.transform = "scaleY(0.15)"; return; }
    const t = performance.now() / 1000;
    barras.forEach((b, i) => {
      const forma = [0.55, 0.85, 1, 0.8, 0.6][i] ?? 0.7;
      const alvo = Math.min(1, 0.12 + nivelAlvo * 7 * forma * (0.8 + 0.2 * Math.sin(t * 13 + i * 1.7)));
      nivelBarras[i] += (alvo - nivelBarras[i]) * (alvo > nivelBarras[i] ? 0.55 : 0.18);
      b.style.transform = `scaleY(${nivelBarras[i].toFixed(3)})`;
    });
    requestAnimationFrame(quadroNivel);
  }
  function nivelDaVoz(v) {
    nivelAlvo = v;
    if (!nivelLigado && nivelEl.classList.contains("ve")) { nivelLigado = true; requestAnimationFrame(quadroNivel); }
  }

  // Fala ao vivo (Parakeet) ao lado da bolota: SÓ o que ele está dizendo agora (13/11, o dono não
  // quer histórico). Some 1,2 s depois que ele termina (a pergunta já vai no cartão da resposta).
  function falaParcial(t) {
    aoVivoEl.textContent = t;
  }
  let falaAte = 0;
  function falaFinal(t) {
    if (t) aoVivoEl.textContent = t;
    falaAte = performance.now() + 1200;
  }
  /** Por quadro: a fala aparece ouvindo (com texto) e logo depois do fim. */
  function falaVisivel() {
    const ve = !!aoVivoEl.textContent && (estadoAtual === "listening" || performance.now() < falaAte);
    if (ve !== falaEl.classList.contains("ve")) falaEl.classList.toggle("ve", ve);
    if (!ve && estadoAtual !== "listening" && aoVivoEl.textContent && performance.now() > falaAte + 300) aoVivoEl.textContent = "";
  }

  // ── cartões soltos ─────────────────────────────────────────────────────────────────────
  function el(tag, cls, texto) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (texto != null) e.textContent = texto;
    return e;
  }

  /**
   * Onde um cartão novo nasce: do lado da bolota que tem espaço, empilhado abaixo dos outros desta
   * resposta, e sempre inteiro na tela. Depois ele fica onde estiver (ou onde ele arrastar).
   */
  // 13/11: os cartões de uma resposta vão numa COLUNA (flex): o da resposta cresce com o texto e
  // os de baixo descem junto, sem se sobrepor. Arrastar um cartão tira ele da coluna (fica solto).
  // A coluna nasce do lado que tem espaço — depois da fala (à direita), senão à esquerda da
  // bolota, senão embaixo dela.
  let coluna = null;
  function novaPilha() {
    if (coluna && !coluna.children.length) coluna.remove();
    coluna = el("div", "coluna");
    const L = 400, larguraLado = 350;
    // Sempre com pelo menos ~420 px de altura livre (a resposta + um desenho), mesmo com a bolota embaixo.
    let x, y = Math.max(16, Math.min(pos.y - 30, telaH - 436));
    if (pos.x + 34 + larguraLado + 10 + L < telaW - 16) x = pos.x + 34 + larguraLado + 10;
    else if (pos.x - 60 - L > 16) x = pos.x - 60 - L;
    else { x = Math.max(16, Math.min(telaW - 16 - L, pos.x - L / 2)); y = pos.y > telaH / 2 ? 16 : Math.min(telaH - 436, pos.y + 60); }
    coluna.style.left = `${x}px`; coluna.style.top = `${y}px`;
    coluna.style.maxHeight = `${telaH - y - 16}px`;
    cartoes.appendChild(coluna);
  }

  /** Um cartão solto: cabeçalho (arrastar, minimizar, fixar, fechar) e o corpo. Devolve o corpo. */
  function novoCartao(titulo = "") {
    const c = el("div", "cartao vidro interativo");
    const cab = el("div", "cab");
    const tit = el("span", "tit", titulo);
    const bMin = el("button", "bt min"); bMin.title = "Minimizar"; bMin.innerHTML = '<svg viewBox="0 0 16 16"><path d="M3 8h10"/></svg>';
    const bFix = el("button", "bt fix"); bFix.title = "Fixar (fica na tela)"; bFix.innerHTML = '<svg viewBox="0 0 16 16"><path d="M10 2l4 4-2.5 1-2.5 2.5.5 3-1.5 1.5L5.5 11 2 14.5 1.5 14 5 10.5 2.5 8 4 6.5l3 .5L9.5 4.5z"/></svg>';
    const bX = el("button", "bt x"); bX.title = "Fechar"; bX.innerHTML = '<svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
    cab.append(tit, bMin, bFix, bX);
    const corpo = el("div", "corpo");
    c.append(cab, corpo);
    if (!coluna || !coluna.isConnected) novaPilha();
    // 14/11 (como o Roamies): no máximo 3 cartões soltos na tela — o mais antigo (não fixado) sai.
    const soltos = [...cartoes.querySelectorAll(".cartao:not(.fixo):not(.sai)")];
    if (soltos.length >= 3) fecharCartao(soltos[0]);
    coluna.appendChild(c);
    bMin.addEventListener("click", () => { c.classList.toggle("mini"); bMin.title = c.classList.contains("mini") ? "Abrir" : "Minimizar"; });
    bFix.addEventListener("click", () => { c.classList.toggle("fixo"); adiarFechar(); });
    bX.addEventListener("click", () => fecharCartao(c));
    // Duplo clique no cabeçalho também minimiza (como janela).
    cab.addEventListener("dblclick", (e) => { if (!e.target.closest(".bt")) c.classList.toggle("mini"); });
    arrastavel(c, cab);
    return corpo;
  }
  function tituloDo(corpo, t) { const tit = corpo?.parentElement?.querySelector(".tit"); if (tit && t) tit.textContent = t; }
  function fecharCartao(c) {
    if (resposta && resposta.c === c) resposta = null;
    c.classList.add("sai");
    setTimeout(() => { const col = c.parentElement; c.remove(); if (col?.classList.contains("coluna") && !col.children.length && col !== coluna) col.remove(); }, 170);
  }

  // Arrastar pelo cabeçalho (pointer capture: não perde o cartão se o mouse correr).
  let arrastando = false;
  function arrastavel(c, cab) {
    let ox = 0, oy = 0, id = null;
    cab.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest(".bt")) return;
      id = e.pointerId; cab.setPointerCapture(id);
      const r = c.getBoundingClientRect();
      ox = e.clientX - r.left; oy = e.clientY - r.top;
      arrastando = true;
      c.classList.add("arrastando", "solto");
      // Sai da coluna (se estava) e vem para a frente, no mesmo lugar da tela.
      c.style.left = `${r.left}px`; c.style.top = `${r.top}px`;
      cartoes.appendChild(c);
    });
    cab.addEventListener("pointermove", (e) => {
      if (e.pointerId !== id) return;
      const x = Math.max(-c.offsetWidth + 80, Math.min(telaW - 80, e.clientX - ox));
      const y = Math.max(0, Math.min(telaH - 40, e.clientY - oy));
      c.style.left = `${x}px`; c.style.top = `${y}px`;
    });
    const soltar = (e) => {
      if (e.pointerId !== id) return;
      id = null; arrastando = false;
      c.classList.remove("arrastando");
      c.classList.add("movido");
    };
    cab.addEventListener("pointerup", soltar);
    cab.addEventListener("pointercancel", soltar);
  }

  /** Pergunta nova: some o que não está fixado. */
  function limpar() {
    for (const c of [...cartoes.children]) if (!c.classList.contains("fixo")) fecharCartao(c);
    esconderBalao();
    esperando.clear();
    coluna = null;
    limparMarcas();
  }

  /**
   * A resposta: 14/11 (o dono: "o texto fica muito longe da bolota") — num balão colado nela, como
   * no Roamies, e não mais num cartão lá do lado. O texto chega aos poucos; os desenhos e telas
   * continuam em cartões (arrastáveis).
   */
  let resposta = null;
  function cartaoResposta() {
    if (resposta) return resposta;
    balaoTexto.textContent = "";
    balaoTexto.appendChild(el("span", "cursor"));
    balao.classList.add("ve");
    resposta = { c: balao, t: balaoTexto, bruto: "", fechado: false };
    return resposta;
  }
  function esconderBalao() {
    balao.classList.remove("ve");
    balaoTexto.textContent = "";
    resposta = null;
  }
  /** Negrito do markdown vira <b>; o resto entra como texto (nada de HTML vindo do modelo). */
  function pintarTexto(alvo, bruto, comCursor) {
    alvo.textContent = "";
    // As cercas de código (```) não aparecem cruas no balão.
    const limpo = bruto.replace(/^#{1,6}\s+/gm, "").replace(/^\s*[-*]\s+/gm, "• ").replace(/^\s*```\w*\s*$/gm, "");
    for (const [i, parte] of limpo.split(/\*\*/).entries()) {
      if (!parte) continue;
      alvo.appendChild(i % 2 ? el("b", null, parte) : document.createTextNode(parte));
    }
    if (comCursor) alvo.appendChild(el("span", "cursor"));
    // O balão rola sozinho junto com o texto novo.
    if (alvo === balaoTexto) balao.scrollTop = balao.scrollHeight;
  }
  let pintura = 0;
  function chegouPedaco(token) {
    const r = cartaoResposta("");
    // Pedaço atrasado de uma resposta que já fechou: ignora (ele repintava o cursor no fim).
    if (r.fechado) return;
    r.bruto += token;
    if (!pintura) { pintura = 1; noQuadro(() => { pintura = 0; pintarTexto(r.t, r.bruto, !r.fechado); }); }
  }
  function respostaFinal(texto) {
    const r = cartaoResposta("");
    r.bruto = String(texto || r.bruto);
    r.fechado = true;
    pintarTexto(r.t, r.bruto, false);
    mostrarStatus("");
  }

  // Esqueleto enquanto o desenho ou a tela vem.
  const esperando = new Map();
  function esqueleto(chave) {
    if (esperando.has(chave)) return esperando.get(chave);
    const corpo = novoCartao(chave === "desenho" ? "Desenhando…" : "Montando a tela…");
    corpo.appendChild(el("div", "esqueleto"));
    esperando.set(chave, corpo);
    return corpo;
  }
  function soltarEsqueleto(chave) {
    const corpo = esperando.get(chave);
    esperando.delete(chave);
    if (corpo) fecharCartao(corpo.parentElement);
  }
  function lugarDe(chave, titulo) {
    const corpo = esperando.get(chave);
    esperando.delete(chave);
    if (!corpo) return novoCartao(titulo);
    corpo.textContent = "";
    tituloDo(corpo, titulo);
    return corpo;
  }

  // ── modelo 3D em pontos (13/11): o mesmo jeito da bolota — cada peça vira uma nuvem de pontos
  // na superfície, a cena gira devagar e cada peça faz o movimento dela (gira, orbita, desliza, pulsa).
  function pontosDaForma(forma, n) {
    const p = [], ouro = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const u = i / n, th = ouro * i;
      if (forma === "esfera") { const y = 1 - 2 * u, r = Math.sqrt(1 - y * y); p.push([Math.cos(th) * r, y, Math.sin(th) * r]); }
      else if (forma === "caixa") { const f = i % 6, a = ((i * 0.618) % 1) * 2 - 1, b = ((i * 0.382 + u) % 1) * 2 - 1; const s = f % 2 ? 1 : -1; p.push(f < 2 ? [s, a, b] : f < 4 ? [a, s, b] : [a, b, s]); }
      else if (forma === "cilindro") { const y = u * 2 - 1; p.push([Math.cos(th), i % 7 === 0 ? (i % 14 ? 1 : -1) : y, Math.sin(th)]); }
      else if (forma === "cone") { const y = u * 2 - 1, r = (1 - y) / 2; p.push([Math.cos(th) * r, y, Math.sin(th) * r]); }
      else { const a = th, b = (i * 2.399) % (Math.PI * 2); p.push([(1 + 0.3 * Math.cos(b)) * Math.cos(a) / 1.3, 0.3 * Math.sin(b) / 1.3, (1 + 0.3 * Math.cos(b)) * Math.sin(a) / 1.3]); }
    }
    return p;
  }
  function modelo3d(c, d) {
    const tela = el("canvas", "modelo3d");
    c.appendChild(tela);
    const ctx = tela.getContext("2d");
    const pecas = d.partes.map((q, i) => ({ ...q, pts: pontosDaForma(q.forma, Math.round(90 + Math.min(1, (q.sx + q.sy + q.sz) / 1.5) * 160)), cor: cor(q.tom, i % 2 ? "b" : "a"), fase: i * 1.7 }));
    const legenda = el("div", "legenda");
    for (const q of pecas) if (q.rotulo) { const s = el("span"); const b = el("i"); b.style.background = q.cor; s.append(b, document.createTextNode(q.rotulo)); legenda.appendChild(s); }
    if (legenda.childNodes.length) c.appendChild(legenda);
    if (d.legenda) c.appendChild(el("p", "nota", d.legenda));
    let t0 = performance.now(), ativo = true;
    function quadro(agora) {
      if (!tela.isConnected || !palco.classList.contains("aberto")) { ativo = false; return; }
      const dpr = Math.min(2, devicePixelRatio || 1), W = Math.round(tela.clientWidth * dpr), H = Math.round(tela.clientHeight * dpr);
      if (tela.width !== W || tela.height !== H) { tela.width = W; tela.height = H; }
      ctx.clearRect(0, 0, W, H);
      const t = (agora - t0) / 1000, devagar = reduzir();
      const rot = devagar ? 0.6 : t * 0.35, cr = Math.cos(rot), sr = Math.sin(rot), inc = 0.42, ci = Math.cos(inc), si = Math.sin(inc);
      const esc = Math.min(W, H) * 0.36;
      const lista = [];
      for (const q of pecas) {
        let ox = q.x, oy = q.y, oz = q.z, s = 1, giro = 0;
        if (!devagar) {
          if (q.movimento === "orbita") { const a = t * 0.9 + q.fase, cx = Math.cos(a), sx = Math.sin(a); [ox, oz] = [q.x * cx - q.z * sx, q.x * sx + q.z * cx]; if (!q.x && !q.z) ox = 0.6 * cx, oz = 0.6 * sx; }
          else if (q.movimento === "desliza") { const k = Math.sin(t * 2.2 + q.fase) * 0.35; if (q.eixo === "x") ox += k; else if (q.eixo === "z") oz += k; else oy += k; }
          else if (q.movimento === "pulsa") s = 1 + 0.12 * Math.sin(t * 4 + q.fase);
          else if (q.movimento === "gira") giro = t * 1.6;
        }
        const cg = Math.cos(giro), sg = Math.sin(giro);
        for (const [px, py, pz] of q.pts) {
          let x = px * q.sx * s, y = py * q.sy * s, z = pz * q.sz * s;
          [x, z] = [x * cg - z * sg, x * sg + z * cg];
          x += ox; y += oy; z += oz;
          const x1 = x * cr + z * sr, z1 = -x * sr + z * cr;
          const y2 = y * ci - z1 * si, z2 = y * si + z1 * ci;
          const f = 3 / (3 - z2);
          lista.push([W / 2 + x1 * esc * f, H / 2 - y2 * esc * f, z2, f, q.cor]);
        }
      }
      lista.sort((a, b) => a[2] - b[2]);
      for (const [x, y, z, f, c2] of lista) {
        const prof = Math.max(0, Math.min(1, (z + 1.4) / 2.8));
        ctx.globalAlpha = 0.25 + prof * 0.75;
        ctx.fillStyle = c2;
        ctx.beginPath(); ctx.arc(x, y, (0.8 + prof * 1.5) * f * dpr, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(quadro);
    }
    requestAnimationFrame(quadro);
    void ativo;
  }

  const DESENHOS = {
    modelo: modelo3d,
    foto(c, d) {
      if (!d.src) return;
      const img = el("img", "foto");
      img.src = d.src; img.alt = d.legenda || d.busca || "";
      c.appendChild(img);
      if (d.legenda) c.appendChild(el("p", "nota", d.legenda));
    },
    conta(c, d) {
      const lista = el("div", "conta");
      d.passos.forEach((p, i) => {
        const linha = el("div", "linha-conta"); linha.style.animationDelay = `${i * 260}ms`;
        linha.append(el("div", "expr", p.expr));
        if (p.nota) linha.append(el("div", "nota", p.nota));
        lista.appendChild(linha);
      });
      c.appendChild(lista);
    },
    quiz(c, d) {
      let certos = 0, feitos = 0;
      const placar = el("div", "placar", `0 de ${d.perguntas.length}`);
      d.perguntas.forEach((q, k) => {
        const bloco = el("div", "pergunta-quiz");
        bloco.appendChild(el("div", "enunciado", `${k + 1}. ${q.texto}`));
        const ops = el("div", "opcoes");
        for (const o of q.opcoes) {
          const b = el("button", "opcao", o);
          b.addEventListener("click", () => {
            if (bloco.classList.contains("respondida")) return;
            bloco.classList.add("respondida");
            const certo = o === q.resposta;
            b.classList.add(certo ? "certa" : "errada");
            if (!certo) for (const x of ops.children) if (x.textContent === q.resposta) x.classList.add("certa");
            if (q.explica) bloco.appendChild(el("div", "explica", q.explica));
            feitos++; if (certo) certos++;
            placar.textContent = `${certos} de ${d.perguntas.length}${feitos === d.perguntas.length ? (certos === feitos ? " — mandou bem!" : "") : ""}`;
          });
          ops.appendChild(b);
        }
        bloco.appendChild(ops);
        c.appendChild(bloco);
      });
      c.appendChild(placar);
    },
    botoes(c, d) {
      const linha = el("div", "botoes-acao");
      for (const b of d.itens) {
        const bt = el("button", "acao", b.texto);
        bt.addEventListener("click", () => {
          if (b.faz === "perguntar") perguntar(b.valor);
          else if (b.faz === "abrir") window.ely.abrir(b.valor);
          else navigator.clipboard.writeText(b.valor).then(() => { bt.textContent = "Copiado"; setTimeout(() => (bt.textContent = b.texto), 1200); }).catch(() => {});
        });
        linha.appendChild(bt);
      }
      c.appendChild(linha);
    },
    cartao(c, d) {
      if (d.titulo) c.appendChild(el("h3", null, d.titulo));
      if (d.texto) c.appendChild(el("p", null, d.texto));
      if (d.itens?.length) { const ul = el("ul"); for (const i of d.itens) ul.appendChild(el("li", null, i)); c.appendChild(ul); }
    },
    passos(c, d) {
      if (d.titulo) c.appendChild(el("h3", null, d.titulo));
      const ol = el("ol", "passos");
      d.itens.forEach((i, n) => {
        const li = el("li"); li.style.animationDelay = `${n * 70}ms`;
        const div = el("div", null, i.titulo);
        if (i.nota) div.appendChild(el("small", null, i.nota));
        li.appendChild(div); ol.appendChild(li);
      });
      c.appendChild(ol);
    },
    linhaDoTempo(c, d) {
      if (d.titulo) c.appendChild(el("h3", null, d.titulo));
      const t = el("div", "tempo");
      d.eventos.forEach((e, n) => { const div = el("div"); div.style.animationDelay = `${n * 70}ms`; div.append(el("b", null, e.quando), document.createTextNode(e.texto)); t.appendChild(div); });
      c.appendChild(t);
    },
    barras(c, d) {
      if (d.titulo) c.appendChild(el("h3", null, d.titulo));
      const max = Math.max(...d.itens.map((i) => Math.abs(i.valor)), 1e-9);
      const fmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
      d.itens.forEach((i, n) => {
        const b = el("div", "barra");
        const rot = el("div", "rot"); rot.append(el("span", null, i.rotulo), el("span", null, `${fmt.format(i.valor)}${d.unidade ? ` ${d.unidade}` : ""}`));
        const tr = el("div", "trilho"), en = el("div", "enche");
        en.style.width = `${Math.max(2, (Math.abs(i.valor) / max) * 100)}%`;
        en.style.background = `linear-gradient(90deg, ${cor(i.tom, n % 2 ? "b" : "a")}, color-mix(in srgb, ${cor(i.tom, n % 2 ? "b" : "a")} 55%, white))`;
        en.style.animationDelay = `${n * 60}ms`;
        tr.appendChild(en); b.append(rot, tr); c.appendChild(b);
      });
    },
    tabela(c, d) {
      if (d.titulo) c.appendChild(el("h3", null, d.titulo));
      const t = el("table"), cab = el("tr");
      for (const col of d.colunas) cab.appendChild(el("th", null, col));
      t.appendChild(cab);
      for (const linha of d.linhas) {
        const tr = el("tr");
        for (let i = 0; i < d.colunas.length; i++) {
          const v = String(linha[i] ?? "");
          const s = v.trim().toLowerCase();
          tr.appendChild(s === "sim" ? el("td", "sim", "✓") : s === "não" || s === "nao" ? el("td", "nao", "✗") : el("td", null, v));
        }
        t.appendChild(tr);
      }
      c.appendChild(t);
    },
    fluxo(c, d) {
      if (d.titulo) c.appendChild(el("h3", null, d.titulo));
      // Camadas pela distância a partir de quem não tem entrada (uma volta só; ciclo não trava).
      const entra = new Map(d.nos.map((n) => [n.id, 0]));
      for (const l of d.ligacoes) entra.set(l.para, (entra.get(l.para) || 0) + 1);
      const nivelDe = new Map();
      const raizes = d.nos.filter((n) => !entra.get(n.id));
      const fila = (raizes.length ? raizes : [d.nos[0]]).map((n) => [n.id, 0]);
      while (fila.length) {
        const [id, nv] = fila.shift();
        if (nivelDe.has(id) || nv > 8) continue;
        nivelDe.set(id, nv);
        for (const l of d.ligacoes) if (l.de === id) fila.push([l.para, nv + 1]);
      }
      let extra = Math.max(0, ...nivelDe.values()) + 1;
      for (const n of d.nos) if (!nivelDe.has(n.id)) nivelDe.set(n.id, extra++);
      const caixa = el("div", "fluxo");
      const camadas = [];
      const nos = new Map();
      d.nos.forEach((n, i) => {
        const nv = nivelDe.get(n.id);
        if (!camadas[nv]) camadas[nv] = el("div", "camada");
        const no = el("div", `no ${n.forma || "caixa"}`, n.texto);
        no.style.setProperty("--cor", cor(n.tom));
        no.style.animationDelay = `${i * 60}ms`;
        camadas[nv].appendChild(no);
        nos.set(n.id, no);
      });
      for (const cam of camadas) if (cam) caixa.appendChild(cam);
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      caixa.appendChild(svg);
      c.appendChild(caixa);
      // As linhas saem depois do layout (posição real de cada caixa).
      noQuadro(() => {
        const base = caixa.getBoundingClientRect();
        for (const l of d.ligacoes) {
          const a = nos.get(l.de)?.getBoundingClientRect(), b = nos.get(l.para)?.getBoundingClientRect();
          if (!a || !b) continue;
          const x1 = a.left + a.width / 2 - base.left, y1 = a.bottom - base.top, x2 = b.left + b.width / 2 - base.left, y2 = b.top - base.top;
          const sobe = y2 <= y1;
          const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
          const meio = (y1 + y2) / 2;
          p.setAttribute("d", sobe ? `M${x1},${a.top - base.top} C${x1 + 40},${y1 - 30} ${x2 + 40},${y2 + 30} ${x2},${b.bottom - base.top}` : `M${x1},${y1} C${x1},${meio} ${x2},${meio} ${x2},${y2}`);
          if (l.andando) p.setAttribute("class", "andando");
          svg.appendChild(p);
          if (l.rotulo) {
            const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
            t.setAttribute("x", String((x1 + x2) / 2 + 6)); t.setAttribute("y", String(meio + 3));
            t.textContent = l.rotulo; svg.appendChild(t);
          }
        }
      });
    },
    diagrama(c, d) {
      if (d.titulo) c.appendChild(el("h3", null, d.titulo));
      const NS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(NS, "svg");
      // Escala ×100 (12/11): texto de 0,08 unidade num viewBox de 2,5 o Chromium não desenha.
      svg.setAttribute("viewBox", "-125 -125 250 250");
      const legenda = el("div", "legenda");
      const defs = document.createElementNS(NS, "defs");
      defs.innerHTML = '<marker id="ponta" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke"/></marker>';
      svg.appendChild(defs);
      // Maiores primeiro (o anel grande não cobre o ponto do meio).
      const caixaX = [Infinity, -Infinity], caixaY = [Infinity, -Infinity];
      const rotulos = [];
      const caber = (cx, cy, r) => {
        caixaX[0] = Math.min(caixaX[0], cx - r); caixaX[1] = Math.max(caixaX[1], cx + r);
        caixaY[0] = Math.min(caixaY[0], cy - r - 12); caixaY[1] = Math.max(caixaY[1], cy + r);
      };
      const partes = d.partes.map((p) => ({ ...p, x: p.x * 100, y: p.y * 100, r: p.r * 100, x2: p.x2 == null ? null : p.x2 * 100, y2: p.y2 == null ? null : p.y2 * 100 })).sort((p, q) => (q.forma === "seta" ? -1 : q.r) - (p.forma === "seta" ? -1 : p.r));
      partes.forEach((p, i) => {
        // Preto só serve de preenchimento (o miolo do buraco negro); em linha some no fundo escuro.
        const c1 = cor(p.tom === "preto" && p.forma !== "circulo" ? "branco" : p.tom, i % 2 ? "b" : "a");
        const x = p.x, y = -p.y;
        let forma;
        if (p.forma === "seta") {
          forma = document.createElementNS(NS, "line");
          forma.setAttribute("x1", x); forma.setAttribute("y1", y);
          forma.setAttribute("x2", p.x2 ?? x + 40); forma.setAttribute("y2", -(p.y2 ?? p.y));
          forma.setAttribute("stroke", c1); forma.setAttribute("stroke-width", "2.5"); forma.setAttribute("marker-end", "url(#ponta)");
        } else {
          forma = document.createElementNS(NS, "circle");
          forma.setAttribute("cx", x); forma.setAttribute("cy", y);
          forma.setAttribute("r", p.forma === "ponto" ? Math.min(p.r, 5) : p.r);
          if (p.forma === "anel") {
            forma.setAttribute("fill", "none"); forma.setAttribute("stroke", c1); forma.setAttribute("stroke-width", String(Math.max(2, p.r * 0.09)));
            if (p.movimento === "gira") forma.setAttribute("stroke-dasharray", `${p.r * 0.5} ${p.r * 0.25}`);
          } else {
            forma.setAttribute("fill", p.forma === "ponto" ? c1 : `color-mix(in srgb, ${c1} 78%, transparent)`);
            if (p.forma === "circulo") forma.setAttribute("stroke", "rgba(255,255,255,.18)"), forma.setAttribute("stroke-width", "0.8");
          }
        }
        let alvo = forma;
        if (p.movimento === "orbita" && p.forma !== "seta") {
          const g = document.createElementNS(NS, "g");
          g.setAttribute("class", "orbita");
          const dist = Math.hypot(p.x, p.y) / 100;
          g.style.setProperty("--t", `${(5 + dist * 7).toFixed(1)}s`);
          g.style.animationDelay = `-${(i * 1.3).toFixed(1)}s`;
          g.appendChild(forma);
          alvo = g;
        } else if (p.movimento === "pulso" || p.movimento === "gira") {
          forma.setAttribute("class", p.movimento);
        }
        svg.appendChild(alvo);
        // O quadro do desenho (o que a parte ocupa; em órbita, o círculo inteiro que ela percorre).
        if (p.forma === "seta") { caber(x, y, 0); caber(p.x2 ?? x + 40, -(p.y2 ?? p.y), 0); }
        else if (p.movimento === "orbita") caber(0, 0, Math.hypot(x, y) + p.r);
        else caber(x, y, p.forma === "ponto" ? Math.min(p.r, 5) : p.r);
        if (p.rotulo && p.movimento !== "orbita") caixaX[1] = Math.max(caixaX[1], x + p.r * 0.72 + 6 + p.rotulo.length * 4.6);
        if (p.rotulo) {
          if (p.movimento === "orbita") {
            const item = el("span"); const bol = el("i"); bol.style.background = c1;
            item.append(bol, document.createTextNode(p.rotulo)); legenda.appendChild(item);
          } else {
            const t = document.createElementNS(NS, "text");
            const r = p.forma === "seta" ? 0 : p.forma === "ponto" ? 5 : p.r;
            // Rótulo do lado de fora, à direita (ou à esquerda, perto da borda direita).
            const seta = p.forma === "seta";
            const dir = x + r + 6 < 85;
            // Seta: o rótulo no meio dela, por cima da linha; o resto, do lado de fora da forma.
            const mx = seta ? (x + (p.x2 ?? x + 40)) / 2 : 0, my = seta ? Math.min(y, -(p.y2 ?? p.y)) - 6 : 0;
            const tx = seta ? mx : dir ? x + r * 0.72 + 6 : x - r * 0.72 - 6;
            let ty = seta ? my : y - r * 0.72 - 3;
            // Sem rótulo em cima de rótulo (anéis do mesmo tamanho caíam no mesmo lugar): desce até achar vaga.
            const larg = p.rotulo.length * 4.6;
            const caixaDe = (yy) => seta ? [tx - larg / 2, yy - 9, tx + larg / 2, yy + 2] : dir ? [tx, yy - 9, tx + larg, yy + 2] : [tx - larg, yy - 9, tx, yy + 2];
            const bate = (b) => rotulos.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
            for (let k = 0; k < 10 && bate(caixaDe(ty)); k++) ty += 11;
            rotulos.push(caixaDe(ty));
            t.setAttribute("x", String(tx));
            t.setAttribute("y", String(ty));
            t.setAttribute("text-anchor", seta ? "middle" : dir ? "start" : "end");
            t.textContent = p.rotulo;
            svg.appendChild(t);
          }
        }
      });
      for (const r of rotulos) { caixaX[0] = Math.min(caixaX[0], r[0]); caixaX[1] = Math.max(caixaX[1], r[2]); caixaY[0] = Math.min(caixaY[0], r[1]); caixaY[1] = Math.max(caixaY[1], r[3]); }
      // Enquadra no que foi desenhado (o modelo nem sempre usa o quadro todo), com folga.
      if (Number.isFinite(caixaX[0])) {
        const m = 8, x0 = Math.max(-200, caixaX[0] - m), x1 = Math.min(200, caixaX[1] + m), y0 = Math.max(-160, caixaY[0] - m), y1 = Math.min(160, caixaY[1] + m);
        const w = Math.max(80, x1 - x0), h = Math.max(80, y1 - y0);
        svg.setAttribute("viewBox", `${x0 - (w - (x1 - x0)) / 2} ${y0 - (h - (y1 - y0)) / 2} ${w} ${h}`);
      }
      const caixa = el("div", "diagrama");
      caixa.appendChild(svg);
      c.appendChild(caixa);
      if (legenda.childNodes.length) c.appendChild(legenda);
      if (d.legenda) c.appendChild(el("p", null, d.legenda)).style.cssText = "margin:8px 0 0;font-size:12.5px;color:var(--apagado)";
    },
  };

  function mostrarCartoes(lista) {
    const validos = (lista || []).filter((d) => DESENHOS[d?.tipo]);
    if (!validos.length) { soltarEsqueleto("desenho"); return; }
    validos.forEach((d, i) => {
      // O título do cartão sobe para o cabeçalho (o h3 de dentro sai).
      const corpo = i === 0 ? lugarDe("desenho", d.titulo || "Desenho") : novoCartao(d.titulo || "Desenho");
      try { DESENHOS[d.tipo](corpo, { ...d, titulo: "" }); } catch (e) { console.warn("[flutuante] cartão falhou:", e); fecharCartao(corpo.parentElement); }
    });
    adiarFechar();
  }

  // ── marcas na tela (o guia de tela, 13/11) ─────────────────────────────────────────────
  // Os passos aparecem um por vez (o anterior fica mais apagado), cada um com a frase dele na
  // legenda embaixo; tudo some na próxima pergunta, no Esc, ao fechar ou em 30 s.
  const marcasEl = $("marcas"), legendaEl = $("legenda");
  const SVG = "http://www.w3.org/2000/svg";
  let timersMarcas = [];
  function svg(tag, attrs, pai) {
    const e = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    if (pai) pai.appendChild(e);
    return e;
  }
  function limparMarcas() {
    for (const t of timersMarcas) clearTimeout(t);
    timersMarcas = [];
    marcasEl.textContent = "";
    legendaEl.classList.remove("ve");
  }
  function tracar(e) {
    try { const L = Math.ceil(e.getTotalLength()); e.style.setProperty("--L", L); } catch { /* sem comprimento */ }
  }
  function desenharMarca(g, m) {
    const pad = 6, x = m.x - pad, y = m.y - pad, w = m.w + pad * 2, h = m.h + pad * 2;
    if (m.tipo === "anel") {
      const r = svg("rect", { x, y, width: w, height: h, rx: Math.min(14, h / 2), class: "anel pulsa" }, g); tracar(r);
    } else if (m.tipo === "sublinhado") {
      const l = svg("line", { x1: m.x, y1: m.y + m.h + 4, x2: m.x + m.w, y2: m.y + m.h + 4, class: "sub tracar" }, g); tracar(l);
    } else if (m.tipo === "seta") {
      // De fora para dentro: vem do lado com mais espaço.
      const daDireita = m.x + m.w + 140 < telaW, deCima = m.y > 120;
      const ex = daDireita ? m.x + m.w + 8 : m.x - 8, ey = m.y + m.h / 2;
      const sx = daDireita ? ex + 110 : ex - 110, sy = deCima ? ey - 70 : ey + 70;
      const p = svg("path", { d: `M${sx},${sy} Q${(sx + ex) / 2},${sy} ${ex},${ey}`, class: "seta tracar" }, g); tracar(p);
      const ang = Math.atan2(ey - sy, ex - (sx + ex) / 2);
      const pt = (a, r) => `${ex - Math.cos(ang + a) * r},${ey - Math.sin(ang + a) * r}`;
      svg("polygon", { points: `${ex},${ey} ${pt(0.45, 13)} ${pt(-0.45, 13)}`, class: "ponta" }, g);
    } else if (m.tipo === "num") {
      svg("circle", { cx: m.x - 2, cy: m.y - 2, r: 12, class: "numc" }, g);
      const t = svg("text", { x: m.x - 2, y: m.y - 2, class: "numt" }, g); t.textContent = String(m.n || 1);
    } else if (m.tipo === "destaque") {
      const id = `buraco${Math.random().toString(36).slice(2, 7)}`;
      const mask = svg("mask", { id }, g);
      svg("rect", { x: 0, y: 0, width: telaW, height: telaH, fill: "white" }, mask);
      svg("rect", { x, y, width: w, height: h, rx: 12, fill: "black" }, mask);
      svg("rect", { x: 0, y: 0, width: telaW, height: telaH, mask: `url(#${id})`, class: "velado" }, g);
    }
    if (m.texto && (m.tipo === "rotulo" || m.tipo === "anel" || m.tipo === "seta")) {
      const rg = svg("g", { class: "rot" }, g);
      const largura = m.texto.length * 7.2 + 20;
      const embaixo = m.y + m.h + 40 < telaH;
      const rx = Math.max(8, Math.min(telaW - largura - 8, m.x + m.w / 2 - largura / 2)), ry = embaixo ? m.y + m.h + 12 : m.y - 40;
      svg("rect", { x: rx, y: ry, width: largura, height: 28, rx: 14 }, rg);
      const t = svg("text", { x: rx + 10, y: ry + 14 }, rg); t.textContent = m.texto;
    }
  }
  function mostrarMarcas(o) {
    limparMarcas();
    const passos = Array.isArray(o?.passos) ? o.passos : [];
    const PASSO_MS = 2600;
    passos.forEach((p, k) => {
      timersMarcas.push(setTimeout(() => {
        for (const ant of marcasEl.querySelectorAll(".passo")) ant.classList.add("antigo");
        const g = svg("g", { class: "passo" }, marcasEl);
        for (const m of p.marcas || []) { try { desenharMarca(g, m); } catch (e) { console.warn("[marca]", e); } }
        if (p.dizer) { legendaEl.textContent = passos.length > 1 ? `${k + 1}. ${p.dizer}` : p.dizer; legendaEl.classList.add("ve"); }
      }, k * PASSO_MS));
    });
    timersMarcas.push(setTimeout(limparMarcas, Math.max(30_000, passos.length * PASSO_MS + 15_000)));
    adiarFechar();
  }

  /** "Posso fazer isso?" — só para o que apaga ou desfaz algo de vez. */
  // 14/11 (o dono: "se tiver permissão, o botão flutuante escrito sim ou não"): uma pílula colada na
  // bolota, com o que vai fazer e Sim / Não grandes. Uma por vez; sem resposta em 30 s some (= não).
  const pilula = $("pilula"), pilulaTexto = $("pilulaTexto");
  let pilulaId = null, pilulaTimer = null;
  function esconderPilula() { pilula.classList.remove("ve"); pilulaId = null; clearTimeout(pilulaTimer); }
  function pedirConfirmacao(o) {
    if (!o || typeof o.id !== "string") return;
    if (pilulaId && pilulaId !== o.id) window.ely.confirmar(pilulaId, false);
    pilulaId = o.id;
    pilulaTexto.textContent = String(o.texto || "Fazer isso?");
    pilula.classList.add("ve");
    parada = true;
    clearTimeout(pilulaTimer);
    pilulaTimer = setTimeout(esconderPilula, 30_000);
    adiarFechar();
  }
  for (const b of pilula.querySelectorAll("button")) {
    b.addEventListener("click", () => {
      if (!pilulaId) return;
      window.ely.confirmar(pilulaId, b.classList.contains("sim"));
      esconderPilula();
    });
  }

  // ── tela (OpenUI), o mesmo renderer isolado do chat ──────────────────────────────────────
  const telas = new Map(); // contentWindow → { iframe, programa, cargas }
  function varsDaTela() {
    return {
      esquema: "escuro",
      vars: {
        "--iui-canvas": tema.surface, "--iui-ink": "#e6edf6", "--iui-muted": "#9aa4b5", "--iui-faint": "#9aa4b5", "--iui-on-ink": tema.bg,
        "--iui-accent": tema.purpleBright, "--iui-on-accent": "#111118",
        "--iui-surface": "rgba(255,255,255,0.06)", "--iui-surface-strong": "rgba(255,255,255,0.10)",
        "--iui-border": "rgba(255,255,255,0.10)", "--iui-border-strong": "rgba(255,255,255,0.18)",
        "--iui-radius-lg": "14px", "--iui-radius-xl": "16px",
        "--iui-chart-2": tema.cyan, "--iui-chart-3": tema.blobs?.[0] || tema.cyan, "--iui-chart-4": tema.blobs?.[2] || tema.purple,
      },
      reduzirMovimento: reduzir(),
    };
  }
  function mostrarTela(chave, programa) {
    const c = lugarDe(chave, "Tela");
    const f = el("iframe", "tela");
    f.setAttribute("sandbox", "allow-scripts");
    f.setAttribute("referrerpolicy", "no-referrer");
    f.title = "Tela da Ely";
    f.src = "ui/render.html";
    c.appendChild(f);
    const ctrl = { iframe: f, programa, cargas: 0 };
    telas.set(f.contentWindow, ctrl);
    f.addEventListener("load", () => {
      // Só a primeira carga é a tela; se navegar para fora, para de ouvir.
      if (++ctrl.cargas === 1) iniciarTela(ctrl); else telas.delete(f.contentWindow);
    });
  }
  function iniciarTela(ctrl) {
    const w = ctrl.iframe.contentWindow;
    if (!w) return;
    w.postMessage({ tipo: "config", internet: true, modo: "previa" }, "*");
    w.postMessage({ tipo: "programa", texto: ctrl.programa, tema: varsDaTela() }, "*");
  }
  window.addEventListener("message", (e) => {
    const ctrl = telas.get(e.source);
    const m = e.data;
    if (!ctrl || !m || typeof m !== "object" || typeof m.tipo !== "string") return;
    if (m.tipo === "pronta") iniciarTela(ctrl);
    else if (m.tipo === "altura" && Number.isFinite(m.px)) ctrl.iframe.style.height = `${Math.max(80, Math.min(460, Math.round(m.px)))}px`;
    else if (m.tipo === "acao" && m.acao === "perguntar" && typeof m.valor === "string" && m.valor.trim()) perguntar(m.valor.trim().slice(0, 2000));
    else if (m.tipo === "acao" && m.acao === "copiar" && typeof m.valor === "string") navigator.clipboard.writeText(m.valor.slice(0, 20000)).catch(() => {});
  });

  // ── digitar ────────────────────────────────────────────────────────────────────────────
  /** Pergunta nova (campo ou botão de uma tela): limpa os cartões e já mostra a pergunta. */
  function perguntar(t) {
    falaFinal(t);
    limpar();
    cartaoResposta(t);
    window.ely.digitar(t);
  }
  // A bolota: clique = levar (vai com o mouse) / largar; segurar e arrastar = mover; ela fica onde parar.
  let toque = null;
  bola.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    bola.setPointerCapture(e.pointerId);
    toque = { id: e.pointerId, sx: e.clientX, sy: e.clientY, px: pos.x, py: pos.y, moveu: false };
  });
  bola.addEventListener("pointermove", (e) => {
    if (!toque || e.pointerId !== toque.id) return;
    const dx = e.clientX - toque.sx, dy = e.clientY - toque.sy;
    if (!toque.moveu && Math.hypot(dx, dy) < 5) return;
    toque.moveu = true;
    modo = "arrastando";
    pos.x = Math.max(30, Math.min(telaW - 30, toque.px + dx)); pos.y = Math.max(30, Math.min(telaH - 30, toque.py + dy));
    vel.x = vel.y = 0;
    moverEly();
  });
  const soltarBola = (e) => {
    if (!toque || e.pointerId !== toque.id) return;
    const moveu = toque.moveu;
    toque = null;
    if (moveu) { modo = "parada"; return; }
    // 14/11: clique = escrever (o campo abre do lado; ela fica parada enquanto ele digita).
    parada = true;
    vel.x = vel.y = 0;
    Bolota.espalhar();
    campo.classList.add("ve");
    estadoEl.classList.remove("ve");
    window.ely.focar();
    setTimeout(() => campo.focus(), 30);
    adiarFechar();
  };
  bola.addEventListener("pointerup", soltarBola);
  bola.addEventListener("pointercancel", soltarBola);
  campo.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && campo.value.trim()) {
      const t = campo.value.trim();
      campo.value = "";
      perguntar(t);
    } else if (e.key === "Escape") window.ely.fechar();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.target === campo) return;
    // Esc com marcas na tela: some com elas primeiro; de novo, fecha.
    if (marcasEl.childNodes.length) limparMarcas(); else window.ely.fechar();
  });

  // ── eventos do main ────────────────────────────────────────────────────────────────────
  window.ely.ao("flutuante:abrir", (o) => {
    movimento = typeof o?.movimento === "string" ? o.movimento : "";
    document.documentElement.classList.toggle("reduzir", reduzir());
    aplicarTema(o?.tema);
    if (o?.tela) { telaW = o.tela.w; telaH = o.tela.h; }
    if (o?.cursor) { cursor.x = o.cursor.x; cursor.y = o.cursor.y; }
    // Nasce já no lugar (sem vir voando do canto).
    const a = alvoDaBolota(); pos.x = a.x; pos.y = a.y; vel.x = vel.y = 0; parada = false; modo = "seguindo";
    moverEly();
    // Os cartões fixados ficam; o resto da vez anterior sai.
    for (const c of [...cartoes.children]) if (!c.classList.contains("fixo")) c.remove();
    esconderBalao();
    esperando.clear();
    coluna = null;
    campo.classList.remove("ve");
    campo.value = "";
    aoVivoEl.textContent = "";
    falaEl.classList.remove("ve");
    ultimoStatus = ""; estadoEl.textContent = ""; estadoEl.classList.remove("ve");
    palco.classList.remove("fechando");
    void palco.offsetWidth;
    palco.classList.add("aberto");
    Bolota.nascer();
    comecarASeguir();
    adiarFechar();
  });
  window.ely.ao("flutuante:cursor", (o) => {
    if (!o) return;
    const agora = performance.now(), dtc = Math.max(8, agora - cursorEm) / 1000;
    velCursor = velCursor * 0.6 + (Math.hypot(o.x - cursor.x, o.y - cursor.y) / dtc) * 0.4;
    velX = velX * 0.5 + ((o.x - cursor.x) / dtc) * 0.5; velY = velY * 0.5 + ((o.y - cursor.y) / dtc) * 0.5;
    cursorEm = agora;
    cursor.x = o.x; cursor.y = o.y;
    if (o.tela) { telaW = o.tela.w; telaH = o.tela.h; }
    Bolota.cursorEm(cursor.x, cursor.y);
  });
  window.ely.ao("flutuante:status", (t) => { if (typeof t === "string" && estadoAtual !== "idle") mostrarStatus(t); });
  window.ely.ao("voice:action-label", (t) => { if (typeof t === "string" && t && !/^Processando/.test(t)) mostrarStatus(t); });
  window.ely.ao("voice:parcial", (t) => { if (typeof t === "string") falaParcial(t); });
  window.ely.ao("flutuante:marcas", (o) => mostrarMarcas(o));
  window.ely.ao("flutuante:confirmar", (o) => pedirConfirmacao(o));
  window.ely.ao("flutuante:fechar", () => {
    clearTimeout(timerFechar);
    dentro = false;
    campo.blur();
    limparMarcas();
    // Cartões, fala e estado somem já; a bolota estoura e implode, e aí a camada apaga.
    palco.classList.add("fechando");
    Bolota.sumir(() => { palco.classList.remove("aberto", "fechando"); seguindo = false; });
  });
  window.ely.ao("flutuante:tema", (id) => aplicarTema(id));
  window.ely.ao("voice:state", (s) => mostrarEstado(String(s)));
  window.ely.ao("voice:audio-level", (v) => { const n = Number(v) || 0; Bolota.microfone(n); nivelDaVoz(n); });
  window.ely.ao("voice:transcript", (t) => { falaFinal(String(t || "")); limpar(); cartaoResposta(String(t || "")); });
  window.ely.ao("chat:chunk", (t) => chegouPedaco(String(t ?? "")));
  window.ely.ao("voice:reply", (t) => respostaFinal(t));
  window.ely.ao("chat:reply", (t) => respostaFinal(t));
  window.ely.ao("voice:error", (t) => respostaFinal(t || "Tive um problema."));
  window.ely.ao("chat:error", (t) => respostaFinal(t || "Tive um problema."));
  window.ely.ao("chat:busy", () => respostaFinal("Um instante, ainda estou terminando o pedido anterior."));
  window.ely.ao("tts:falando", (f) => { falando = !!f; Bolota.fala(falando); adiarFechar(); });
  window.ely.ao("flutuante:desenhando", () => esqueleto("desenho"));
  window.ely.ao("flutuante:cartoes", (o) => { if (o?.cartoes) mostrarCartoes(o.cartoes); else soltarEsqueleto("desenho"); });
  window.ely.ao("chat:tela", (o) => {
    if (!o || typeof o.id !== "string") return;
    if (o.estado === "gerando") esqueleto(o.id);
    // Só a tela que começou com a flutuante aberta (uma geração antiga chegando agora não entra).
    else if (typeof o.programa === "string") { if (esperando.has(o.id)) mostrarTela(o.id, o.programa); }
    else if (o.falhou) soltarEsqueleto(o.id);
  });
})();
