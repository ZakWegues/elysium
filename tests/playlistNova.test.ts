import { beforeEach, describe, expect, it, vi } from "vitest";

/** 27/11: "gera uma playlist e coloca no Spotify do celular" — monta, toca no aparelho certo, e acorda o app fechado. */
const abertos: string[] = [];
vi.mock("electron", () => ({ shell: { openExternal: async (u: string) => { abertos.push(u); } } }));
vi.mock("../src/actions/playMusic", () => ({ playMusic: async () => "PC" }));

let aparelhoLigado = true;
let aparelhoAcordaEm = 0;
const tocadas: { aparelho: string; uri: unknown }[] = [];
let criarFalha: string | null = null;
vi.mock("../src/services/spotify", () => ({
  isConnected: () => true,
  criarPlaylist: async (nome: string, itens: unknown[]) => {
    if (criarFalha) throw new Error(criarFalha);
    return { nome, total: itens.length, uri: "spotify:playlist:NOVA" };
  },
  tocarNo: async (aparelho: string, uri: unknown) => {
    if (!aparelhoLigado && Date.now() < aparelhoAcordaEm) return false;
    if (!aparelhoLigado && !aparelhoAcordaEm) return false;
    tocadas.push({ aparelho, uri });
    return true;
  },
  acharColecao: async () => ({ uri: "spotify:playlist:PRONTA", nome: "Deep Focus", tipo: "playlist" }),
  acharFaixa: async () => null,
}));
let sugestoes: { itens: { titulo: string; artista: string }[] } | null = null;
vi.mock("../src/services/musicaConversa", () => ({
  musicasParecidas: async () => sugestoes,
  resolverPelaConversa: async () => [],
}));

const { gerarPlaylist, tocarQuandoAcordar } = await import("../src/services/tocar");

beforeEach(() => {
  aparelhoLigado = true; aparelhoAcordaEm = 0; tocadas.length = 0; abertos.length = 0; criarFalha = null;
  sugestoes = { itens: [{ titulo: "A", artista: "X" }, { titulo: "B", artista: "Y" }, { titulo: "C", artista: "Z" }] };
});

describe("playlist nova (27/11)", () => {
  it("monta na conta dele e toca no celular", async () => {
    const fala = await gerarPlaylist("instrumental para estudar", "Foco", "celular");
    expect(fala).toBe("Montei a playlist Foco, com 3 músicas, e já está tocando no celular.");
    expect(tocadas).toEqual([{ aparelho: "celular", uri: { contexto: "spotify:playlist:NOVA" } }]);
  });

  it("sem modelo (Groq fora), toca uma playlist pronta do Spotify", async () => {
    sugestoes = null;
    expect(await gerarPlaylist("foco", "", "pc")).toBe("Tocando a playlist Deep Focus, no PC.");
  });

  it("sem permissão de criar playlist: toca a pronta e diz como liberar", async () => {
    criarFalha = "Saia e conecte o Spotify de novo no PC para liberar playlists.";
    const fala = await gerarPlaylist("foco", "", "pc");
    expect(fala).toContain("Deep Focus");
    expect(fala).toContain("conecte o Spotify de novo");
  });

  it("Spotify do PC fechado: abre a playlist e dá o play quando o app acorda", async () => {
    vi.useFakeTimers();
    try {
      aparelhoLigado = false;
      const fala = await gerarPlaylist("foco", "Foco", "pc");
      expect(fala).toBe("Montei a playlist Foco, com 3 músicas, e abri no Spotify do PC.");
      expect(abertos).toEqual(["spotify:playlist:NOVA"]);
      aparelhoAcordaEm = Date.now() + 3000;
      await vi.advanceTimersByTimeAsync(6000);
      expect(tocadas).toEqual([{ aparelho: "pc", uri: { contexto: "spotify:playlist:NOVA" } }]);
    } finally { vi.useRealTimers(); }
  });

  it("um pedido novo cancela a espera do anterior", async () => {
    vi.useFakeTimers();
    try {
      aparelhoLigado = false;
      tocarQuandoAcordar("celular", "spotify:track:VELHA");
      tocarQuandoAcordar("celular", "spotify:track:NOVA");
      aparelhoAcordaEm = Date.now() + 1000;
      await vi.advanceTimersByTimeAsync(5000);
      expect(tocadas).toEqual([{ aparelho: "celular", uri: "spotify:track:NOVA" }]);
    } finally { vi.useRealTimers(); }
  });
});
