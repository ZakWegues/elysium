import { describe, expect, it } from "vitest";
import { casarJanelas, grade, lugarUnico, monitorDe, noProximoMonitor, paraAbsoluto, paraRelativo, pedidoDeJanelas } from "../src/services/layoutJanelas";
import { escolherPacote, falaDaBusca, idValido, lerDetalhesWinget, lerTabelaWinget, termoValido } from "../src/actions/instalarApp";
import { decidirChamada } from "../src/services/politicaFerramentas";

const A = { x: 0, y: 0, largura: 1920, altura: 1040 };

describe("geometria das janelas (bloco 216)", () => {
  it("grade de 1 a 4 e metades", () => {
    expect(grade(2, A)).toEqual([{ x: 0, y: 0, largura: 960, altura: 1040 }, { x: 960, y: 0, largura: 960, altura: 1040 }]);
    expect(grade(3, A)[2]).toEqual({ x: 960, y: 520, largura: 960, altura: 520 });
    expect(grade(4, A)).toHaveLength(4);
    expect(lugarUnico("direita", A)).toEqual({ x: 960, y: 0, largura: 960, altura: 1040 });
  });
  it("relativo ↔ absoluto e outro monitor", () => {
    const B = { x: 1920, y: 0, largura: 2560, altura: 1400 };
    const r = { x: 960, y: 0, largura: 960, altura: 1040 };
    expect(paraAbsoluto(paraRelativo(r, A), A)).toEqual(r);
    expect(monitorDe(r, [A, B])).toBe(0);
    expect(noProximoMonitor(r, [A, B])).toEqual({ x: 1920 + 1280, y: 0, largura: 1280, altura: 1400 });
    expect(noProximoMonitor(r, [A])).toEqual(r);
  });
  it("layout volta preso ao monitor menor", () => {
    expect(paraAbsoluto({ x: 0.9, y: 0, l: 0.5, a: 1 }, A).x).toBe(960);
  });
  it("casa cada item com uma janela, preferindo o título parecido", () => {
    const itens = [
      { processo: "chrome", titulo: "Aula de física - YouTube", monitor: 0, rel: { x: 0, y: 0, l: 0.5, a: 1 }, maximizada: false },
      { processo: "chrome", titulo: "Gmail", monitor: 0, rel: { x: 0.5, y: 0, l: 0.5, a: 1 }, maximizada: false },
      { processo: "Code", titulo: "projeto", monitor: 0, rel: { x: 0, y: 0, l: 1, a: 1 }, maximizada: true },
    ];
    const abertas = [
      { hwnd: "1", processo: "chrome", titulo: "Caixa de entrada - Gmail" },
      { hwnd: "2", processo: "chrome", titulo: "Física aula 3 - YouTube" },
    ];
    expect(casarJanelas(itens, abertas)).toEqual(["2", "1", null]);
  });
  it("frases do fastRoute", () => {
    expect(pedidoDeJanelas("Ely, organiza minhas janelas")).toEqual({ modo: "quadrantes" });
    expect(pedidoDeJanelas("janelas lado a lado")).toEqual({ modo: "lado_a_lado" });
    expect(pedidoDeJanelas("salva o layout estudo")).toEqual({ modo: "salvar_layout", layout: "estudo" });
    expect(pedidoDeJanelas("layout estudo")).toEqual({ modo: "aplicar_layout", layout: "estudo" });
    expect(pedidoDeJanelas("joga o chrome pra esquerda")).toEqual({ modo: "esquerda", programa: "chrome" });
    expect(pedidoDeJanelas("manda o spotify pro outro monitor")).toEqual({ modo: "outro_monitor", programa: "spotify" });
    expect(pedidoDeJanelas("modo estudo")).toBeNull();
    expect(pedidoDeJanelas("manda o link pro celular")).toBeNull();
  });
});

const BUSCA = "Name                Id                         Version Match        Source\r\n---------------------------------------------------------------------------\r\nVLC                 XPDM1ZW6815MQM             Unknown              msstore\r\nVLC media player    VideoLAN.VLC               3.0.24  Moniker: vlc winget\r\npympress            Cimbali.pympress           1.8.6   Tag: vlc     winget\r\n<additional entries truncated due to result limit>\r\n";

describe("winget (bloco 216)", () => {
  it("lê a tabela da busca, com o spinner antes", () => {
    const l = lerTabelaWinget("   -\r   \\\r   |\r" + BUSCA);
    expect(l.map(x => [x.nome, x.id, x.versao, x.fonte])).toEqual([
      ["VLC", "XPDM1ZW6815MQM", "Unknown", "msstore"],
      ["VLC media player", "VideoLAN.VLC", "3.0.24", "winget"],
      ["pympress", "Cimbali.pympress", "1.8.6", "winget"],
    ]);
  });
  it("lê a tabela de atualizações (coluna Available)", () => {
    const up = "Name      Id            Version Available Source\n-------------------------------------------------\nApp Um    Exemplo.Um    1.0     1.1       winget\n1 upgrades available.\n";
    expect(lerTabelaWinget(up)).toEqual([{ nome: "App Um", id: "Exemplo.Um", versao: "1.0", disponivel: "1.1", fonte: "winget" }]);
  });
  it("detalhes do show", () => {
    expect(lerDetalhesWinget("Found VLC media player [VideoLAN.VLC]\nVersion: 3.0.24\nPublisher: VideoLAN\n")).toEqual({ nome: "VLC media player", id: "VideoLAN.VLC", editora: "VideoLAN", versao: "3.0.24" });
  });
  it("escolhe o pacote só quando não há dúvida", () => {
    const l = lerTabelaWinget(BUSCA);
    expect(escolherPacote("VideoLAN.VLC", l)?.id).toBe("VideoLAN.VLC");
    expect(escolherPacote("vlc media player", l)?.id).toBe("VideoLAN.VLC");
    expect(escolherPacote("vlc", l)?.id).toBe("XPDM1ZW6815MQM"); // nome igual ao da Store
    expect(escolherPacote("player", l)).toBeNull();
    expect(falaDaBusca("vlc", l)).toContain("VLC media player (VideoLAN.VLC, 3.0.24)");
  });
  it("nada estranho vira argumento", () => {
    expect(termoValido("vlc")).toBe(true);
    expect(termoValido("vlc\" & calc")).toBe(false);
    expect(idValido("VideoLAN.VLC")).toBe(true);
    expect(idValido("x; rm -rf")).toBe(false);
  });
  it("conteúdo de fora não instala sem o pedido pedir", () => {
    expect(decidirChamada("instalar_app", true, "resume essa página", { pacote: "malware.app" }).tipo).toBe("bloquear");
    expect(decidirChamada("instalar_app", true, "instala o vlc que essa página recomenda", { pacote: "VideoLAN.VLC" }).tipo).toBe("executar");
  });
});
