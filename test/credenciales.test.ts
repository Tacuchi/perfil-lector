import { describe, expect, it } from 'vitest';

import { apiUrlValida, CredencialesAusentes, credencialesDelLlavero, CUENTAS, type Cuenta } from '../src/credenciales.js';

const llavero = (datos: Partial<Record<Cuenta, string>>) => async (c: Cuenta) => datos[c] ?? null;

describe('credenciales del Llavero', () => {
  it('arma la URL de la API y las cabeceras del token de servicio solo con lo del Llavero', async () => {
    const c = await credencialesDelLlavero(llavero({
      [CUENTAS.apiUrl]: 'https://api.ejemplo.test/', [CUENTAS.tokenId]: 'id.access', [CUENTAS.tokenSecreto]: 'secreto',
    }));
    expect(c).toEqual({
      apiUrl: 'https://api.ejemplo.test',
      identidad: { 'CF-Access-Client-Id': 'id.access', 'CF-Access-Client-Secret': 'secreto' },
    });
  });

  it('falla si falta alguna entrada', async () => {
    await expect(credencialesDelLlavero(llavero({ [CUENTAS.apiUrl]: 'https://api.ejemplo.test' }))).rejects.toBeInstanceOf(CredencialesAusentes);
  });

  it('solo admite https, o http hacia la propia máquina', () => {
    expect(apiUrlValida('https://api.ejemplo.test')).toBe(true);
    expect(apiUrlValida('http://localhost:8080')).toBe(true);
    expect(apiUrlValida('http://api.ejemplo.test')).toBe(false);
    expect(apiUrlValida('https://u:p@api.ejemplo.test')).toBe(false);
    expect(apiUrlValida('file:///etc/passwd')).toBe(false);
  });
});
