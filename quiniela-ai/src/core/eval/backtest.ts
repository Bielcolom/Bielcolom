import { type MatchResult, type Probs1X2, type Sign, signOf } from '../types.js'
import { type ScoreSummary, scoreAll } from './metrics.js'

/**
 * Validacion walk-forward (hacia delante en el tiempo).
 *
 * Es la unica forma valida de evaluar un modelo de prediccion deportiva. La
 * validacion cruzada aleatoria esta MAL aqui: al repartir partidos al azar
 * entre entrenamiento y test, el modelo acaba entrenando con partidos
 * posteriores a los que predice. Como las fuerzas de los equipos son
 * persistentes, eso filtra informacion del futuro y produce metricas
 * optimistas que no se sostienen en produccion.
 *
 * Aqui, para cada bloque de partidos, el modelo solo ve lo ocurrido
 * ESTRICTAMENTE ANTES de la fecha del primer partido del bloque.
 */

export interface BacktestFold {
  readonly index: number
  readonly trainSize: number
  readonly cutoff: Date
  readonly predictions: readonly { match: MatchResult; probs: Probs1X2; actual: Sign }[]
  readonly score: ScoreSummary
}

export interface BacktestReport {
  readonly folds: readonly BacktestFold[]
  /** Metricas agregadas sobre todas las predicciones fuera de muestra. */
  readonly overall: ScoreSummary
  /** Comparacion contra la referencia, si se proporciono. */
  readonly baseline?: ScoreSummary
  /** 1 - rps_modelo / rps_baseline. Positivo = el modelo aporta. */
  readonly rpsSkill?: number
}

export interface BacktestOptions {
  /** Partidos minimos antes de empezar a predecir. Por debajo de ~500 el
   *  ajuste de Dixon-Coles es demasiado inestable para significar nada. */
  readonly minTrain?: number
  /** Cuantos partidos predice cada fold. Una jornada de quiniela son 15. */
  readonly blockSize?: number
  /** Referencia contra la que medir (p.ej. las probabilidades del mercado). */
  readonly baseline?: (match: MatchResult) => Probs1X2 | undefined
}

/**
 * @param matches  Historico completo. Se ordena por fecha internamente.
 * @param train    Ajusta un modelo con los partidos dados y devuelve un
 *                 predictor. Se invoca una vez por fold.
 */
export function walkForward(
  matches: readonly MatchResult[],
  train: (history: readonly MatchResult[]) => (match: MatchResult) => Probs1X2 | undefined,
  options: BacktestOptions = {},
): BacktestReport {
  const minTrain = options.minTrain ?? 500
  const blockSize = options.blockSize ?? 15

  const sorted = [...matches].sort((a, b) => a.date.getTime() - b.date.getTime())
  if (sorted.length <= minTrain) {
    throw new Error(
      `Historico insuficiente: ${sorted.length} partidos, se necesitan mas de ${minTrain}`,
    )
  }

  const folds: BacktestFold[] = []
  const all: { probs: Probs1X2; actual: Sign }[] = []
  const baselineAll: { probs: Probs1X2; actual: Sign }[] = []

  let start = minTrain
  let index = 0
  while (start < sorted.length) {
    const block = sorted.slice(start, start + blockSize)
    if (block.length === 0) break
    const cutoff = block[0]!.date

    // Corte estricto por fecha: si varios partidos comparten dia, ninguno del
    // mismo dia entra en el entrenamiento. Cortar por indice dejaria pasar
    // partidos de la misma jornada, que es una fuga sutil y muy comun.
    const history = sorted.filter((m) => m.date.getTime() < cutoff.getTime())
    if (history.length < minTrain) {
      start += blockSize
      continue
    }

    const predict = train(history)
    const predictions: { match: MatchResult; probs: Probs1X2; actual: Sign }[] = []
    for (const match of block) {
      const probs = predict(match)
      // Equipo sin historico (recien ascendido en la primera jornada, p.ej.):
      // se omite en vez de inventar una prediccion.
      if (!probs) continue
      const actual = signOf(match.homeGoals, match.awayGoals)
      predictions.push({ match, probs, actual })
      all.push({ probs, actual })

      const base = options.baseline?.(match)
      if (base) baselineAll.push({ probs: base, actual })
    }

    if (predictions.length > 0) {
      folds.push({
        index: index++,
        trainSize: history.length,
        cutoff,
        predictions,
        score: scoreAll(predictions),
      })
    }
    start += blockSize
  }

  if (all.length === 0) throw new Error('El backtest no produjo ninguna prediccion')

  const overall = scoreAll(all)
  // El skill score solo es comparable si la referencia cubre los mismos
  // partidos; si no, estariamos comparando poblaciones distintas.
  const comparable = baselineAll.length === all.length && baselineAll.length > 0
  const baseline = comparable ? scoreAll(baselineAll) : undefined
  return {
    folds,
    overall,
    baseline,
    rpsSkill: baseline ? 1 - overall.rps / baseline.rps : undefined,
  }
}

/**
 * Referencia trivial: la frecuencia historica de 1/X/2. Cualquier modelo que
 * no bata esto claramente no sirve para nada.
 */
export function baseRateModel(history: readonly MatchResult[]): Probs1X2 {
  let h = 0
  let d = 0
  let a = 0
  for (const m of history) {
    const s = signOf(m.homeGoals, m.awayGoals)
    if (s === '1') h++
    else if (s === 'X') d++
    else a++
  }
  const n = Math.max(1, history.length)
  return { home: h / n, draw: d / n, away: a / n }
}

/**
 * Suelo de ruido irreducible del futbol.
 *
 * Calculado por simulacion para una liga top: incluso un pronosticador que
 * conociera las probabilidades VERDADERAS de cada partido obtendria
 * aproximadamente estos valores, porque el resto es azar puro.
 *
 * Contexto: los mejores modelos publicados estan en RPS 0,1925-0,2063 y el
 * mercado en ~0,198. Es decir, el estado del arte ya esta tocando el suelo.
 * No hay un modelo magico esperando a ser descubierto.
 *
 * Uso practico: si un backtest devuelve un RPS claramente por debajo de este
 * suelo, la explicacion casi segura no es que el modelo sea genial, sino que
 * hay fuga de datos.
 */
export const IRREDUCIBLE_NOISE_FLOOR = {
  rps: 0.202,
  logLoss: 0.985,
  hitRate: 0.52,
} as const

export function looksLikeDataLeakage(score: { rps: number }): boolean {
  return score.rps < IRREDUCIBLE_NOISE_FLOOR.rps * 0.9
}

/**
 * Busca la semivida optima barriendo una rejilla y midiendo el RPS fuera de
 * muestra. Es el procedimiento correcto: la semivida no se puede estimar
 * conjuntamente con el resto de parametros.
 */
export function tuneHalfLife(
  matches: readonly MatchResult[],
  buildTrainer: (
    halfLifeDays: number,
  ) => (history: readonly MatchResult[]) => (match: MatchResult) => Probs1X2 | undefined,
  candidates: readonly number[] = [120, 180, 250, 320, 380, 450, 550, 700],
  options: BacktestOptions = {},
): { halfLifeDays: number; rps: number }[] {
  return candidates
    .map((halfLifeDays) => ({
      halfLifeDays,
      rps: walkForward(matches, buildTrainer(halfLifeDays), options).overall.rps,
    }))
    .sort((a, b) => a.rps - b.rps)
}
