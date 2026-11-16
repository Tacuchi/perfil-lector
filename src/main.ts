#!/usr/bin/env node
import { correr, type Salida } from './corrida.js';
import { credencialesDelLlavero } from './credenciales.js';
import { lectorBumeran } from './fuentes/bumeran.js';
import { lectorLinkedIn } from './fuentes/linkedin.js';
import { registroEnArchivo } from './registro.js';

const CODIGOS: Record<Salida, number> = {
  terminada: 0, 'enlace-invalido': 2, 'sin-credenciales': 3, 'codigo-rechazado': 4, 'api-inalcanzable': 5, fallo: 1,
};

// Solo se mira el primer argumento: la app del enlace pasa la dirección como uno solo, citado.
const salida = await correr(process.argv[2], {
  credenciales: () => credencialesDelLlavero(),
  lectores: { LINKEDIN: () => lectorLinkedIn(), BUMERAN: () => lectorBumeran() },
  registro: registroEnArchivo(),
});
process.exitCode = CODIGOS[salida];
