import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Perfiles persistentes de Chrome del lector, uno por conexión, fuera de cualquier repositorio. */
export const CARPETA_PERFILES = join(homedir(), 'Library', 'Application Support', 'perfil-lector');

export const perfilDe = (conexion: string): string => join(CARPETA_PERFILES, conexion);

/*
 * Las superficies de Playwright que usa el lector, declaradas con sus miembros como funciones, como lo son en
 * Playwright para Node: así `resp.status === 429` o `pagina.url.includes(…)` no compilan, en vez de comparar una
 * función y dar una lectura vacía por buena.
 */

export interface Respuesta {
  url(): string;
  status(): number;
  request(): { method(): string };
  json(): Promise<unknown>;
}

export interface Pagina {
  goto(url: string, opciones?: { waitUntil?: 'domcontentloaded'; timeout?: number }): Promise<{ status(): number } | null>;
  url(): string;
  waitForTimeout(ms: number): Promise<void>;
  mouse: { wheel(x: number, y: number): Promise<void> };
  /** La función corre dentro de la página: solo recibe lo que se declara aquí de cada elemento. */
  $$eval<R>(selector: string, fn: (elementos: Array<{ getAttribute(nombre: string): string | null }>) => R): Promise<R>;
}

export interface Contexto {
  cookies(url?: string): Promise<Array<{ name: string; value: string }>>;
  on(evento: 'response', cb: (respuesta: Respuesta) => void): void;
  pages(): Pagina[];
  newPage(): Promise<Pagina>;
  close(): Promise<void>;
}

export type Lanzador = (perfil: string, conVentana: boolean) => Promise<Contexto>;

// Nunca se sugiere «playwright install chrome»: en macOS ese comando borra el Chrome instalado.
export const MSG_SIN_CHROME = 'no pude abrir Chrome con el perfil de la conexión: instala Google Chrome desde google.com/chrome';
export const MSG_PERFIL_EN_USO = 'el perfil de esta conexión ya está abierto por otro proceso: espera a que termine y vuelve a intentarlo';

const SENAL_PERFIL_TOMADO = ['processsingleton', 'singletonlock', 'profile appears to be in use', 'already in use'];

/** Chrome no pudo abrirse: no se llegó a consultar el sitio. */
export class ArranqueFallido extends Error {
  override name = 'ArranqueFallido';
}

const lanzadorReal: Lanzador = async (perfil, conVentana) => {
  // Import perezoso: las pruebas y la validación del enlace no cargan Playwright.
  const { chromium } = await import('playwright-core');
  const contexto = await chromium.launchPersistentContext(perfil, {
    channel: 'chrome',
    headless: !conVentana,
    viewport: { width: 1280, height: 860 },
    args: ['--disable-blink-features=AutomationControlled'],
  });
  return contexto as unknown as Contexto;
};

/**
 * Chrome real sobre el perfil dedicado de la conexión, sin caer a otro navegador: el perfil lo creó Chrome y
 * abrirlo con otro binario puede dañarlo. Distingue un perfil ya tomado de un Chrome ausente.
 */
export async function abrirChrome(perfil: string, conVentana: boolean, lanzar: Lanzador = lanzadorReal): Promise<Contexto> {
  mkdirSync(perfil, { recursive: true, mode: 0o700 });
  try {
    return await lanzar(perfil, conVentana);
  } catch (e) {
    const detalle = (e instanceof Error ? e.message : String(e)).toLowerCase();
    throw new ArranqueFallido(SENAL_PERFIL_TOMADO.some((s) => detalle.includes(s)) ? MSG_PERFIL_EN_USO : MSG_SIN_CHROME);
  }
}
