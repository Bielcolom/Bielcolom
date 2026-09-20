import { type Probs1X2, type Sign, toArray } from '../types.js'

/**
 * Ranked Probability Score. Es la metrica estandar para 1X2 porque, a
 * diferencia del Brier, respeta el ORDEN natural de los resultados: predecir
 * "1" cuando sale "X" se penaliza menos que predecir "1" cuando sale "2".
 *
 *   RPS = 1/(r-1) * SUM_{i=1..r-1} ( SUM_{j=1..i} (p_j - e_j) )^2
 *
 * Rango [0, 1]; mas bajo es mejor.
 */
export function rps(probs: Probs1X2, actual: Sign): number {
  const p = toArray(probs)
  const e = [actual === '1' ? 1 : 0, actual === 'X' ? 1 : 0, actual === '2' ? 1 : 0]
  let cumP = 0
  let cumE = 0
  let sum = 0
  // Solo hasta r-1: el ultimo termino acumulado es siempre (1 - 1) = 0.
  for (let i = 0; i < p.length - 1; i++) {
    cumP += p[i] ?? 0
    cumE += e[i] ?? 0
    sum += (cumP - cumE) ** 2
  }
  return sum / (p.length - 1)
}

/** Brier multiclase: suma de cuadrados sobre las 3 clases. Rango [0, 2]. */
export function brier(probs: Probs1X2, actual: Sign): number {
  const p = toArray(probs)
  const e = [actual === '1' ? 1 : 0, actual === 'X' ? 1 : 0, actual === '2' ? 1 : 0]
  return p.reduce((acc, pi, i) => acc + (pi - (e[i] ?? 0)) ** 2, 0)
}

/** Log loss (entropia cruzada). Castiga con dureza la confianza mal puesta. */
export function logLoss(probs: Probs1X2, actual: Sign, eps = 1e-15): number {
  const p = actual === '1' ? probs.home : actual === 'X' ? probs.draw : probs.away
  return -Math.log(Math.min(1 - eps, Math.max(eps, p)))
}

export interface ScoreSummary {
  readonly n: number
  readonly rps: number
  readonly brier: number
  readonly logLoss: number
  /** Fraccion de partidos donde el signo mas probable fue el correcto. */
  readonly hitRate: number
}

export function scoreAll(
  predictions: readonly { probs: Probs1X2; actual: Sign }[],
): ScoreSummary {
  if (predictions.length === 0) {
    throw new Error('scoreAll necesita al menos una prediccion')
  }
  let sRps = 0
  let sBrier = 0
  let sLog = 0
  let hits = 0
  for (const { probs, actual } of predictions) {
    sRps += rps(probs, actual)
    sBrier += brier(probs, actual)
    sLog += logLoss(probs, actual)
    if (argmaxSign(probs) === actual) hits++
  }
  const n = predictions.length
  return { n, rps: sRps / n, brier: sBrier / n, logLoss: sLog / n, hitRate: hits / n }
}

export function argmaxSign(probs: Probs1X2): Sign {
  if (probs.home >= probs.draw && probs.home >= probs.away) return '1'
  return probs.draw >= probs.away ? 'X' : '2'
}

/**
 * Skill score frente a una referencia (p.ej. el mercado, o la frecuencia base).
 * Positivo = nuestro modelo bate a la referencia.
 */
export function skillScore(model: number, reference: number): number {
  return 1 - model / reference
}
