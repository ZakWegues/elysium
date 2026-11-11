"use client";

import { defineComponent, reactive, useStateField } from "@openuidev/react-lang";
import { useEffect, useId, useState, type ReactNode } from "react";
import { z } from "zod/v4";
import { enviarAoHost } from "../../ponte";
import { Glyph } from "./glyph";
import { inline } from "./markdown";
import { Photo } from "./media";
import { children, color, cx, fg } from "./style";

/**
 * Componentes da Ely (26/10, pedido do dono: telas "muito mais aprimoradas e completas"). Peças
 * prontas para o que toda tela boa tem: abertura com ícone, números com variação e minigráfico,
 * anel e barra de progresso, linha do tempo com fotos, cartões com foto, avisos, comparação com
 * vencedor, avatares, estado vazio ilustrado, semana e quiz com retorno na hora.
 *
 * 🔴 Só se ADICIONA aqui: o celular pode estar com um renderer mais velho que o PC, e telas
 * guardadas no histórico precisam continuar abrindo. Nada de renomear nem tirar argumento.
 */

const str = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const lista = (v: unknown) => (Array.isArray(v) ? v.flat().filter((x) => x != null) : []);
const tom = (t: unknown) => fg(typeof t === "string" && t ? t : "info") ?? "var(--iui-accent)";

/** Pede ao app uma vibração curta (o PC ignora; o celular vibra). */
export function vibrar(tipo: "leve" | "sucesso" | "erro"): void {
  try { enviarAoHost({ tipo: "acao", acao: "haptica", valor: tipo }); } catch { /* sem host: nada */ }
}

/** Número que aparece contando (só a primeira vez; texto não numérico entra direto). */
function Contando({ texto }: { texto: string }) {
  const m = /^(\D*?)(-?\d{1,3}(?:\.\d{3})*(?:,\d+)?|-?\d+(?:[.,]\d+)?)(.*)$/.exec(texto);
  const alvo = m ? Number(m[2].replace(/\./g, "").replace(",", ".")) : NaN;
  const [visto, setVisto] = useState(() => (m && Number.isFinite(alvo) ? 0 : alvo));
  useEffect(() => {
    if (!m || !Number.isFinite(alvo) || matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.reduzir !== undefined) { setVisto(alvo); return; }
    const t0 = performance.now(), dur = 700;
    let raf = 0;
    const passo = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      setVisto(alvo * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [texto]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!m || !Number.isFinite(alvo)) return <>{texto}</>;
  const casas = (m[2].split(/[,]/)[1] ?? "").length;
  const fmt = visto.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  return <>{m[1]}{fmt}{m[3]}</>;
}

// ── Hero ───────────────────────────────────────────────────────────────────────────────────
export const Hero = defineComponent({
  name: "Hero",
  props: z.object({ title: z.string(), subtitle: z.string().optional(), icon: z.string().optional(), tone: color.optional() }),
  description: "Opening band: icon plate, big title, one-line subtitle, soft gradient. One way to open a screen (a photo ImageCard, a big Stat or a Title also work).",
  component: ({ props }) => (
    <div className="ely-hero" style={{ ["--ely-tom" as string]: tom(props.tone) }}>
      {props.icon ? <span className="ely-hero-icone"><Glyph name={props.icon} size={22} /></span> : null}
      <div className="ely-hero-texto">
        <div className="ely-hero-titulo" role="heading" aria-level={2}>{inline(str(props.title))}</div>
        {props.subtitle ? <div className="ely-hero-sub">{inline(str(props.subtitle))}</div> : null}
      </div>
    </div>
  ),
});

// ── Stat / StatRow ─────────────────────────────────────────────────────────────────────────
function Sparkline({ valores }: { valores: number[] }) {
  const id = useId().replace(/:/g, "");
  if (valores.length < 2) return null;
  const min = Math.min(...valores), max = Math.max(...valores), w = 100, h = 28;
  const pts = valores.map((v, i) => [(i / (valores.length - 1)) * w, h - 2 - ((v - min) / (max - min || 1)) * (h - 4)]);
  const linha = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  return (
    <svg className="ely-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${linha}L${w} ${h}L0 ${h}Z`} fill={`url(#g${id})`} />
      <path d={linha} fill="none" stroke="currentColor" strokeWidth="1.6" vectorEffect="non-scaling-stroke" className="ely-spark-linha" />
    </svg>
  );
}

export const Stat = defineComponent({
  name: "Stat",
  props: z.object({
    label: z.string(),
    value: z.union([z.string(), z.number()]),
    icon: z.string().optional(),
    delta: z.number().optional(),
    spark: z.array(z.number()).optional(),
    tone: color.optional(),
  }),
  description: 'One metric tile: label, big value (already formatted, e.g. @Format(x, "currency", 2, "BRL")), optional icon, delta in % (shows ▲/▼ in green/red) and spark = a short list of numbers drawn as a sparkline.',
  component: ({ props }) => {
    const d = num(props.delta);
    const valores = lista(props.spark).map(num).filter((x): x is number => x !== null);
    const valor = typeof props.value === "number" ? props.value.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : str(props.value);
    return (
      <div className="ely-stat" style={{ ["--ely-tom" as string]: tom(props.tone) }}>
        <div className="ely-stat-topo">
          {props.icon ? <span className="ely-stat-icone"><Glyph name={props.icon} size={15} /></span> : null}
          <span className="ely-stat-rotulo">{props.label}</span>
        </div>
        <div className="ely-stat-valor"><Contando texto={valor} /></div>
        {d !== null || valores.length > 1 ? (
          <div className="ely-stat-pe">
            {d !== null ? <span className={cx("ely-delta", d > 0 ? "is-sobe" : d < 0 ? "is-desce" : "is-igual")}>{d > 0 ? "▲" : d < 0 ? "▼" : "•"} {Math.abs(d).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span> : <span />}
            {valores.length > 1 ? <Sparkline valores={valores} /> : null}
          </div>
        ) : null}
      </div>
    );
  },
});

export const StatRow = defineComponent({
  name: "StatRow",
  props: z.object({ children }),
  description: "Row of Stat tiles: 2 per line on a phone, up to 4 when wide. The first Stat is the headline result.",
  component: ({ props, renderNode }) => <div className="ely-statrow">{renderNode(lista(props.children))}</div>,
});

// ── Ring / Progress ────────────────────────────────────────────────────────────────────────
export const Ring = defineComponent({
  name: "Ring",
  props: z.object({ value: z.number(), max: z.number().optional(), label: z.string().optional(), center: z.string().optional(), tone: color.optional() }),
  description: 'Progress ring that draws itself: value of max (default 100); center text defaults to the percent. For scores, completion, share of a total. Reacts to $variables.',
  component: ({ props }) => {
    const max = num(props.max) ?? 100;
    const v = Math.max(0, Math.min(max, num(props.value) ?? 0));
    const k = max > 0 ? v / max : 0;
    const C = 2 * Math.PI * 42;
    return (
      <div className="ely-ring" style={{ ["--ely-tom" as string]: tom(props.tone) }}>
        <svg viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r="42" className="ely-ring-fundo" />
          <circle cx="50" cy="50" r="42" className="ely-ring-arco" strokeDasharray={C} style={{ strokeDashoffset: C * (1 - k) }} />
        </svg>
        <div className="ely-ring-centro">
          <span className="ely-ring-valor">{props.center ? inline(str(props.center)) : `${Math.round(k * 100)}%`}</span>
          {props.label ? <span className="ely-ring-rotulo">{props.label}</span> : null}
        </div>
      </div>
    );
  },
});

export const Progress = defineComponent({
  name: "Progress",
  props: z.object({ value: z.number(), max: z.number().optional(), label: z.string().optional(), tone: color.optional() }),
  description: "Horizontal progress bar with label and value/max on the right (e.g. answered/total). Reacts to $variables.",
  component: ({ props }) => {
    const max = num(props.max) ?? 100;
    const v = Math.max(0, Math.min(max, num(props.value) ?? 0));
    return (
      <div className="ely-progress" style={{ ["--ely-tom" as string]: tom(props.tone) }}>
        {props.label || props.max != null ? (
          <div className="ely-progress-topo">
            <span>{props.label ?? ""}</span>
            <span className="ely-num">{props.max != null ? `${v.toLocaleString("pt-BR")}/${max.toLocaleString("pt-BR")}` : `${Math.round((v / max) * 100)}%`}</span>
          </div>
        ) : null}
        <div className="ely-progress-trilho"><div className="ely-progress-barra" style={{ transform: `scaleX(${max > 0 ? v / max : 0})` }} /></div>
      </div>
    );
  },
});

// ── Timeline ───────────────────────────────────────────────────────────────────────────────
export const TimelineItem = defineComponent({
  name: "TimelineItem",
  props: z.object({ title: z.string(), text: z.string().optional(), time: z.string().optional(), icon: z.string().optional(), image: z.string().optional() }),
  description: "One stop in a Timeline: title, short text, time label, optional icon, image = a photo search query (2–4 words).",
  component: ({ props }) => (
    <li className="ely-tl-item">
      <span className="ely-tl-ponto">{props.icon ? <Glyph name={props.icon} size={13} /> : null}</span>
      <div className="ely-tl-corpo">
        {props.time ? <span className="ely-tl-hora">{props.time}</span> : null}
        <span className="ely-tl-titulo">{inline(str(props.title))}</span>
        {props.text ? <span className="ely-tl-texto">{inline(str(props.text))}</span> : null}
        {props.image ? <div className="ely-tl-foto"><Photo query={props.image} aspectRatio={2} radius="md" /></div> : null}
      </div>
    </li>
  ),
});

export const Timeline = defineComponent({
  name: "Timeline",
  props: z.object({ children }),
  description: "Vertical timeline of TimelineItem: itineraries, schedules, steps, history. Use instead of a map for places.",
  component: ({ props, renderNode }) => <ol className="ely-tl">{renderNode(lista(props.children))}</ol>,
});

// ── ImageCard ──────────────────────────────────────────────────────────────────────────────
export const ImageCard = defineComponent({
  name: "ImageCard",
  props: z.object({ query: z.string(), title: z.string(), caption: z.string().optional(), badge: z.string().optional() }),
  description: "Card with a real photo on top (query = 2–4 words naming the thing), title and caption below, optional badge on the photo.",
  component: ({ props }) => (
    <div className="ely-imgcard">
      <div className="ely-imgcard-foto">
        <Photo query={props.query} aspectRatio={1.6} radius={0} />
        {props.badge ? <span className="ely-imgcard-selo">{props.badge}</span> : null}
      </div>
      <div className="ely-imgcard-texto">
        <span className="ely-imgcard-titulo">{inline(str(props.title))}</span>
        {props.caption ? <span className="ely-imgcard-sub">{inline(str(props.caption))}</span> : null}
      </div>
    </div>
  ),
});

// ── Callout ────────────────────────────────────────────────────────────────────────────────
const TONS_CALLOUT = { insight: ["sparkles", "info"], dica: ["lightbulb", "success"], alerta: ["alert-triangle", "warning"], sucesso: ["check-circle", "success"] } as const;
export const Callout = defineComponent({
  name: "Callout",
  props: z.object({ text: z.string(), tone: z.enum(["insight", "dica", "alerta", "sucesso"]).optional(), icon: z.string().optional(), title: z.string().optional() }),
  description: "Highlighted note: insight (default), dica, alerta or sucesso. For the takeaway, a tip, a warning, a verdict.",
  component: ({ props }) => {
    const [icone, cor] = TONS_CALLOUT[props.tone ?? "insight"];
    return (
      <div className={cx("ely-callout", `is-${props.tone ?? "insight"}`)} style={{ ["--ely-tom" as string]: tom(cor) }}>
        <span className="ely-callout-icone"><Glyph name={props.icon ?? icone} size={16} /></span>
        <div>
          {props.title ? <div className="ely-callout-titulo">{inline(str(props.title))}</div> : null}
          <div className="ely-callout-texto">{inline(str(props.text))}</div>
        </div>
      </div>
    );
  },
});

// ── ScoreBar / Versus ──────────────────────────────────────────────────────────────────────
export const ScoreBar = defineComponent({
  name: "ScoreBar",
  props: z.object({ label: z.string(), value: z.number(), max: z.number().optional(), highlight: z.boolean().optional() }),
  description: "Labeled score bar (value of max, default 10). highlight marks the best one.",
  component: ({ props }) => {
    const max = num(props.max) ?? 10;
    const v = Math.max(0, Math.min(max, num(props.value) ?? 0));
    return (
      <div className={cx("ely-score", props.highlight && "is-destaque")}>
        <div className="ely-score-topo"><span>{props.label}</span><span className="ely-num">{v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</span></div>
        <div className="ely-progress-trilho"><div className="ely-progress-barra" style={{ transform: `scaleX(${max > 0 ? v / max : 0})` }} /></div>
      </div>
    );
  },
});

export const Versus = defineComponent({
  name: "Versus",
  props: z.object({ children, winner: z.number().optional() }),
  description: "Side-by-side options (each child usually an ImageCard or a Card); winner = 0-based index of the best, shown with a crown.",
  component: ({ props, renderNode }) => {
    const itens = lista(props.children);
    const w = num(props.winner);
    return (
      <div className="ely-versus" style={{ ["--ely-n" as string]: String(Math.max(1, itens.length)) }}>
        {itens.map((it, i) => (
          <div key={i} className={cx("ely-versus-item", w === i && "is-vencedor")}>
            {w === i ? <span className="ely-versus-coroa"><Glyph name="award" size={13} /> Melhor escolha</span> : null}
            {renderNode(it)}
          </div>
        ))}
      </div>
    );
  },
});

// ── Avatar ─────────────────────────────────────────────────────────────────────────────────
function corDoNome(nome: string): string {
  let h = 0;
  for (const c of nome) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 55%)`;
}
export const Avatar = defineComponent({
  name: "Avatar",
  props: z.object({ name: z.string(), value: z.string().optional() }),
  description: "Round avatar with the person's initials (stable color per name) and an optional value below, e.g. what each one pays.",
  component: ({ props }) => {
    const iniciais = str(props.name).trim().split(/\s+/).map((p) => p[0] ?? "").join("").slice(0, 2).toUpperCase() || "?";
    return (
      <div className="ely-avatar">
        <span className="ely-avatar-bola" style={{ background: corDoNome(str(props.name)) }}>{iniciais}</span>
        <span className="ely-avatar-nome">{props.name}</span>
        {props.value ? <span className="ely-avatar-valor ely-num">{props.value}</span> : null}
      </div>
    );
  },
});
export const AvatarRow = defineComponent({
  name: "AvatarRow",
  props: z.object({ children }),
  description: "Row of Avatar that wraps.",
  component: ({ props, renderNode }) => <div className="ely-avatarrow">{renderNode(lista(props.children))}</div>,
});

// ── Empty ──────────────────────────────────────────────────────────────────────────────────
const DESENHOS: Record<string, ReactNode> = {
  caixa: <><path d="M14 30 L32 22 L50 30 L32 38 Z" /><path d="M14 30 V48 L32 56 L50 48 V30" /><path d="M32 38 V56" /></>,
  busca: <><circle cx="28" cy="28" r="13" /><path d="M38 38 L50 50" /><path d="M22 28 h12" /></>,
  folha: <><rect x="18" y="12" width="28" height="40" rx="4" /><path d="M24 22 h16 M24 30 h16 M24 38 h10" /></>,
  estrela: <><path d="M32 12 L37 26 L52 26 L40 35 L44 50 L32 41 L20 50 L24 35 L12 26 L27 26 Z" /></>,
};
export const Empty = defineComponent({
  name: "Empty",
  props: z.object({ title: z.string(), text: z.string().optional(), icon: z.enum(["caixa", "busca", "folha", "estrela"]).optional() }),
  description: "Friendly empty state with a line drawing (caixa, busca, folha, estrela), a title and a short hint.",
  component: ({ props }) => (
    <div className="ely-vazio">
      <svg viewBox="0 0 64 64" aria-hidden className="ely-vazio-desenho">{DESENHOS[props.icon ?? "caixa"]}</svg>
      <span className="ely-vazio-titulo">{props.title}</span>
      {props.text ? <span className="ely-vazio-texto">{props.text}</span> : null}
    </div>
  ),
});

// ── WeekGrid ───────────────────────────────────────────────────────────────────────────────
const dia = z.object({ dia: z.string(), itens: z.array(z.object({ hora: z.string().optional(), tarefa: z.string() })) });
export const WeekGrid = defineComponent({
  name: "WeekGrid",
  props: z.object({ days: z.array(dia) }),
  description: 'Week planner: days = [{dia: "Seg", itens: [{hora: "19h", tarefa: "Bioquímica"}]}]. Columns when wide, stacked days on a phone.',
  component: ({ props }) => (
    <div className="ely-semana">
      {lista(props.days).map((d, i) => {
        const x = d as z.infer<typeof dia>;
        return (
          <div key={i} className="ely-semana-dia">
            <span className="ely-semana-nome">{x.dia}</span>
            {lista(x.itens).map((it, j) => {
              const y = it as { hora?: string; tarefa: string };
              return (
                <div key={j} className="ely-semana-item">
                  {y.hora ? <span className="ely-semana-hora">{y.hora}</span> : null}
                  <span>{y.tarefa}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  ),
});

// ── QuizCard ───────────────────────────────────────────────────────────────────────────────
export const QuizCard = defineComponent({
  name: "QuizCard",
  props: z.object({
    value: reactive(z.string()),
    question: z.string(),
    options: z.array(z.string()),
    correct: z.number(),
    explanation: z.string().optional(),
  }),
  description: "One quiz question: tap an option, it locks and shows right (green) or wrong (shake, red) plus the explanation. value holds the chosen option text; score with ($q1 == \"right option\" ? 1 : 0).",
  component: function QuizCardView({ props, statementId }) {
    const id = useId();
    const campo = useStateField(statementId ?? props.question ?? id, props.value);
    const escolhida = campo.value == null ? "" : String(campo.value);
    const opcoes = lista(props.options).map(str);
    const certa = opcoes[Math.max(0, Math.min(opcoes.length - 1, num(props.correct) ?? 0))];
    const respondeu = escolhida !== "";
    return (
      <div className={cx("ely-quiz", respondeu && (escolhida === certa ? "is-certo" : "is-errado"))}>
        <div className="ely-quiz-pergunta">{inline(str(props.question))}</div>
        <div className="ely-quiz-opcoes">
          {opcoes.map((o, i) => (
            <button key={i} type="button" disabled={respondeu}
              className={cx("ely-quiz-opcao", respondeu && o === certa && "is-certa", respondeu && o === escolhida && o !== certa && "is-errada")}
              onClick={() => { campo.setValue(o); vibrar(o === certa ? "sucesso" : "erro"); }}>
              <span className="ely-quiz-letra">{String.fromCharCode(65 + i)}</span>
              <span>{o}</span>
              {respondeu && o === certa ? <Glyph name="check-circle" size={16} /> : null}
            </button>
          ))}
        </div>
        {respondeu ? (
          <div className="ely-quiz-explica">
            <strong>{escolhida === certa ? "Certo!" : `Resposta: ${certa}.`}</strong>{props.explanation ? ` ${props.explanation}` : ""}
          </div>
        ) : null}
      </div>
    );
  },
});

// ── Tabs / Section (11/11) ─────────────────────────────────────────────────────────────────
// Telas longas sem virar um paredão: abas para assuntos paralelos (visão geral, custos, dicas) e
// seções que abrem e fecham para o que é detalhe.
export const Tabs = defineComponent({
  name: "Tabs",
  props: z.object({ labels: z.array(z.string()), children, initial: z.number().optional() }),
  description: "Tabs: one label per child panel, in the same order. For 2–5 parallel parts of a long answer (overview, costs, tips; day 1, day 2). Each panel is usually a Col.",
  component: function TabsView({ props, renderNode }) {
    const paineis = lista(props.children);
    const rotulos = (props.labels ?? []).map(str).slice(0, paineis.length);
    const [i, setI] = useState(() => Math.min(Math.max(0, Math.trunc(num(props.initial) ?? 0)), Math.max(0, rotulos.length - 1)));
    const atual = Math.min(i, Math.max(0, paineis.length - 1));
    return (
      <div className="ely-tabs">
        <div className="ely-tabs-barra" role="tablist">
          {rotulos.map((r, k) => (
            <button key={k} type="button" role="tab" aria-selected={k === atual} className={cx("ely-tab", k === atual && "is-ativa")} onClick={() => setI(k)}>{inline(r)}</button>
          ))}
        </div>
        <div className="ely-tabs-painel" role="tabpanel" key={atual}>{renderNode(paineis[atual])}</div>
      </div>
    );
  },
});

export const Section = defineComponent({
  name: "Section",
  props: z.object({ title: z.string(), children, open: z.boolean().optional(), icon: z.string().optional(), subtitle: z.string().optional() }),
  description: "Collapsible section: a header that opens and closes its content. For details, FAQs, extra steps or long lists the user may skip. open (default false) starts it open.",
  component: function SectionView({ props, renderNode }) {
    const [aberta, setAberta] = useState(!!props.open);
    return (
      <div className={cx("ely-secao", aberta && "is-aberta")}>
        <button type="button" className="ely-secao-topo" aria-expanded={aberta} onClick={() => setAberta((v) => !v)}>
          {props.icon ? <span className="ely-secao-icone"><Glyph name={props.icon} size={16} /></span> : null}
          <span className="ely-secao-textos">
            <span className="ely-secao-titulo">{inline(str(props.title))}</span>
            {props.subtitle ? <span className="ely-secao-sub">{inline(str(props.subtitle))}</span> : null}
          </span>
          <Glyph name="chevron-down" size={16} className="ely-secao-seta" />
        </button>
        {aberta ? <div className="ely-secao-corpo">{renderNode(lista(props.children))}</div> : null}
      </div>
    );
  },
});

export const elyComponents = [Hero, Stat, StatRow, Ring, Progress, Timeline, TimelineItem, ImageCard, Callout, ScoreBar, Versus, Avatar, AvatarRow, Empty, WeekGrid, QuizCard, Tabs, Section];
