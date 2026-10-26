import { createParser } from "@openuidev/lang-core";
import { describe, expect, it } from "vitest";
import { library } from "../src/lib/library";
import { exampleDashboard, exampleShoppingList, exampleSteps, exampleTrip } from "../src/lib/prompt-options";
import { compositionPrograms } from "../galeria/composition-programs";
import { programasPt } from "../galeria/programas-pt";
import { telasProntas } from "../galeria/telas-prontas";
import { programs } from "../galeria/programs";
import { toolPrograms } from "../galeria/tool-programs";

const parser = createParser(library.toJSONSchema());

const todos = [
  ...telasProntas,
  ...programasPt,
  ...toolPrograms,
  { id: "example-list", code: exampleShoppingList },
  { id: "example-trip", code: exampleTrip },
  { id: "example-steps", code: exampleSteps },
  { id: "example-dashboard", code: exampleDashboard },
  ...programs,
  ...compositionPrograms,
];

describe.each(todos)("$id", ({ code }) => {
  it("parseia no OpenUI Lang 1.0 sem erro", () => {
    const r = parser.parse(code);
    expect(r.root).not.toBeNull();
    expect(r.meta.errors.map((e) => e.message)).toEqual([]);
    expect(r.meta.unresolved).toEqual([]);
    expect(r.meta.orphaned).toEqual([]);
  });
});

describe("componente inventado", () => {
  it("vira erro com a lista dos que existem (serve para a 2ª tentativa)", () => {
    const r = parser.parse('root = Col([Title("Oi", "lg"), Grafico(1, 2)])');
    expect(r.meta.errors.some((e) => /Grafico/.test(e.message))).toBe(true);
  });
});
