/** Los tres signos de la quiniela. */
export type Sign = '1' | 'X' | '2'

export const SIGNS: readonly Sign[] = ['1', 'X', '2'] as const

/** Probabilidades de un partido, en el orden 1 / X / 2. Deben sumar 1. */
export interface Probs1X2 {
  readonly home: number
  readonly draw: number
  readonly away: number
}

/** Categorias de goles del Pleno al 15: 0, 1, 2 o M (3 o mas). */
export type GoalBucket = '0' | '1' | '2' | 'M'

export const GOAL_BUCKETS: readonly GoalBucket[] = ['0', '1', '2', 'M'] as const

export interface MatchResult {
  readonly homeTeam: string
  readonly awayTeam: string
  /** Fecha del partido; se usa para el decaimiento temporal del ajuste. */
  readonly date: Date
  readonly homeGoals: number
  readonly awayGoals: number
  /** Identificador de competicion. Los ratings se ajustan por liga. */
  readonly competition: string
}

export function toArray(p: Probs1X2): [number, number, number] {
  return [p.home, p.draw, p.away]
}

export function signOf(homeGoals: number, awayGoals: number): Sign {
  if (homeGoals > awayGoals) return '1'
  if (homeGoals === awayGoals) return 'X'
  return '2'
}

export function bucketOf(goals: number): GoalBucket {
  if (goals <= 0) return '0'
  if (goals === 1) return '1'
  if (goals === 2) return '2'
  return 'M'
}

export function normalize(p: readonly number[]): number[] {
  const total = p.reduce((a, b) => a + b, 0)
  if (total <= 0) throw new Error('No se puede normalizar un vector de suma <= 0')
  return p.map((x) => x / total)
}
