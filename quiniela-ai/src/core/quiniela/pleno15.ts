import type { ScorelineMatrix } from '../model/dixon-coles.js'
import { type GoalBucket, GOAL_BUCKETS, bucketOf } from '../types.js'

/**
 * El Pleno al 15.
 *
 * El decimoquinto partido no se juega a 1/X/2: hay que acertar cuantos goles
 * marca CADA equipo, en cuatro categorias — 0, 1, 2 o M (3 o mas). Son 4x4 =
 * 16 combinaciones posibles.
 *
 * El error tipico es tratar los dos lados como independientes y multiplicar
 * las marginales. No lo son: comparten el contexto del partido (un partido
 * abierto produce goles en los dos lados, uno trabado en ninguno), y ademas
 * la correccion tau de Dixon-Coles introduce dependencia explicita en los
 * marcadores bajos, que es justo donde se concentra la masa de probabilidad.
 * Aqui la distribucion conjunta sale de la matriz de marcadores completa.
 */

export interface Pleno15Cell {
  readonly home: GoalBucket
  readonly away: GoalBucket
  readonly probability: number
}

/** Las 16 combinaciones ordenadas de mas a menos probable. */
export function pleno15Distribution(matrix: ScorelineMatrix): Pleno15Cell[] {
  const joint = new Map<string, number>()
  for (const h of GOAL_BUCKETS) {
    for (const a of GOAL_BUCKETS) joint.set(`${h}-${a}`, 0)
  }

  for (let x = 0; x < matrix.grid.length; x++) {
    const row = matrix.grid[x]!
    const hb = bucketOf(x)
    for (let y = 0; y < row.length; y++) {
      const key = `${hb}-${bucketOf(y)}`
      joint.set(key, joint.get(key)! + row[y]!)
    }
  }

  const cells: Pleno15Cell[] = []
  for (const h of GOAL_BUCKETS) {
    for (const a of GOAL_BUCKETS) {
      cells.push({ home: h, away: a, probability: joint.get(`${h}-${a}`)! })
    }
  }
  return cells.sort((p, q) => q.probability - p.probability)
}

/**
 * Cuanto se aparta la distribucion conjunta del producto de las marginales.
 * Si devuelve un valor apreciable, tratar los dos lados como independientes
 * (que es lo que hace casi todo el mundo) esta introduciendo un sesgo real.
 * Se mide como distancia de variacion total, en [0, 1].
 */
export function dependenceVsIndependent(matrix: ScorelineMatrix): number {
  const joint = pleno15Distribution(matrix)
  const home = new Map<GoalBucket, number>(GOAL_BUCKETS.map((b) => [b, 0]))
  const away = new Map<GoalBucket, number>(GOAL_BUCKETS.map((b) => [b, 0]))
  for (const c of joint) {
    home.set(c.home, home.get(c.home)! + c.probability)
    away.set(c.away, away.get(c.away)! + c.probability)
  }
  let tvd = 0
  for (const c of joint) {
    tvd += Math.abs(c.probability - home.get(c.home)! * away.get(c.away)!)
  }
  return tvd / 2
}

/**
 * Cobertura acumulada: cuantas de las 16 combinaciones hay que jugar para
 * cubrir una fraccion dada de la probabilidad. Responde a la pregunta
 * practica de cuanto cuesta "asegurar" el Pleno al 15.
 */
export function coverageFor(
  matrix: ScorelineMatrix,
  targetProbability: number,
): { cells: Pleno15Cell[]; covered: number } {
  if (targetProbability <= 0 || targetProbability > 1) {
    throw new Error('targetProbability debe estar en (0, 1]')
  }
  const sorted = pleno15Distribution(matrix)
  const cells: Pleno15Cell[] = []
  let covered = 0
  for (const c of sorted) {
    cells.push(c)
    covered += c.probability
    if (covered >= targetProbability) break
  }
  return { cells, covered }
}

export function formatCell(cell: Pleno15Cell): string {
  return `${cell.home}-${cell.away}`
}
