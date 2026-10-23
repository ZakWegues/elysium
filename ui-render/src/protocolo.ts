import { z } from "zod/v4";

/**
 * O protocolo entre a tela e o host, dos dois lados. O host (PC/celular) importa este mesmo
 * arquivo — ou a cópia gerada no build (`dist/protocolo.js`) — para validar o que vem da tela.
 *
 * Host → tela: `programa` (o OpenUI Lang, o tema e o estado salvo), `tema` (troca ao vivo),
 * `config` (fotos e mapas da internet ligados? prévia no chat ou tela cheia?), `resposta` (de um `pedido`).
 * Tela → host: `pronta`, `altura`, `acao` (perguntar / abrirLink / copiar), `estado` (o que foi
 * digitado, para voltar ao reabrir), `pedido` (fotos, rota), `erro` (o programa não montou),
 * `rolar` (a roda do mouse na prévia: quem rola é o chat do host).
 */

const MAX_PROGRAMA = 200_000;
const texto = (max: number) => z.string().max(max);

/** As variáveis de tema que o host manda: nome `--iui-*` e valor CSS curto, sem `url(`/`;`. */
export const tema = z.object({
  esquema: z.enum(["claro", "escuro"]),
  vars: z.record(z.string().regex(/^--iui-[a-z0-9-]{1,40}$/), z.string().max(80).regex(/^[^;{}<>]*$/).refine((v) => !/url\s*\(|expression\s*\(/i.test(v), "valor proibido")).optional(),
  reduzirMovimento: z.boolean().optional(),
});
export type Tema = z.infer<typeof tema>;

/** Estado dos controles: nomes de variável `$x` → valor JSON simples. */
export const estado = z.record(z.string().max(60), z.union([z.string().max(5000), z.number(), z.boolean(), z.null(), z.array(z.unknown()).max(200), z.record(z.string(), z.unknown())]));

export const mensagemDoHost = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("programa"), texto: texto(MAX_PROGRAMA), tema, estado: estado.optional(), streaming: z.boolean().optional() }),
  z.object({ tipo: z.literal("tema"), tema }),
  z.object({ tipo: z.literal("config"), internet: z.boolean(), modo: z.enum(["previa", "cheia"]).optional() }),
  z.object({ tipo: z.literal("resposta"), id: z.number().int().positive(), dados: z.unknown().optional(), erro: texto(200).optional() }),
]);
export type MensagemDoHost = z.infer<typeof mensagemDoHost>;

export const mensagemDaTela = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("pronta") }),
  z.object({ tipo: z.literal("altura"), px: z.number().int().min(0).max(20_000) }),
  z.object({ tipo: z.literal("acao"), acao: z.enum(["perguntar", "abrirLink", "copiar"]), valor: texto(4000) }),
  z.object({ tipo: z.literal("estado"), vars: estado }),
  z.object({ tipo: z.literal("pedido"), id: z.number().int().positive(), rota: z.enum(["fotos", "rota"]), params: z.record(z.string().max(30), texto(300)) }),
  z.object({ tipo: z.literal("erro"), mensagem: texto(1000) }),
  z.object({ tipo: z.literal("rolar"), dy: z.number().min(-2000).max(2000) }),
]);
export type MensagemDaTela = z.infer<typeof mensagemDaTela>;

/**
 * O host confere um link antes de abrir: só `https:`, sem usuário/senha na URL. Puro — vale
 * para o `shell.openExternal` do PC e o `Linking` do celular.
 */
export function linkSeguro(valor: string): string | null {
  try {
    const u = new URL(valor);
    if (u.protocol !== "https:" || u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}
