import { describe, expect, it } from 'vitest'
import {
  applyIsotonic,
  calibrate,
  calibrationCurve,
  expectedCalibrationError,
  fitCalibrator1X2,
  fitIsotonic,
} from '../model/calibration.js'
import type { Probs1X2, Sign } from '../types.js'

describe('isotonic', () => {
  it('es monotona no decreciente', () => {
    const m = fitIsotonic([
      { predicted: 0.1, actual: 0 },
      { predicted: 0.2, actual: 1 },
      { predicted: 0.3, actual: 0 },
      { predicted: 0.4, actual: 1 },
      { predicted: 0.5, actual: 1 },
    ])
    for (let i = 1; i < m.y.length; i++) {
      expect(m.y[i]!).toBeGreaterThanOrEqual(m.y[i - 1]! - 1e-12)
    }
  })

  it('corrige la sobreconfianza', () => {
    // Simulamos un modelo sobreconfiado: dice 0.9 pero solo acierta el 60%.
    // Es exactamente el patron que la literatura describe en los LLM.
    const samples = [
      ...Array.from({ length: 60 }, () => ({ predicted: 0.9, actual: 1 })),
      ...Array.from({ length: 40 }, () => ({ predicted: 0.9, actual: 0 })),
      ...Array.from({ length: 10 }, () => ({ predicted: 0.1, actual: 1 })),
      ...Array.from({ length: 90 }, () => ({ predicted: 0.1, actual: 0 })),
    ]
    const m = fitIsotonic(samples)
    expect(applyIsotonic(m, 0.9)).toBeCloseTo(0.6, 1)
    expect(applyIsotonic(m, 0.9)).toBeLessThan(0.9)
  })

  it('devuelve valores siempre en [0,1]', () => {
    const m = fitIsotonic([
      { predicted: 0.2, actual: 0 },
      { predicted: 0.8, actual: 1 },
    ])
    for (const p of [-1, 0, 0.5, 1, 2]) {
      const v = applyIsotonic(m, p)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})

describe('calibrador 1X2', () => {
  it('produce distribuciones validas', () => {
    const samples: { probs: Probs1X2; actual: Sign }[] = []
    const signs: Sign[] = ['1', 'X', '2']
    for (let i = 0; i < 300; i++) {
      samples.push({
        probs: { home: 0.45, draw: 0.3, away: 0.25 },
        actual: signs[i % 3]!,
      })
    }
    const cal = fitCalibrator1X2(samples)
    const p = calibrate(cal, { home: 0.45, draw: 0.3, away: 0.25 })
    expect(p.home + p.draw + p.away).toBeCloseTo(1, 10)
  })
})

describe('curva de calibracion', () => {
  it('un modelo perfectamente calibrado tiene ECE proximo a 0', () => {
    const samples = Array.from({ length: 1000 }, (_, i) => {
      const predicted = ((i % 10) + 0.5) / 10
      // Hacemos que la frecuencia observada coincida exactamente con la predicha.
      return { predicted, occurred: Math.floor(i / 10) % 10 < predicted * 10 }
    })
    const ece = expectedCalibrationError(calibrationCurve(samples))
    expect(ece).toBeLessThan(0.05)
  })

  it('detecta un modelo sobreconfiado', () => {
    const samples = Array.from({ length: 200 }, (_, i) => ({
      predicted: 0.95,
      occurred: i < 100, // solo ocurre el 50% de las veces
    }))
    const ece = expectedCalibrationError(calibrationCurve(samples))
    expect(ece).toBeGreaterThan(0.4)
  })
})
