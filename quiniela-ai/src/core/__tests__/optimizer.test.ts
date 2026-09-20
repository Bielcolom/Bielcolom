import { describe, expect, it } from 'vitest'
import { evaluateColumnExact, expectedRivals } from '../quiniela/exact-ev.js'
import {
  TARGET_LAMBDA_RANGE,
  columnForTheta,
  consensusWarning,
  optimizeBaseColumn,
  paretoFrontier,
} from '../quiniela/optimizer.js'
import type { CrowdModel } from '../quiniela/parimutuel.js'
import { SIGNS, type Sign } from '../types.js'

const P = (h: number, d: number, a: number) => ({ '1': h, X: d, '2': a })
const modelProbs = Array.from({ length: 14 }, (_, i) =>
  i % 3 === 0 ? P(0.42, 0.28, 0.3) : i % 3 === 1 ? P(0.5, 0.26, 0.24) : P(0.33, 0.3, 0.37),
)
const crowd: CrowdModel = {
  perMatch: Array.from({ length: 14 }, (_, i) =>
    i % 3 === 0 ? P(0.56, 0.24, 0.2) : i % 3 === 1 ? P(0.62, 0.22, 0.16) : P(0.44, 0.28, 0.28),
  ),
  totalBets: 4_000_000,
}

describe('columnForTheta', () => {
  it('con theta = 0 devuelve la columna mas probable del modelo', () => {
    const c = columnForTheta(modelProbs, crowd.perMatch, 0)
    c.matches.forEach((sel, i) => {
      const p = modelProbs[i]!
      const mejor = SIGNS.reduce((a, s) => (p[s] > p[a] ? s : a), '1' as Sign)
      expect(sel[0]).toBe(mejor)
    })
  })

  it('al subir theta, lambda baja de forma monotona', () => {
    let anterior = Infinity
    for (const theta of [0, 0.5, 1, 1.5, 2, 3, 4, 6]) {
      const l = expectedRivals(columnForTheta(modelProbs, crowd.perMatch, theta), crowd)
      expect(l).toBeLessThanOrEqual(anterior + 1e-9)
      anterior = l
    }
  })
})

describe('frontera de Pareto', () => {
  const frontier = paretoFrontier(modelProbs, crowd)

  it('produce varios puntos distintos, ordenados de popular a contrario', () => {
    expect(frontier.length).toBeGreaterThan(3)
    for (let i = 1; i < frontier.length; i++) {
      expect(frontier[i]!.lambda).toBeLessThan(frontier[i - 1]!.lambda)
    }
  })

  it('es una frontera real: menos rivales cuesta menos probabilidad', () => {
    // La definicion misma de compromiso. Si esto se rompiera habria puntos
    // dominados y la frontera estaria mal construida.
    for (let i = 1; i < frontier.length; i++) {
      expect(frontier[i]!.logProbability).toBeLessThan(frontier[i - 1]!.logProbability + 1e-9)
    }
  })

  it('cubre desde miles de rivales hasta ser acertante unico', () => {
    expect(frontier[0]!.lambda).toBeGreaterThan(10)
    expect(frontier[frontier.length - 1]!.lambda).toBeLessThan(1)
  })
})

describe('optimizeBaseColumn', () => {
  const r = optimizeBaseColumn(modelProbs, crowd)

  it('deja lambda dentro de la zona util', () => {
    expect(r.targetMissed).toBe(false)
    expect(r.lambda).toBeGreaterThanOrEqual(TARGET_LAMBDA_RANGE.min)
    expect(r.lambda).toBeLessThanOrEqual(TARGET_LAMBDA_RANGE.max)
  })

  it('bate en EV a la columna de consenso', () => {
    const consenso = consensusWarning(crowd)
    const evOptimo = evaluateColumnExact(r.column, { crowd, modelProbs })
    const evConsenso = evaluateColumnExact(consenso.column, { crowd, modelProbs })
    expect(evOptimo.roi).toBeGreaterThan(evConsenso.roi)
  })

  it('NO es la columna que maximiza el cociente p/q', () => {
    // Justo lo que distingue este optimizador de la trampa: se para en la zona
    // util de lambda en vez de perseguir rareza sin limite.
    const maxValor = modelProbs.map((p, i) => {
      let best: Sign = '1'
      let bv = -Infinity
      for (const s of SIGNS) {
        const v = p[s] / crowd.perMatch[i]![s]
        if (v > bv) {
          bv = v
          best = s
        }
      }
      return best
    })
    const iguales = r.column.matches.every((sel, i) => sel[0] === maxValor[i])
    expect(iguales).toBe(false)
  })

  it('senala cuando no puede alcanzar el objetivo en vez de mentir', () => {
    // Publico muy disperso y pocas apuestas: ni la columna mas popular
    // tendria un solo rival esperado.
    const disperso: CrowdModel = {
      perMatch: Array.from({ length: 14 }, () => P(1 / 3, 1 / 3, 1 / 3)),
      totalBets: 100,
    }
    const res = optimizeBaseColumn(modelProbs, disperso)
    expect(res.targetMissed).toBe(true)
  })

  it('respeta un rango de lambda personalizado', () => {
    const res = optimizeBaseColumn(modelProbs, crowd, { min: 10, max: 60 })
    expect(res.targetMissed).toBe(false)
    expect(res.lambda).toBeGreaterThanOrEqual(10)
    expect(res.lambda).toBeLessThanOrEqual(60)
    // Al admitir mas rivales, puede permitirse una columna mas probable.
    expect(res.logProbability).toBeGreaterThan(r.logProbability)
  })

  it('con un rango imposible elige el punto mas cercano y lo declara', () => {
    // Lambda es un producto de 14 factores discretos, asi que un rango muy
    // estrecho puede no contener ningun punto de la frontera. El optimizador
    // debe decirlo, no fingir que lo ha cumplido.
    const res = optimizeBaseColumn(modelProbs, crowd, { min: 2.5, max: 2.6 })
    expect(res.targetMissed).toBe(true)
    // Aun asi devuelve algo razonable: el punto mas cercano en escala log.
    expect(res.lambda).toBeGreaterThan(0.5)
    expect(res.lambda).toBeLessThan(10)
  })
})

describe('aviso de consenso', () => {
  it('cuantifica con cuanta gente se compartiria el premio', () => {
    const w = consensusWarning(crowd)
    expect(w.lambda).toBeGreaterThan(100)
    expect(w.message).toContain('Nunca es la jugada optima')
  })
})
