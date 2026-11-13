// dashboard/js/flutuante.js — a Ely flutuante (12/11): a bolinha ao lado do cursor e os cartões.
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
  const palco = $("palco"), bola = $("bola"), estadoEl = $("estado"), campo = $("campo"), cartoes = $("cartoes");
  const ESPERA_FECHAR_MS = 40_000;
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

  // ── mouse: só os pedaços visíveis recebem clique; o resto atravessa para o programa de baixo ──
  let dentro = false;
  function marcarMouse(v) { if (v !== dentro) { dentro = v; window.ely.mouse(v); } if (v) adiarFechar(); }
  document.addEventListener("mousemove", (e) => {
    const alvo = e.target instanceof Element ? e.target.closest(".bola, .vidro, .campo, .estado.ve") : null;
    marcarMouse(!!alvo);
  });
  document.addEventListener("mouseleave", () => marcarMouse(false));

  // ── fechar sozinho ─────────────────────────────────────────────────────────────────────
  let timerFechar = null, ocupada = false, falando = false;
  function adiarFechar() {
    clearTimeout(timerFechar);
    timerFechar = setTimeout(() => {
      if (dentro || ocupada || falando || document.activeElement === campo) { adiarFechar(); return; }
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
    let cor = [200, 170, 110];
    const rgb = (hex) => { const h = String(hex || "").replace("#", ""); return h.length === 6 ? [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) : [200, 170, 110]; };
    function corAlvo() {
      if (estado === "listening") return rgb(tema.cyan);
      if (estado === "processing") return [242, 180, 78];
      if (falando || estado === "speaking") return rgb(tema.purpleBright);
      return rgb(tema.purple);
    }
    const lento = reduzir;
    document.addEventListener("mousemove", (e) => {
      const r = tela.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
      mouse.dentro = Math.hypot(mouse.x - r.width / 2, mouse.y - r.height / 2) < r.width * 0.42;
      if (mouse.dentro) ligar();
    });
    document.addEventListener("mouseleave", () => { mouse.dentro = false; });

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

      const kN = nascerEm ? (agora - nascerEm) / L.NASCER_MS : 1;
      if (kN >= 1) nascerEm = 0;
      const eN = nascerEm ? L.easeOutCubic(kN) : 1;
      const cx = W / 2, cy = H / 2;
      const R = 22 * dpr * (1 + 0.03 * Math.sin(t * 1.4) + n * 0.16);
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
        let x = p[0] * r, y = p[1] * r, z = p[2] * r;
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
      nascer() { if (!lento()) nascerEm = performance.now(); fox.fill(0); foy.fill(0); fvx.fill(0); fvy.fill(0); viva = false; ligar(); },
      espalhar() { explodir = true; fluidoAte = performance.now() + 1300; ligar(); },
      estado(s) { estado = s; if (s !== "listening") mic = 0; },
      microfone(v) { mic = v; },
      fala(f) { falando = f; },
    };
  })();

  // ── estado da bolota ───────────────────────────────────────────────────────────────────
  const ROTULOS = { listening: "Ouvindo…", processing: "Pensando…", speaking: "", idle: "" };
  function mostrarEstado(s) {
    ocupada = s === "listening" || s === "processing";
    Bolota.estado(s);
    const r = ROTULOS[s] ?? "";
    estadoEl.textContent = r;
    estadoEl.classList.toggle("ve", !!r && !campo.classList.contains("ve"));
    adiarFechar();
  }

  // ── cartões ────────────────────────────────────────────────────────────────────────────
  function el(tag, cls, texto) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (texto != null) e.textContent = texto;
    return e;
  }
  function limpar() {
    for (const c of [...cartoes.children]) { c.classList.add("sai"); setTimeout(() => c.remove(), 170); }
    resposta = null;
    esperando.clear();
  }
  function novoCartao(antesDe) {
    const c = el("div", "vidro");
    if (antesDe) cartoes.insertBefore(c, antesDe); else cartoes.appendChild(c);
    return c;
  }

  /** O cartão da resposta (o primeiro): pergunta em cima, texto chegando aos poucos. */
  let resposta = null;
  function cartaoResposta(pergunta) {
    if (resposta) return resposta;
    const c = novoCartao(cartoes.firstChild);
    const x = el("button", "fechar", "✕");
    x.title = "Fechar (Esc)";
    x.addEventListener("click", () => window.ely.fechar());
    c.appendChild(x);
    const p = el("div", "pergunta", pergunta || "");
    if (!pergunta) p.style.display = "none";
    const t = el("div", "resp");
    t.appendChild(el("span", "cursor"));
    c.append(p, t);
    resposta = { c, p, t, bruto: "", fechado: false };
    return resposta;
  }
  /** Negrito do markdown vira <b>; o resto entra como texto (nada de HTML vindo do modelo). */
  function pintarTexto(alvo, bruto, comCursor) {
    alvo.textContent = "";
    const limpo = bruto.replace(/^#{1,6}\s+/gm, "").replace(/^\s*[-*]\s+/gm, "• ");
    for (const [i, parte] of limpo.split(/\*\*/).entries()) {
      if (!parte) continue;
      alvo.appendChild(i % 2 ? el("b", null, parte) : document.createTextNode(parte));
    }
    if (comCursor) alvo.appendChild(el("span", "cursor"));
  }
  let pintura = 0;
  function chegouPedaco(token) {
    const r = cartaoResposta("");
    // Pedaço atrasado de uma resposta que já fechou: ignora (ele repintava o cursor no fim).
    if (r.fechado) return;
    r.bruto += token;
    if (!pintura) { pintura = 1; noQuadro(() => { pintura = 0; pintarTexto(r.t, r.bruto, !r.fechado); seguirFim(); }); }
  }
  function respostaFinal(texto) {
    const r = cartaoResposta("");
    r.bruto = String(texto || r.bruto);
    r.fechado = true;
    pintarTexto(r.t, r.bruto, false);
    seguirFim();
  }
  function seguirFim() {
    if (palco.classList.contains("cima")) return; // os cartões crescem para cima: o fim já está à vista
    cartoes.scrollTop = cartoes.scrollHeight;
  }

  // Esqueleto enquanto o desenho ou a tela vem.
  const esperando = new Map();
  function esqueleto(chave) {
    if (esperando.has(chave)) return esperando.get(chave);
    const c = novoCartao();
    c.appendChild(el("div", "esqueleto"));
    esperando.set(chave, c);
    return c;
  }
  function soltarEsqueleto(chave) {
    const c = esperando.get(chave);
    esperando.delete(chave);
    if (c) { c.classList.add("sai"); setTimeout(() => c.remove(), 170); }
  }
  function lugarDe(chave) {
    const c = esperando.get(chave);
    esperando.delete(chave);
    if (!c) return novoCartao();
    c.textContent = "";
    return c;
  }

  const DESENHOS = {
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
      // Enquadra no que foi desenhado (o modelo nem sempre usa o quadro todo), com folga.
      if (Number.isFinite(caixaX[0])) {
        const m = 10, x0 = Math.max(-135, caixaX[0] - m), x1 = Math.min(160, caixaX[1] + m), y0 = Math.max(-135, caixaY[0] - m), y1 = Math.min(135, caixaY[1] + m);
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
    const lugar = lugarDe("desenho");
    let primeiro = true;
    for (const d of lista || []) {
      const fazer = DESENHOS[d?.tipo];
      if (!fazer) continue;
      const c = primeiro ? lugar : novoCartao();
      primeiro = false;
      try { fazer(c, d); } catch (e) { console.warn("[flutuante] cartão falhou:", e); c.remove(); }
    }
    if (primeiro) lugar.remove();
    adiarFechar();
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
    const c = lugarDe(chave);
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
    limpar();
    cartaoResposta(t);
    window.ely.digitar(t);
  }
  bola.addEventListener("click", () => {
    Bolota.espalhar();
    campo.classList.add("ve");
    estadoEl.classList.remove("ve");
    window.ely.focar();
    setTimeout(() => campo.focus(), 30);
  });
  campo.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && campo.value.trim()) {
      const t = campo.value.trim();
      campo.value = "";
      perguntar(t);
    } else if (e.key === "Escape") window.ely.fechar();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && e.target !== campo) window.ely.fechar(); });

  // ── eventos do main ────────────────────────────────────────────────────────────────────
  window.ely.ao("flutuante:abrir", (o) => {
    movimento = typeof o?.movimento === "string" ? o.movimento : "";
    document.documentElement.classList.toggle("reduzir", reduzir());
    aplicarTema(o?.tema);
    palco.className = `${o?.vert === "cima" ? "cima" : "baixo"} ${o?.horiz === "esq" ? "esq" : "dir"}`;
    for (const c of [...cartoes.children]) c.remove();
    resposta = null;
    esperando.clear();
    telas.clear();
    campo.classList.remove("ve");
    campo.value = "";
    void palco.offsetWidth;
    palco.classList.add("aberto");
    Bolota.nascer();
    adiarFechar();
  });
  window.ely.ao("flutuante:fechar", () => {
    palco.classList.remove("aberto");
    clearTimeout(timerFechar);
    dentro = false;
    campo.blur();
  });
  window.ely.ao("flutuante:tema", (id) => aplicarTema(id));
  window.ely.ao("voice:state", (s) => mostrarEstado(String(s)));
  window.ely.ao("voice:audio-level", (v) => Bolota.microfone(Number(v) || 0));
  window.ely.ao("voice:transcript", (t) => { limpar(); cartaoResposta(String(t || "")); });
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
