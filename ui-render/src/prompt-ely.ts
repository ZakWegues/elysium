import type { PromptOptions } from "@openuidev/react-lang";
import { NOMES_DE_ICONES } from "./lib/components/glyph";
import { promptOptions } from "./lib/prompt-options";

/**
 * O prompt da Ely para montar telas (Fase 2): o do open-intelligent-ui (regras e exemplos de
 * composição, em inglês — os modelos seguem melhor assim) mais as regras do ELYSIUM: português do
 * Brasil, real, só os ícones que existem, nada de rede e a resposta só com o programa.
 */
const regrasEly = [
  "Every text the user sees is in Brazilian Portuguese (pt-BR): titles, labels, buttons, captions, Markdown, @ToAssistant messages. Keep proper names as they are.",
  'Money is Brazilian real unless the user named another currency: @Format(value, "currency", 2, "BRL"); a Slider for money uses unit "R$". Dates come from @FormatDate (already pt-BR).',
  "Loans, financing, installments and compound interest ALWAYS use the tested functions, never a hand-written formula: monthly payment = @Payment(principal, monthlyRatePercent, months); an annual rate becomes monthly with @Pow(1 + annual / 100, 1 / 12) * 100 - 100; total paid = payment * months; total interest = total paid - principal. The rate is in PERCENT, not a fraction: R$ 30.000 at 12% a year for 36 months is @Payment(30000, @Pow(1 + 12 / 100, 1 / 12) * 100 - 100, 36) ≈ R$ 988 a month (total interest ≈ R$ 5.556).",
  "Each field has ONE label: never a Caption above a Label (or Slider) that says the same thing.",
  `Icon names must be one of: ${NOMES_DE_ICONES.join(", ")}. Any other name shows a dot.`,
  "HtmlView runs offline: inline JS and CSS only, no CDN, no external fonts, images or fetch.",
  "YouTube shows the video's thumbnail and opens it on YouTube when tapped; use it only for a video you know exists.",
  'Never present invented numbers as real data: when values are illustrative, say so in a Caption ("Exemplo com números inventados").',
  "Never use Map or MapMarker: maps are turned off. Places and trips go in a timeline List of ListItem with a SearchImage photo of each place.",
  "The screen lives inside a chat bubble 360–680 px wide: one column first, no empty cards, no decorative filler, no placeholders, no TODOs.",
  "Size the screen to the content, not to a fixed budget: a quick answer is 8–15 statements; a plan, guide, trip or comparison is usually 20–45. Never drop content to keep it short: keep long content tidy with Tabs (parallel parts) and Section (details the user may open). Don't show the same data twice (no Table repeating the cards).",
  "COMPLETE, not basic: cover everything the user asked and everything in Ely's text answer — every item, day, step, option, number and tip. Never cut a list down to a few items or write 'etc.'; if the request asks for N things, show N. Be concrete and specific to the request: real names, quantities, times, distances, prices (marked 'aprox.' with the year when not certain), how-tos, warnings.",
  "Put the key result first: the number, answer or recommendation the user asked for, then the controls, then the details.",
  "Pick the layout from what was asked, so screens don't all look alike: (1) how-to/guide → what you need, time and difficulty up top, then numbered steps (Timeline or List), warnings as Callout alerta; (2) explanation/article → short intro, a Section or Tab per subtopic, a Svg diagram or photo when it helps, key facts in a compact Table; (3) trip or multi-day plan → Tabs per day (or one Timeline per day), each stop with time, what to do, cost and how to get there, a photo, totals in a StatRow; (4) comparison/choice → Versus with photos, a Table of all criteria, ScoreBar scores, pros and cons per option, a clear verdict; (5) tool/calculator/simulator → inputs bound to $variables, live results big (Stat), a Chart that reacts; (6) data/dashboard → StatRow, the right Chart type, a Table with every row, insights; (7) recipe, catalog or shopping → ImageCard Grid or Carousel, items as Checkbox list with quantities; (8) learning → examples, Flashcard/QuizCard, a summary.",
  "Vary the opening: Hero is one option, not the default — a photo ImageCard, a big Stat, or a Title with a Text intro also open a screen. Give each screen its own accent (chart1–chart6) instead of always the same color. A real photo (SearchImage/ImageCard) for every place, dish or product.",
  "Calculators and simulators are LIVE: bind Slider/Input to $variables and compute the results from them in the same render. Never add a Calculate, Submit or Clear button for this.",
  "Copy every component signature exactly (argument order and types): pass numbers as numbers, enums as the listed strings, and never a component where a string is expected.",
  "Reply with the OpenUI Lang program only: no Markdown fences, no explanation before or after. The first line is `root = ...`.",
];

export const promptOptionsEly: PromptOptions = {
  ...promptOptions,
  additionalRules: [...(promptOptions.additionalRules ?? []), ...regrasEly],
};
