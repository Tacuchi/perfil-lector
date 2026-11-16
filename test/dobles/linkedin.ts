import { readFileSync } from 'node:fs';

import type { Contexto, Pagina, Respuesta } from '../../src/fuentes/navegador.js';

/** Respuesta de avisos guardada de la página de empleos, recortada a cinco avisos. */
export const RECOMENDADAS: unknown = JSON.parse(readFileSync(new URL('./linkedin/recomendadas.json', import.meta.url), 'utf8'));

const URL_AVISOS = 'https://www.linkedin.com/voyager/api/graphql?variables=(count:6)&queryId=voyagerJobsDashJobCards.0f1e2d3c';

/** La misma respuesta con `n` avisos: cada copia renumera los urns, como si fueran otros avisos del sitio. */
export function conAvisos(n: number): unknown {
  const base = JSON.stringify(RECOMENDADAS);
  const ids = [...new Set([...base.matchAll(/fsd_jobPosting:(\d+)/g)].map((m) => m[1] as string))];
  const included: unknown[] = [];
  for (let copia = 0; included.length === 0 || ids.length * copia < n; copia++) {
    let texto = base;
    ids.forEach((id, k) => { texto = texto.split(`fsd_jobPosting:${id}`).join(`fsd_jobPosting:${9_000_000_000 + copia * 100 + k}`); });
    included.push(...(JSON.parse(texto) as { included: unknown[] }).included);
  }
  return { included };
}

export interface Escenario {
  /** Lo que responde la página al navegar a cada dirección. */
  estado?: number;
  /** Dirección final tras navegar (un desvío a login o a una verificación). */
  final?: (url: string) => string;
  /** Enlaces que muestra la página (los de las alertas en preferencias). */
  enlaces?: string[];
  /** Respuestas de datos que la página carga al navegar. */
  respuestas?: Array<{ url?: string; status?: number; metodo?: string; cuerpo: unknown }>;
  cookies?: Array<{ name: string; value: string }>;
}

/** Un Chrome simulado que emite, al navegar, las respuestas guardadas por el mismo camino que el real. */
export function chromeSimulado(escenario: Escenario) {
  const oyentes: Array<(r: Respuesta) => void> = [];
  const visitadas: string[] = [];
  let actual = 'about:blank';
  let cerrado = false;
  const pagina: Pagina = {
    async goto(url) {
      visitadas.push(url);
      actual = escenario.final?.(url) ?? url;
      for (const r of escenario.respuestas ?? []) {
        const respuesta: Respuesta = {
          url: () => r.url ?? URL_AVISOS,
          status: () => r.status ?? 200,
          request: () => ({ method: () => r.metodo ?? 'GET' }),
          json: async () => r.cuerpo,
        };
        oyentes.forEach((o) => o(respuesta));
      }
      return { status: () => escenario.estado ?? 200 };
    },
    url: () => actual,
    waitForTimeout: async () => {},
    mouse: { wheel: async () => {} },
    $$eval: async (_selector, fn) => fn((escenario.enlaces ?? []).map((h) => ({ getAttribute: () => h }))),
  };
  const contexto: Contexto = {
    cookies: async () => escenario.cookies ?? [],
    on: (_evento, cb) => { oyentes.push(cb); },
    pages: () => [pagina],
    newPage: async () => pagina,
    close: async () => { cerrado = true; },
  };
  return { contexto, visitadas, cerrado: () => cerrado };
}
