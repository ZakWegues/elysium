import { describe, expect, it } from "vitest";
import { montarResumo, FatosResumo } from "../src/services/resumoDoDia";

const base = (): FatosResumo => ({
  agora: new Date(2026, 9, 1, 8, 5),
  nome: "Fulano",
  clima: "Em Recife, 18 graus e nublado.",
  lembretes: [],
  rotinas: [],
  recadosNovos: 0,
  alertas: [],
  versaoNova: null,
});

describe("resumo do dia (bloco 117)", () => {
  it("dia vazio: saudação, clima e 'nada marcado'", () => {
    expect(montarResumo(base())).toBe("Bom dia, Fulano. Em Recife, 18 graus e nublado. Nada marcado para hoje.");
  });

  it("junta lembretes em ordem, rotinas, recados, alertas e versão", () => {
    const f = base();
    const h = (hh: number, mm = 0) => new Date(2026, 9, 1, hh, mm).getTime();
    f.lembretes = [{ texto: "dentista", em: h(15) }, { texto: "remédio", em: h(9, 30) }];
    f.rotinas = [{ nome: "Estado do PC", em: h(22) }];
    f.recadosNovos = 2;
    f.alertas = ["disco c: 25 GB livres"];
    f.versaoNova = "1.7.0";
    const t = montarResumo(f);
    expect(t).toContain("2 lembretes hoje: remédio às 9h30 e dentista às 15h.");
    expect(t).toContain("Rotina de hoje: Estado do PC às 22h.");
    expect(t).toContain("Tem 2 recados do celular");
    expect(t).toContain("Atenção: disco c: 25 GB livres.");
    f.alertas = ["Disco C: 25 GB livres", "Chaves de assinatura: sem backup"];
    expect(montarResumo(f)).toContain("Atenção: Disco C: 25 GB livres; Chaves de assinatura: sem backup.");
    expect(t).toContain("A versão 1.7.0");
    expect(t).not.toContain("Nada marcado");
  });

  it("sem nome e à noite", () => {
    const f = base();
    f.nome = "";
    f.agora = new Date(2026, 9, 1, 21, 0);
    expect(montarResumo(f).startsWith("Boa noite. ")).toBe(true);
  });
});
