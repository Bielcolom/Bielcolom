import { describe, expect, it } from 'vitest'
import { applyBoundedAdjustment, linearPool, logPool } from '../model/blend.js'
import type { Probs1X2 } from '../types.js'

const a: Probs1X2 = { home: 0.5, draw: 0.3, away: 0.2 }
const b: Probs1X2 = { home: 0.4, draw: 0.3, away: 0.3 }

describe('pools', () => {
  it('ambos devuelven distribuciones validas', () => {
    for (const f of [linearPool, logPool]) {
      const p = f([{ probs: a, weight: 1 }, { probs: b, weight: 1 }])
      expect(p.home + p.draw + p.away).toBeCloseTo(1, 10)
    }
  })

  it('una sola fuente se devuelve intacta', () => {
    const p = logPool([{ probs: a, weight: 3 }])
    expect(p.home).toBeCloseTo(a.home, 10)
    expect(p.draw).toBeCloseTo(a.draw, 10)
  })

  it('respeta los pesos: mas peso acerca el resultado a esa fuente', () => {
    const p = logPool([{ probs: a, weight: 9 }, { probs: b, weight: 1 }])
    expect(Math.abs(p.home - a.home)).toBeLessThan(Math.abs(p.home - b.home))
  })

  it('el pool logaritmico es mas concentrado que el lineal cuando hay acuerdo', () => {
    // Dos fuentes que coinciden en el favorito deben reforzarlo, no promediarlo.
    const s1: Probs1X2 = { home: 0.6, draw: 0.25, away: 0.15 }
    const s2: Probs1X2 = { home: 0.65, draw: 0.2, away: 0.15 }
    const lin = linearPool([{ probs: s1, weight: 1 }, { probs: s2, weight: 1 }])
    const log = logPool([{ probs: s1, weight: 1 }, { probs: s2, weight: 1 }])
    expect(log.home).toBeGreaterThan(lin.home)
  })

  it('rechaza pesos no positivos y listas vacias', () => {
    expect(() => logPool([])).toThrow()
    expect(() => logPool([{ probs: a, weight: 0 }])).toThrow()
  })
})

describe('applyBoundedAdjustment', () => {
  it('sin empujon deja las probabilidades como estaban', () => {
    const p = applyBoundedAdjustment(a, { home: 0, draw: 0, away: 0 })
    expect(p.home).toBeCloseTo(a.home, 10)
  })

  it('un empujon positivo sube ese signo y baja los otros', () => {
    const p = applyBoundedAdjustment(a, { home: 0.3, draw: 0, away: 0 })
    expect(p.home).toBeGreaterThan(a.home)
    expect(p.away).toBeLessThan(a.away)
    expect(p.home + p.draw + p.away).toBeCloseTo(1, 10)
  })

  it('acota el empujon: la IA no puede secuestrar la prediccion', () => {
    // Este es el test que importa de toda la capa de IA. Aunque el modelo de
    // lenguaje devuelva un valor absurdo, el desplazamiento queda limitado.
    const delirio = applyBoundedAdjustment(a, { home: 50, draw: -50, away: -50 }, 0.4)
    const tope = applyBoundedAdjustment(a, { home: 0.4, draw: -0.4, away: -0.4 }, 0.4)
    expect(delirio.home).toBeCloseTo(tope.home, 10)
    expect(delirio.home).toBeLessThan(0.75)
  })

  it('nunca produce probabilidades fuera de rango', () => {
    const p = applyBoundedAdjustment({ home: 0.02, draw: 0.03, away: 0.95 }, {
      home: 10,
      draw: 10,
      away: -10,
    })
    expect(Math.min(p.home, p.draw, p.away)).toBeGreaterThan(0)
    expect(Math.max(p.home, p.draw, p.away)).toBeLessThan(1)
  })
})
