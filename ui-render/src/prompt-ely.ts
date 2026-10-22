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
  `Icon names must be one of: ${NOMES_DE_ICONES.join(", ")}. Any other name shows a dot.`,
  "HtmlView runs offline: inline JS and CSS only, no CDN, no external fonts, images or fetch.",
  "YouTube shows the video's thumbnail and opens it on YouTube when tapped; use it only for a video you know exists.",
  'Never present invented numbers as real data: when values are illustrative, say so in a Caption ("Exemplo com números inventados").',
  "Keep the page focused: one screen of content, usually under 40 statements. No placeholders, no TODOs.",
  "Reply with the OpenUI Lang program only: no Markdown fences, no explanation before or after. The first line is `root = ...`.",
];

export const promptOptionsEly: PromptOptions = {
  ...promptOptions,
  additionalRules: [...(promptOptions.additionalRules ?? []), ...regrasEly],
};
