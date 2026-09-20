import { describe, expect, it } from 'vitest'
import { booksum, devig, margin } from '../model/devig.js'

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
