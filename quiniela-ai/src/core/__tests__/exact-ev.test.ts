import { describe, expect, it } from 'vitest'
import { type CrowdModel, consensusColumn } from '../quiniela/parimutuel.js'
import {
  evaluateColumnExact,
  expectedRivals,
  isConsensusColumn,
} from '../quiniela/exact-ev.js'
import type { Column } from '../quiniela/ticket.js'
import { SIGNS, type Sign } from '../types.js'

const P = (h: number, d: number, a: number) => ({ '1': h, X: d, '2': a })

/**
 * Jornada sintetica con un sesgo del publico realista: la gente sobrejuega al
 * favorito local respecto a lo que dice el modelo.
 */
const modelProbs = Array.from({ length: 14 }, (_, i) =>
  i % 3 === 0 ? P(0.42, 0.28, 0.3) : i % 3 === 1 ? P(0.5, 0.26, 0.24) : P(0.33, 0.3, 0.37),
)
const crowdProbs = Array.from({ length: 14 }, (_, i) =>
  i % 3 === 0 ? P(0.56, 0.24, 0.2) : i % 3 === 1 ? P(0.62, 0.22, 0.16) : P(0.44, 0.28, 0.28),
)
const crowd: CrowdModel = { perMatch: crowdProbs, totalBets: 4_000_000 }

const simple = (signs: readonly Sign[]): Column => ({ matches: signs.map((s) => [s]) })

function argmax(p: { '1': number; X: number; '2': number }): Sign {
  let best: Sign = '1'
  for (const s of SIGNS) if (p[s] > p[best]) best = s
  return best
}

const columnaFavoritos = simple(crowdProbs.map(argmax))
const columnaModelo = simple(modelProbs.map(argmax))
// La "trampa": maximizar el cociente de valor p/q signo a signo.
const columnaMaxValor = simple(
  modelProbs.map((p, i) => {
    let best: Sign = '1'
    let bestV = -Infinity
    for (const s of SIGNS) {
      const v = p[s] / crowdProbs[i]![s]
      if (v > bestV) {
        bestV = v
        best = s
      }
    }
    return best
  }),
)

describe('enumeracion exacta', () => {
  it('un boleto simple tiene exactamente 19.321 resultados que premian', () => {
    // |S_m| = C(14,m)*2^m para m = 0..4  ->  1 + 28 + 364 + 2912 + 16016
    const r = evaluateColumnExact(columnaFavoritos, { crowd, modelProbs })
    expect(r.outcomesEvaluated).toBe(19_321)
  })

  it('la descomposicion por categoria suma el total', () => {
    const r = evaluateColumnExact(columnaModelo, { crowd, modelProbs })
    const suma = r.byCategory.reduce((a, c) => a + c.expectedReturn, 0)
    expect(suma).toBeCloseTo(r.expectedReturn, 8)
  })

  it('cubre las cinco categorias de 10 a 14 aciertos', () => {
    const r = evaluateColumnExact(columnaModelo, { crowd, modelProbs })
    expect(r.byCategory.map((c) => c.hits).sort()).toEqual([10, 11, 12, 13, 14])
  })

  it('rechaza columnas demasiado amplias en vez de colgarse', () => {
    const enorme: Column = { matches: Array.from({ length: 14 }, () => [...SIGNS]) }
    expect(() => evaluateColumnExact(enorme, { crowd, modelProbs, maxOutcomes: 1000 })).toThrow(
      /enumeracion exacta/,
    )
  })
})

describe('EL RETORNO POR RAREZA SATURA EN lambda ~ 1', () => {
  // El resultado estructural que gobierna toda la estrategia.
  //
  //   EV_14(c) = W_14 * P(c) * (1 - e^-lambda) / lambda,  lambda = N * Q(c)
  //
  // Con lambda >> 1 solo importa el cociente P/Q: apartarse de la masa paga.
  // Con lambda << 1 ya eres acertante unico, el factor de reparto satura y
  // seguir buscando rareza SOLO resta probabilidad de acertar.
  //
  // Por tanto existe un optimo interior. Lo comprobamos recorriendo una
  // familia de columnas desde la mas popular hasta la mas contraria.

  /** Columnas cada vez mas contrarias, cambiando un partido cada vez. */
  function familiaDeColumnas(): Column[] {
    const base = crowdProbs.map(argmax) // la mas popular
    // Orden de cambio: primero los partidos donde el signo de maximo valor
    // esta mas infrajugado por el publico.
    const orden = [...Array(14).keys()].sort((a, b) => ganancia(b) - ganancia(a))
    function ganancia(i: number): number {
      const p = modelProbs[i]!
      const q = crowdProbs[i]!
      return Math.max(...SIGNS.map((s) => p[s] / q[s]))
    }
    function maxValorSigno(i: number): Sign {
      const p = modelProbs[i]!
      const q = crowdProbs[i]!
      let best: Sign = '1'
      let bv = -Infinity
      for (const s of SIGNS) {
        const v = p[s] / q[s]
        if (v > bv) {
          bv = v
          best = s
        }
      }
      return best
    }
    const out: Column[] = []
    const actual = [...base]
    out.push(simple(actual))
    for (const i of orden) {
      actual[i] = maxValorSigno(i)
      out.push(simple([...actual]))
    }
    return out
  }

  const familia = familiaDeColumnas()
  // evaluateColumnExact ya devuelve lambda, no hace falta recalcularla.
  const evaluaciones = familia.map((c) => evaluateColumnExact(c, { crowd, modelProbs }))

  it('lambda cae de forma monotona conforme la columna se vuelve contraria', () => {
    for (let i = 1; i < evaluaciones.length; i++) {
      expect(evaluaciones[i]!.lambda).toBeLessThanOrEqual(evaluaciones[i - 1]!.lambda + 1e-9)
    }
    // Arranca con muchisimos rivales y acaba siendo acertante practicamente unico.
    expect(evaluaciones[0]!.lambda).toBeGreaterThan(10)
    expect(evaluaciones[evaluaciones.length - 1]!.lambda).toBeLessThan(1)
  })

  it('el EV crece al apartarse de la masa: el contrarianismo funciona', () => {
    const inicial = evaluaciones[0]!.roi
    const mejor = Math.max(...evaluaciones.map((e) => e.roi))
    expect(mejor).toBeGreaterThan(inicial * 2)
  })

  it('todo el beneficio del reparto se agota ANTES de lambda = 1', () => {
    // Esta es la afirmacion precisa, y es independiente del escenario.
    //
    // El factor de reparto (1-e^-L)/L pasa de ~0,1% con la columna de
    // consenso a ~100% con la mas contraria. Pero practicamente todo ese
    // recorrido ocurre mientras lambda baja hasta 1. Por debajo de 1 el
    // factor ya vale >60% y no puede pasar de 100%, asi que queda menos de
    // un x1,6 disponible por mucha rareza adicional que se busque.
    //
    // Consecuencia: pasado lambda ~ 1, cualquier cambio adicional tiene que
    // justificarse SOLO por probabilidad. Si no la aumenta, resta.
    const factor = (L: number) => (1 - Math.exp(-L)) / L
    const primero = evaluaciones[0]!
    const cruce = evaluaciones.find((e) => e.lambda < 1)!
    const ultimo = evaluaciones[evaluaciones.length - 1]!

    const gananciaHastaUno = factor(cruce.lambda) / factor(primero.lambda)
    const gananciaDespues = factor(ultimo.lambda) / factor(cruce.lambda)

    expect(gananciaHastaUno).toBeGreaterThan(100)
    expect(gananciaDespues).toBeLessThan(1.6)
  })

  it('el factor de reparto (1-e^-L)/L satura por debajo de lambda = 1', () => {
    // Comprobacion directa de la formula, independiente del escenario.
    const factor = (L: number) => (1 - Math.exp(-L)) / L
    expect(factor(20)).toBeLessThan(0.06) // muchos rivales: se reparte muchisimo
    expect(factor(4)).toBeGreaterThan(0.2)
    expect(factor(1)).toBeCloseTo(0.632, 3)
    expect(factor(0.1)).toBeCloseTo(0.952, 3)
    expect(factor(0.01)).toBeCloseTo(0.995, 3)
    // De lambda=1 a lambda=0,01 solo se gana un 57%; de lambda=20 a lambda=1,
    // un 1.100%. Ahi esta el rendimiento decreciente.
    expect(factor(0.01) / factor(1)).toBeLessThan(1.6)
    expect(factor(1) / factor(20)).toBeGreaterThan(10)
  })
})

describe('lambda: rivales esperados', () => {
  it('la columna de favoritos tiene muchisimos mas rivales que la contraria', () => {
    const lFav = expectedRivals(columnaFavoritos, crowd)
    const lValor = expectedRivals(columnaMaxValor, crowd)
    expect(lFav).toBeGreaterThan(lValor)
  })

  it('la columna de maximo valor se pasa de contraria: lambda cae por debajo de 1', () => {
    // Por debajo de 1 rival esperado ya eres acertante unico, asi que seguir
    // buscando rareza no anade nada y solo resta probabilidad de acertar.
    expect(expectedRivals(columnaMaxValor, crowd)).toBeLessThan(1)
  })
})

describe('deteccion de la columna de consenso', () => {
  it('reconoce la columna de favoritos del publico', () => {
    const consenso = simple(consensusColumn(crowd))
    expect(isConsensusColumn(consenso, crowd)).toBe(true)
  })

  it('no confunde un boleto con dobles con el consenso', () => {
    const conDoble: Column = {
      matches: consensusColumn(crowd).map((s, i) => (i === 0 ? [s, 'X' as Sign] : [s])),
    }
    expect(isConsensusColumn(conDoble, crowd)).toBe(false)
  })
})
