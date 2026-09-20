import { describe, expect, it } from 'vitest'
import { fitDixonColes, scorelineMatrix } from '../model/dixon-coles.js'
import {
  coverageFor,
  dependenceVsIndependent,
  pleno15Distribution,
} from '../quiniela/pleno15.js'
import {
  type Column,
  betCount,
  betsFor,
  enumerateBets,
  hitDistribution,
  probabilityOfFull14,
  validateColumn,
} from '../quiniela/ticket.js'
import type { MatchResult, Sign } from '../types.js'

function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}
function samplePoisson(l: number, rng: () => number) {
  const L = Math.exp(-l)
  let k = 0
  let p = 1
  do {
    k++
    p *= rng()
  } while (p > L)
  return k - 1
}

const rng = makeRng(99)
const teams = ['A', 'B', 'C', 'D', 'E', 'F']
const matches: MatchResult[] = []
for (let r = 0; r < 15; r++) {
  for (const h of teams) {
    for (const a of teams) {
      if (h === a) continue
      matches.push({
        homeTeam: h,
        awayTeam: a,
        date: new Date(2025, 0, 1 + r),
        homeGoals: samplePoisson(1.5, rng),
        awayGoals: samplePoisson(1.15, rng),
        competition: 'L',
      })
    }
  }
}
const params = fitDixonColes(matches, { iterations: 800, halfLifeDays: 100_000 })
const matrix = scorelineMatrix(params, 'A', 'B', 'L')

describe('Pleno al 15', () => {
  it('tiene exactamente 16 combinaciones que suman 1', () => {
    const d = pleno15Distribution(matrix)
    expect(d).toHaveLength(16)
    expect(d.reduce((a, c) => a + c.probability, 0)).toBeCloseTo(1, 10)
  })

  it('viene ordenada de mas a menos probable', () => {
    const d = pleno15Distribution(matrix)
    for (let i = 1; i < d.length; i++) {
      expect(d[i]!.probability).toBeLessThanOrEqual(d[i - 1]!.probability)
    }
  })

  it('la conjunta NO coincide con el producto de marginales', () => {
    // Si esto fuese 0, tratar los dos lados como independientes seria
    // inofensivo. No lo es: la correccion tau introduce dependencia real
    // justo en los marcadores bajos, que es donde esta la masa.
    expect(dependenceVsIndependent(matrix)).toBeGreaterThan(0)
  })

  it('la cobertura acumulada alcanza el objetivo pedido', () => {
    const { cells, covered } = coverageFor(matrix, 0.5)
    expect(covered).toBeGreaterThanOrEqual(0.5)
    expect(cells.length).toBeLessThanOrEqual(16)
    // Con 16 celdas y una distribucion concentrada, la mitad de la
    // probabilidad se cubre con unas pocas combinaciones.
    expect(cells.length).toBeLessThan(8)
  })

  it('rechaza objetivos de cobertura invalidos', () => {
    expect(() => coverageFor(matrix, 0)).toThrow()
    expect(() => coverageFor(matrix, 1.5)).toThrow()
  })
})

const simple = (s: Sign): Sign[] => [s]

describe('boleto y combinatoria', () => {
  const allSimple: Column = { matches: Array.from({ length: 14 }, () => simple('1')) }

  it('un boleto simple es una sola apuesta', () => {
    expect(betCount(allSimple)).toBe(1)
  })

  it('cada doble multiplica por 2 y cada triple por 3', () => {
    const col: Column = {
      matches: [
        ['1', 'X'],
        ['1', 'X', '2'],
        ...Array.from({ length: 12 }, () => simple('1')),
      ],
    }
    expect(betCount(col)).toBe(6)
    expect(betsFor(1, 1)).toBe(6)
    expect(betsFor(4, 3)).toBe(432)
    expect(betsFor(0, 0)).toBe(1)
  })

  it('enumera exactamente las apuestas que dice contar', () => {
    const col: Column = {
      matches: [['1', 'X'], ['X', '2'], ...Array.from({ length: 12 }, () => simple('1'))],
    }
    const bets = [...enumerateBets(col)]
    expect(bets).toHaveLength(betCount(col))
    expect(bets).toHaveLength(4)
    // Todas distintas.
    expect(new Set(bets.map((b) => b.join(''))).size).toBe(4)
    // Todas con 14 signos.
    expect(bets.every((b) => b.length === 14)).toBe(true)
  })

  it('valida la estructura del boleto', () => {
    expect(() => validateColumn({ matches: [] })).toThrow(/14 partidos/)
    expect(() =>
      validateColumn({ matches: [[], ...Array.from({ length: 13 }, () => simple('1'))] }),
    ).toThrow(/al menos un signo/)
    expect(() =>
      validateColumn({
        matches: [['1', '1'], ...Array.from({ length: 13 }, () => simple('1'))],
      }),
    ).toThrow(/repetidos/)
  })
})

describe('probabilidad y distribucion de aciertos', () => {
  const p = Array.from({ length: 14 }, () => ({ '1': 0.45, X: 0.27, '2': 0.28 }))

  it('la probabilidad de 14 de un boleto simple es el producto', () => {
    const col: Column = { matches: Array.from({ length: 14 }, () => simple('1')) }
    expect(probabilityOfFull14(col, p)).toBeCloseTo(0.45 ** 14, 15)
  })

  it('marcar un doble suma las probabilidades de ese partido', () => {
    const col: Column = {
      matches: [['1', 'X'], ...Array.from({ length: 13 }, () => simple('1'))],
    }
    expect(probabilityOfFull14(col, p)).toBeCloseTo(0.72 * 0.45 ** 13, 15)
  })

  it('la distribucion de aciertos suma 1 y tiene 15 entradas (0..14)', () => {
    const col: Column = { matches: Array.from({ length: 14 }, () => simple('1')) }
    const d = hitDistribution(col, p)
    expect(d).toHaveLength(15)
    expect(d.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12)
  })

  it('su ultima entrada coincide con probabilityOfFull14', () => {
    const col: Column = {
      matches: [['1', 'X'], ['1', 'X', '2'], ...Array.from({ length: 12 }, () => simple('2'))],
    }
    const d = hitDistribution(col, p)
    expect(d[14]!).toBeCloseTo(probabilityOfFull14(col, p), 15)
  })

  it('acertar 10 o mas es mucho mas probable que acertar 14', () => {
    // Es la razon por la que el valor esperado de una cartera viene sobre todo
    // de las categorias bajas: el 14 casi nunca cae.
    const col: Column = { matches: Array.from({ length: 14 }, () => simple('1')) }
    const d = hitDistribution(col, p)
    const tenPlus = d.slice(10).reduce((a, b) => a + b, 0)
    expect(tenPlus).toBeGreaterThan(d[14]! * 100)
  })

  it('un triple garantiza el acierto en ese partido', () => {
    const col: Column = {
      matches: [['1', 'X', '2'], ...Array.from({ length: 13 }, () => simple('1'))],
    }
    const d = hitDistribution(col, p)
    // Con un triple, es imposible sacar 0 aciertos.
    expect(d[0]!).toBeCloseTo(0, 15)
  })
})
