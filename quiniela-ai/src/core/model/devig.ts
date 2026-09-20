import { normalize } from '../types.js'

/**
 * Extraccion del margen ("vig") de un conjunto de cuotas decimales.
 *
 * Una cuota no es una probabilidad: la casa incluye su comision, de modo que
 * la suma de las inversas ("booksum") es > 1. Como se reparte ese exceso entre
 * los resultados NO es neutral: el metodo proporcional asume que la casa carga
 * el margen por igual en todos, lo cual es empiricamente falso — las casas
 * cargan mas margen sobre los "longshots". Elegir mal el metodo introduce un
 * sesgo sistematico en todo lo que venga despues.
 */
export type DevigMethod = 'proportional' | 'additive' | 'power' | 'shin' | 'oddsProportional'

export function booksum(odds: readonly number[]): number {
  return odds.reduce((acc, o) => acc + 1 / o, 0)
}

/** Margen del mercado (overround). 1.05 de booksum => 5% de margen. */
export function margin(odds: readonly number[]): number {
  return booksum(odds) - 1
}

/** Normalizacion simple. Rapido, pero mantiene el sesgo favorito-longshot. */
export function devigProportional(odds: readonly number[]): number[] {
  return normalize(odds.map((o) => 1 / o))
}

/** Resta el mismo exceso absoluto a cada resultado. Puede dar negativos. */
export function devigAdditive(odds: readonly number[]): number[] {
  const n = odds.length
  const excess = margin(odds) / n
  const raw = odds.map((o) => 1 / o - excess)
  if (raw.some((p) => p <= 0)) return devigProportional(odds)
  return normalize(raw)
}

/**
 * Metodo de potencia: busca k tal que SUM (1/o_i)^k = 1.
 * Al ser exponencial, comprime mas las probabilidades pequenas, que es la
 * direccion correcta para corregir el sesgo del longshot.
 */
export function devigPower(odds: readonly number[]): number[] {
  const r = odds.map((o) => 1 / o)
  const f = (k: number) => r.reduce((acc, ri) => acc + ri ** k, 0) - 1
  const k = bisect(f, 0.5, 5, 1e-12)
  return normalize(r.map((ri) => ri ** k))
}

/**
 * Metodo de Shin (1993). Modela el margen como consecuencia de que la casa se
 * protege de apostantes informados (insider trading): z es la proporcion
 * estimada de dinero informado. Es el que mejor calibra en la mayoria de
 * analisis empiricos sobre futbol.
 */
export function devigShin(odds: readonly number[]): number[] {
  const r = odds.map((o) => 1 / o)
  const B = r.reduce((a, b) => a + b, 0)
  if (B <= 1) return normalize(r)

  const probsForZ = (z: number): number[] => {
    if (z >= 1) return normalize(r)
    return r.map((ri) => (Math.sqrt(z * z + 4 * (1 - z) * ((ri * ri) / B)) - z) / (2 * (1 - z)))
  }
  const f = (z: number) => probsForZ(z).reduce((a, b) => a + b, 0) - 1
  const z = bisect(f, 0, 0.9999, 1e-12)
  return normalize(probsForZ(z))
}

/**
 * Margen proporcional a la cuota (Buchdahl): asume que la casa carga mas
 * margen cuanto mayor es la cuota.
 *   cuota_justa_i = n * o_i / (n - M * o_i)
 */
export function devigOddsProportional(odds: readonly number[]): number[] {
  const n = odds.length
  const M = margin(odds)
  const fair = odds.map((o) => (n * o) / (n - M * o))
  if (fair.some((o) => o <= 1)) return devigShin(odds)
  return normalize(fair.map((o) => 1 / o))
}

export function devig(odds: readonly number[], method: DevigMethod = 'shin'): number[] {
  if (odds.length < 2) throw new Error('devig necesita al menos 2 cuotas')
  if (odds.some((o) => o <= 1)) throw new Error('Las cuotas decimales deben ser > 1')
  switch (method) {
    case 'proportional':
      return devigProportional(odds)
    case 'additive':
      return devigAdditive(odds)
    case 'power':
      return devigPower(odds)
    case 'shin':
      return devigShin(odds)
    case 'oddsProportional':
      return devigOddsProportional(odds)
  }
}

/** Biseccion sobre una funcion monotona. Devuelve el extremo si no hay cambio de signo. */
function bisect(f: (x: number) => number, lo: number, hi: number, tol: number): number {
  let a = lo
  let b = hi
  let fa = f(a)
  const fb = f(b)
  if (fa === 0) return a
  if (fb === 0) return b
  if (fa * fb > 0) return Math.abs(fa) < Math.abs(fb) ? a : b
  for (let i = 0; i < 200; i++) {
    const m = (a + b) / 2
    const fm = f(m)
    if (Math.abs(fm) < tol || (b - a) / 2 < tol) return m
    if (fa * fm < 0) {
      b = m
    } else {
      a = m
      fa = fm
    }
  }
  return (a + b) / 2
}
