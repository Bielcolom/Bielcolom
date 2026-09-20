import { describe, expect, it } from 'vitest'
import { brier, logLoss, rps, scoreAll } from '../eval/metrics.js'
import type { Probs1X2 } from '../types.js'

const certainHome: Probs1X2 = { home: 1, draw: 0, away: 0 }
const uniform: Probs1X2 = { home: 1 / 3, draw: 1 / 3, away: 1 / 3 }

describe('rps', () => {
  it('es 0 con una prediccion perfecta', () => {
    expect(rps(certainHome, '1')).toBe(0)
  })

  it('es 1 con la prediccion maximamente equivocada', () => {
    expect(rps(certainHome, '2')).toBe(1)
  })

  it('penaliza menos fallar por un puesto que por dos', () => {
    // Es la propiedad que justifica usar RPS en vez de Brier para 1X2:
    // predecir "1" y que salga "X" duele menos que predecir "1" y que salga "2".
    expect(rps(certainHome, 'X')).toBeLessThan(rps(certainHome, '2'))
    expect(rps(certainHome, 'X')).toBeCloseTo(0.5, 10)
  })

  it('el Brier NO distingue esos dos casos, el RPS si', () => {
    expect(brier(certainHome, 'X')).toBeCloseTo(brier(certainHome, '2'), 10)
    expect(rps(certainHome, 'X')).not.toBeCloseTo(rps(certainHome, '2'), 5)
  })

  it('da 1/3 aproximado para la prediccion uniforme', () => {
    expect(rps(uniform, '1')).toBeCloseTo(0.2778, 4)
    expect(rps(uniform, 'X')).toBeCloseTo(0.1111, 4)
  })
})

describe('logLoss', () => {
  it('es 0 cuando acierta con certeza', () => {
    expect(logLoss(certainHome, '1')).toBeCloseTo(0, 10)
  })
  it('es finito aunque la probabilidad asignada sea 0', () => {
    expect(Number.isFinite(logLoss(certainHome, '2'))).toBe(true)
  })
  it('vale ln(3) para la uniforme', () => {
    expect(logLoss(uniform, 'X')).toBeCloseTo(Math.log(3), 10)
  })
})

describe('scoreAll', () => {
  it('promedia y calcula el acierto del signo mas probable', () => {
    const s = scoreAll([
      { probs: { home: 0.6, draw: 0.25, away: 0.15 }, actual: '1' },
      { probs: { home: 0.2, draw: 0.3, away: 0.5 }, actual: '1' },
    ])
    expect(s.n).toBe(2)
    expect(s.hitRate).toBe(0.5)
    expect(s.rps).toBeGreaterThan(0)
  })
})
