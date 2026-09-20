import { describe, expect, it } from 'vitest'
import {
  booksum,
  compareDevigMethods,
  devig,
  margin,
  perOutcomeMargin,
} from '../model/devig.js'

// Cuotas realistas de un 1X2 con ~5% de margen.
const odds = [2.1, 3.4, 3.6]

describe('devig', () => {
  it('detecta el margen del mercado', () => {
    expect(booksum(odds)).toBeGreaterThan(1)
    expect(margin(odds)).toBeCloseTo(0.0481, 3)
  })

  it('todos los metodos devuelven probabilidades que suman 1', () => {
    for (const m of ['proportional', 'additive', 'power', 'shin', 'oddsProportional'] as const) {
      const p = devig(odds, m)
      expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
      expect(p.every((x) => x > 0 && x < 1)).toBe(true)
    }
  })

  it('Shin y potencia asignan MENOS probabilidad al longshot que el proporcional', () => {
    // Esta es la correccion del sesgo favorito-longshot: las casas cargan mas
    // margen sobre las cuotas altas, asi que el metodo proporcional las
    // sobreestima. Si esto se rompe, el de-vig esta mal.
    const prop = devig(odds, 'proportional')
    const shin = devig(odds, 'shin')
    const power = devig(odds, 'power')
    const longshot = 2 // la cuota mas alta (3.6)
    expect(shin[longshot]!).toBeLessThan(prop[longshot]!)
    expect(power[longshot]!).toBeLessThan(prop[longshot]!)
  })

  it('y en consecuencia MAS al favorito', () => {
    const prop = devig(odds, 'proportional')
    const shin = devig(odds, 'shin')
    expect(shin[0]!).toBeGreaterThan(prop[0]!)
  })

  it('sin margen, todos los metodos coinciden', () => {
    const fair = [3, 3, 3]
    for (const m of ['proportional', 'power', 'shin', 'oddsProportional'] as const) {
      const p = devig(fair, m)
      expect(p[0]!).toBeCloseTo(1 / 3, 6)
    }
  })

  it('rechaza cuotas invalidas', () => {
    expect(() => devig([0.9, 3, 3])).toThrow()
    expect(() => devig([2])).toThrow()
  })
})

describe('equivalencia aditivo / margen proporcional a la cuota', () => {
  it('son el mismo metodo, no dos', () => {
    // 1/cuota_justa = (n - M*o)/(n*o) = 1/o - M/n, que es la formula aditiva.
    // Buchdahl lo presenta como metodo propio, pero como distribucion de
    // probabilidad coincide exactamente con el aditivo.
    for (const m of [[1.25, 6, 11], [2.4, 3.2, 3.1], [1.08, 12, 29], [3.0, 3.4, 2.45]]) {
      const a = devig(m, 'additive')
      const w = devig(m, 'oddsProportional')
      a.forEach((x, i) => expect(x).toBeCloseTo(w[i]!, 15))
    }
  })
})

describe('perOutcomeMargin', () => {
  it('la casa carga mucho mas margen sobre el longshot que sobre el favorito', () => {
    // El diagnostico del sesgo favorito-longshot.
    const m = perOutcomeMargin([1.25, 6, 11])
    expect(m[0]!).toBeLessThan(0.05) // favorito: margen pequeno
    expect(m[2]!).toBeGreaterThan(0.2) // longshot: margen enorme
    expect(m[2]!).toBeGreaterThan(m[1]!)
    expect(m[1]!).toBeGreaterThan(m[0]!)
  })

  it('en un mercado equilibrado el margen es parecido en los tres', () => {
    const m = perOutcomeMargin([3, 3, 3])
    expect(Math.max(...m) - Math.min(...m)).toBeCloseTo(0, 10)
  })
})

describe('compareDevigMethods', () => {
  it('ordena los metodos por log loss y evalua todas las muestras', () => {
    const samples = [
      { odds: [1.5, 4, 7], winnerIndex: 0 },
      { odds: [2.1, 3.4, 3.6], winnerIndex: 1 },
      { odds: [5, 4, 1.7], winnerIndex: 2 },
      { odds: [1.3, 5.5, 9], winnerIndex: 0 },
    ]
    const r = compareDevigMethods(samples)
    expect(r).toHaveLength(4)
    expect(r.every((x) => x.n === 4)).toBe(true)
    for (let i = 1; i < r.length; i++) {
      expect(r[i]!.logLoss).toBeGreaterThanOrEqual(r[i - 1]!.logLoss)
    }
  })

  it('exige muestras', () => {
    expect(() => compareDevigMethods([])).toThrow()
  })
})
