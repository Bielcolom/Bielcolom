import { type Sign, SIGNS } from '../types.js'
import { type CrowdModel, consensusColumn } from './parimutuel.js'
import { MATCHES_1X2, type Column } from './ticket.js'

/**
 * Seleccion de la columna base.
 *
 * El problema NO es "maximizar la probabilidad" ni "maximizar el cociente de
 * valor p/q": es
 *
 *   maximizar  P(c)   sujeto a   lambda = N * Q(c) <= lambda*
 *
 * es decir, ser todo lo probable que se pueda sin acabar en una combinacion
 * que juegue media Espana. Una mochila multi-eleccion de 14 items y 3 opciones.
 *
 * Se resuelve por relajacion lagrangiana, que ademas traza la frontera de
 * Pareto entera: para cada theta >= 0 se elige en cada partido el signo que
 * maximiza
 *
 *   log p[i,s] - theta * log q[i,s]
 *
 * lo cual se descompone partido a partido. Con theta = 0 sale la columna mas
 * probable; al subir theta se penaliza la popularidad y lambda baja de forma
 * monotona. Basta con buscar por biseccion el theta que deja lambda en el
 * objetivo.
 */

export interface ParetoPoint {
  /** Cuantos partidos se han cambiado respecto a la columna mas probable. */
  readonly step: number
  readonly column: Column
  readonly logProbability: number
  /** Rivales esperados sobre la combinacion: N * Q(c). */
  readonly lambda: number
}

export type MatchProbs = { readonly '1': number; readonly X: number; readonly '2': number }

/**
 * Zona util de rivales esperados.
 *
 * Por debajo de ~1 el factor de reparto ya esta saturado y la rareza deja de
 * aportar; muy por encima el premio se diluye entre multitudes. El optimo
 * suele caer en este rango.
 */
export const TARGET_LAMBDA_RANGE = { min: 1, max: 4 } as const

/** Columna que maximiza log p - theta * log q, partido a partido. */
export function columnForTheta(
  modelProbs: readonly MatchProbs[],
  crowdProbs: readonly MatchProbs[],
  theta: number,
): Column {
  const eps = 1e-12
  const matches = modelProbs.map((p, i) => {
    const q = crowdProbs[i]!
    let best: Sign = '1'
    let bestScore = -Infinity
    for (const s of SIGNS) {
      const score = Math.log(Math.max(eps, p[s])) - theta * Math.log(Math.max(eps, q[s]))
      if (score > bestScore) {
        bestScore = score
        best = s
      }
    }
    return [best] as Sign[]
  })
  return { matches }
}

/**
 * Frontera de Pareto entre probabilidad y rareza.
 *
 * NO se construye por relajacion lagrangiana. Se probo y se descarto: al
 * cruzar cada umbral de theta, todos los partidos con el mismo perfil cambian
 * de signo a la vez, asi que solo se obtienen los vertices de la envolvente
 * convexa. En un escenario con pocos perfiles distintos la frontera se quedaba
 * en tres puntos, con saltos de lambda de cinco ordenes de magnitud, y era
 * imposible acertar ningun objetivo intermedio.
 *
 * En su lugar se construye de forma voraz, cambiando UN partido cada vez: en
 * cada paso se elige el cambio que mas rareza gana por unidad de probabilidad
 * perdida, es decir el de mayor
 *
 *   |delta log q| / |delta log p|
 *
 * Eso da hasta 28 puntos (cada partido puede cambiarse dos veces) con
 * transiciones finas, que es lo que hace falta para poder fijar un objetivo
 * de lambda.
 */
export function paretoFrontier(
  modelProbs: readonly MatchProbs[],
  crowd: CrowdModel,
): ParetoPoint[] {
  assertShape(modelProbs, crowd)
  const eps = 1e-12
  const lp = (i: number, s: Sign) => Math.log(Math.max(eps, modelProbs[i]![s]))
  const lq = (i: number, s: Sign) => Math.log(Math.max(eps, crowd.perMatch[i]![s]))

  // Punto de partida: la columna mas probable segun el modelo.
  const actual: Sign[] = modelProbs.map((p) => {
    let best: Sign = '1'
    for (const s of SIGNS) if (p[s] > p[best]) best = s
    return best
  })

  const snapshot = (step: number): ParetoPoint => {
    let logP = 0
    let logQ = 0
    for (let i = 0; i < MATCHES_1X2; i++) {
      logP += lp(i, actual[i]!)
      logQ += lq(i, actual[i]!)
    }
    return {
      step,
      column: { matches: actual.map((s) => [s] as Sign[]) },
      logProbability: logP,
      lambda: crowd.totalBets * Math.exp(logQ),
    }
  }

  const out: ParetoPoint[] = [snapshot(0)]

  // Cada partido admite como mucho dos cambios antes de agotar sus signos.
  for (let paso = 1; paso <= MATCHES_1X2 * 2; paso++) {
    let mejorI = -1
    let mejorS: Sign | null = null
    let mejorRatio = -Infinity

    for (let i = 0; i < MATCHES_1X2; i++) {
      const s0 = actual[i]!
      for (const s of SIGNS) {
        if (s === s0) continue
        const dp = lp(i, s) - lp(i, s0)
        const dq = lq(i, s) - lq(i, s0)
        // Solo interesan los cambios que reducen la popularidad.
        if (dq >= 0) continue
        // Un cambio que ADEMAS gana probabilidad es gratis: se aplica ya.
        const ratio = dp >= 0 ? Infinity : dq / dp
        if (ratio > mejorRatio) {
          mejorRatio = ratio
          mejorI = i
          mejorS = s
        }
      }
    }

    if (mejorI < 0 || mejorS === null) break
    actual[mejorI] = mejorS
    out.push(snapshot(paso))
  }

  // Quita puntos dominados: mismo lambda o peor probabilidad sin ganar rareza.
  const limpio: ParetoPoint[] = []
  for (const pt of out) {
    const previo = limpio[limpio.length - 1]
    if (previo && pt.lambda >= previo.lambda) continue
    limpio.push(pt)
  }
  return limpio
}

export interface OptimizeResult {
  readonly column: Column
  readonly lambda: number
  readonly logProbability: number
  readonly step: number
  /** true si no se alcanzo el objetivo de lambda con el theta maximo. */
  readonly targetMissed: boolean
}

/**
 * Columna base optima: la mas probable cuyo lambda cae dentro del rango util.
 *
 * Si ninguna columna de la frontera entra en el rango (puede pasar cuando el
 * publico esta muy disperso y hasta la columna mas popular tiene pocos
 * rivales), devuelve la mas probable y lo senala con `targetMissed`.
 */
export function optimizeBaseColumn(
  modelProbs: readonly MatchProbs[],
  crowd: CrowdModel,
  target: { min: number; max: number } = TARGET_LAMBDA_RANGE,
): OptimizeResult {
  const frontier = paretoFrontier(modelProbs, crowd)
  if (frontier.length === 0) throw new Error('La frontera de Pareto salio vacia')

  // Dentro del rango, la frontera esta ordenada por lambda decreciente y la
  // probabilidad decrece con theta, asi que el mejor punto admisible es el de
  // mayor lambda dentro del rango.
  const dentro = frontier.filter((p) => p.lambda >= target.min && p.lambda <= target.max)
  // Lambda solo puede tomar valores discretos (es un producto de 14 factores),
  // asi que un rango estrecho puede no contener ningun punto. En ese caso se
  // elige el mas cercano en escala logaritmica y se marca targetMissed.
  const centro = Math.sqrt(target.min * target.max)
  const elegido =
    dentro.length > 0
      ? dentro.reduce((a, b) => (a.logProbability >= b.logProbability ? a : b))
      : frontier.reduce((a, b) =>
          Math.abs(Math.log(a.lambda / centro)) <= Math.abs(Math.log(b.lambda / centro)) ? a : b,
        )

  return {
    column: elegido.column,
    lambda: elegido.lambda,
    logProbability: elegido.logProbability,
    step: elegido.step,
    targetMissed: dentro.length === 0,
  }
}

/**
 * Aviso duro: jugar la columna de consenso.
 *
 * Es la unica recomendacion del proyecto que no necesita modelo: basta con los
 * porcentajes de LAE. El boleto de favoritos se degrada de forma monotona
 * conforme aumenta el sesgo del publico, porque si acierta, acierta con todo
 * el mundo a la vez.
 */
export function consensusWarning(crowd: CrowdModel): {
  column: Column
  lambda: number
  message: string
} {
  const consensus = consensusColumn(crowd)
  const column: Column = { matches: consensus.map((s) => [s]) }
  let q = 1
  for (let i = 0; i < MATCHES_1X2; i++) q *= crowd.perMatch[i]![consensus[i]!]
  const lambda = crowd.totalBets * q
  return {
    column,
    lambda,
    message:
      `La columna de consenso esperaria compartir premio con ${Math.round(lambda)} ` +
      'apuestas mas. Nunca es la jugada optima.',
  }
}

function assertShape(modelProbs: readonly MatchProbs[], crowd: CrowdModel): void {
  if (modelProbs.length !== MATCHES_1X2 || crowd.perMatch.length !== MATCHES_1X2) {
    throw new Error(`Se necesitan ${MATCHES_1X2} partidos en modelo y publico`)
  }
}
