import { type Probs1X2, type Sign, normalize } from '../types.js'

/**
 * Calibracion de probabilidades.
 *
 * Un modelo puede ordenar bien los partidos y aun asi mentir en la escala:
 * si de todos los partidos a los que asigna un 70% solo gana el local el 55%
 * de las veces, esta sobreconfiado. Eso no se ve en el porcentaje de aciertos,
 * solo en el RPS y en la curva de calibracion — y arruina cualquier calculo de
 * valor esperado, porque el EV depende de la probabilidad, no del orden.
 *
 * Es especialmente critico para la capa de IA: la evidencia publicada sobre
 * LLMs en tareas de prediccion muestra sobreconfianza sistematica en el tramo
 * alto de probabilidad.
 */

export interface IsotonicModel {
  readonly x: readonly number[]
  readonly y: readonly number[]
}

/**
 * Regresion isotonica por PAVA (Pool Adjacent Violators). Ajusta la funcion
 * monotona no decreciente que minimiza el error cuadratico. A diferencia del
 * escalado de Platt no impone forma sigmoide, asi que corrige deformaciones
 * arbitrarias — a cambio necesita mas datos y puede sobreajustar con pocos.
 */
export function fitIsotonic(
  points: readonly { predicted: number; actual: number }[],
): IsotonicModel {
  if (points.length === 0) throw new Error('fitIsotonic necesita datos')
  const sorted = [...points].sort((a, b) => a.predicted - b.predicted)

  // Cada bloque guarda su suma y su peso para poder fusionarlos.
  const values: number[] = []
  const weights: number[] = []
  const xs: number[] = []

  for (const pt of sorted) {
    values.push(pt.actual)
    weights.push(1)
    xs.push(pt.predicted)
    // Mientras el bloque anterior viole la monotonia, se fusionan.
    let i = values.length - 1
    while (i > 0 && values[i - 1]! > values[i]!) {
      const wSum = weights[i - 1]! + weights[i]!
      const vMerged = (values[i - 1]! * weights[i - 1]! + values[i]! * weights[i]!) / wSum
      values.splice(i - 1, 2, vMerged)
      weights.splice(i - 1, 2, wSum)
      // El x representativo del bloque fusionado es el mayor de los dos.
      xs.splice(i - 1, 2, xs[i]!)
      i--
    }
  }
  return { x: xs, y: values }
}

/** Aplica el modelo isotonico con interpolacion lineal entre nodos. */
export function applyIsotonic(model: IsotonicModel, p: number): number {
  const { x, y } = model
  if (x.length === 0) return p
  if (p <= x[0]!) return clamp01(y[0]!)
  if (p >= x[x.length - 1]!) return clamp01(y[y.length - 1]!)
  // Busqueda binaria del intervalo.
  let lo = 0
  let hi = x.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (x[mid]! <= p) lo = mid
    else hi = mid
  }
  const x0 = x[lo]!
  const x1 = x[hi]!
  const y0 = y[lo]!
  const y1 = y[hi]!
  if (x1 === x0) return clamp01(y1)
  return clamp01(y0 + ((p - x0) / (x1 - x0)) * (y1 - y0))
}

export interface Calibrator1X2 {
  readonly home: IsotonicModel
  readonly draw: IsotonicModel
  readonly away: IsotonicModel
}

/**
 * Calibrador uno-contra-resto para 1X2: ajusta cada signo por separado y luego
 * renormaliza. No es la unica opcion, pero es la robusta con pocos datos.
 */
export function fitCalibrator1X2(
  samples: readonly { probs: Probs1X2; actual: Sign }[],
): Calibrator1X2 {
  const pick = (sign: Sign, get: (p: Probs1X2) => number) =>
    fitIsotonic(
      samples.map((s) => ({ predicted: get(s.probs), actual: s.actual === sign ? 1 : 0 })),
    )
  return {
    home: pick('1', (p) => p.home),
    draw: pick('X', (p) => p.draw),
    away: pick('2', (p) => p.away),
  }
}

export function calibrate(cal: Calibrator1X2, probs: Probs1X2): Probs1X2 {
  const raw = [
    applyIsotonic(cal.home, probs.home),
    applyIsotonic(cal.draw, probs.draw),
    applyIsotonic(cal.away, probs.away),
  ]
  // Si la calibracion aplasta los tres a ~0, no hay informacion que rescatar:
  // devolvemos el original en vez de normalizar ruido.
  if (raw.reduce((a, b) => a + b, 0) < 1e-9) return probs
  const [home, draw, away] = normalize(raw) as [number, number, number]
  return { home, draw, away }
}

/**
 * Curva de calibracion por tramos: para cada intervalo de probabilidad
 * predicha, la frecuencia observada. Es el diagnostico que hay que mirar
 * antes de fiarse de ningun EV.
 */
export interface CalibrationBin {
  readonly lower: number
  readonly upper: number
  readonly count: number
  readonly meanPredicted: number
  readonly observedRate: number
}

export function calibrationCurve(
  samples: readonly { predicted: number; occurred: boolean }[],
  bins = 10,
): CalibrationBin[] {
  const out: CalibrationBin[] = []
  for (let b = 0; b < bins; b++) {
    const lower = b / bins
    const upper = (b + 1) / bins
    const inBin = samples.filter(
      (s) => s.predicted >= lower && (b === bins - 1 ? s.predicted <= upper : s.predicted < upper),
    )
    if (inBin.length === 0) continue
    out.push({
      lower,
      upper,
      count: inBin.length,
      meanPredicted: inBin.reduce((a, s) => a + s.predicted, 0) / inBin.length,
      observedRate: inBin.filter((s) => s.occurred).length / inBin.length,
    })
  }
  return out
}

/**
 * Expected Calibration Error: desviacion media entre lo predicho y lo
 * observado, ponderada por el numero de casos de cada tramo. 0 = perfecto.
 */
export function expectedCalibrationError(bins: readonly CalibrationBin[]): number {
  const total = bins.reduce((a, b) => a + b.count, 0)
  if (total === 0) return 0
  return bins.reduce(
    (acc, b) => acc + (b.count / total) * Math.abs(b.meanPredicted - b.observedRate),
    0,
  )
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}
