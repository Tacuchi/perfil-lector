import { describe, expect, it } from 'vitest';

import { codigoDeEnlace } from '../src/enlace.js';

const CODIGO = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCde';

describe('dirección del enlace', () => {
  it('admite solo la ruta leer con un código de 43 caracteres base64url', () => {
    expect(CODIGO).toHaveLength(43);
    expect(codigoDeEnlace(`perfil-lector://leer?corrida=${CODIGO}`)).toBe(CODIGO);
  });

  it.each([
    ['comillas y ;', `perfil-lector://leer?corrida=x';touch /tmp/x;'`],
    ['sustitución de orden', `perfil-lector://leer?corrida=$(touch${'${IFS}'}/tmp/x)`],
    ['backticks', 'perfil-lector://leer?corrida=`id`'],
    ['salto de línea codificado', `perfil-lector://leer?corrida=${CODIGO}%0Aid`],
    ['salto de línea real', `perfil-lector://leer?corrida=${CODIGO}\nid`],
    ['otra ruta', `perfil-lector://borrar?corrida=${CODIGO}`],
    ['otro esquema', `https://leer?corrida=${CODIGO}`],
    ['esquema en mayúsculas', `PERFIL-LECTOR://leer?corrida=${CODIGO}`],
    ['código largo', `perfil-lector://leer?corrida=${CODIGO}A`],
    ['código corto', `perfil-lector://leer?corrida=${CODIGO.slice(1)}`],
    ['otro alfabeto', `perfil-lector://leer?corrida=${CODIGO.slice(1)}+`],
    ['relleno', `perfil-lector://leer?corrida=${CODIGO.slice(1)}=`],
    ['parámetro extra', `perfil-lector://leer?corrida=${CODIGO}&api=https://otra.test`],
    ['api en el enlace', `perfil-lector://leer?api=https://otra.test&corrida=${CODIGO}`],
    ['fragmento', `perfil-lector://leer?corrida=${CODIGO}#x`],
    ['vacía', ''],
  ])('rechaza %s', (_caso, direccion) => {
    expect(codigoDeEnlace(direccion)).toBeNull();
  });

  it('rechaza lo que no es texto', () => {
    expect(codigoDeEnlace(undefined)).toBeNull();
    expect(codigoDeEnlace(['perfil-lector://leer?corrida=' + CODIGO])).toBeNull();
  });
});
