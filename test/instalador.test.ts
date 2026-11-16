import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { crearApp, guionDeApp, ID_APP, quitarApp } from '../src/instalador/app.js';

const destino = mkdtempSync(join(tmpdir(), 'instalador-'));
afterAll(() => rmSync(destino, { recursive: true, force: true }));

const NODO = '/Users/persona/.nvm/versions/node/v24.22.3/bin/node';
const LECTOR = '/Users/persona/Git/perfil lector/dist/main.js';

describe('instalador de la app del enlace', () => {
  it('el guion pasa Node, el lector y la dirección cada uno con quoted form of', () => {
    const guion = guionDeApp(NODO, LECTOR);
    expect(guion).toContain('on open location direccion');
    expect(guion).toContain(`quoted form of "${NODO}"`);
    expect(guion).toContain(`quoted form of "${LECTOR}"`);
    expect(guion).toContain('quoted form of direccion');
    // La dirección nunca se concatena sin citar.
    expect(guion).not.toMatch(/& direccion/);
  });

  it('escapa comillas y barras de las rutas dentro del literal de AppleScript', () => {
    expect(guionDeApp('/a"b/node', '/c\\d/main.js')).toContain('quoted form of "/a\\"b/node" & " " & quoted form of "/c\\\\d/main.js"');
  });

  it('rechaza rutas relativas', async () => {
    await expect(crearApp(destino, 'node', LECTOR)).rejects.toThrow(/absolutas/);
  });

  it.runIf(process.platform === 'darwin')('crea en un directorio temporal una app que declara el esquema, con rutas absolutas', async () => {
    const app = await crearApp(destino, NODO, LECTOR);
    const plist = JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', join(app, 'Contents', 'Info.plist')], { encoding: 'utf8' }));
    expect(plist.CFBundleIdentifier).toBe(ID_APP);
    expect(plist.CFBundleURLTypes[0].CFBundleURLSchemes).toEqual(['perfil-lector']);
    expect(plist.LSBackgroundOnly).toBe(true);
    const guion = execFileSync('/usr/bin/osadecompile', [join(app, 'Contents', 'Resources', 'Scripts', 'main.scpt')], { encoding: 'utf8' });
    expect(guion).toContain(`quoted form of "${NODO}"`);
    expect(guion).toContain(`quoted form of "${LECTOR}"`);
    expect(guion).toContain('quoted form of direccion');
    execFileSync('/usr/bin/codesign', ['-v', app]);
    expect(readFileSync(join(app, 'Contents', 'Info.plist'), 'utf8')).not.toContain('corrida=');
  });

  it.runIf(process.platform === 'darwin')('desinstalar quita la app', async () => {
    const app = await crearApp(destino, NODO, LECTOR);
    await quitarApp(app, async () => '');
    expect(existsSync(app)).toBe(false);
  });
});
