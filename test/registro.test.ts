import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { enmascarar, registroEnArchivo } from '../src/registro.js';

const temporales: string[] = [];
afterEach(() => { for (const t of temporales.splice(0)) rmSync(t, { recursive: true, force: true }); });

describe('registro local', () => {
  it('tapa códigos de corrida y códigos firmados aunque lleguen dentro de un error', () => {
    const codigo = 'Zx9_-Zx9_-Zx9_-Zx9_-Zx9_-Zx9_-Zx9_-Zx9_-Zx9';
    const jwt = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.firma_x-y';
    expect(enmascarar(`falló con ${codigo} y ${jwt}`)).toBe('falló con [código] y [código]');
  });

  it('escribe en su archivo con permisos solo para la persona', () => {
    const dir = mkdtempSync(join(tmpdir(), 'registro-'));
    temporales.push(dir);
    const archivo = join(dir, 'sub', 'lector.log');
    registroEnArchivo(archivo).error('la API no responde desde esta máquina');
    expect(readFileSync(archivo, 'utf8')).toMatch(/ERROR la API no responde desde esta máquina\n$/);
  });
});
