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
  "The screen lives inside a chat bubble 360–680 px wide: design one column first, compact, no empty cards, no decorative filler. Usually under 25 statements. No placeholders, no TODOs.",
  "Put the key result first (right after the title): the number, answer or recommendation the user asked for, then the controls, then details.",
  "Make it rich and polished, not a bare form: open with Hero(title, subtitle, icon); show metrics in a StatRow of Stat (icon, delta, spark); the takeaway in a Callout; places, times or steps in a Timeline; progress or shares in Ring/Progress; options side by side in Versus with ImageCard; people in AvatarRow. A real photo (SearchImage/ImageCard) for every place, dish or product.",
  "Calculators and simulators are LIVE: bind Slider/Input to $variables and compute the results from them in the same render. Never add a Calculate, Submit or Clear button for this.",
  "Copy every component signature exactly (argument order and types): pass numbers as numbers, enums as the listed strings, and never a component where a string is expected.",
  "Reply with the OpenUI Lang program only: no Markdown fences, no explanation before or after. The first line is `root = ...`.",
];

export const promptOptionsEly: PromptOptions = {
  ...promptOptions,
  additionalRules: [...(promptOptions.additionalRules ?? []), ...regrasEly],
};
