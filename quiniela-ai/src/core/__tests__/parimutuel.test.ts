import { describe, expect, it } from 'vitest'
import {
  type CrowdModel,
  type PrizeStructure,
  consensusColumn,
  evaluateColumn,
  expectedWinnersByHits,
  ourBetsWithExactHits,
  poissonBinomial,
  signValue,
} from '../quiniela/parimutuel.js'
import { PRICE_PER_BET, PRIZE_CATEGORIES } from '../quiniela/rules.js'
import { type Column, betCount } from '../quiniela/ticket.js'
import type { Sign } from '../types.js'

const P = (h: number, d: number, a: number) => ({ '1': h, X: d, '2': a })

describe('poissonBinomial', () => {
  it('suma 1', () => {
    const d = poissonBinomial([0.1, 0.5, 0.9, 0.3])
    expect(d.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12)
  })
  it('coincide con la binomial cuando todas las probabilidades son iguales', () => {
    const n = 5
    const p = 0.4
    const d = poissonBinomial(Array.from({ length: n }, () => p))
    const binom = (k: number) => {
      const c = factorial(n) / (factorial(k) * factorial(n - k))
      return c * p ** k * (1 - p) ** (n - k)
    }
    for (let k = 0; k <= n; k++) expect(d[k]!).toBeCloseTo(binom(k), 12)
  })
  it('con probabilidad 1 en todos, toda la masa esta en n', () => {
    const d = poissonBinomial([1, 1, 1])
    expect(d[3]!).toBeCloseTo(1, 12)
  })
})

function factorial(n: number): number {
  return n <= 1 ? 1 : n * factorial(n - 1)
}

describe('ourBetsWithExactHits', () => {
  const outcome: Sign[] = Array.from({ length: 14 }, () => '1')

  it('un boleto simple totalmente acertado da 1 apuesta con 14 aciertos', () => {
    const col: Column = { matches: Array.from({ length: 14 }, () => ['1' as Sign]) }
    expect(ourBetsWithExactHits(col, outcome, 14)).toBe(1)
    expect(ourBetsWithExactHits(col, outcome, 13)).toBe(0)
  })

  it('reparte las apuestas de una columna multiple entre categorias', () => {
    // Dos dobles, ambos conteniendo el signo correcto: 4 apuestas, de las
    // cuales 1 acierta 14, 2 aciertan 13 y 1 acierta 12.
    const col: Column = {
      matches: [
        ['1', 'X'],
        ['1', '2'],
        ...Array.from({ length: 12 }, () => ['1' as Sign]),
      ],
    }
    expect(ourBetsWithExactHits(col, outcome, 14)).toBe(1)
    expect(ourBetsWithExactHits(col, outcome, 13)).toBe(2)
    expect(ourBetsWithExactHits(col, outcome, 12)).toBe(1)
  })

  it('las apuestas repartidas por categoria suman el total del boleto', () => {
    const col: Column = {
      matches: [
        ['1', 'X', '2'],
        ['1', 'X'],
        ['X', '2'],
        ...Array.from({ length: 11 }, () => ['1' as Sign]),
      ],
    }
    let total = 0
    for (let k = 0; k <= 14; k++) total += ourBetsWithExactHits(col, outcome, k)
    expect(total).toBe(betCount(col))
  })
})

const uniformCrowd: CrowdModel = {
  perMatch: Array.from({ length: 14 }, () => P(0.45, 0.28, 0.27)),
  totalBets: 1_000_000,
}

describe('expectedWinnersByHits', () => {
  const outcome: Sign[] = Array.from({ length: 14 }, () => '1')

  it('el total de acertantes por categoria suma el total de apuestas', () => {
    const w = expectedWinnersByHits(uniformCrowd, outcome)
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(uniformCrowd.totalBets, 3)
  })

  it('sigue sumando el total con concentracion de consenso', () => {
    const w = expectedWinnersByHits({ ...uniformCrowd, consensusShare: 0.12 }, outcome)
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(uniformCrowd.totalBets, 3)
  })

  it('la concentracion de consenso AUMENTA los acertantes de 14 cuando sale el consenso', () => {
    // Es el efecto que hace que jugar la columna de la prensa sea mal negocio:
    // si aciertas, aciertas con todo el mundo.
    const sinConcentracion = expectedWinnersByHits(uniformCrowd, outcome)
    const conConcentracion = expectedWinnersByHits(
      { ...uniformCrowd, consensusShare: 0.12 },
      outcome,
    )
    // outcome es todo "1", que es justo la columna de consenso.
    expect(consensusColumn(uniformCrowd).every((s) => s === '1')).toBe(true)
    expect(conConcentracion[14]!).toBeGreaterThan(sinConcentracion[14]!)
  })
})

describe('signValue', () => {
  it('marca como infrajugado el signo al que el modelo da mas que el publico', () => {
    const v = signValue(P(0.3, 0.35, 0.35), P(0.6, 0.25, 0.15))
    expect(v['1']).toBeLessThan(1) // el publico sobrejuega al local
    expect(v['2']).toBeGreaterThan(1) // el visitante esta infrajugado
  })
})

describe('evaluateColumn: el nucleo estrategico', () => {
  // Estructura oficial verificada contra respuestas reales de la API de SELAE.
  const prize: PrizeStructure = { categories: PRIZE_CATEGORIES }
  const pricePerBet = PRICE_PER_BET

  it('el coste es el numero de apuestas por el precio unitario', () => {
    const col: Column = {
      matches: [['1', 'X'], ...Array.from({ length: 13 }, () => ['1' as Sign])],
    }
    const r = evaluateColumn(col, {
      prize,
      crowd: uniformCrowd,
      modelProbs: Array.from({ length: 14 }, () => P(0.45, 0.28, 0.27)),
      pricePerBet,
    })
    expect(r.cost).toBeCloseTo(2 * pricePerBet, 10)
  })

  it('descompone el retorno por categoria de forma consistente', () => {
    // Que el peso relativo de cada categoria caiga del lado del 14 o de las
    // bajas depende de los porcentajes reales de reparto de LAE, asi que no
    // se da por supuesto: se calcula. Lo que si debe cumplirse siempre es que
    // la descomposicion sume el total y que ninguna categoria se pierda.
    const col: Column = { matches: Array.from({ length: 14 }, () => ['1' as Sign]) }
    const r = evaluateColumn(col, {
      prize,
      crowd: uniformCrowd,
      modelProbs: Array.from({ length: 14 }, () => P(0.45, 0.28, 0.27)),
      pricePerBet,
      simulations: 40_000,
    })
    const suma = r.byCategory.reduce((a, c) => a + c.expectedReturn, 0)
    expect(suma).toBeCloseTo(r.expectedReturn, 8)
    expect(r.byCategory.reduce((a, c) => a + c.share, 0)).toBeCloseTo(1, 8)
    expect(r.byCategory).toHaveLength(prize.categories.length)
    // Sin jugar el Pleno al 15, la categoria especial no aporta nada: es
    // exactamente el candado que protege el bote.
    expect(r.byCategory.find((c) => c.id === 'especial')!.expectedReturn).toBe(0)
    // Las categorias bajas aportan una parte NO despreciable: ignorarlas y
    // optimizar solo el pleno deja valor sobre la mesa.
    const bajas = r.byCategory.filter((c) => c.hits <= 12).reduce((a, c) => a + c.share, 0)
    expect(bajas).toBeGreaterThan(0.1)
  })

  it('apartarse de la masa vale mas que seguirla, a igualdad de probabilidad', () => {
    // EL TEST QUE JUSTIFICA TODO EL PROYECTO.
    //
    // Montamos una jornada donde el modelo y el publico coinciden en 13
    // partidos, y discrepan en el primero: el publico da un 70% al local, el
    // modelo reparte 40/30/30. Comparamos jugar el signo popular contra jugar
    // el signo infrajugado.
    //
    // El signo popular tiene MAS probabilidad de acertar segun el publico,
    // pero si acierta, el premio se reparte con muchisima mas gente.
    const crowd: CrowdModel = {
      perMatch: [P(0.7, 0.18, 0.12), ...Array.from({ length: 13 }, () => P(0.45, 0.28, 0.27))],
      totalBets: 1_000_000,
      consensusShare: 0.1,
    }
    const modelProbs = [P(0.4, 0.3, 0.3), ...Array.from({ length: 13 }, () => P(0.45, 0.28, 0.27))]

    const conLaMasa: Column = { matches: Array.from({ length: 14 }, () => ['1' as Sign]) }
    const contraLaMasa: Column = {
      matches: [['2'], ...Array.from({ length: 13 }, () => ['1' as Sign])],
    }

    const opts = { prize, crowd, modelProbs, pricePerBet, simulations: 60_000, seed: 7 }
    const rMasa = evaluateColumn(conLaMasa, opts)
    const rContra = evaluateColumn(contraLaMasa, opts)

    // Misma inversion.
    expect(rContra.cost).toBeCloseTo(rMasa.cost, 10)
    // El signo contrario tiene MENOS probabilidad de pleno segun el modelo...
    expect(rContra.probFull14).toBeLessThan(rMasa.probFull14)
    // ...y aun asi mas valor esperado, porque se comparte con menos gente.
    expect(rContra.expectedReturn).toBeGreaterThan(rMasa.expectedReturn)
  })

  it('exige 14 partidos en modelo y publico', () => {
    const col: Column = { matches: Array.from({ length: 14 }, () => ['1' as Sign]) }
    expect(() =>
      evaluateColumn(col, {
        prize,
        crowd: uniformCrowd,
        modelProbs: [P(0.4, 0.3, 0.3)],
        pricePerBet,
      }),
    ).toThrow(/14 partidos/)
  })
})
