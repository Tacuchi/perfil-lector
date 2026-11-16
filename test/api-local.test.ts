import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { correr } from '../src/corrida.js';
import { lectorLinkedIn, SesionChrome } from '../src/fuentes/linkedin.js';
import { chromeSimulado, RECOMENDADAS } from './dobles/linkedin.js';
import { registroEnMemoria } from './dobles/api.js';

/*
 * Corrida contra la API local de perfil-api (`./mvnw spring-boot:test-run`). Solo corre si se indica dónde está:
 * PERFIL_API_LOCAL=http://localhost:8080 y PERFIL_API_TARGET=<carpeta target de perfil-api>, donde la API deja los
 * códigos firmados de la persona y del lector. LinkedIn es el Chrome simulado con la respuesta guardada.
 */
const API = process.env['PERFIL_API_LOCAL'];
const TARGET = process.env['PERFIL_API_TARGET'];
const ORIGEN_PANEL = 'http://localhost:4200';

const codigo = (archivo: string) => readFileSync(join(TARGET ?? '', archivo), 'utf8').trim();

async function comoPanel(metodo: string, ruta: string): Promise<{ status: number; cuerpo: Record<string, unknown> }> {
  const r = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: { 'Cf-Access-Jwt-Assertion': codigo('codigo-local.jwt'), Origin: ORIGEN_PANEL },
  });
  return { status: r.status, cuerpo: (await r.json()) as Record<string, unknown> };
}

const credenciales = async () => ({ apiUrl: API ?? '', identidad: { 'Cf-Access-Jwt-Assertion': codigo('codigo-lector-local.jwt') } });

function lectorConDoble() {
  return lectorLinkedIn(() => {
    const ses = SesionChrome.sobre(chromeSimulado({ cookies: [{ name: 'li_at', value: 'x' }], respuestas: [{ cuerpo: RECOMENDADAS }] }).contexto);
    ses.abrir = async () => {};
    return ses;
  });
}

describe.runIf(API !== undefined && TARGET !== undefined)('corrida contra la API local', () => {
  it('un código que la API no emitió se rechaza y no se abre Chrome', async () => {
    let creado = false;
    const registro = registroEnMemoria();
    const salida = await correr(`perfil-lector://leer?corrida=${'A'.repeat(43)}`, {
      credenciales, registro, lectores: { LINKEDIN: () => { creado = true; return lectorConDoble(); } },
    });
    expect(salida).toBe('codigo-rechazado');
    expect(creado).toBe(false);
  });

  it('la persona abre la corrida desde el panel y el lector entrega LinkedIn y la termina', async () => {
    const abierta = await comoPanel('POST', '/api/recoleccion/maquina');
    expect(abierta.status).toBe(202);
    const codigoCorrida = abierta.cuerpo['codigo'] as string;
    const registro = registroEnMemoria();
    const salida = await correr(`perfil-lector://leer?corrida=${codigoCorrida}`, {
      credenciales, registro, lectores: { LINKEDIN: lectorConDoble },
    });
    expect(salida).toBe('terminada');
    const avance = (await comoPanel('GET', '/api/recoleccion')).cuerpo as {
      estado: string; origen: string; cierre: string | null; fuentes: Array<{ fuente: string; resultado: string; ofertasLeidas: number }>;
    };
    expect(avance).toMatchObject({ estado: 'TERMINADA', origen: 'MAQUINA', cierre: null });
    expect(avance.fuentes).toEqual([expect.objectContaining({ fuente: 'LINKEDIN', resultado: 'CORRECTA', ofertasLeidas: 5 })]);
    expect(registro.lineas.join('\n')).not.toContain(codigoCorrida);
    // Una segunda corrida el mismo día ya no tiene lectura de LinkedIn.
    expect((await comoPanel('POST', '/api/recoleccion/maquina')).status).toBe(409);
  });
});
