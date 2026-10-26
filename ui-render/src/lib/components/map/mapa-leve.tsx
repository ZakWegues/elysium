"use client";

import { defineComponent, reactive, useIsStreaming, useStateField } from "@openuidev/react-lang";
import { useId } from "react";
import { z } from "zod/v4";
import { cx } from "../style";

/**
 * Mapa leve (26/10). O mapa de rua (MapLibre, ~1,4 MB com o worker) está desligado desde 24/10
 * — saía errado e pesava. Telas antigas guardadas no histórico ainda têm `Map`/`MapMarker`: estes
 * dois continuam com o MESMO nome e as MESMAS props (o parser não quebra), mas desenham as paradas
 * como uma trilha numerada. Tocar numa parada preenche `selected`, como o mapa fazia.
 */

export const MapMarker = defineComponent({
  name: "MapMarker",
  props: z.object({
    label: z.string(),
    lat: z.number(),
    lng: z.number(),
    category: z.string().optional(),
    icon: z.string().optional(),
  }),
  description: "A place on a Map; icon is one emoji, else the pin shows its number.",
  component: () => null,
});

type Parada = { label: string; category?: string; icon?: string };

function paradas(markers: unknown, streaming: boolean): Parada[] {
  return (Array.isArray(markers) ? markers.flat() : []).flatMap((item) => {
    const el = item as { type?: string; partial?: boolean; props?: Record<string, unknown> } | null;
    if (el?.type !== "element" || !el.props || (streaming && el.partial)) return [];
    const { label, category, icon } = el.props;
    if (typeof label !== "string" || !label.trim()) return [];
    return [{ label: label.trim(), category: typeof category === "string" ? category : undefined, icon: typeof icon === "string" ? icon : undefined }];
  });
}

export const MapView = defineComponent({
  name: "Map",
  props: z.object({
    markers: z.array(MapMarker.ref),
    route: z.boolean().optional(),
    selected: reactive(z.string().optional()),
    height: z.number().optional(),
  }),
  description: "Street map fitted to its markers. route draws the road path in marker order; selected holds the clicked marker's label.",
  component: function MapaLeve({ props, statementId }) {
    const streaming = useIsStreaming();
    const id = useId();
    const selecao = useStateField(statementId ?? `mapa-${id}`, props.selected);
    const lista = paradas(props.markers, streaming);
    if (!lista.length) return null;
    return (
      <ol className={cx("ely-trilha", props.route && "is-rota")} aria-label="Lugares">
        {lista.map((p, i) => (
          <li key={`${p.label}-${i}`} className={cx("ely-trilha-item", selecao.value === p.label && "is-sel")}>
            <button type="button" onClick={() => selecao.setValue(p.label)}>
              <span className="ely-trilha-ponto">{p.icon && p.icon.length <= 4 ? p.icon : i + 1}</span>
              <span className="ely-trilha-texto">
                <span className="ely-trilha-titulo">{p.label}</span>
                {p.category ? <span className="ely-trilha-sub">{p.category}</span> : null}
              </span>
            </button>
          </li>
        ))}
      </ol>
    );
  },
});
