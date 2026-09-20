import type { GoalBucket } from '../types.js'

/**
 * Lineas base empiricas del futbol espanol.
 *
 * Medidas sobre 14.314 partidos de LaLiga (SP1, n=6.460) y LaLiga Hypermotion
 * (SP2, n=7.854), temporadas 2009/10 a 2025/26.
 *
 * No son parametros del modelo: son BARANDILLAS. Sirven para detectar cuando
 * el modelo se ha ido de madre, para inicializar priors y para no cometer los
 * errores clasicos de bulto al rellenar un boleto.
 */

export interface LeagueBaseline {
  readonly matches: number
  readonly homeWin: number
  readonly draw: number
  readonly awayWin: number
  readonly goalsHome: number
  readonly goalsAway: number
  /** Ventaja de campo en puntos por partido. */
  readonly homeAdvantagePoints: number
  /** Brier del MERCADO. Es el techo practico: nadie lo bate con holgura. */
  readonly marketBrier: number
  /** Acierto del favorito del mercado. */
  readonly favouriteHitRate: number
  /** Fraccion de partidos con un favorito claro (probabilidad > 60%). */
  readonly clearFavouriteRate: number
}

export const PRIMERA: LeagueBaseline = {
  matches: 6460,
  homeWin: 0.469,
  draw: 0.25,
  awayWin: 0.281,
  goalsHome: 1.54,
  goalsAway: 1.13,
  homeAdvantagePoints: 0.57,
  marketBrier: 0.5649,
  favouriteHitRate: 0.548,
  clearFavouriteRate: 0.267,
}

/**
 * Dos datos contraintuitivos de Segunda que conviene no olvidar:
 *
 * 1. La ventaja de campo es LIGERAMENTE MAYOR que en Primera (+0,60 vs +0,57
 *    puntos), no menor como suele suponerse.
 * 2. Solo el 5% de los partidos tienen un favorito claro, frente al 26,7% de
 *    Primera, y mas de la mitad son partidos abiertos. No es que los modelos
 *    fallen en Segunda: es que no hay senal que extraer. El propio mercado
 *    baja al 46,9% de acierto.
 */
export const SEGUNDA: LeagueBaseline = {
  matches: 7854,
  homeWin: 0.454,
  draw: 0.293,
  awayWin: 0.253,
  goalsHome: 1.37,
  goalsAway: 1.0,
  homeAdvantagePoints: 0.6,
  marketBrier: 0.6241,
  favouriteHitRate: 0.469,
  clearFavouriteRate: 0.05,
}

/**
 * Techo empirico de la probabilidad de empate.
 *
 * Ni en el partido mas igualado que existe el empate supera el ~34%. Esto es
 * una consecuencia estructural: con tres resultados y dos de ellos
 * "decisivos", la X nunca domina. Cualquier modelo que devuelva una X por
 * encima de este techo esta mal calibrado, no ha encontrado una joya.
 */
export const MAX_OBSERVED_DRAW_PROB = 0.34

export function drawProbabilityLooksWrong(drawProb: number): boolean {
  return drawProb > MAX_OBSERVED_DRAW_PROB
}

/**
 * Distribucion de goles por equipo en las categorias del Pleno al 15.
 * El Pleno suele caer en un partido de Segunda, asi que esa es la tabla
 * que mas se usa.
 */
export const GOAL_BUCKET_BASELINE: Record<
  'primera' | 'segunda',
  { home: Record<GoalBucket, number>; away: Record<GoalBucket, number> }
> = {
  primera: {
    home: { '0': 0.227, '1': 0.331, '2': 0.24, M: 0.202 },
    away: { '0': 0.339, '1': 0.353, '2': 0.201, M: 0.107 },
  },
  segunda: {
    home: { '0': 0.245, '1': 0.358, '2': 0.243, M: 0.155 },
    away: { '0': 0.373, '1': 0.366, '2': 0.176, M: 0.084 },
  },
}

/**
 * Los seis marcadores mas probables del Pleno al 15 en Segunda. Suman el
 * 63,3% de la probabilidad: cubrirlos cuesta 6 de 16 combinaciones.
 */
export const TOP_PLENO15_SEGUNDA: readonly { combo: string; probability: number }[] = [
  { combo: '1-1', probability: 0.136 },
  { combo: '1-0', probability: 0.135 },
  { combo: '0-0', probability: 0.102 },
  { combo: '2-1', probability: 0.091 },
  { combo: '0-1', probability: 0.085 },
  { combo: '2-0', probability: 0.084 },
]

/**
 * Empates esperados en una jornada de 14 partidos, segun la mezcla de
 * divisiones. Entre 3 y 5 empates cubre alrededor del 62% de las jornadas sea
 * cual sea la mezcla; marcar menos de 3 o mas de 6 es apostar contra la
 * distribucion.
 */
export function expectedDraws(primeraCount: number, segundaCount: number): number {
  return primeraCount * PRIMERA.draw + segundaCount * SEGUNDA.draw
}

/**
 * Ajustes contextuales con efecto medido POR ENCIMA de lo que ya descuenta el
 * mercado. Los que no aparecen aqui (racha, cambio de entrenador, dias de
 * descanso, derbi, horario, motivacion de final de temporada sobre el 1X2)
 * fueron contrastados y NO baten al mercado: meterlos solo anade ruido.
 *
 * Los valores son desplazamientos en puntos por partido del equipo local, tal
 * y como se midieron; hay que convertirlos a la escala del modelo antes de
 * aplicarlos, y conviene tratarlos como priors regularizados, no como verdad.
 */
export interface ContextEffect {
  readonly id: string
  readonly description: string
  readonly league: 'primera' | 'segunda'
  /** Residuo medido en puntos por partido del local. */
  readonly homePointsShift: number
  /** Estadistico z del contraste. Por debajo de |2,8| hay que ser prudente. */
  readonly z: number
  readonly confidence: 'alta' | 'media'
}

export const CONTEXT_EFFECTS: readonly ContextEffect[] = [
  {
    id: 'inicio-temporada',
    description:
      'Jornadas 1-3 de Primera: el %1 cae del 47,5% al 40,0% y el mercado no lo descuenta. Plantillas sin rodar y fichajes tardios.',
    league: 'primera',
    homePointsShift: -0.149,
    z: -2.88,
    confidence: 'alta',
  },
  {
    id: 'paron-navidad',
    description:
      'Segunda tras el paron navideno: el %1 se desploma al 33,7% y los empates suben al 37,3%. Consistente en 12 de 15 temporadas, pero con solo 166 casos: validar antes de fiarse.',
    league: 'segunda',
    homePointsShift: -0.267,
    z: -2.92,
    confidence: 'media',
  },
  {
    id: 'paron-fifa',
    description:
      'Primera tras paron de selecciones: el local, que suele ser el equipo con mas internacionales, recupera jugadores cansados a ultima hora.',
    league: 'primera',
    homePointsShift: -0.127,
    z: -2.24,
    confidence: 'media',
  },
  {
    id: 'filial-local',
    description:
      'Filiales como locales en Segunda: 1,42 puntos frente a 1,66 de un equipo normal. Como visitantes son normales, asi que el deficit es del ambiente, no del viaje.',
    league: 'segunda',
    homePointsShift: -0.12,
    z: -1.81,
    confidence: 'media',
  },
]

/**
 * Efecto de final de temporada. No toca el 1X2 —la creencia de que el equipo
 * que se juega algo gana mas NO se sostiene en los datos— pero si desploma
 * los empates: en Segunda caen del 30,1% al 22,9% en las ultimas 4 jornadas.
 * El folclore acierta el fenomeno (los partidos se abren) y falla la
 * conclusion (quien gana).
 */
export const END_OF_SEASON = {
  lastRounds: 4,
  segundaDrawRate: 0.229,
  segundaDrawRateNormal: 0.301,
  primeraDrawRate: 0.235,
  primeraDrawRateNormal: 0.252,
  segundaGoals: 2.55,
  segundaGoalsNormal: 2.35,
} as const

/**
 * Factores contrastados que NO superan al mercado. Documentados aqui a
 * proposito: la tentacion de meterlos es constante y cada uno de ellos
 * degrada el modelo.
 */
export const DEBUNKED_FACTORS: readonly string[] = [
  'Racha de resultados: 12 contrastes, ninguno significativo, y los signos son inconsistentes entre divisiones.',
  'Cambio de entrenador: el efecto es reversion a la media. Un estudio con 331 destituciones y grupo de control da intervalos de confianza que incluyen el cero.',
  'Dias de descanso: el diferencial de descanso, que es la variable que importa, da z entre 0,17 y 0,34. La fatiga es real fisiologicamente e irrelevante para el 1X2.',
  'Derbis con mas empates: en Primera son identicos al resto (24,9% vs 25,0%) y en Segunda tienen MENOS empates. Lo unico real es un 12% mas de tarjetas.',
  'Equipos sin nada en juego: ningun contraste significativo, ni siquiera en el escenario asimetrico clasico.',
  'Horario del partido: el "partido de las 14:00" da 1,64 puntos de local, exactamente lo mismo que a las 16:00 o a las 21:00.',
  'Ventaja de campo por estadio en Primera: 1 de 25 equipos significativo, justo lo esperable por azar. En Segunda si hay senal (6 de 34).',
]
