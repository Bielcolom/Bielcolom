import { describe, expect, it } from 'vitest'
import {
  PAYOUT_RATE,
  PRICE_PER_BET,
  PRIZE_CATEGORIES,
  REDUCED_SYSTEMS,
  TOTAL_1X2_COLUMNS,
  TOTAL_FULL_COLUMNS,
  breakEvenRollover,
  fullCoverageCost,
  maxProfitableStake,
  netAfterTax,
  sphereCoveringBound,
  theoreticalRtp,
} from '../quiniela/rules.js'
import { CONTEXT_EFFECTS, MAX_OBSERVED_DRAW_PROB, PRIMERA, SEGUNDA, expectedDraws } from '../quiniela/baselines.js'

describe('estructura oficial de premios', () => {
  it('las seis categorias suman exactamente el 55% de la recaudacion', () => {
    const total = PRIZE_CATEGORIES.reduce((a, c) => a + c.revenueShare, 0)
    expect(total).toBeCloseTo(PAYOUT_RATE, 10)
  })

  it('solo la categoria especial exige el Pleno al 15', () => {
    const conPleno = PRIZE_CATEGORIES.filter((c) => c.requiresPleno15)
    expect(conPleno).toHaveLength(1)
    expect(conPleno[0]!.id).toBe('especial')
  })

  it('reproduce los importes reales publicados por SELAE', () => {
    // Jornada del 20-10-2021, recaudacion 1.152.231,75 EUR.
    // Especial: 28 acertantes a 3.086,34 EUR. 1a: 392 acertantes a 470,30 EUR.
    //
    // Se comprueba en error RELATIVO, no absoluto: los premios publicados
    // vienen redondeados al centimo, asi que sobre 184.000 EUR repartidos
    // entre 392 acertantes el redondeo ya deja medio euro de diferencia. Lo
    // que se verifica es que los porcentajes oficiales reproducen los pagos
    // reales dentro de ese redondeo.
    const recaudacion = 1_152_231.75
    const relErr = (a: number, b: number) => Math.abs(a - b) / b
    const especial = PRIZE_CATEGORIES.find((c) => c.id === 'especial')!
    const primera = PRIZE_CATEGORIES.find((c) => c.id === '1a')!
    expect(relErr(28 * 3086.34, recaudacion * especial.revenueShare)).toBeLessThan(1e-5)
    expect(relErr(392 * 470.3, recaudacion * primera.revenueShare)).toBeLessThan(1e-5)

    // Segunda jornada independiente (01-08-2021, recaudacion 626.173,50 EUR):
    // 4a con 571 acertantes a 82,25 EUR y 5a con 3.705 a 15,21 EUR.
    const r2 = 626_173.5
    const cuarta = PRIZE_CATEGORIES.find((c) => c.id === '4a')!
    const quinta = PRIZE_CATEGORIES.find((c) => c.id === '5a')!
    expect(relErr(571 * 82.25, r2 * cuarta.revenueShare)).toBeLessThan(1e-4)
    expect(relErr(3705 * 15.21, r2 * quinta.revenueShare)).toBeLessThan(1e-4)
  })
})

describe('economia de la jornada', () => {
  it('sin bote el retorno es del 55%', () => {
    expect(theoreticalRtp(1_000_000)).toBeCloseTo(0.55, 10)
  })

  it('el bote puede llevar el retorno agregado por encima del 100%', () => {
    // Caso real: fondo de bote de 2.360.075 EUR sobre una recaudacion de ~1,5M.
    expect(theoreticalRtp(1_500_000, 2_360_075)).toBeGreaterThan(2)
  })

  it('el umbral de EV positivo es bote > 45% de la recaudacion', () => {
    const r = 1_000_000
    expect(breakEvenRollover(r)).toBeCloseTo(450_000, 6)
    expect(theoreticalRtp(r, breakEvenRollover(r))).toBeCloseTo(1, 10)
  })

  it('el Pleno al 15 multiplica por 16 el coste de cobertura total', () => {
    expect(TOTAL_FULL_COLUMNS).toBe(TOTAL_1X2_COLUMNS * 16)
    expect(fullCoverageCost(false)).toBeCloseTo(TOTAL_1X2_COLUMNS * PRICE_PER_BET, 6)
  })

  it('EL CANDADO: cubrir el Pleno cuesta mas que lo que permite la autodilucion', () => {
    // El resultado central de toda la economia del juego. Aunque el bote haga
    // la jornada favorable en agregado, la inversion maxima antes de diluirse
    // a uno mismo queda MUY por debajo del coste de cubrir el Pleno al 15.
    // Por eso el bote es inexpugnable por fuerza bruta.
    const bote = 2_360_075
    const recaudacionBase = 1_500_000
    const maxInversion = maxProfitableStake(bote, recaudacionBase)
    expect(maxInversion).toBeGreaterThan(0) // la jornada SI es favorable...
    expect(maxInversion).toBeLessThan(fullCoverageCost(true)) // ...pero no alcanza
    expect(fullCoverageCost(true) / maxInversion).toBeGreaterThan(10)
  })
})

describe('reducidas oficiales', () => {
  it('el coste concuerda con el numero de apuestas a 0,75 EUR', () => {
    for (const r of REDUCED_SYSTEMS) {
      expect(r.cost).toBeCloseTo(r.bets * PRICE_PER_BET, 10)
    }
  })

  it('las columnas al directo concuerdan con dobles y triples', () => {
    for (const r of REDUCED_SYSTEMS) {
      expect(r.directColumns).toBe(2 ** r.doubles * 3 ** r.triples)
    }
  })

  it('la primera reducida es un codigo ternario perfecto', () => {
    // 4 triples, 81 columnas al directo, bola de radio 1 de tamano 1+4*2=9.
    // 81/9 = 9 exacto: la cota se alcanza con igualdad.
    expect(sphereCoveringBound(0, 4, 1)).toBeCloseTo(9, 10)
    expect(REDUCED_SYSTEMS.find((r) => r.id === 'r1')!.bets).toBe(9)
  })

  it('la segunda reducida es el codigo de Hamming (7,4)', () => {
    expect(sphereCoveringBound(7, 0, 1)).toBeCloseTo(16, 10)
    expect(REDUCED_SYSTEMS.find((r) => r.id === 'r2')!.bets).toBe(16)
  })

  it('DESMIENTE el reclamo comercial de "11 dobles al 13 por 132 apuestas"', () => {
    // Varias webs anuncian la sexta reducida como garantia al 13. Para
    // garantizar 13 con 11 dobles harian falta al menos 2048/12 = 171
    // columnas, y la sexta reducida solo juega 132. Es imposible.
    const r6 = REDUCED_SYSTEMS.find((r) => r.id === 'r6')!
    const minimoParaGarantizar13 = sphereCoveringBound(11, 0, 1)
    expect(minimoParaGarantizar13).toBeGreaterThan(r6.bets)
    expect(r6.guarantee).toBe(12)
    // Con radio 2 si es factible.
    expect(sphereCoveringBound(11, 0, 2)).toBeLessThan(r6.bets)
  })

  it('todas las garantias son consistentes con la cota de esfera', () => {
    for (const r of REDUCED_SYSTEMS) {
      const fallosTolerados = 14 - r.guarantee
      expect(sphereCoveringBound(r.doubles, r.triples, fallosTolerados)).toBeLessThanOrEqual(r.bets)
    }
  })
})

describe('fiscalidad', () => {
  it('no retiene por debajo de 40.000 EUR', () => {
    expect(netAfterTax(39_999)).toBe(39_999)
    expect(netAfterTax(40_000)).toBe(40_000)
  })
  it('retiene el 20% del exceso', () => {
    expect(netAfterTax(1_368_166.47)).toBeCloseTo(1_368_166.47 - (1_368_166.47 - 40_000) * 0.2, 6)
  })
})

describe('lineas base empiricas', () => {
  it('las distribuciones de signos suman 1', () => {
    for (const l of [PRIMERA, SEGUNDA]) {
      expect(l.homeWin + l.draw + l.awayWin).toBeCloseTo(1, 3)
    }
  })

  it('Segunda tiene MAS empates y MENOS favoritos claros que Primera', () => {
    expect(SEGUNDA.draw).toBeGreaterThan(PRIMERA.draw)
    expect(SEGUNDA.clearFavouriteRate).toBeLessThan(PRIMERA.clearFavouriteRate)
    expect(SEGUNDA.marketBrier).toBeGreaterThan(PRIMERA.marketBrier)
  })

  it('la ventaja de campo en Segunda NO es menor que en Primera', () => {
    // Contraintuitivo, pero es lo que dicen 14.314 partidos.
    expect(SEGUNDA.homeAdvantagePoints).toBeGreaterThanOrEqual(PRIMERA.homeAdvantagePoints)
  })

  it('el techo del empate esta por debajo del 35%', () => {
    expect(MAX_OBSERVED_DRAW_PROB).toBeLessThan(0.35)
    expect(MAX_OBSERVED_DRAW_PROB).toBeGreaterThan(SEGUNDA.draw)
  })

  it('una quiniela tipica lleva entre 3 y 5 empates', () => {
    expect(expectedDraws(14, 0)).toBeGreaterThan(3)
    expect(expectedDraws(0, 14)).toBeLessThan(5)
    expect(expectedDraws(8, 6)).toBeGreaterThan(expectedDraws(14, 0))
  })

  it('todos los efectos contextuales documentados son negativos para el local', () => {
    expect(CONTEXT_EFFECTS.length).toBeGreaterThan(0)
    for (const e of CONTEXT_EFFECTS) {
      expect(e.homePointsShift).toBeLessThan(0)
      expect(Math.abs(e.z)).toBeGreaterThan(1.6)
    }
  })
})
