import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ESQUEMA } from '../enlace.js';

export const NOMBRE_APP = 'PerfilLector.app';
export const ID_APP = 'net.tacuchi.perfil-lector';
const LSREGISTER = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
const PLUTIL = '/usr/bin/plutil';

export type Ejecutar = (orden: string, argumentos: string[]) => Promise<string>;

export const ejecutarReal: Ejecutar = (orden, argumentos) =>
  new Promise((resolver, rechazar) => {
    execFile(orden, argumentos, (error, salida) => (error ? rechazar(error) : resolver(salida)));
  });

/** Literal de cadena de AppleScript. */
const literal = (texto: string): string => `"${texto.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/**
 * El guion de la app del enlace. Node, el lector y la dirección entran a la orden cada uno con `quoted form of`,
 * así que la dirección llega al lector como un único argumento y nunca se interpreta como parte de la orden.
 * El lector queda en segundo plano y la app termina enseguida.
 */
export function guionDeApp(nodo: string, lector: string): string {
  return [
    'on open location direccion',
    `\tdo shell script quoted form of ${literal(nodo)} & " " & quoted form of ${literal(lector)} & " " & quoted form of direccion & " >/dev/null 2>&1 &"`,
    'end open location',
    '',
  ].join('\n');
}

/** Compila la app en `destino`, declara el esquema y la firma localmente. No la registra. */
export async function crearApp(destino: string, nodo: string, lector: string, ejecutar: Ejecutar = ejecutarReal): Promise<string> {
  if (!nodo.startsWith('/') || !lector.startsWith('/')) throw new Error('las rutas de Node y del lector deben ser absolutas');
  const app = join(destino, NOMBRE_APP);
  const temporal = mkdtempSync(join(tmpdir(), 'perfil-lector-'));
  try {
    const guion = join(temporal, 'enlace.applescript');
    writeFileSync(guion, guionDeApp(nodo, lector));
    rmSync(app, { recursive: true, force: true });
    await ejecutar('/usr/bin/osacompile', ['-o', app, guion]);
  } finally {
    rmSync(temporal, { recursive: true, force: true });
  }
  const plist = join(app, 'Contents', 'Info.plist');
  const tipos = JSON.stringify([{ CFBundleURLName: ESQUEMA, CFBundleURLSchemes: [ESQUEMA] }]);
  await ejecutar(PLUTIL, ['-replace', 'CFBundleIdentifier', '-string', ID_APP, plist]);
  await ejecutar(PLUTIL, ['-replace', 'CFBundleURLTypes', '-json', tipos, plist]);
  await ejecutar(PLUTIL, ['-replace', 'LSBackgroundOnly', '-bool', 'true', plist]);
  // Cambiar el Info.plist invalida la firma que deja osacompile.
  await ejecutar('/usr/bin/codesign', ['--force', '-s', '-', app]);
  return app;
}

export async function registrarApp(app: string, ejecutar: Ejecutar = ejecutarReal): Promise<void> {
  await ejecutar(LSREGISTER, ['-f', app]);
}

export async function quitarApp(app: string, ejecutar: Ejecutar = ejecutarReal): Promise<void> {
  await ejecutar(LSREGISTER, ['-u', app]).catch(() => {});
  rmSync(app, { recursive: true, force: true });
}
