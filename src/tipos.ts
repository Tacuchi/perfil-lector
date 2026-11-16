/** Conexiones que se leen desde la máquina, con el nombre que usa la API. */
export type FuenteMaquina = 'LINKEDIN';

/** Fallos que la API reconoce en una entrega; el detalle visible lo escribe la API. */
export type FalloMaquina = 'SIN_SESION' | 'VERIFICACION' | 'RITMO' | 'VACIA';

export type Modalidad = 'REMOTO' | 'HIBRIDO' | 'PRESENCIAL' | 'NO_INFORMA';

/** Un aviso ya convertido, con la forma que la API admite en una entrega. */
export interface OfertaEntregada {
  idExterno: string;
  titulo: string;
  empresa: string | null;
  publicadaEn: string | null;
  ubicacion: string | null;
  modalidad: Modalidad;
  descripcion: string;
  url: string;
}

export interface FuenteALeer {
  fuente: string;
  nombre: string;
  avisosMaximos: number;
}

export interface CorridaIniciada {
  fuentes: FuenteALeer[];
  venceEn: string;
}

/** Lo que pasó con una fuente en esta corrida. */
export type Resultado =
  | { tipo: 'avisos'; ofertas: OfertaEntregada[] }
  | { tipo: 'fallo'; fallo: FalloMaquina }
  /** No llegó a consultar el sitio (Chrome ausente, perfil en uso): no se avisa ni se entrega nada. */
  | { tipo: 'local'; motivo: string }
  /** La API respondió que esta fuente no se lee en esta corrida. */
  | { tipo: 'omitida' };

/**
 * Un lector de una fuente de la máquina. Antes de la primera petición al sitio llama a `avisar`, que le dice
 * a la API que empieza a consultarlo; si devuelve false, la API la mandó no leer y el lector no la consulta.
 */
export interface LectorDeFuente {
  readonly fuente: FuenteMaquina;
  leer(contexto: ContextoLectura): Promise<Resultado>;
}

export interface ContextoLectura {
  avisar(): Promise<boolean>;
  avisosMaximos: number;
  /** Hasta cuándo puede esperar a que la persona inicie sesión. */
  esperaSesionHasta: number;
}
