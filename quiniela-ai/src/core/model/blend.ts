import { type Probs1X2, normalize } from '../types.js'

/**
 * Combinacion de varias fuentes de probabilidad para un mismo partido
 * (modelo propio, mercado de apuestas, ajuste contextual...).
 *
 * Hay dos formas de mezclar y NO son equivalentes:
 *
 * - Lineal (media ponderada): conserva la media, pero ensancha la
 *   distribucion. Si dos fuentes discrepan mucho, el resultado es una
 *   mezcla "indecisa" con colas gordas.
 * - Logaritmica (log-opinion pool, media geometrica): multiplica las
 *   probabilidades elevadas a sus pesos. Es la que se comporta como una
 *   actualizacion bayesiana y la que conviene cuando las fuentes son
 *   informativas y no meras opiniones: si dos fuentes coinciden, refuerza;
 *   si discrepan, no promedia ciegamente.
 *
 * Por defecto usamos la logaritmica.
 */
export interface WeightedSource {
  readonly probs: Probs1X2
  readonly weight: number
}

export function linearPool(sources: readonly WeightedSource[]): Probs1X2 {
  assertSources(sources)
  const wSum = sources.reduce((a, s) => a + s.weight, 0)
  let home = 0
  let draw = 0
  let away = 0
  for (const s of sources) {
    const w = s.weight / wSum
    home += w * s.probs.home
    draw += w * s.probs.draw
    away += w * s.probs.away
  }
  return { home, draw, away }
}

export function logPool(sources: readonly WeightedSource[], eps = 1e-9): Probs1X2 {
  assertSources(sources)
  const wSum = sources.reduce((a, s) => a + s.weight, 0)
  const logs = [0, 0, 0]
  for (const s of sources) {
    const w = s.weight / wSum
    const p = [s.probs.home, s.probs.draw, s.probs.away]
    for (let i = 0; i < 3; i++) logs[i]! += w * Math.log(Math.max(eps, p[i]!))
  }
  // Restar el maximo antes de exponenciar evita el underflow.
  const max = Math.max(...logs)
  const [home, draw, away] = normalize(logs.map((l) => Math.exp(l - max))) as [
    number,
    number,
    number,
  ]
  return { home, draw, away }
}

export type PoolMethod = 'linear' | 'log'

export function blend(
  sources: readonly WeightedSource[],
  method: PoolMethod = 'log',
): Probs1X2 {
  return method === 'linear' ? linearPool(sources) : logPool(sources)
}

/**
 * Aplica un ajuste contextual acotado sobre unas probabilidades base.
 *
 * Pensado para la capa de IA: el modelo de lenguaje NO emite probabilidades
 * (esta mal calibrado y es sobreconfiado), emite un empujon en escala log-odds
 * sobre cada signo, y aqui lo acotamos. Con maxShift = 0.4 el ajuste no puede
 * mover una probabilidad del 50% mas alla del rango 40%-60% aproximadamente:
 * suficiente para recoger "les falta el portero titular", imposible para
 * inventarse un resultado.
 */
export function applyBoundedAdjustment(
  base: Probs1X2,
  logOddsShift: { home: number; draw: number; away: number },
  maxShift = 0.4,
): Probs1X2 {
  const clamp = (x: number) => Math.min(maxShift, Math.max(-maxShift, x))
  const eps = 1e-9
  const adjusted = [
    Math.log(Math.max(eps, base.home)) + clamp(logOddsShift.home),
    Math.log(Math.max(eps, base.draw)) + clamp(logOddsShift.draw),
    Math.log(Math.max(eps, base.away)) + clamp(logOddsShift.away),
  ]
  const max = Math.max(...adjusted)
  const [home, draw, away] = normalize(adjusted.map((l) => Math.exp(l - max))) as [
    number,
    number,
    number,
  ]
  return { home, draw, away }
}

function assertSources(sources: readonly WeightedSource[]): void {
  if (sources.length === 0) throw new Error('blend necesita al menos una fuente')
  if (sources.some((s) => s.weight <= 0)) throw new Error('Los pesos deben ser > 0')
}
