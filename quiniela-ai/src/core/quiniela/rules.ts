/**
 * Reglas y economia oficiales de La Quiniela (SELAE).
 *
 * Los porcentajes de reparto estan verificados contra respuestas reales de la
 * API de SELAE: para varias jornadas de anos distintos, ganadores x premio de
 * cada categoria reproduce el porcentaje indicado sobre la recaudacion con
 * desviacion inferior al centimo.
 *
 * OJO con la unidad: SELAE expresa el reparto como porcentaje de la
 * RECAUDACION INTEGRA, no del fondo de premios. Confundir ambas escalas
 * infla los premios en un factor 1/0,55 = 1,82.
 */

/** Precio de una apuesta simple, en euros. */
export const PRICE_PER_BET = 0.75

/** Numero minimo de apuestas por boleto. */
export const MIN_BETS_PER_TICKET = 2

/** Partidos a 1X2. El decimoquinto es el Pleno al 15. */
export const MATCHES_1X2 = 14

/** Fraccion de la recaudacion que se devuelve en premios. */
export const PAYOUT_RATE = 0.55

export interface OfficialCategory {
  readonly id: string
  readonly label: string
  /** Aciertos necesarios entre los 14 partidos de 1X2. */
  readonly hits: number
  /** Si ademas exige acertar el Pleno al 15. */
  readonly requiresPleno15: boolean
  /** Fraccion de la RECAUDACION destinada a esta categoria. */
  readonly revenueShare: number
}

/**
 * Las seis categorias de premio. Suman exactamente el 55%.
 *
 * Nota importante sobre la categoria especial: su 7,5% es el unico que se
 * acumula al bote cuando queda desierta, y exige acertar los 14 signos Y el
 * marcador del Pleno al 15.
 */
export const PRIZE_CATEGORIES: readonly OfficialCategory[] = [
  { id: 'especial', label: 'Especial (14 + Pleno al 15)', hits: 14, requiresPleno15: true, revenueShare: 0.075 },
  { id: '1a', label: '1ª (14 aciertos)', hits: 14, requiresPleno15: false, revenueShare: 0.16 },
  { id: '2a', label: '2ª (13 aciertos)', hits: 13, requiresPleno15: false, revenueShare: 0.075 },
  { id: '3a', label: '3ª (12 aciertos)', hits: 12, requiresPleno15: false, revenueShare: 0.075 },
  { id: '4a', label: '4ª (11 aciertos)', hits: 11, requiresPleno15: false, revenueShare: 0.075 },
  { id: '5a', label: '5ª (10 aciertos)', hits: 10, requiresPleno15: false, revenueShare: 0.09 },
] as const

/**
 * Retorno teorico de la jornada, incluyendo el bote acumulado.
 *
 *   RTP = 0,55 + bote / recaudacion
 *
 * Sin bote el retorno es del 55%: la quiniela devuelve la mitad de lo que
 * recauda, lo que la situa en el terreno de la loteria pura y no en el de las
 * apuestas deportivas, donde el margen ronda el 4-8%.
 */
export function theoreticalRtp(revenue: number, rolloverFund = 0): number {
  if (revenue <= 0) throw new Error('La recaudacion debe ser positiva')
  return PAYOUT_RATE + rolloverFund / revenue
}

/**
 * Bote necesario para que el retorno agregado de la jornada supere el 100%.
 *   bote > 0,45 x recaudacion
 *
 * Se cumple con frecuencia en la practica. Pero ver `plenoLockWarning`: que el
 * agregado sea favorable no significa que sea alcanzable.
 */
export function breakEvenRollover(revenue: number): number {
  return (1 - PAYOUT_RATE) * revenue
}

/**
 * Por que un bote grande no es dinero gratis.
 *
 * Todo el excedente del bote vive en la categoria especial, que exige el Pleno
 * al 15. Y ahi esta la trampa matematica:
 *
 * - Cubrir las 3^14 = 4.782.969 columnas de 1X2 cuesta ~3,59 M EUR y GARANTIZA
 *   el 14. Pero con un solo marcador marcado en el Pleno, la probabilidad de
 *   llevarse el bote es solo la de acertar ese marcador.
 * - Cubrir ademas las 16 opciones del Pleno multiplica por 16: 76.527.504
 *   columnas, ~57,4 M EUR. Muy por encima de cualquier bote historico.
 *
 * Ademas hay autodilucion: al inyectar S euros en una jornada de recaudacion
 * base R0 y bote B, uno se lleva la fraccion S/(R0+S) del fondo, de modo que
 * el beneficio solo es positivo si S < B/0,45 - R0. Ese limite siempre queda
 * muy por debajo del coste de cubrir el Pleno.
 *
 * Conclusion: el factor x16 del Pleno al 15 es el mecanismo que hace
 * inexpugnable el bote por fuerza bruta.
 */
export const TOTAL_1X2_COLUMNS = 3 ** 14
export const TOTAL_PLENO15_COMBOS = 16
export const TOTAL_FULL_COLUMNS = TOTAL_1X2_COLUMNS * TOTAL_PLENO15_COMBOS

export function fullCoverageCost(includePleno15: boolean): number {
  return (includePleno15 ? TOTAL_FULL_COLUMNS : TOTAL_1X2_COLUMNS) * PRICE_PER_BET
}

/**
 * Inversion maxima antes de que la propia apuesta diluya el bote hasta anular
 * la ventaja. Devuelve 0 o negativo si ni siquiera merece la pena entrar.
 */
export function maxProfitableStake(rolloverFund: number, baseRevenue: number): number {
  return rolloverFund / (1 - PAYOUT_RATE) - baseRevenue
}

/**
 * Las seis reducciones oficiales de LAE.
 *
 * Una reducida juega solo un subconjunto de las columnas que generarian los
 * dobles y triples elegidos, a cambio de una GARANTIA: si el resultado cae
 * dentro de los signos marcados, se asegura un minimo de aciertos.
 *
 * Las garantias estan comprobadas con teoria de codigos cubridores:
 * - 1a (4 triples, 9 de 81): 81/(1+4x2) = 9 exacto. Codigo ternario perfecto,
 *   radio de cobertura 1, luego como mucho 1 fallo => 13 aciertos.
 * - 2a (7 dobles, 16 de 128): es el codigo de Hamming (7,4), radio 1 => 13.
 * - 5a (8 triples, 81 de 6.561): radio 1 exigiria >= 386 columnas, imposible
 *   con 81; radio 2 => 12.
 * - 6a (11 dobles, 132 de 2.048): radio 1 exigiria >= 171 (el valor conocido
 *   K(11,1) es 192), imposible con 132; radio 2 => 12.
 *
 * Por eso varias webs comerciales que anuncian la de 11 dobles como "al 13"
 * con 132 apuestas estan equivocadas: es matematicamente imposible.
 */
export interface ReducedSystem {
  readonly id: string
  readonly label: string
  readonly doubles: number
  readonly triples: number
  /** Columnas que generaria al directo, sin reducir. */
  readonly directColumns: number
  /** Columnas que realmente se juegan. */
  readonly bets: number
  readonly cost: number
  /** Aciertos garantizados si el resultado cae dentro de lo marcado. */
  readonly guarantee: number
}

export const REDUCED_SYSTEMS: readonly ReducedSystem[] = [
  { id: 'r1', label: 'Primera reducida', doubles: 0, triples: 4, directColumns: 81, bets: 9, cost: 6.75, guarantee: 13 },
  { id: 'r2', label: 'Segunda reducida', doubles: 7, triples: 0, directColumns: 128, bets: 16, cost: 12.0, guarantee: 13 },
  { id: 'r3', label: 'Tercera reducida', doubles: 3, triples: 3, directColumns: 216, bets: 24, cost: 18.0, guarantee: 13 },
  { id: 'r4', label: 'Cuarta reducida', doubles: 6, triples: 2, directColumns: 576, bets: 64, cost: 48.0, guarantee: 13 },
  { id: 'r5', label: 'Quinta reducida', doubles: 0, triples: 8, directColumns: 6561, bets: 81, cost: 60.75, guarantee: 12 },
  { id: 'r6', label: 'Sexta reducida', doubles: 11, triples: 0, directColumns: 2048, bets: 132, cost: 99.0, guarantee: 12 },
] as const

/**
 * Cota de esfera (Hamming): numero minimo de columnas necesarias para
 * garantizar un radio de cobertura dado. Sirve para detectar garantias
 * imposibles como la de "11 dobles al 13 por 132 apuestas".
 */
export function sphereCoveringBound(
  doubles: number,
  triples: number,
  radius: number,
): number {
  const direct = 2 ** doubles * 3 ** triples
  // Tamano de la bola de radio r: combinaciones de hasta r fallos, contando
  // cuantas alternativas erroneas tiene cada posicion (1 en dobles, 2 en triples).
  let ball = 0
  for (let r = 0; r <= radius; r++) {
    for (let fromTriples = 0; fromTriples <= Math.min(r, triples); fromTriples++) {
      const fromDoubles = r - fromTriples
      if (fromDoubles > doubles) continue
      ball += choose(triples, fromTriples) * 2 ** fromTriples * choose(doubles, fromDoubles)
    }
  }
  return direct / ball
}

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  let r = 1
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1)
  return Math.round(r)
}

/** Fiscalidad espanola sobre premios de loteria. */
export const TAX_FREE_THRESHOLD = 40_000
export const TAX_RATE = 0.2

export function netAfterTax(prize: number): number {
  if (prize <= TAX_FREE_THRESHOLD) return prize
  return prize - (prize - TAX_FREE_THRESHOLD) * TAX_RATE
}
