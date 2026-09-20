import { type Sign, SIGNS } from '../types.js'

/**
 * Representacion de un boleto y su combinatoria.
 *
 * En los 14 primeros partidos se puede marcar un signo (simple), dos (doble) o
 * los tres (triple). El numero de apuestas que genera un boleto es el producto
 * de los signos marcados en cada partido, y crece muy rapido: cada triple
 * multiplica por 3 y cada doble por 2.
 */

/** Signos marcados en un partido. Nunca vacio, nunca con repetidos. */
export type Selection = readonly Sign[]

export interface Column {
  /** Seleccion para cada uno de los 14 partidos. */
  readonly matches: readonly Selection[]
}

export const MATCHES_1X2 = 14

export function validateColumn(column: Column): void {
  if (column.matches.length !== MATCHES_1X2) {
    throw new Error(`Un boleto tiene ${MATCHES_1X2} partidos de 1X2, recibidos ${column.matches.length}`)
  }
  column.matches.forEach((sel, i) => {
    if (sel.length === 0) throw new Error(`Partido ${i + 1}: hay que marcar al menos un signo`)
    if (new Set(sel).size !== sel.length) throw new Error(`Partido ${i + 1}: signos repetidos`)
    if (sel.some((s) => !SIGNS.includes(s))) throw new Error(`Partido ${i + 1}: signo invalido`)
  })
}

/** Numero de apuestas simples que genera el boleto. */
export function betCount(column: Column): number {
  validateColumn(column)
  return column.matches.reduce((acc, sel) => acc * sel.length, 1)
}

export function countDoubles(column: Column): number {
  return column.matches.filter((s) => s.length === 2).length
}

export function countTriples(column: Column): number {
  return column.matches.filter((s) => s.length === 3).length
}

/**
 * Cuantas apuestas genera una combinacion de dobles y triples.
 * Es la funcion que hay que mirar antes de emocionarse: 4 dobles y 3 triples
 * ya son 432 apuestas.
 */
export function betsFor(doubles: number, triples: number): number {
  return 2 ** doubles * 3 ** triples
}

/** Enumera todas las apuestas simples de un boleto multiple. */
export function* enumerateBets(column: Column): Generator<Sign[]> {
  validateColumn(column)
  const total = betCount(column)
  for (let i = 0; i < total; i++) {
    const bet: Sign[] = []
    let rest = i
    for (const sel of column.matches) {
      bet.push(sel[rest % sel.length]!)
      rest = Math.floor(rest / sel.length)
    }
    yield bet
  }
}

/**
 * Probabilidad de que el boleto contenga la apuesta ganadora de los 14, dadas
 * las probabilidades por partido. Al marcar varios signos en un partido, su
 * probabilidad es la suma de los marcados.
 *
 * Ojo: esto es la probabilidad de ACERTAR, no el valor esperado. En un juego
 * mutualista no son lo mismo, y confundirlas es el error central de casi
 * todos los sistemas de quiniela que circulan.
 */
export function probabilityOfFull14(
  column: Column,
  perMatch: readonly { readonly '1': number; readonly X: number; readonly '2': number }[],
): number {
  validateColumn(column)
  if (perMatch.length !== MATCHES_1X2) {
    throw new Error(`Se necesitan probabilidades para ${MATCHES_1X2} partidos`)
  }
  return column.matches.reduce((acc, sel, i) => {
    const p = perMatch[i]!
    return acc * sel.reduce((s, sign) => s + p[sign], 0)
  }, 1)
}

/**
 * Distribucion del numero de aciertos del MEJOR boleto simple contenido en la
 * columna. Se calcula por convolucion sobre los 14 partidos: en cada paso, la
 * probabilidad de haber acertado k de los partidos vistos hasta ahora.
 *
 * Hace falta para el valor esperado real: las categorias de 10 a 13 aciertos
 * caen con frecuencia muchisimo mayor que el pleno, asi que su aportacion al
 * EV es material y hay que calcularla, no suponerla.
 */
export function hitDistribution(
  column: Column,
  perMatch: readonly { readonly '1': number; readonly X: number; readonly '2': number }[],
): number[] {
  validateColumn(column)
  if (perMatch.length !== MATCHES_1X2) {
    throw new Error(`Se necesitan probabilidades para ${MATCHES_1X2} partidos`)
  }
  // dist[k] = P(exactamente k aciertos entre los partidos procesados)
  let dist = [1]
  column.matches.forEach((sel, i) => {
    const p = perMatch[i]!
    const pHit = sel.reduce((s, sign) => s + p[sign], 0)
    const next = new Array<number>(dist.length + 1).fill(0)
    for (let k = 0; k < dist.length; k++) {
      next[k]! += dist[k]! * (1 - pHit)
      next[k + 1]! += dist[k]! * pHit
    }
    dist = next
  })
  return dist
}
