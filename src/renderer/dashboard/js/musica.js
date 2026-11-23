// dashboard/js/musica.js — gostos e sugestões de música (23/11).
//
// O PC guarda as respostas e faz a conta (services/gostos.ts); o celular mostra as mesmas. Aqui
// mora a lista "Talvez você goste" (card da Início, mídia da aba PC) e a gaveta Música, com o
// questionário: estilos, artistas e músicas. Um clique gosta, o segundo não gosta, o terceiro limpa.

const MG_MOMENTOS = [["geral", "Tudo"], ["foco", "Foco"], ["treino", "Treino"], ["noite", "Noite"]];
const MG_ABAS = [["sugestoes", "Para você"], ["estilos", "Estilos"], ["artistas", "Artistas"], ["musicas", "Músicas"]];
const mg = {
  momento: "geral", sug: null, carregando: false, erro: false,
  aba: "sugestoes", gostos: null, estilo: null, artistas: {}, busca: null, musicas: null, notas: {},
  audio: null, tocandoPrevia: 0,
};

async function mgRpc(metodo, params) {
  const r = await window.nx.rpc(metodo, params);
  if (r?.error) throw new Error(r.error);
  return r?.result;
}

async function mgCarregar(refazer = false) {
  if (mg.carregando) return;
  mg.carregando = true; mg.erro = false;
  mgDesenhar();
  try { mg.sug = await mgRpc("gostos.sugestoes", { momento: mg.momento, refazer }); }
  catch { mg.erro = true; }
  mg.carregando = false;
  mgDesenhar();
}

/** A lista que entra nos cards. `quantas` linhas; o resto fica na gaveta. */
function mgHtml(quantas) {
  if (!mg.sug && !mg.carregando && !mg.erro) setTimeout(() => mgCarregar(), 0);
  return `<div class="mg" data-mg-lista="${quantas}">${mgMiolo(quantas)}</div>`;
}

function mgMiolo(quantas) {
  const s = mg.sug;
  if (s && !s.pronto) {
    return `<div class="mg-vazio"><span>Conte do que você gosta e eu sugiro músicas novas.</span>
      <button class="mg-bt" data-mg="abrir" data-aba="estilos">${ico("music", "ico-sm")}<span>Responder</span></button></div>`;
  }
  const cabeca = `<div class="mg-cab"><b>Talvez você goste</b>
    <div class="mg-momentos">${MG_MOMENTOS.map(([id, nome]) => `<button data-mg="momento" data-id="${id}" class="${mg.momento === id ? "aceso" : ""}">${nome}</button>`).join("")}</div>
    <button class="mg-ico${mg.carregando ? " girando" : ""}" data-mg="refazer" title="Outras sugestões">${ico("refresh", "ico-sm")}</button>
    ${quantas < 99 ? `<button class="mg-ico" data-mg="abrir" data-aba="sugestoes" title="Ver tudo e meus gostos">${ico("maximize", "ico-sm")}</button>` : ""}</div>`;
  if (!s) return cabeca + `<div class="mg-vazio"><span>${mg.erro ? "Não consegui buscar agora." : "Procurando…"}</span></div>`;
  if (!s.itens.length) return cabeca + `<div class="mg-vazio"><span>Sem sugestões agora. Confira a internet.</span></div>`;
  return cabeca + `<div class="mg-itens${mg.carregando ? " apagado" : ""}">${s.itens.slice(0, quantas).map(mgLinha).join("")}</div>`;
}

function mgLinha(m) {
  const previa = mg.tocandoPrevia === m.id;
  const nota = mg.notas[m.id];
  return `<div class="mg-linha" data-id="${m.id}" data-titulo="${escHtml(m.titulo)}" data-artista="${escHtml(m.artista)}">
    <button class="mg-capa" data-mg="previa" title="${previa ? "Parar" : "Ouvir um trecho"}">${m.capa ? `<img src="${escHtml(m.capa)}" alt="" loading="lazy">` : ""}<i>${ico(previa ? "pause" : "play", "ico-sm")}</i></button>
    <button class="mg-txt" data-mg="tocar" data-no="pc" title="Tocar no PC"><b>${escHtml(m.titulo)}</b><span>${escHtml(m.artista)}${m.motivo ? ` · ${escHtml(m.motivo)}` : ""}</span></button>
    <div class="mg-acoes">
      <button data-mg="nota" data-valor="1" class="${nota === 1 ? "aceso" : ""}" title="Gostei">${ico("thumbs-up", "ico-sm")}</button>
      <button data-mg="nota" data-valor="-1" class="${nota === -1 ? "aceso" : ""}" title="Não gostei">${ico("thumbs-down", "ico-sm")}</button>
      <button data-mg="tocar" data-no="celular" title="Tocar no celular">${ico("smartphone", "ico-sm")}</button>
    </div></div>`;
}

/** Só o miolo das listas que estão na tela: os cards em volta não se redesenham. */
function mgDesenhar() {
  document.querySelectorAll("[data-mg-lista]").forEach((el) => { el.innerHTML = mgMiolo(Number(el.dataset.mgLista)); });
  // As linhas do chat não se redesenham (o chat guarda o HTML): só o que mudou nelas.
  document.querySelectorAll(".chat-musicas .mg-linha").forEach((el) => {
    const id = Number(el.dataset.id);
    el.querySelector(".mg-capa i").innerHTML = ico(mg.tocandoPrevia === id ? "pause" : "play", "ico-sm");
    el.querySelectorAll('[data-mg="nota"]').forEach((n) => n.classList.toggle("aceso", mg.notas[id] === Number(n.dataset.valor)));
  });
  mgDesenharGaveta();
}

// ── A gaveta Música ───────────────────────────────

async function abrirMusica(aba = "sugestoes") {
  mg.aba = aba;
  abrirGaveta({
    titulo: "Música", icone: "music", classe: "gaveta-musica",
    html: `<div class="mg-abas" role="tablist"></div><div id="mg-corpo"></div>`,
    aoFechar: () => { mgPararPrevia(); if (mg.sug) mgDesenhar(); else mgCarregar(); },
  });
  mgDesenharGaveta();
  try { mg.gostos = await mgRpc("gostos.get"); } catch { showToast("Não consegui ler os seus gostos.", true); }
  mgAbrirAba(aba);
}

function mgAbrirAba(aba) {
  mg.aba = aba;
  mgDesenharGaveta();
  if (aba === "sugestoes" && !mg.sug) mgCarregar();
  if (aba === "artistas") mgAbrirEstilo(mg.estilo ?? mg.gostos?.estilos.find((e) => e.valor === 1)?.id ?? mg.gostos?.estilos[0]?.id);
  if (aba === "musicas" && !mg.musicas) mgMaisMusicas();
}

async function mgAbrirEstilo(id) {
  if (!id) return;
  mg.estilo = id; mg.busca = null;
  mgDesenharGaveta();
  if (mg.artistas[id]) return;
  try { mg.artistas[id] = (await mgRpc("gostos.artistas", { estilo: id })).artistas; } catch { mg.artistas[id] = []; }
  mgDesenharGaveta();
}

async function mgMaisMusicas() {
  mg.musicas = null;
  mgDesenharGaveta();
  try { mg.musicas = (await mgRpc("gostos.musicas")).musicas; } catch { mg.musicas = []; }
  mgDesenharGaveta();
}

const mgClasse = (v) => (v === 1 ? " gosto" : v === -1 ? " nao" : "");
/** sem resposta → gosto → não gosto → sem resposta. */
const mgProximo = (v) => (v === 1 ? -1 : v === -1 ? null : 1);

function mgDesenharGaveta() {
  const corpo = document.getElementById("mg-corpo");
  if (!corpo) return;
  document.querySelector(".mg-abas").innerHTML = MG_ABAS.map(([id, nome]) => `<button role="tab" aria-selected="${mg.aba === id}" data-mg="aba" data-id="${id}" class="${mg.aba === id ? "aceso" : ""}">${nome}</button>`).join("");
  const g = mg.gostos;
  if (mg.aba === "sugestoes") {
    corpo.innerHTML = `<div class="mg">${mgMiolo(99)}</div>` + (mg.sug?.itens?.length ? `<div class="mg-rodape">
      <button class="mg-bt" data-mg="fila">${ico("list", "ico-sm")}<span>Pôr na fila</span></button>
      <button class="mg-bt" data-mg="playlist">${ico("plus", "ico-sm")}<span>Criar playlist</span></button>
      <button class="mg-bt" data-mg="passar">${ico("smartphone", "ico-sm")}<span>Continuar no celular</span></button></div>` : "");
  } else if (!g) {
    corpo.innerHTML = `<div class="mg-vazio"><span>Carregando…</span></div>`;
  } else if (mg.aba === "estilos") {
    corpo.innerHTML = `<p class="mg-dica">Um clique gosto, dois não gosto.</p><div class="mg-chips">${g.estilos.map((e) => `<button data-mg="estilo" data-id="${e.id}" class="mg-chip${mgClasse(e.valor)}">${escHtml(e.nome)}</button>`).join("")}</div>
      <div class="mg-rodape"><button class="mg-bt" data-mg="aba" data-id="artistas"><span>Agora os artistas</span>${ico("chevron-right", "ico-sm")}</button></div>`;
  } else if (mg.aba === "artistas") {
    const foco = document.activeElement?.id === "mg-busca";
    const texto = document.getElementById("mg-busca")?.value ?? "";
    const ordem = [...g.estilos].sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0));
    const lista = mg.busca ?? mg.artistas[mg.estilo];
    corpo.innerHTML = `<input type="text" id="mg-busca" placeholder="Procurar um artista" autocomplete="off" value="${escHtml(texto)}">
      <div class="mg-estilos">${ordem.map((e) => `<button data-mg="ver-estilo" data-id="${e.id}" class="${!mg.busca && mg.estilo === e.id ? "aceso" : ""}">${escHtml(e.nome)}</button>`).join("")}</div>
      <div class="mg-artistas">${lista ? lista.map((a) => `<button data-mg="artista" data-nome="${escHtml(a.nome)}" class="mg-artista${mgClasse(g.respostas[a.nome])}">${a.foto ? `<img src="${escHtml(a.foto)}" alt="" loading="lazy">` : `<i>${escHtml(a.nome[0] ?? "")}</i>`}<span>${escHtml(a.nome)}</span></button>`).join("") : `<div class="mg-vazio"><span>Carregando…</span></div>`}</div>
      <p class="mg-dica">${g.gosta.length} de que gosta, ${g.naoGosta.length} de que não gosta.</p>`;
    if (foco) { const b = document.getElementById("mg-busca"); b.focus(); b.setSelectionRange(texto.length, texto.length); }
  } else {
    const aprendidos = g?.aprendidos ?? [];
    corpo.innerHTML = (aprendidos.length ? `<p class="mg-dica">Aprendi com você</p><div class="mg-chips">${aprendidos.map((a, i) =>
      `<button data-mg="esquecer" data-i="${i}" class="mg-chip${mgClasse(a.valor)}" title="Esquecer">${escHtml(a.artista ? `${a.nome}, ${a.artista}` : a.nome)}${ico("x", "ico-sm")}</button>`).join("")}</div>` : "") + (mg.musicas === null ? `<div class="mg-vazio"><span>Procurando músicas para perguntar…</span></div>`
      : !mg.musicas.length ? `<div class="mg-vazio"><span>Marque antes alguns artistas.</span></div>`
      : `<p class="mg-dica">Ouça um trecho na capa e diga se gosta.</p><div class="mg"><div class="mg-itens">${mg.musicas.map(mgLinha).join("")}</div></div>
         <div class="mg-rodape"><button class="mg-bt" data-mg="mais-musicas">${ico("refresh", "ico-sm")}<span>Outras músicas</span></button></div>`);
  }
}

// ── O trecho de 30 s ──────────────────────────────

function mgPararPrevia() {
  mg.audio?.pause();
  mg.audio = null; mg.tocandoPrevia = 0;
}
async function mgPrevia(id) {
  const parar = mg.tocandoPrevia === id;
  mgPararPrevia();
  if (parar) { mgDesenhar(); return; }
  mg.tocandoPrevia = id;
  mgDesenhar();
  try {
    const { url } = await mgRpc("gostos.previa", { musica: id });
    if (mg.tocandoPrevia !== id) return;
    if (!url) throw new Error("sem trecho");
    const a = new Audio(url);
    a.volume = 0.6;
    a.onended = () => { if (mg.tocandoPrevia === id) { mgPararPrevia(); mgDesenhar(); } };
    mg.audio = a;
    await a.play();
  } catch {
    if (mg.tocandoPrevia === id) { mgPararPrevia(); mgDesenhar(); showToast("Esta música não tem trecho.", true); }
  }
}

// ── Cliques (nos cards e na gaveta) ───────────────

/** Depois de responder, a próxima visita às sugestões refaz a conta. */
function mgMudou(r) {
  if (r && mg.gostos) mg.gostos.pronto = r.pronto;
  mg.sug = null;
}

document.addEventListener("click", async (e) => {
  const b = e.target instanceof Element ? e.target.closest("[data-mg]") : null;
  if (!b) return;
  const linha = b.closest(".mg-linha");
  const musica = linha ? { id: Number(linha.dataset.id), titulo: linha.dataset.titulo, artista: linha.dataset.artista } : null;
  try {
    switch (b.dataset.mg) {
      case "abrir": await abrirMusica(b.dataset.aba); break;
      case "aba": mgAbrirAba(b.dataset.id); break;
      case "momento": mg.momento = b.dataset.id; await mgCarregar(); break;
      case "refazer": await mgCarregar(true); break;
      case "previa": await mgPrevia(musica.id); break;
      case "tocar": {
        mgPararPrevia(); mgDesenhar();
        showToast(`Procurando ${musica.titulo}…`);
        showToast((await mgRpc("musica.tocar", { titulo: musica.titulo, artista: musica.artista, no: b.dataset.no })).fala);
        if (typeof atualizarInicio === "function" && b.dataset.no === "pc") setTimeout(atualizarInicio, 1500);
        break;
      }
      case "nota": {
        const valor = Number(b.dataset.valor);
        await mgRpc("gostos.marcar", { tipo: "musica", musica: musica.id, titulo: musica.titulo, artista: musica.artista, valor });
        mg.notas[musica.id] = valor;
        // "Não gostei" tira da lista na hora; "gostei" fica, marcada.
        if (valor === -1 && mg.sug) mg.sug.itens = mg.sug.itens.filter((x) => x.id !== musica.id);
        mgDesenhar();
        break;
      }
      case "estilo": {
        const est = mg.gostos.estilos.find((x) => x.id === b.dataset.id);
        est.valor = mgProximo(est.valor);
        mgDesenharGaveta();
        mgMudou(await mgRpc("gostos.marcar", { tipo: "estilo", id: est.id, valor: est.valor }));
        break;
      }
      case "ver-estilo": { const i = document.getElementById("mg-busca"); if (i) i.value = ""; await mgAbrirEstilo(b.dataset.id); break; }
      case "artista": {
        const nome = b.dataset.nome, g = mg.gostos, v = mgProximo(g.respostas[nome]);
        if (v === null) delete g.respostas[nome]; else g.respostas[nome] = v;
        g.gosta = Object.keys(g.respostas).filter((n) => g.respostas[n] === 1);
        g.naoGosta = Object.keys(g.respostas).filter((n) => g.respostas[n] === -1);
        mgDesenharGaveta();
        mgMudou(await mgRpc("gostos.marcar", { tipo: "artista", nome, valor: v }));
        break;
      }
      case "esquecer": {
        const [a] = mg.gostos.aprendidos.splice(Number(b.dataset.i), 1);
        mgDesenharGaveta();
        mgMudou(await mgRpc("gostos.marcar", a.tipo === "musica" ? { tipo: "musica", musica: a.id, titulo: a.nome, artista: a.artista, valor: null } : { tipo: "artista", nome: a.nome, valor: null }));
        break;
      }
      case "mais-musicas": await mgMaisMusicas(); break;
      case "fila": showToast(`${(await mgRpc("musica.fila", { musicas: mg.sug.itens })).total} músicas na fila.`); break;
      case "playlist": { const p = await mgRpc("musica.playlist", { musicas: mg.sug.itens }); showToast(`Playlist "${p.nome}" criada com ${p.total} músicas.`); break; }
      case "passar": showToast((await mgRpc("musica.passar", { para: "celular" })).fala); break;
    }
  } catch (err) { showToast(String(err?.message || "Não deu certo."), true); }
});

let mgBuscaTimer = 0;
document.addEventListener("input", (e) => {
  if (e.target?.id !== "mg-busca") return;
  clearTimeout(mgBuscaTimer);
  const q = e.target.value.trim();
  mgBuscaTimer = setTimeout(async () => {
    if (q.length < 2) { mg.busca = null; mgDesenharGaveta(); return; }
    try { mg.busca = (await mgRpc("gostos.buscar", { q })).artistas; } catch { mg.busca = []; }
    mgDesenharGaveta();
  }, 350);
});
