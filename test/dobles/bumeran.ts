import { readFileSync } from 'node:fs';

/** Respuesta de búsqueda guardada de la página de Bumeran, recortada a cinco avisos y a sus descripciones. */
export const BUSQUEDA_GUARDADA: { content: Array<Record<string, unknown>> } & Record<string, unknown> = JSON.parse(
  readFileSync(new URL('./bumeran/busqueda.json', import.meta.url), 'utf8'),
);

/** Enlaces a esos cinco avisos, tal como los muestra la página. */
export const ENLACES_GUARDADOS: string[] = JSON.parse(readFileSync(new URL('./bumeran/enlaces.json', import.meta.url), 'utf8'));

/** Como la pide la página: por POST, con sus parámetros de búsqueda. */
export const URL_AVISOS = 'https://www.bumeran.com.pe/api/avisos/searchV2?pageSize=20&page=0&sort=RECIENTES';

/** La misma respuesta con `n` avisos y sus enlaces: cada copia renumera los avisos, como si fueran otros del sitio. */
export function conAvisos(n: number): { cuerpo: unknown; enlaces: string[] } {
  const content: Array<Record<string, unknown>> = [];
  const enlaces: string[] = [];
  for (let k = 0; k < n; k++) {
    const base = BUSQUEDA_GUARDADA.content[k % BUSQUEDA_GUARDADA.content.length] as Record<string, unknown>;
    const id = 9_000_000 + k;
    content.push({ ...base, id });
    enlaces.push(`/empleos/aviso-de-prueba-${id}.html`);
  }
  return { cuerpo: { ...BUSQUEDA_GUARDADA, content }, enlaces };
}
