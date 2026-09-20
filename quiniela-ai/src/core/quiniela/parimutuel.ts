import { type GoalBucket, type Sign, SIGNS } from '../types.js'
import { type OfficialCategory, PRIZE_CATEGORIES } from './rules.js'
import { type Column, MATCHES_1X2, validateColumn } from './ticket.js'

/**
 * Valor esperado en un juego MUTUALISTA.
 *
 * La quiniela no paga cuotas fijas: reparte un bote entre los acertantes. Por
 * tanto el valor de un signo NO es su probabilidad — es su probabilidad
 * dividida por la gente que lo va a jugar. Un 14 compartido con 40.000
 * personas paga menos que un 12 compartido con 200.
 *
 * De ahi la tesis del proyecto: el objetivo no es acertar mas que los demas,
 * es acertar DISTINTO a los demas cuando el modelo cree que la masa se
 * equivoca. LAE publica el porcentaje de apuestas del publico por signo, asi
 * que esa "masa" es observable, no una conjetura.
 *
 * El calculo se hace por Monte Carlo sobre el resultado real, pero con la
 * parte de dentro EXACTA: dado un resultado concreto, el numero esperado de
 * acertantes de cada categoria se obtiene por convolucion (Poisson-binomial)
 * sobre las probabilidades del publico, sin simular millones de boletos.
 */

export interface PrizeStructure {
  /** Categorias oficiales; usar PRIZE_CATEGORIES salvo para simular. */
  readonly categories: readonly OfficialCategory[]
  /** Bote acumulado de jornadas anteriores, en euros. Solo alimenta la
   *  categoria especial, que es la unica que lo acumula. */
  readonly rollover?: number
}

export interface CrowdModel {
  /** Para cada partido, el reparto de apuestas del publico entre 1, X y 2. */
  readonly perMatch: readonly { readonly '1': number; readonly X: number; readonly '2': number }[]
  /** Numero total de apuestas jugadas en la jornada. */
  readonly totalBets: number
  /**
   * Fraccion del publico que juega exactamente la columna de consenso.
   *
   * Las apuestas del publico NO son independientes entre partidos: mucha gente
   * copia el mismo pronostico de prensa, asi que hay una concentracion real de
   * boletos identicos que una convolucion independiente no ve — y que hace que
   * el 14 se comparta mucho mas de lo que saldria en el papel. Se modela como
   * mezcla: una fraccion juega la columna modal, el resto tira de forma
   * independiente, y los marginales se reajustan para seguir cuadrando con los
   * porcentajes observados.
   */
  readonly consensusShare?: number
}

/**
 * Distribucion Poisson-binomial: probabilidad de obtener exactamente k exitos
 * en n ensayos independientes con probabilidades distintas. Por convolucion,
 * O(n^2), exacta.
 */
export function poissonBinomial(probs: readonly number[]): number[] {
  let dist = [1]
  for (const p of probs) {
    const next = new Array<number>(dist.length + 1).fill(0)
    for (let k = 0; k < dist.length; k++) {
      next[k]! += dist[k]! * (1 - p)
      next[k + 1]! += dist[k]! * p
    }
    dist = next
  }
  return dist
}

/** La columna que juega la mayoria: el signo mas apostado en cada partido. */
export function consensusColumn(crowd: CrowdModel): Sign[] {
  return crowd.perMatch.map((m) => {
    let best: Sign = '1'
    for (const s of SIGNS) if (m[s] > m[best]) best = s
    return best
  })
}

/**
 * Numero esperado de boletos del publico con exactamente k aciertos, dado un
 * resultado concreto. Devuelve un array indexado por aciertos (0..14).
 */
export function expectedWinnersByHits(
  crowd: CrowdModel,
  outcome: readonly Sign[],
): number[] {
  const rho = crowd.consensusShare ?? 0
  const consensus = consensusColumn(crowd)

  // Probabilidad de que un boleto "independiente" acierte cada partido, una vez
  // descontada la parte del publico que juega el consenso.
  const independentHitProb = crowd.perMatch.map((m, i) => {
    const q = m[outcome[i]!]
    if (rho <= 0) return q
    const playsConsensus = consensus[i] === outcome[i] ? rho : 0
    // Si el consenso se lleva mas peso del que tiene el signo, la mezcla no es
    // representable: caemos al caso independiente para ese partido.
    const remainder = (q - playsConsensus) / (1 - rho)
    return Math.min(1, Math.max(0, remainder))
  })

  const indep = poissonBinomial(independentHitProb)
  const consensusHits = consensus.reduce((acc, s, i) => acc + (s === outcome[i] ? 1 : 0), 0)

  const out = new Array<number>(MATCHES_1X2 + 1).fill(0)
  for (let k = 0; k <= MATCHES_1X2; k++) {
    out[k] = (1 - rho) * crowd.totalBets * (indep[k] ?? 0)
  }
  out[consensusHits]! += rho * crowd.totalBets
  return out
}

export interface EvaluationResult {
  /** Coste del boleto en euros. */
  readonly cost: number
  /** Retorno esperado en euros. */
  readonly expectedReturn: number
  /** expectedReturn / cost. Por encima de 1 seria EV positivo. */
  readonly roi: number
  /** Probabilidad de acertar los 14. */
  readonly probFull14: number
  /** Aportacion de cada categoria al retorno esperado. */
  readonly byCategory: readonly { id: string; hits: number; expectedReturn: number; share: number }[]
}

export interface Pleno15Selection {
  readonly home: GoalBucket
  readonly away: GoalBucket
}

export interface EvaluateOptions {
  readonly prize?: PrizeStructure
  readonly crowd: CrowdModel
  /** Probabilidades del MODELO por partido (no las del publico). */
  readonly modelProbs: readonly { readonly '1': number; readonly X: number; readonly '2': number }[]
  readonly pricePerBet: number
  /**
   * Marcadores jugados en el Pleno al 15. Sin esto la categoria especial (la
   * unica que acumula bote) es inalcanzable, asi que se omite del calculo.
   */
  readonly pleno15?: readonly Pleno15Selection[]
  /** Distribucion del modelo sobre las 16 combinaciones del Pleno al 15. */
  readonly pleno15Probs?: ReadonlyMap<string, number>
  /**
   * Reparto del publico sobre las 16 combinaciones del Pleno al 15. Si falta,
   * se asume reparto uniforme, que subestima los co-acertantes de los
   * marcadores populares (1-1, 1-0, 0-0).
   */
  readonly pleno15Crowd?: ReadonlyMap<string, number>
  readonly simulations?: number
  readonly seed?: number
}

export function plenoKey(home: GoalBucket, away: GoalBucket): string {
  return `${home}-${away}`
}

/**
 * Valor esperado de una columna. El resultado real se muestrea del modelo; el
 * reparto entre acertantes se calcula de forma exacta para cada muestra.
 */
export function evaluateColumn(column: Column, options: EvaluateOptions): EvaluationResult {
  validateColumn(column)
  const { crowd, modelProbs, pricePerBet } = options
  const prize = options.prize ?? { categories: PRIZE_CATEGORIES }
  const sims = options.simulations ?? 20_000
  if (modelProbs.length !== MATCHES_1X2 || crowd.perMatch.length !== MATCHES_1X2) {
    throw new Error(`Se necesitan ${MATCHES_1X2} partidos en modelo y publico`)
  }

  const plenoPicks = options.pleno15 ?? []
  const plenoMultiplier = Math.max(1, plenoPicks.length)
  const nBets = column.matches.reduce((a, s2) => a * s2.length, 1) * plenoMultiplier
  const cost = nBets * pricePerBet

  // La recaudacion es la del PUBLICO: los porcentajes de reparto se aplican
  // sobre ella, no sobre el fondo de premios.
  const revenue = crowd.totalBets * pricePerBet
  const rollover = prize.rollover ?? 0

  const rng = makeRng(options.seed ?? 20260920)
  const categoryTotals = new Map<string, number>(prize.categories.map((c) => [c.id, 0]))
  let totalReturn = 0
  let full14 = 0

  for (let s2 = 0; s2 < sims; s2++) {
    const outcome = sampleOutcome(modelProbs, rng)

    let ourHits = 0
    for (let i = 0; i < MATCHES_1X2; i++) {
      if (column.matches[i]!.includes(outcome[i]!)) ourHits++
    }
    if (ourHits === MATCHES_1X2) full14++

    const winners = expectedWinnersByHits(crowd, outcome)

    // El Pleno al 15 se muestrea aparte: es un marcador, no un signo.
    const plenoOutcome = options.pleno15Probs
      ? samplePleno(options.pleno15Probs, rng)
      : undefined
    const plenoHit =
      plenoOutcome !== undefined &&
      plenoPicks.some((pick) => plenoKey(pick.home, pick.away) === plenoOutcome)

    for (const cat of prize.categories) {
      if (ourHits < cat.hits) continue
      if (cat.requiresPleno15 && !plenoHit) continue

      const ours = ourBetsWithExactHits(column, outcome, cat.hits)
      if (ours === 0) continue

      let others = winners[cat.hits] ?? 0
      // La especial solo la cobran quienes ademas clavaron el marcador, asi
      // que hay que filtrar a los acertantes de 14 por la probabilidad de que
      // el publico jugase ese Pleno.
      if (cat.requiresPleno15) {
        const share = options.pleno15Crowd?.get(plenoOutcome!) ?? 1 / 16
        others *= share
      }

      // El bote solo alimenta la categoria especial.
      const pool = revenue * cat.revenueShare + (cat.requiresPleno15 ? rollover : 0)
      const prizePerWinner = pool / Math.max(1, others + ours)
      const gain = prizePerWinner * ours
      totalReturn += gain
      categoryTotals.set(cat.id, categoryTotals.get(cat.id)! + gain)
    }
  }

  const expectedReturn = totalReturn / sims
  const byCategory = prize.categories
    .map((c) => ({
      id: c.id,
      hits: c.hits,
      expectedReturn: categoryTotals.get(c.id)! / sims,
      share: expectedReturn > 0 ? categoryTotals.get(c.id)! / sims / expectedReturn : 0,
    }))
    .sort((a, b) => b.expectedReturn - a.expectedReturn)

  return {
    cost,
    expectedReturn,
    roi: cost > 0 ? expectedReturn / cost : 0,
    probFull14: full14 / sims,
    byCategory,
  }
}

function samplePleno(probs: ReadonlyMap<string, number>, rng: () => number): string {
  let total = 0
  for (const v of probs.values()) total += v
  let r = rng() * total
  for (const [k, v] of probs) {
    r -= v
    if (r <= 0) return k
  }
  return [...probs.keys()][probs.size - 1]!
}

/**
 * Cuantas apuestas simples de la columna obtienen EXACTAMENTE `hits` aciertos
 * contra un resultado dado. Se cuenta combinatoriamente, sin enumerar: los
 * partidos donde acertamos seguro, los que fallamos seguro y los que dependen
 * de cual de los signos marcados salga.
 */
export function ourBetsWithExactHits(
  column: Column,
  outcome: readonly Sign[],
  hits: number,
): number {
  // Para cada partido: cuantas de nuestras opciones aciertan (0 o 1) y cuantas
  // fallan. Un doble con el acierto dentro aporta 1 acierto y 1 fallo.
  let dist = [1]
  for (let i = 0; i < MATCHES_1X2; i++) {
    const sel = column.matches[i]!
    const hitWays = sel.includes(outcome[i]!) ? 1 : 0
    const missWays = sel.length - hitWays
    const next = new Array<number>(dist.length + 1).fill(0)
    for (let k = 0; k < dist.length; k++) {
      if (dist[k] === 0) continue
      next[k]! += dist[k]! * missWays
      next[k + 1]! += dist[k]! * hitWays
    }
    dist = next
  }
  return dist[hits] ?? 0
}

function sampleOutcome(
  probs: readonly { readonly '1': number; readonly X: number; readonly '2': number }[],
  rng: () => number,
): Sign[] {
  return probs.map((p) => {
    const r = rng() * (p['1'] + p.X + p['2'])
    if (r < p['1']) return '1'
    if (r < p['1'] + p.X) return 'X'
    return '2'
  })
}

function makeRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * Cociente de valor de cada signo: probabilidad del modelo dividida por la
 * fraccion que juega el publico. Por encima de 1, el signo esta infrajugado.
 *
 * CUIDADO — NO es un criterio de seleccion por si solo.
 *
 * Construir la columna eligiendo en cada partido el signo de mayor p/q es una
 * trampa conocida: se maximiza el cociente y se destruye la probabilidad. La
 * columna resultante puede ser tan improbable que no gane nunca, y rendir
 * menos que jugar a favoritos.
 *
 * El motivo esta en la formula del reparto:
 *
 *   EV_14(c) = W_14 * P(c) * (1 - e^-lambda) / lambda      lambda = N * Q(c)
 *
 * Con lambda >> 1 el EV depende solo de P/Q y apartarse de la masa paga mucho.
 * Con lambda << 1 uno ya es acertante unico, el factor de reparto satura cerca
 * de 1 y no puede mejorar mas: a partir de ahi, cualquier rareza adicional
 * solo puede costar probabilidad.
 *
 * El criterio correcto es maximizar P sujeto a que lambda se mantenga en la
 * zona util (del orden de 1 a 4 rivales esperados). Ver `optimizeBaseColumn`.
 */
export function signValue(
  modelProbs: { readonly '1': number; readonly X: number; readonly '2': number },
  crowdProbs: { readonly '1': number; readonly X: number; readonly '2': number },
): Record<Sign, number> {
  const out = {} as Record<Sign, number>
  for (const s of SIGNS) {
    // Ratio modelo/publico. Por encima de 1, el signo esta infrajugado.
    out[s] = modelProbs[s] / Math.max(1e-6, crowdProbs[s])
  }
  return out
}
