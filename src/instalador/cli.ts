import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

import { apiUrlValida, CUENTAS, SERVICIO_LLAVERO } from '../credenciales.js';
import { crearApp, NOMBRE_APP, quitarApp, registrarApp } from './app.js';

const DESTINO = join(homedir(), 'Applications');
const LECTOR = resolve(fileURLToPath(new URL('../main.js', import.meta.url)));

/**
 * Guarda una entrada del Llavero. Sin valor, `security` pide el dato en la terminal de la persona:
 * el secreto no pasa por este proceso ni queda en la lista de procesos.
 */
function guardar(cuenta: string, valor?: string): void {
  const argumentos = ['add-generic-password', '-U', '-s', SERVICIO_LLAVERO, '-a', cuenta, '-w'];
  if (valor !== undefined) argumentos.push(valor);
  const r = spawnSync('/usr/bin/security', argumentos, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`no se pudo guardar «${cuenta}» en el Llavero`);
}

async function instalar(): Promise<void> {
  mkdirSync(DESTINO, { recursive: true });
  const app = await crearApp(DESTINO, process.execPath, LECTOR);
  await registrarApp(app);
  console.log(`App del enlace instalada en ${app}`);

  const preguntas = createInterface({ input: process.stdin, output: process.stdout });
  const apiUrl = (await preguntas.question('URL de la API (https://…): ')).trim();
  preguntas.close();
  if (!apiUrlValida(apiUrl)) throw new Error('la URL de la API debe ser https');
  guardar(CUENTAS.apiUrl, apiUrl);
  console.log('Identificador del token de servicio de Access:');
  guardar(CUENTAS.tokenId);
  console.log('Secreto del token de servicio de Access:');
  guardar(CUENTAS.tokenSecreto);
  console.log('Listo: «Leer desde mi máquina» ya abre el lector.');
}

async function desinstalar(): Promise<void> {
  await quitarApp(join(DESTINO, NOMBRE_APP));
  for (const cuenta of Object.values(CUENTAS)) {
    spawnSync('/usr/bin/security', ['delete-generic-password', '-s', SERVICIO_LLAVERO, '-a', cuenta], { stdio: 'ignore' });
  }
  console.log('App del enlace y entradas del Llavero quitadas.');
}

const orden = process.argv[2];
if (orden === 'instalar') await instalar();
else if (orden === 'desinstalar') await desinstalar();
else {
  console.error('uso: cli.js instalar | desinstalar');
  process.exitCode = 2;
}
