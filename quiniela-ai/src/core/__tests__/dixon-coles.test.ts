import { describe, expect, it } from 'vitest'
import {
  expectedGoals,
  fitDixonColes,
  goalBucketMarginals,
  poissonPmf,
  probs1X2,
  scorelineMatrix,
  tau,
} from '../model/dixon-coles.js'
import type { MatchResult } from '../types.js'

/** LCG con semilla: los tests deben ser deterministas. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function samplePoisson(lambda: number, rng: () => number): number {
  const L = Math.exp(-lambda)
  let k = 0
  let p = 1
  do {
    k++
    p *= rng()
  } while (p > L)
  return k - 1
}

describe('poissonPmf', () => {
  it('suma practicamente 1 con cola suficiente', () => {
    const pmf = poissonPmf(1.4, 15)
    expect(pmf.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 8)
  })
  it('coincide con el calculo directo', () => {
    const pmf = poissonPmf(2, 5)
    expect(pmf[0]!).toBeCloseTo(Math.exp(-2), 12)
    expect(pmf[2]!).toBeCloseTo((Math.exp(-2) * 4) / 2, 12)
  })
})

describe('tau', () => {
  it('solo modifica los cuatro marcadores bajos', () => {
    expect(tau(2, 1, 1.5, 1.1, -0.1)).toBe(1)
    expect(tau(0, 0, 1.5, 1.1, -0.1)).not.toBe(1)
    expect(tau(1, 1, 1.5, 1.1, -0.1)).not.toBe(1)
  })
  it('con rho negativo sube la probabilidad del 1-1 y del 0-0', () => {
    // rho < 0 es el signo que se observa en la practica: la Poisson
    // independiente se queda corta de empates ajustados.
    expect(tau(1, 1, 1.5, 1.1, -0.1)).toBeGreaterThan(1)
    expect(tau(0, 0, 1.5, 1.1, -0.1)).toBeGreaterThan(1)
  })
})

describe('fitDixonColes: recuperacion de parametros', () => {
  // Generamos una liga sintetica con fuerzas conocidas y comprobamos que el
  // ajuste las recupera. Si esto falla, todo lo que venga despues es ruido.
  const rng = makeRng(42)
  const teams = Array.from({ length: 20 }, (_, i) => `Equipo${i}`)
  const trueAttack = new Map(teams.map((t, i) => [t, (i - 9.5) * 0.06]))
  const trueDefence = new Map(teams.map((t, i) => [t, ((9.5 - i) * 0.05) - 0.0]))
  const TRUE_HOME = 0.26

  const matches: MatchResult[] = []
  const start = new Date('2024-08-01').getTime()
  // 6 vueltas completas: suficiente senal para que el ajuste sea estable.
  for (let round = 0; round < 6; round++) {
    for (const home of teams) {
      for (const away of teams) {
        if (home === away) continue
        const lambda = Math.exp(trueAttack.get(home)! + trueDefence.get(away)! + TRUE_HOME)
        const mu = Math.exp(trueAttack.get(away)! + trueDefence.get(home)!)
        matches.push({
          homeTeam: home,
          awayTeam: away,
          date: new Date(start + (round * 38 + matches.length / 20) * 86_400_000),
          homeGoals: samplePoisson(lambda, rng),
          awayGoals: samplePoisson(mu, rng),
          competition: 'TEST',
        })
      }
    }
  }

  // Semivida muy larga: aqui no queremos decaimiento, las fuerzas son fijas.
  const fitted = fitDixonColes(matches, { halfLifeDays: 100_000, iterations: 3000, ridge: 0.001 })

  it('recupera la ventaja de campo', () => {
    expect(fitted.homeAdvantage.get('TEST')!).toBeCloseTo(TRUE_HOME, 1)
  })

  it('recupera el orden de fuerzas ofensivas (correlacion alta)', () => {
    const r = pearson(
      teams.map((t) => trueAttack.get(t)!),
      teams.map((t) => fitted.attack.get(t)!),
    )
    expect(r).toBeGreaterThan(0.95)
  })

  it('recupera el orden de fuerzas defensivas', () => {
    const r = pearson(
      teams.map((t) => trueDefence.get(t)!),
      teams.map((t) => fitted.defence.get(t)!),
    )
    expect(r).toBeGreaterThan(0.95)
  })

  it('mantiene ataque y defensa centrados en 0 (identificabilidad)', () => {
    const sumA = teams.reduce((a, t) => a + fitted.attack.get(t)!, 0)
    expect(sumA).toBeCloseTo(0, 6)
  })

  it('estima goles esperados con un error medio bajo sobre todos los cruces', () => {
    // Un cruce suelto puede desviarse un 5-7% por puro ruido de estimacion de
    // esos dos equipos. Lo que debe cumplirse es el agregado: sobre los 380
    // enfrentamientos posibles, el error medio tiene que ser pequeno y sin
    // sesgo sistematico en una direccion.
    const errors: number[] = []
    let signedBias = 0
    for (const h of teams) {
      for (const a of teams) {
        if (h === a) continue
        const { lambda } = expectedGoals(fitted, h, a, 'TEST')
        const trueLambda = Math.exp(trueAttack.get(h)! + trueDefence.get(a)! + TRUE_HOME)
        errors.push(relErr(lambda, trueLambda))
        signedBias += (lambda - trueLambda) / trueLambda
      }
    }
    const meanErr = errors.reduce((x, y) => x + y, 0) / errors.length
    // Suelo de ruido teorico: con ~228 partidos por equipo, el error tipico
    // del parametro de ataque en escala log es ~1/sqrt(228*1.4) = 0.056, y al
    // cruzar ataque con defensa queda ~7.9% de desviacion en lambda. Pedir
    // menos que eso seria pedirle al ajuste que bata al muestreo.
    expect(meanErr).toBeLessThan(0.08)
    // Sin sesgo neto: los errores se compensan entre si.
    expect(Math.abs(signedBias / errors.length)).toBeLessThan(0.02)
  })

  it('en el cruce mas extremo el ridge encoge algo la estimacion, pero sin desviarla', () => {
    // El mejor ataque contra la peor defensa es donde la regularizacion muerde
    // mas. Aceptamos un sesgo hacia la media, pero acotado: si esto se dispara,
    // el ridge esta demasiado alto para el volumen de datos.
    const { lambda } = expectedGoals(fitted, teams[19]!, teams[0]!, 'TEST')
    const trueLambda = Math.exp(trueAttack.get(teams[19]!)! + trueDefence.get(teams[0]!)! + TRUE_HOME)
    expect(relErr(lambda, trueLambda)).toBeLessThan(0.08)
    expect(lambda).toBeLessThan(trueLambda)
  })
})

describe('scorelineMatrix y derivados', () => {
  const matches: MatchResult[] = []
  const rng = makeRng(7)
  const teams = ['A', 'B', 'C', 'D', 'E', 'F']
  for (let r = 0; r < 12; r++) {
    for (const h of teams) {
      for (const a of teams) {
        if (h === a) continue
        matches.push({
          homeTeam: h,
          awayTeam: a,
          date: new Date(2025, 0, 1 + r),
          homeGoals: samplePoisson(1.5, rng),
          awayGoals: samplePoisson(1.1, rng),
          competition: 'L',
        })
      }
    }
  }
  const params = fitDixonColes(matches, { iterations: 800, halfLifeDays: 100_000 })
  const m = scorelineMatrix(params, 'A', 'B', 'L')

  it('la matriz suma 1', () => {
    const total = m.grid.flat().reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(1, 10)
  })

  it('las probabilidades 1X2 suman 1 y son positivas', () => {
    const p = probs1X2(m)
    expect(p.home + p.draw + p.away).toBeCloseTo(1, 10)
    expect(Math.min(p.home, p.draw, p.away)).toBeGreaterThan(0)
  })

  it('las marginales de goles del Pleno al 15 suman 1 por lado', () => {
    const { home, away } = goalBucketMarginals(m)
    expect(home['0'] + home['1'] + home['2'] + home.M).toBeCloseTo(1, 10)
    expect(away['0'] + away['1'] + away['2'] + away.M).toBeCloseTo(1, 10)
  })

  it('el equipo local tiene mas probabilidad de marcar 2+ que el visitante en igualdad', () => {
    // Con ventaja de campo positiva y equipos equivalentes.
    const { home, away } = goalBucketMarginals(m)
    expect(home['2'] + home.M).toBeGreaterThan(away['2'] + away.M)
  })

  it('usa la ventaja de campo media si la competicion es desconocida', () => {
    expect(() => scorelineMatrix(params, 'A', 'B', 'COMPETICION_NUEVA')).not.toThrow()
  })

  it('falla de forma explicita con un equipo sin ratings', () => {
    expect(() => scorelineMatrix(params, 'A', 'Desconocido', 'L')).toThrow(/sin ratings/)
  })
})

function relErr(actual: number, expected: number): number {
  return Math.abs(actual - expected) / expected
}

function pearson(a: readonly number[], b: readonly number[]): number {
  const n = a.length
  const ma = a.reduce((x, y) => x + y, 0) / n
  const mb = b.reduce((x, y) => x + y, 0) / n
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < n; i++) {
    const x = a[i]! - ma
    const y = b[i]! - mb
    num += x * y
    da += x * x
    db += y * y
  }
  return num / Math.sqrt(da * db)
}
