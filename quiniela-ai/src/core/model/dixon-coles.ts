import {
  type GoalBucket,
  type MatchResult,
  type Probs1X2,
  bucketOf,
} from '../types.js'

/**
 * Modelo Dixon-Coles (1997).
 *
 * Parte del modelo de Poisson de Maher: cada equipo tiene una fuerza de ataque
 * y una de defensa, y los goles de cada lado siguen una Poisson cuya media sale
 * de cruzar el ataque de uno con la defensa del otro, mas la ventaja de campo.
 *
 *   lambda (goles local)     = exp(ataque_local  + defensa_visitante + ventaja)
 *   mu     (goles visitante) = exp(ataque_visitante + defensa_local)
 *
 * Dixon y Coles le anaden dos cosas que son justo las que importan aqui:
 *
 * 1. La correccion "tau" sobre los marcadores bajos (0-0, 1-0, 0-1, 1-1). La
 *    Poisson independiente subestima los empates, y el empate es el signo que
 *    decide una quiniela. Sin esta correccion el modelo reparte mal las X.
 *
 * 2. Decaimiento temporal exponencial: un partido de hace dos anos no dice lo
 *    mismo que uno de hace dos semanas. El peso cae con una semivida ajustable.
 */

export interface DixonColesParams {
  /** Fuerza ofensiva por equipo (centrada en 0). */
  readonly attack: ReadonlyMap<string, number>
  /** Fuerza defensiva por equipo; mas negativo = mejor defensa. */
  readonly defence: ReadonlyMap<string, number>
  /** Ventaja de campo en escala log, por competicion. */
  readonly homeAdvantage: ReadonlyMap<string, number>
  /** Correccion de dependencia en marcadores bajos. */
  readonly rho: number
  /** Semivida en dias usada al ajustar. */
  readonly halfLifeDays: number
}

export interface FitOptions {
  /** Semivida del decaimiento temporal. ~180 dias es un punto de partida razonable. */
  readonly halfLifeDays?: number
  /** Fecha de referencia del decaimiento. Por defecto, el partido mas reciente. */
  readonly asOf?: Date
  readonly iterations?: number
  readonly learningRate?: number
  /** Regularizacion L2 hacia 0 sobre ataque/defensa. Evita que equipos con
   *  pocos partidos se vayan a valores extremos. */
  readonly ridge?: number
  /** Goles maximos considerados al construir la matriz de marcadores. */
  readonly maxGoals?: number
}

const DEFAULTS = {
  halfLifeDays: 180,
  iterations: 4000,
  learningRate: 0.05,
  ridge: 0.02,
  maxGoals: 10,
} as const

/** Correccion tau de Dixon-Coles para los cuatro marcadores bajos. */
export function tau(x: number, y: number, lambda: number, mu: number, rho: number): number {
  if (x === 0 && y === 0) return 1 - lambda * mu * rho
  if (x === 0 && y === 1) return 1 + lambda * rho
  if (x === 1 && y === 0) return 1 + mu * rho
  if (x === 1 && y === 1) return 1 - rho
  return 1
}

/** Derivadas parciales de tau respecto a lambda, mu y rho. */
function dTau(
  x: number,
  y: number,
  lambda: number,
  mu: number,
  rho: number,
): { dLambda: number; dMu: number; dRho: number } {
  if (x === 0 && y === 0) return { dLambda: -mu * rho, dMu: -lambda * rho, dRho: -lambda * mu }
  if (x === 0 && y === 1) return { dLambda: rho, dMu: 0, dRho: lambda }
  if (x === 1 && y === 0) return { dLambda: 0, dMu: rho, dRho: mu }
  if (x === 1 && y === 1) return { dLambda: 0, dMu: 0, dRho: -1 }
  return { dLambda: 0, dMu: 0, dRho: 0 }
}

export function fitDixonColes(
  matches: readonly MatchResult[],
  options: FitOptions = {},
): DixonColesParams {
  if (matches.length === 0) throw new Error('fitDixonColes necesita partidos')

  const halfLifeDays = options.halfLifeDays ?? DEFAULTS.halfLifeDays
  const iterations = options.iterations ?? DEFAULTS.iterations
  const lr = options.learningRate ?? DEFAULTS.learningRate
  const ridge = options.ridge ?? DEFAULTS.ridge

  const asOf =
    options.asOf ?? new Date(Math.max(...matches.map((m) => m.date.getTime())))

  const teams = [...new Set(matches.flatMap((m) => [m.homeTeam, m.awayTeam]))].sort()
  const comps = [...new Set(matches.map((m) => m.competition))].sort()
  const teamIndex = new Map(teams.map((t, i) => [t, i]))
  const compIndex = new Map(comps.map((c, i) => [c, i]))

  const nT = teams.length
  // Vector de parametros: [ataque x nT, defensa x nT, ventaja x nComp, rho]
  const nP = nT * 2 + comps.length + 1
  const p = new Float64Array(nP)
  // Arranque en una ventaja de campo positiva pequena: acelera la convergencia
  // y evita quedarse en la region plana alrededor de 0.
  for (let c = 0; c < comps.length; c++) p[nT * 2 + c] = 0.25
  const RHO = nP - 1

  // Peso temporal: exp(-ln(2) * dias / semivida). Un partido de hace una
  // semivida pesa exactamente la mitad que uno de hoy.
  const decay = Math.LN2 / halfLifeDays
  const MS_PER_DAY = 86_400_000
  const weights = matches.map((m) => {
    const days = Math.max(0, (asOf.getTime() - m.date.getTime()) / MS_PER_DAY)
    return Math.exp(-decay * days)
  })

  const grad = new Float64Array(nP)
  // Adam
  const m1 = new Float64Array(nP)
  const m2 = new Float64Array(nP)
  const b1 = 0.9
  const b2 = 0.999
  const eps = 1e-8

  for (let iter = 1; iter <= iterations; iter++) {
    grad.fill(0)

    for (let k = 0; k < matches.length; k++) {
      const match = matches[k]!
      const w = weights[k]!
      if (w < 1e-6) continue

      const i = teamIndex.get(match.homeTeam)!
      const j = teamIndex.get(match.awayTeam)!
      const c = nT * 2 + compIndex.get(match.competition)!
      const x = match.homeGoals
      const y = match.awayGoals

      const lambda = Math.exp(p[i]! + p[nT + j]! + p[c]!)
      const mu = Math.exp(p[j]! + p[nT + i]!)
      const rho = p[RHO]!

      // Parte Poisson: d/d(log lambda) = x - lambda
      let gLambda = x - lambda
      let gMu = y - mu

      // Parte tau (solo afecta a los cuatro marcadores bajos)
      const t = tau(x, y, lambda, mu, rho)
      if (t !== 1) {
        // Barrera: tau debe mantenerse positivo o el log-likelihood explota.
        const tSafe = Math.max(t, 1e-6)
        const d = dTau(x, y, lambda, mu, rho)
        gLambda += (d.dLambda / tSafe) * lambda
        gMu += (d.dMu / tSafe) * mu
        grad[RHO]! += (w * d.dRho) / tSafe
      }

      grad[i]! += w * gLambda
      grad[nT + j]! += w * gLambda
      grad[c]! += w * gLambda
      grad[j]! += w * gMu
      grad[nT + i]! += w * gMu
    }

    // Regularizacion L2 sobre ataque y defensa (no sobre ventaja ni rho).
    for (let i = 0; i < nT * 2; i++) grad[i]! -= ridge * p[i]!

    for (let q = 0; q < nP; q++) {
      const g = grad[q]!
      m1[q] = b1 * m1[q]! + (1 - b1) * g
      m2[q] = b2 * m2[q]! + (1 - b2) * g * g
      const mHat = m1[q]! / (1 - b1 ** iter)
      const vHat = m2[q]! / (1 - b2 ** iter)
      p[q] = p[q]! + (lr * mHat) / (Math.sqrt(vHat) + eps)
    }

    // rho fuera de un rango estrecho produce probabilidades negativas.
    p[RHO] = Math.min(0.25, Math.max(-0.25, p[RHO]!))

    // Identificabilidad: ataque y defensa solo estan definidos salvo una
    // constante comun, asi que centramos ambos bloques en cada paso.
    center(p, 0, nT)
    center(p, nT, nT)
  }

  const attack = new Map<string, number>()
  const defence = new Map<string, number>()
  teams.forEach((t, i) => {
    attack.set(t, p[i]!)
    defence.set(t, p[nT + i]!)
  })
  const homeAdvantage = new Map<string, number>()
  comps.forEach((c, i) => homeAdvantage.set(c, p[nT * 2 + i]!))

  return { attack, defence, homeAdvantage, rho: p[RHO]!, halfLifeDays }
}

function center(p: Float64Array, offset: number, n: number): void {
  let sum = 0
  for (let i = 0; i < n; i++) sum += p[offset + i]!
  const mean = sum / n
  for (let i = 0; i < n; i++) p[offset + i]! -= mean
}

export interface ScorelineMatrix {
  /** grid[x][y] = P(local marca x, visitante marca y). */
  readonly grid: readonly (readonly number[])[]
  readonly lambda: number
  readonly mu: number
}

/** Medias esperadas de goles para un enfrentamiento concreto. */
export function expectedGoals(
  params: DixonColesParams,
  homeTeam: string,
  awayTeam: string,
  competition: string,
): { lambda: number; mu: number } {
  const ah = params.attack.get(homeTeam)
  const aa = params.attack.get(awayTeam)
  const dh = params.defence.get(homeTeam)
  const da = params.defence.get(awayTeam)
  if (ah === undefined || aa === undefined || dh === undefined || da === undefined) {
    throw new Error(`Equipo sin ratings ajustados: ${homeTeam} vs ${awayTeam}`)
  }
  // Un equipo recien ascendido puede no tener ventaja de campo propia de su
  // nueva competicion; en ese caso usamos la media de las conocidas.
  const ha =
    params.homeAdvantage.get(competition) ?? mean([...params.homeAdvantage.values()])
  return { lambda: Math.exp(ah + da + ha), mu: Math.exp(aa + dh) }
}

function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

/** Matriz completa de marcadores, ya con la correccion tau y normalizada. */
export function scorelineMatrix(
  params: DixonColesParams,
  homeTeam: string,
  awayTeam: string,
  competition: string,
  maxGoals: number = DEFAULTS.maxGoals,
): ScorelineMatrix {
  const { lambda, mu } = expectedGoals(params, homeTeam, awayTeam, competition)
  const ph = poissonPmf(lambda, maxGoals)
  const pa = poissonPmf(mu, maxGoals)

  const grid: number[][] = []
  let total = 0
  for (let x = 0; x <= maxGoals; x++) {
    const row: number[] = []
    for (let y = 0; y <= maxGoals; y++) {
      const v = Math.max(0, ph[x]! * pa[y]! * tau(x, y, lambda, mu, params.rho))
      row.push(v)
      total += v
    }
    grid.push(row)
  }
  // La correccion tau rompe la normalizacion; la restauramos.
  for (const row of grid) {
    for (let y = 0; y < row.length; y++) row[y]! /= total
  }
  return { grid, lambda, mu }
}

export function probs1X2(matrix: ScorelineMatrix): Probs1X2 {
  let home = 0
  let draw = 0
  let away = 0
  for (let x = 0; x < matrix.grid.length; x++) {
    const row = matrix.grid[x]!
    for (let y = 0; y < row.length; y++) {
      const v = row[y]!
      if (x > y) home += v
      else if (x === y) draw += v
      else away += v
    }
  }
  return { home, draw, away }
}

/**
 * Distribucion marginal de goles por equipo en las categorias del Pleno al 15
 * (0, 1, 2, M). Se calcula sobre la matriz conjunta y no sobre dos Poisson
 * independientes, para que herede la correccion tau.
 */
export function goalBucketMarginals(matrix: ScorelineMatrix): {
  home: Record<GoalBucket, number>
  away: Record<GoalBucket, number>
} {
  const home: Record<GoalBucket, number> = { '0': 0, '1': 0, '2': 0, M: 0 }
  const away: Record<GoalBucket, number> = { '0': 0, '1': 0, '2': 0, M: 0 }
  for (let x = 0; x < matrix.grid.length; x++) {
    const row = matrix.grid[x]!
    for (let y = 0; y < row.length; y++) {
      const v = row[y]!
      home[bucketOf(x)] += v
      away[bucketOf(y)] += v
    }
  }
  return { home, away }
}

/** Poisson pmf para 0..maxGoals, calculada de forma iterativa y estable. */
export function poissonPmf(lambda: number, maxGoals: number): number[] {
  const out = new Array<number>(maxGoals + 1)
  let p = Math.exp(-lambda)
  out[0] = p
  for (let k = 1; k <= maxGoals; k++) {
    p = (p * lambda) / k
    out[k] = p
  }
  return out
}
