import { describe, expect, it } from 'vitest'
import { baseRateModel, walkForward } from '../eval/backtest.js'
import { fitDixonColes, probs1X2, scorelineMatrix } from '../model/dixon-coles.js'
import type { MatchResult, Probs1X2 } from '../types.js'

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

/** Liga sintetica con fuerzas reales y persistentes. */
function syntheticLeague(seed: number, rounds: number): MatchResult[] {
  const rng = makeRng(seed)
  const teams = Array.from({ length: 20 }, (_, i) => `T${i}`)
  const attack = new Map(teams.map((t, i) => [t, (i - 9.5) * 0.07]))
  const defence = new Map(teams.map((t, i) => [t, (9.5 - i) * 0.05]))
  const out: MatchResult[] = []
  let day = 0
  for (let r = 0; r < rounds; r++) {
    for (let g = 0; g < teams.length; g++) {
      const home = teams[g]!
      const away = teams[(g + 1 + r) % teams.length]!
      if (home === away) continue
      const lambda = Math.exp(attack.get(home)! + defence.get(away)! + 0.27)
      const mu = Math.exp(attack.get(away)! + defence.get(home)!)
      out.push({
        homeTeam: home,
        awayTeam: away,
        // Todos los partidos de una jornada, el mismo dia: asi el test
        // comprueba el corte estricto por fecha.
        date: new Date(2022, 0, 1 + day),
        homeGoals: samplePoisson(lambda, rng),
        awayGoals: samplePoisson(mu, rng),
        competition: 'SYN',
      })
    }
    day += 7
  }
  return out
}

describe('walkForward', () => {
  const matches = syntheticLeague(123, 90)

  it('nunca entrena con partidos de la fecha que predice o posteriores', () => {
    // Esta es LA propiedad del backtest. Si se rompe, todas las metricas
    // del proyecto estan infladas y no nos enteramos.
    let checks = 0
    walkForward(
      matches,
      (history) => {
        const maxTrain = Math.max(...history.map((m) => m.date.getTime()))
        return (match) => {
          expect(maxTrain).toBeLessThan(match.date.getTime())
          checks++
          return { home: 0.45, draw: 0.27, away: 0.28 }
        }
      },
      { minTrain: 400, blockSize: 20 },
    )
    expect(checks).toBeGreaterThan(100)
  })

  it('agrega las metricas de todos los folds', () => {
    const report = walkForward(
      matches,
      () => () => ({ home: 0.45, draw: 0.27, away: 0.28 }),
      { minTrain: 400, blockSize: 20 },
    )
    expect(report.folds.length).toBeGreaterThan(5)
    expect(report.overall.n).toBe(
      report.folds.reduce((a, f) => a + f.predictions.length, 0),
    )
    expect(report.overall.rps).toBeGreaterThan(0)
    expect(report.overall.rps).toBeLessThan(1)
  })

  it('omite partidos que el modelo no sabe predecir en vez de inventarlos', () => {
    const report = walkForward(
      matches,
      () => (match) => (match.homeTeam === 'T0' ? undefined : { home: 0.4, draw: 0.3, away: 0.3 }),
      { minTrain: 400, blockSize: 20 },
    )
    expect(report.overall.n).toBeGreaterThan(0)
    for (const f of report.folds) {
      expect(f.predictions.every((p) => p.match.homeTeam !== 'T0')).toBe(true)
    }
  })

  it('Dixon-Coles bate a la frecuencia base fuera de muestra', () => {
    // Prueba de extremo a extremo: si el modelo no supera a "apostar siempre
    // la distribucion historica de 1/X/2", no aporta nada.
    const report = walkForward(
      matches,
      (history) => {
        const params = fitDixonColes(history, { iterations: 500, halfLifeDays: 100_000 })
        return (match): Probs1X2 | undefined => {
          try {
            return probs1X2(scorelineMatrix(params, match.homeTeam, match.awayTeam, match.competition))
          } catch {
            return undefined
          }
        }
      },
      {
        minTrain: 600,
        blockSize: 60,
        baseline: () => baseRateModel(matches),
      },
    )
    expect(report.baseline).toBeDefined()
    expect(report.rpsSkill).toBeGreaterThan(0.05)
    expect(report.overall.rps).toBeLessThan(report.baseline!.rps)
  })

  it('falla de forma explicita si no hay historico suficiente', () => {
    expect(() => walkForward(matches.slice(0, 10), () => () => undefined, { minTrain: 500 })).toThrow(
      /insuficiente/,
    )
  })
})
