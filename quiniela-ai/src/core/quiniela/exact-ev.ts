import { type Sign, SIGNS } from '../types.js'
import { type CrowdModel, type PrizeStructure, consensusColumn } from './parimutuel.js'
import { PRICE_PER_BET, PRIZE_CATEGORIES } from './rules.js'
import { type Column, MATCHES_1X2, validateColumn } from './ticket.js'

/**
 * Valor esperado EXACTO, sin Monte Carlo.
 *
 * Solo hay 19.321 resultados que premian a un boleto simple: los que estan a
 * distancia de Hamming <= 4 de la columna jugada, porque con 5 fallos ya se
 * baja de 10 aciertos. Se pueden enumerar todos.
 *
 *   |S_m| = C(14,m) * 2^m  ->  1, 28, 364, 2.912, 16.016  ->  19.321
 *
 * Esto importa mucho mas de lo que parece: el 14 y el 13 son tan raros que el
 * Monte Carlo no los muestrea bien. Con 300.000 simulaciones se obtienen del
 * orden de 7 aciertos de 14, y el estimador resultante es basura justo en la
 * categoria donde vive el efecto contrario.
 *
 * Para cada resultado r se calcula de forma cerrada:
 *   - P(r)   = producto de las probabilidades del modelo
 *   - n_d(r) = apuestas del publico con exactamente 14-d aciertos
 *            = N * [x^d] PROD_i ( q[i,r_i] + (1 - q[i,r_i]) x )
 *   - m_d(r) = apuestas NUESTRAS con exactamente 14-d aciertos
 *
 *   EV = SUM_d W_{14-d} * SUM_r P(r) * m_d(r) / (n_d(r) + m_d(r))
 */

/** Maximo de fallos que aun premia: 14 - 10 = 4. */
const MAX_MISSES = 4

export interface ExactEvaluation {
  readonly cost: number
  readonly expectedReturn: number
  readonly roi: number
  readonly probFull14: number
  /** Rivales esperados sobre la combinacion mas probable de la columna. */
  readonly lambda: number
  /** Probabilidad de cobrar algo (10 aciertos o mas). */
  readonly probAnyPrize: number
  readonly byCategory: readonly { id: string; hits: number; expectedReturn: number }[]
  /** Resultados enumerados. Util para verificar que la enumeracion es completa. */
  readonly outcomesEvaluated: number
}

export interface ExactEvOptions {
  readonly crowd: CrowdModel
  readonly modelProbs: readonly { readonly '1': number; readonly X: number; readonly '2': number }[]
  readonly prize?: PrizeStructure
  readonly pricePerBet?: number
  /** Tope de resultados a enumerar. Protege de columnas absurdamente amplias. */
  readonly maxOutcomes?: number
}

export function evaluateColumnExact(column: Column, options: ExactEvOptions): ExactEvaluation {
  validateColumn(column)
  const { crowd, modelProbs } = options
  const prize = options.prize ?? { categories: PRIZE_CATEGORIES }
  const pricePerBet = options.pricePerBet ?? PRICE_PER_BET
  const maxOutcomes = options.maxOutcomes ?? 5_000_000
  if (modelProbs.length !== MATCHES_1X2 || crowd.perMatch.length !== MATCHES_1X2) {
    throw new Error(`Se necesitan ${MATCHES_1X2} partidos en modelo y publico`)
  }

  const nBets = column.matches.reduce((a, s) => a * s.length, 1)
  const cost = nBets * pricePerBet
  const revenue = crowd.totalBets * pricePerBet
  const rollover = prize.rollover ?? 0

  // Categorias indexadas por numero de fallos. La especial se excluye: exige
  // el Pleno al 15, que es un problema aparte.
  const poolByMisses = new Map<number, { id: string; pool: number }>()
  for (const cat of prize.categories) {
    if (cat.requiresPleno15) continue
    const misses = MATCHES_1X2 - cat.hits
    if (misses < 0 || misses > MAX_MISSES) continue
    poolByMisses.set(misses, { id: cat.id, pool: revenue * cat.revenueShare })
  }

  const totals = new Map<string, number>()
  for (const v of poolByMisses.values()) totals.set(v.id, 0)

  let expectedReturn = 0
  let probFull14 = 0
  let probAnyPrize = 0
  let outcomesEvaluated = 0

  // Signos NO marcados en cada partido: son los que producen fallo.
  const missSigns: Sign[][] = column.matches.map((sel) =>
    SIGNS.filter((s) => !sel.includes(s)),
  )

  const expected = countOutcomes(column, missSigns)
  if (expected > maxOutcomes) {
    throw new Error(
      `La enumeracion exacta requeriria ${expected} resultados (tope ${maxOutcomes}). ` +
        'Reduce el numero de dobles y triples o sube maxOutcomes.',
    )
  }

  // Recorre los subconjuntos de posiciones fallidas de tamano 0..4.
  const positions = Array.from({ length: MATCHES_1X2 }, (_, i) => i)
  for (let k = 0; k <= MAX_MISSES; k++) {
    forEachCombination(positions, k, (missSet) => {
      // Un triple no puede fallar: no hay signo fuera de la seleccion.
      if (missSet.some((i) => missSigns[i]!.length === 0)) return
      enumerateOutcomes(column, missSigns, missSet, (outcome) => {
        outcomesEvaluated++

        let pr = 1
        for (let i = 0; i < MATCHES_1X2; i++) pr *= modelProbs[i]![outcome[i]!]
        if (pr <= 0) return

        const ours = ourBetCounts(column, outcome)
        const theirs = publicBetCounts(crowd, outcome)

        if (k === 0) probFull14 += pr * (ours[0]! > 0 ? 1 : 0)
        probAnyPrize += pr

        for (const [misses, cat] of poolByMisses) {
          const mine = ours[misses] ?? 0
          if (mine === 0) continue
          const pool = cat.pool + (misses === 0 ? 0 : 0)
          const others = theirs[misses] ?? 0
          const gain = pr * ((pool * mine) / (others + mine))
          expectedReturn += gain
          totals.set(cat.id, totals.get(cat.id)! + gain)
        }
      })
    })
  }

  // El bote solo se cobra con el Pleno al 15, asi que no entra aqui. Se deja
  // constancia explicita para que no parezca un olvido.
  void rollover

  const byCategory = [...poolByMisses.entries()]
    .map(([misses, cat]) => ({
      id: cat.id,
      hits: MATCHES_1X2 - misses,
      expectedReturn: totals.get(cat.id)!,
    }))
    .sort((a, b) => b.expectedReturn - a.expectedReturn)

  return {
    cost,
    expectedReturn,
    roi: cost > 0 ? expectedReturn / cost : 0,
    probFull14,
    lambda: expectedRivals(column, crowd),
    probAnyPrize,
    byCategory,
    outcomesEvaluated,
  }
}

/**
 * Rivales esperados sobre la combinacion mas probable de la columna:
 * lambda = N * Q(c).
 *
 * Es el parametro que gobierna toda la estrategia. Con lambda muy alto el
 * premio se reparte entre multitudes; con lambda muy bajo ya se es acertante
 * unico y seguir buscando rareza no aporta nada, solo resta probabilidad.
 * El optimo esta en torno a 1-4.
 */
export function expectedRivals(column: Column, crowd: CrowdModel): number {
  let q = 1
  for (let i = 0; i < MATCHES_1X2; i++) {
    // El signo mas jugado de los que hemos marcado.
    const sel = column.matches[i]!
    let best = 0
    for (const s of sel) best = Math.max(best, crowd.perMatch[i]![s])
    q *= best
  }
  return crowd.totalBets * q
}

/** Apuestas del publico con exactamente d fallos, por convolucion. */
function publicBetCounts(crowd: CrowdModel, outcome: readonly Sign[]): number[] {
  let poly = [1]
  for (let i = 0; i < MATCHES_1X2; i++) {
    const hit = crowd.perMatch[i]![outcome[i]!]
    const next = new Array<number>(Math.min(poly.length + 1, MAX_MISSES + 2)).fill(0)
    for (let d = 0; d < poly.length; d++) {
      if (d < next.length) next[d]! += poly[d]! * hit
      if (d + 1 < next.length) next[d + 1]! += poly[d]! * (1 - hit)
    }
    poly = next
  }
  return poly.map((x) => x * crowd.totalBets)
}

/** Apuestas nuestras con exactamente d fallos. */
function ourBetCounts(column: Column, outcome: readonly Sign[]): number[] {
  let poly = [1]
  for (let i = 0; i < MATCHES_1X2; i++) {
    const sel = column.matches[i]!
    const hit = sel.includes(outcome[i]!) ? 1 : 0
    const miss = sel.length - hit
    const next = new Array<number>(Math.min(poly.length + 1, MAX_MISSES + 2)).fill(0)
    for (let d = 0; d < poly.length; d++) {
      if (d < next.length) next[d]! += poly[d]! * hit
      if (d + 1 < next.length) next[d + 1]! += poly[d]! * miss
    }
    poly = next
  }
  return poly
}

function countOutcomes(column: Column, missSigns: readonly Sign[][]): number {
  // SUM sobre subconjuntos de fallos de tamano <= 4.
  const positions = Array.from({ length: MATCHES_1X2 }, (_, i) => i)
  let total = 0
  for (let k = 0; k <= MAX_MISSES; k++) {
    forEachCombination(positions, k, (missSet) => {
      let prod = 1
      for (let i = 0; i < MATCHES_1X2; i++) {
        prod *= missSet.includes(i) ? missSigns[i]!.length : column.matches[i]!.length
      }
      total += prod
    })
  }
  return total
}

function enumerateOutcomes(
  column: Column,
  missSigns: readonly Sign[][],
  missSet: readonly number[],
  visit: (outcome: readonly Sign[]) => void,
): void {
  const choices: readonly Sign[][] = column.matches.map((sel, i) =>
    missSet.includes(i) ? missSigns[i]! : [...sel],
  )
  const outcome: Sign[] = new Array(MATCHES_1X2)
  const rec = (i: number): void => {
    if (i === MATCHES_1X2) {
      visit(outcome)
      return
    }
    for (const s of choices[i]!) {
      outcome[i] = s
      rec(i + 1)
    }
  }
  rec(0)
}

function forEachCombination(
  items: readonly number[],
  k: number,
  visit: (combo: number[]) => void,
): void {
  const combo: number[] = []
  const rec = (start: number): void => {
    if (combo.length === k) {
      visit([...combo])
      return
    }
    for (let i = start; i <= items.length - (k - combo.length); i++) {
      combo.push(items[i]!)
      rec(i + 1)
      combo.pop()
    }
  }
  rec(0)
}

/**
 * La recomendacion mas robusta y libre de modelo de todo el proyecto:
 * NUNCA jugar la columna de consenso.
 *
 * No hace falta un modelo bueno para saberlo, basta con los porcentajes de
 * LAE. El boleto de favoritos se degrada de forma monotona conforme aumenta
 * el sesgo del publico: si aciertas, aciertas con todo el mundo.
 */
export function isConsensusColumn(column: Column, crowd: CrowdModel): boolean {
  const consensus = consensusColumn(crowd)
  return column.matches.every((sel, i) => sel.length === 1 && sel[0] === consensus[i])
}
