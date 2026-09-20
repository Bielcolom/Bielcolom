# La Quiniela: investigación de fondo

> Base de conocimiento del proyecto. Todo lo que sigue está etiquetado por nivel
> de evidencia, porque en este terreno circula muchísima afirmación sin respaldo
> — incluidas varias que este documento desmiente.

| Etiqueta | Significado |
|---|---|
| **[V]** | Verificado contra datos crudos (payloads reales de la API de SELAE, o análisis propio sobre partidos) |
| **[M]** | Medido: análisis estadístico propio sobre 14.314 partidos de SP1+SP2, 2009/10–2025/26 |
| **[A]** | Literatura académica, citada con DOI o URL |
| **[?]** | No confirmado. Tratar como hipótesis |

---

## 1. La tesis del proyecto

La quiniela **no es un problema de predicción**. Es un problema de predicción
*más* un problema de teoría de juegos, y el segundo pesa más que el primero.

El motivo es que el premio es **mutualista**: el bote se reparte entre los
acertantes. Acertar 14 no vale lo mismo si lo aciertan 30 personas que si lo
aciertan 3.000. **[V]** En la jornada del 20-10-2021 hubo 392 acertantes de 14
y cada uno cobró **470,30 €**. No es un error de transcripción: el premio de
catorce aciertos es habitualmente de cientos de euros, no de miles.

De ahí se sigue la única estrategia con sentido:

> No se trata de acertar más que los demás. Se trata de **acertar distinto**
> a los demás cuando el modelo tiene razones para creer que la masa se equivoca.

Y eso es factible porque **la masa es observable**: SELAE publica el porcentaje
de apuestas del público por cada signo de cada partido, con actualización
diaria. Es información pública, gratuita y directamente explotable. Casi ningún
proyecto de los que circulan la usa como eje.

---

## 2. Reglas y economía (verificado)

### 2.1 Estructura

**[V]** 15 partidos. Los 14 primeros a 1/X/2. El decimoquinto es el **Pleno al
15**: hay que acertar los goles de *cada* equipo en cuatro categorías — 0, 1, 2
o M (3 o más) — lo que da **16 combinaciones**, no 10 como afirman varias guías
populares que omiten 1-1, 2-2, 1-M, M-1, 2-M y M-2.

- Precio por apuesta simple: **0,75 €**. Mínimo 2 apuestas por boleto.
- Combinaciones totales: 3¹⁴ × 16 = **76.527.504**.

### 2.2 Reparto de premios — el dato que casi todo el mundo cita mal

**[V]** Los porcentajes se expresan sobre la **RECAUDACIÓN ÍNTEGRA**, no sobre
el fondo de premios. Confundir ambas escalas infla los premios en un factor
1/0,55 = 1,82.

| Categoría | Aciertos | % de la recaudación | % del fondo |
|---|---|---|---|
| Especial | 14 + Pleno al 15 | **7,5 %** | 13,64 % |
| 1ª | 14 | **16,0 %** | 29,09 % |
| 2ª | 13 | **7,5 %** | 13,64 % |
| 3ª | 12 | **7,5 %** | 13,64 % |
| 4ª | 11 | **7,5 %** | 13,64 % |
| 5ª | 10 | **9,0 %** | 16,36 % |
| **Total** | | **55,0 %** | 100 % |

Está verificado al céntimo contra pagos reales de dos jornadas independientes
(ver `src/core/__tests__/rules.test.ts`). Codificado en
`src/core/quiniela/rules.ts`.

**RTP sin bote: 55 %.** Para comparar: el margen de una casa de apuestas en el
1X2 de LaLiga ronda el 4-8 %, es decir un RTP del 92-96 %. **La quiniela es
entre 7 y 11 veces peor en esperanza que apostar el mismo 1X2 en una casa.**
Está en el terreno de la lotería, no en el de las apuestas deportivas.

### 2.3 El candado del Pleno al 15 — el hallazgo central

Con bote, el retorno agregado de la jornada es:

```
RTP = 0,55 + bote / recaudación        →   EV positivo  ⟺  bote > 0,45 × recaudación
```

**[V]** Y eso ocurre con frecuencia. Con un fondo real de 2.360.075 € sobre una
recaudación de ~1,5 M€, el RTP agregado es del **212 %**.

Parece dinero gratis. No lo es, y la razón es estructural:

1. **Todo el excedente vive en la categoría especial**, que exige el Pleno al 15.
   Las otras cinco categorías siguen devolviendo su 47,5 % fijo, con bote o sin él.
2. Cubrir las 4.782.969 columnas de 1X2 cuesta **3,59 M€** y garantiza el 14 —
   pero con un solo marcador del Pleno marcado, la probabilidad de llevarse el
   bote es solo la de acertar ese marcador.
3. Cubrirlo entero cuesta ×16: **57,4 M€**. Muy por encima de cualquier bote
   histórico.
4. Y hay **autodilución**: al inyectar S € en una jornada de recaudación base R₀,
   uno se lleva la fracción S/(R₀+S) del fondo, así que el beneficio solo es
   positivo si `S < bote/0,45 − R₀`. En el caso real de arriba ese techo son
   ~3,74 M€ — **un orden de magnitud por debajo de los 57,4 M€** que costaría
   cubrir el Pleno.

> **El factor ×16 del Pleno al 15 es el mecanismo que hace el bote inexpugnable
> por fuerza bruta.** El sistema es autoconsistente: no se puede romper.

Hay un test que lo comprueba numéricamente (`EL CANDADO` en `rules.test.ts`).

### 2.4 Las seis reducidas oficiales

| # | Dobles | Triples | Al directo | Apuestas | Coste | Garantía |
|---|---|---|---|---|---|---|
| 1ª | 0 | 4 | 81 | 9 | 6,75 € | **13** |
| 2ª | 7 | 0 | 128 | 16 | 12,00 € | **13** |
| 3ª | 3 | 3 | 216 | 24 | 18,00 € | **13** |
| 4ª | 6 | 2 | 576 | 64 | 48,00 € | **13** |
| 5ª | 0 | 8 | 6.561 | 81 | 60,75 € | **12** |
| 6ª | 11 | 0 | 2.048 | 132 | 99,00 € | **12** |

Las garantías están validadas con **teoría de códigos cubridores**:
la 1ª es un código ternario perfecto (81/9 = 9 exacto) y la 2ª es literalmente
el **código de Hamming (7,4)**.

> **Desmentido:** varias webs comerciales anuncian la 6ª como *"11 dobles al 13
> por 132 apuestas"*. Es **matemáticamente imposible**: garantizar 13 con 11
> dobles exige al menos 2.048/12 = 171 columnas (el valor conocido K(11,1) es
> 192), y la reducida solo juega 132. Garantiza 12. Hay un test que lo demuestra.

### 2.5 Fiscalidad

**[V]** Exención hasta **40.000 €**, retención del **20 %** sobre el exceso,
definitiva y automática. En premios compartidos el mínimo exento se prorratea.

---

## 3. La composición del boleto ya no es lo que crees

Esto invalida el supuesto de partida "la quiniela es Primera + Segunda":

**[V]** Composición real de jornadas recientes:

| Jornada | Composición |
|---|---|
| 2026 J1 | 1ª: 9, 2ª: 6 |
| 2027 J4 | 1ª: 8, 2ª: 3, **Liga F: 4** |
| 2027 J5 | **Champions: 5, liga finlandesa: 10** |
| 2027 J9 | 2ª: 10, **Liga F: 4**, extranjera: 1 |
| 2026 J71–J76 (verano) | **liga finlandesa: 15/15** |

Tres consecuencias de diseño:

1. **Liga F entra de forma permanente con 4 partidos por jornada** (~27 % del
   boleto), por el **Real Decreto 369/2026**. Y el fútbol femenino español tiene
   **peor cobertura de datos que la Segunda**. Ese, y no la Segunda, es el
   verdadero agujero del proyecto.
2. **Las jornadas de verano son 100 % liga extranjera.** Un modelo que solo sepa
   de fútbol español no puede jugar ~6 jornadas al año.
3. Segunda no siempre es minoritaria: hubo una jornada con 10 de 15.

→ **El pipeline necesita una abstracción de competición desde el primer día**, y
hay que asumir un modelo con distintos niveles de calidad por competición.

---

## 4. Líneas base empíricas [M]

Medido sobre 14.314 partidos (SP1 n=6.460, SP2 n=7.854), 2009/10–2025/26.
Codificado en `src/core/quiniela/baselines.ts`.

| | %1 | %X | %2 | Goles | Ventaja campo | Brier mercado | Acierto favorito |
|---|---|---|---|---|---|---|---|
| **Primera** | 46,9 | 25,0 | 28,1 | 2,67 | +0,57 pts | 0,5649 | 54,8 % |
| **Segunda** | 45,4 | 29,3 | 25,3 | 2,37 | +0,60 pts | 0,6241 | 46,9 % |

### Cuatro cosas contraintuitivas

**1. La ventaja de campo en Segunda es igual o MAYOR que en Primera** (+0,60 vs
+0,57). Coincide con el único estudio serio sobre ambas categorías españolas
([Sánchez et al. 2009](https://pubmed.ncbi.nlm.nih.gov/19725315/), 20.992
partidos), que no halló diferencias significativas.

**2. El empate nunca supera el ~34 %.** Ni en el partido más igualado imaginable.

| Igualdad del partido | %X Primera | %X Segunda |
|---|---|---|
| máxima (\|p₁−p₂\| < 0,05) | **34,1 %** | **33,8 %** |
| media | 29,2 % | 31,8 % |
| favorito claro | 11,2 % | — |

→ **Barandilla dura: un modelo que devuelva X por encima del 34 % está mal
calibrado, no ha encontrado una joya.** Implementado como
`drawProbabilityLooksWrong`.

**3. Segunda no es "más difícil de predecir" por culpa de los modelos. Es que no
hay señal que extraer.** Solo el **5 %** de los partidos de Segunda tienen un
favorito claro (>60 %), frente al **26,7 %** de Primera, y **el 54,8 % son
partidos abiertos** sin ningún signo por encima del 45 %. El propio mercado, con
toda su información, baja al 46,9 % de acierto. → En Segunda, **optimiza
calibración, no acierto**. El techo está ahí y no se mueve.

**4. La ventaja de campo lleva décadas erosionándose**: −0,22 pp de %1 por
temporada, −3,5 pp acumulados en 17 años. El COVID la aceleró (con estadios
vacíos cayó un 40-55 %) pero la tendencia venía de antes. **No uses una constante
histórica: reestima la ventaja de campo por temporada.**

> **Confirmación limpia del efecto afición:** los **filiales** en Segunda juegan
> sin público. Como locales suman 1,42 pts frente a 1,66 de un equipo normal —
> pero **como visitantes son perfectamente normales** (residuo +0,0007). El
> déficit está solo en casa, que es exactamente lo que predice la hipótesis del
> ambiente y no la del viaje ni el césped.

### Pleno al 15: distribución de goles

| | 0 | 1 | 2 | M (3+) |
|---|---|---|---|---|
| Primera local | 22,7 % | 33,1 % | 24,0 % | 20,2 % |
| Primera visitante | 33,9 % | 35,3 % | 20,1 % | 10,7 % |
| Segunda local | 24,5 % | 35,8 % | 24,3 % | 15,5 % |
| Segunda visitante | 37,3 % | 36,6 % | 17,6 % | 8,4 % |

Seis marcadores cubren el **63,3 %** en Segunda: `1-1` 13,6 %, `1-0` 13,5 %,
`0-0` 10,2 %, `2-1` 9,1 %, `0-1` 8,5 %, `2-0` 8,4 %. El menos probable es `M-M`
(1,45 %).

### Empates por jornada

**3–5 empates cubre ~62 % de las jornadas**, sea cual sea la mezcla de
divisiones. Marcar menos de 3 o más de 6 es apostar contra la distribución.
Cuanta más Segunda lleve el boleto, más empates hay que marcar.

---

## 5. Factores contextuales: qué sí y qué no

La distinción que importa no es "¿este factor afecta al resultado?" sino
**"¿afecta por encima de lo que las cuotas ya descuentan?"**. Casi todo el
folclore muere en esa segunda pregunta.

### Sí baten al mercado [M]

| Factor | Efecto | z |
|---|---|---|
| **Jornadas 1–3 de Primera** | %1 cae del 47,5 % al 40,0 %. Plantillas sin rodar, fichajes tardíos | **−2,88** |
| **Parón navideño en Segunda** | %1 se desploma al 33,7 %, empates al 37,3 %. Consistente en 12 de 15 temporadas | **−2,92** |
| **Final de temporada** | Segunda: empates caen del 30,1 % al 22,9 % en las últimas 4 jornadas | −2,56 |
| **Parón FIFA en Primera** | %1 cae 5 pp | −2,24 |
| **Filial como local** (Segunda) | Ventaja de campo reducida | −1,81 |

> El parón navideño es el efecto más grande pero solo tiene n=166. **Valídalo con
> datos frescos antes de meterlo en producción.**

### Mitos: contrastados y descartados [M]

- **Rachas de resultados.** Doce contrastes, **cero significativos**, y los
  signos son inconsistentes entre divisiones. La racha correlaciona con el
  resultado solo porque es un proxy ruidoso de la calidad, y el mercado ya
  conoce la calidad mejor que la racha. **No metas "forma de los últimos 5".**
- **New manager bounce.** [A] *The sacking illusion* (331 destituciones con grupo
  de control de trayectoria idéntica, incluye segundas divisiones): ATT entre
  −0,18 y +0,13 puntos, **todos los intervalos de confianza incluyen el cero**.
  Es reversión a la media. [DOI](https://doi.org/10.1080/02640414.2026.2698238)
- **Días de descanso.** El diferencial de descanso, que es la variable que
  importa, da z entre 0,17 y 0,34. La fatiga es real fisiológicamente e
  irrelevante para el 1X2: los entrenadores rotan y los jugadores dosifican.
- **Derbis con más empates.** En Primera son idénticos al resto (24,9 % vs
  25,0 %); en Segunda tienen **menos**. Lo único real: 12 % más de tarjetas.
- **Equipos sin nada en juego.** Ningún contraste significativo, ni en el
  escenario asimétrico clásico. *Pero* sí baja el empate y suben los goles al
  final de temporada: el folclore acierta el fenómeno (los partidos se abren) y
  falla la conclusión (quién gana).
- **El "partido de las 14:00".** 1,64 pts de local, exactamente lo mismo que a
  las 16:00 y a las 21:00.
- **Ventaja de campo por estadio en Primera.** 1 de 25 equipos significativo,
  justo lo esperable por azar. **En Segunda sí hay señal** (6 de 34).

Todos documentados en `DEBUNKED_FACTORS` a propósito: la tentación de meterlos
es constante y cada uno degrada el modelo.

### Predictor base infravalorado

**[A]** El **valor de plantilla de Transfermarkt** correlaciona r ≈ 0,79 con los
puntos finales (R² ≈ 0,62). Es el predictor a priori más potente que existe y es
gratis. Usa el **logaritmo**, no el valor bruto. Fuerte en los extremos, débil en
el centro de la tabla. Especialmente valioso en Segunda y al inicio de temporada.

---

## 5.bis El modelo: qué implementar y cuál es el techo

### El hallazgo más importante de toda la investigación

Existe un **suelo de ruido irreducible**. Calculado por simulación: un
pronosticador que conociera las **probabilidades verdaderas** de cada partido
obtendría en una liga top aproximadamente:

```
RPS ≈ 0,202     log-loss ≈ 0,985     acierto argmax ≈ 52 %
```

Y los mejores modelos publicados están en **RPS 0,1925–0,2063**, con el mercado
en **≈0,198**.

> **El estado del arte ya está tocando el suelo de ruido.** No hay un modelo
> mágico esperando a ser descubierto: hay un techo físico y la literatura ya
> está en él. El fútbol es, en su mayor parte, azar.

Consecuencia operativa inmediata: **si un backtest devuelve un RPS muy por
debajo de 0,202, la explicación casi segura no es que el modelo sea brillante
sino que hay fuga de datos.** Implementado como `looksLikeDataLeakage`.

### El bug del half-life — corregido en este proyecto

Dixon y Coles publican ξ = 0,0065, pero **su unidad de tiempo son medias
semanas (3,5 días), no días**.

| | ξ | Semivida |
|---|---|---|
| Lectura correcta | 0,0065 / 3,5 = **0,00186** /día | **373 días** |
| Lectura errónea (muy extendida) | 0,0065 /día | 107 días |
| Ley, Van de Wiele & Van Eetvelde (2019), optimización independiente | — | **390 días** |

Implementar `exp(−0,0065 × días)` descarta casi toda la temporada anterior y
convierte los parámetros en ruido. **Nuestro valor por defecto era 180 días —
también demasiado agresivo — y se ha corregido a 380.**

Y ξ **no se puede estimar junto con los demás parámetros** (la verosimilitud
degenera hacia cero). Hay que barrer una rejilla midiendo RPS fuera de muestra,
y hacerlo **por liga**: la rotación de plantillas no es igual en Primera que en
Segunda. Implementado como `tuneHalfLife`.

### Orden de implementación, según la evidencia

| # | Componente | Por qué |
|---|---|---|
| 1 | **Dixon-Coles con decaimiento temporal** | 28 años después, ningún método lo bate por un margen grande y robusto. Y es el único que da gratis la matriz de marcadores que el Pleno al 15 exige |
| 2 | **Walk-forward + bootstrap por jornadas** | Sin esto no sabes si tus mejoras son ruido. La mayoría de mejoras publicadas caben dentro del intervalo de confianza |
| 3 | **Recalibración isotónica** | Barato y casi siempre mejora |
| 4 | **xG en la verosimilitud** | Mejora la eficiencia de estimación (menos partidos para la misma precisión). Ganancia en RPS pequeña |
| 5 | **pi-ratings o Elo como features + gradient boosting, mezclado con DC** | El único enfoque ML con evidencia sólida de mejora. Y la ganancia viene **de los ratings, no del aprendiz** |
| 6 | COM-Poisson, Weibull-cópula, inflado en diagonal | Marginal. Solo después de tener 1–4 |

**Modelo a descartar para este proyecto:** el **Skellam** tiene buen RPS (0,193
reportado en Premier) pero solo modela la *diferencia* de goles, no los goles de
cada equipo. **Es inservible para el Pleno al 15.**

---

## 6. El mercado como fuente de probabilidad

### De-vigging

Una cuota no es una probabilidad. Cómo se reparte el margen **no es neutral**:
la casa carga mucho más sobre los longshots.

**[V]** En un mercado 1,25 / 6,00 / 11,00 los márgenes específicos son **2,5 %
sobre el favorito y 27 % sobre el longshot**. El método proporcional, que reparte
por igual, introduce un sesgo sistemático en todo lo que venga después.

**Hallazgo del proyecto:** el método "margin weights proportional to the odds" de
Buchdahl es **algebraicamente idéntico al aditivo**:

```
p_i = (n − M·o_i)/(n·o_i) = 1/o_i − M/n
```

Verificado numéricamente a 1e-17. No son dos métodos, es uno. Lo que sí aporta
esa formulación es el **margen desglosado por resultado**, conservado como
`perOutcomeMargin`.

**Qué método usar:** la literatura **no se pone de acuerdo**.
[Štrumbelj (2014)](https://doi.org/10.1016/j.ifforecast.2014.02.008) concluye que
gana Shin; [Clarke, Kovalchik & Ingram
(2017)](https://doi.org/10.11648/j.ajss.20170506.12) concluyen que gana potencia.
Análisis posteriores sugieren que **el ganador depende de la casa**. Por defecto
usamos potencia (nunca sale de [0,1]), pero lo correcto es medirlo con datos
propios: `compareDevigMethods`.

Nota práctica: con margen bajo (Pinnacle ~1,8 %) los cinco métodos coinciden
dentro de una décima de punto porcentual. **Solo importa con casas de margen alto.**

### Sesgos, y uno que probablemente va al revés de lo que crees

- **[A] Favorito-longshot:** existe en el 1X2 clásico (longshots sobrevalorados).
  **Los mercados de hándicap asiático NO lo muestran** → mejor fuente de precio.
- **[A] Sesgo del empate: el empate está INFRAVALORADO.** Los apostantes
  infra-predicen sistemáticamente la X por un sesgo de "blanco o negro": la gente
  quiere elegir un ganador. Bruce & Lezana (2026) encuentran retornos anormales
  concentrados en empates y visitantes, **explotables sin poder predictivo
  superior**. [DOI](https://doi.org/10.1177/15270025261438385)
  → **Consecuencia directa:** si tu Dixon-Coles infra-predice empates (problema
  clásico), estarás *replicando* el sesgo del público en vez de explotarlo.
  Por eso el modelo lleva la corrección tau y por eso hay que calibrar la X aparte.
- **[A] Equipos populares en España: la dirección es la CONTRARIA a la intuición
  americana.** Forrest & Simmons (2008), sobre 3.000+ apuestas de Primera:
  a los seguidores del club más popular se les ofrecen condiciones **más
  favorables**, porque las casas mejoran el precio de ese lado para captar
  volumen. [Paper](https://eprints.lancs.ac.uk/id/eprint/44748/1/10.pdf)
  → La hipótesis "fadea al Madrid porque el público lo infla" puede estar
  exactamente al revés. **Mídelo antes de construir nada sobre ella.**
- **[?] Segundas divisiones: no hay ningún estudio revisado por pares.** Es una
  pregunta abierta y tenemos los datos gratis para responderla. Experimento
  mínimo: comparar la mejora apertura→cierre en SP1 vs SP2. Si es mayor en SP2,
  hay evidencia directa de que ahí el precio de apertura es más blando — que es
  justo el nicho que buscamos.

### Mezclar modelo y mercado

**[A/?] No existe ningún estudio que dé un peso óptimo concreto en fútbol.** Hay
que estimarlo fuera de muestra minimizando log-loss, y **será distinto por liga**.
Lo razonable es que salga bajo en LaLiga y más alto en Segunda. **Si sale alto en
LaLiga, sospecha de fuga de datos antes de celebrarlo.**

Usamos **pool logarítmico** por defecto (`blend`): se comporta como una
actualización bayesiana y refuerza cuando las fuentes coinciden, en vez de
promediar a ciegas.

---

## 7. Fuentes de datos

Todo lo que sigue es **gratis y sin API key**.

| Capa | Fuente | Nota |
|---|---|---|
| **Histórico de entrenamiento** | `football-data.co.uk/mmz4281/{AAAA}/SP1.csv` y `SP2.csv` | **[V]** SP1 desde 1993/94, SP2 desde 1996/97. Tiros y tiros a puerta al **100 %** en Segunda, y cuotas de cierre completas |
| **Porcentajes del público** ⭐ | `quinielista.es/xml2/porcentajes_lae.asp?jornada={J}&temporada={AAAA}` | **[V]** XML plano, sin auth. Incluye porcentajes del **Pleno al 15** (`porc_15L_0`…`porc_15V_M`). Histórico barrible |
| **Porcentajes oficiales** | `loteriasyapuestas.es/servicios/estadisticas?jornada={J}&temporada={AAAA}` | **[?]** Endpoint identificado, estructura de respuesta sin documentar |
| **Composición del boleto** | `api.eduardolosilla.es/detallePartido` | **[V]** 15 partidos, división de cada uno, clasificaciones, H2H de 10 años |
| **Probabilidad "real"** | `api.eduardolosilla.es/servicios/v1/probabilidad_real` | Su estimación desde cuotas. El contraste contra `porcentajes_lae` **es la señal de valor** |
| **Resultados oficiales** | `www.loteriasyapuestas.es/servicios/fechav3?game_id=LAQU&fecha_sorteo=AAAAMMDD` | **[V]** Esquema JSON documentado |
| **Lesiones 1ª y 2ª** ⭐ | `futbolfantasy.com/laliga/lesionados` y `/laliga2/lesionados` | **[V]** La única que cubre Hypermotion. `robots.txt` permisivo. Categorías lesionado/duda/disponible con días de baja |
| **Profundidad histórica** | [RicardoMoya/FootballMatchesDataSet](https://github.com/RicardoMoya/FootballMatchesDataSet) | 1ª y 2ª **desde 1970-71**. Solo marcador |
| **Respaldo con licencia limpia** | [openfootball/football.json](https://github.com/openfootball/football.json) | **CC0**. La única sin ambigüedad legal |

### Trampas verificadas

- **[V] API-Football plan gratuito: congelado a temporadas 2022–2024.** El token
  valida pero devuelve *"Free plans do not have access to this season"* para la
  temporada en curso. Inútil para predecir. No aparece en su página de precios.
- **[V] football-data.org: la Segunda española NO está en el plan gratuito.**
- **[V] Understat no cubre Segunda.** Confirmado desde el código de `soccerdata`.
- **[V] betEScraper está abandonado** (último commit 2013) y no da porcentajes.
- **[V] QuiniHub/1X2 no tiene LICENSE** → todos los derechos reservados.
  Inspírate, no copies.
- **[V] Unidades inconsistentes en la API de SELAE**: `recaudacion` viene en
  céntimos en respuestas antiguas y en euros en las recientes. **Valida siempre
  contra `apuestas × 0,75`.**
- **[V] FBref: máximo 10 peticiones/minuto** o baneo de hasta un día.

### El problema del xG, y su solución

Understat no cubre Segunda y FBref tiene disponibilidad irregular. Pero un
modelo con features distintos por división rompe la **comparabilidad entre
partidos del mismo boleto**, que es justo lo que se necesita para decidir dónde
poner los dobles.

**Solución: construir un proxy de xG propio a partir de los tiros**, que sí están
al 100 % en ambas divisiones y con 30 temporadas de historia. Entrenarlo en
Primera, **validarlo contra el xG real de Understat**, y aplicarlo a Segunda con
confianza justificada. Feature homogéneo, coste cero.

Y recordar el orden de importancia: **las cuotas de cierre pesan más que el xG.**

---

## 8. Dónde encaja la IA (y dónde estorba)

**[A]** La evidencia sobre LLMs en tareas de predicción es específica y hay que
respetarla:

- Superan a multitudes genéricas (Brier ≈ 0,135 vs ≈ 0,149) pero están **muy por
  detrás de los superforecasters** (Brier ≈ 0,02).
- **Sobreconfianza sistemática en el tramo alto de probabilidad.**
- **Los formatos narrativos o de "debate" empeoran la precisión** frente a
  consultas directas y estructuradas.
- Lo que cierra la brecha es la **calibración estadística posterior**.

De ahí el diseño, que es deliberadamente restrictivo:

1. **El LLM no emite probabilidades.** Emite un **empujón acotado en escala
   log-odds** sobre un modelo estadístico ya calibrado (`applyBoundedAdjustment`).
   Con el tope por defecto no puede mover una probabilidad del 50 % más allá del
   rango 40-60 %: suficiente para recoger "les falta el portero titular",
   imposible para inventarse un resultado. Hay un test que comprueba que aunque
   devuelva un valor delirante, el desplazamiento queda limitado.
2. **Salida estructurada, no prosa.**
3. **Todo pasa por la capa de calibración después.**
4. Donde el LLM sí aporta de verdad: **normalizar nombres de equipos entre
   fuentes**, leer partes médicos y convertirlos a impacto estimado, y detectar
   contexto que no está en ninguna tabla (huelga, cambio de estadio, un equipo
   con la plantilla en rebeldía).

---

## 8.bis Estrategia: la parte que casi todos los sistemas hacen mal

### La fórmula que casi nadie escribe bien

Si `λ = N·Q(c)` son las apuestas rivales esperadas sobre tu combinación:

```
EV₁₄(c) = W₁₄ · P(c) · (1 − e^(−λ)) / λ
```

Tiene **dos regímenes**, y confundirlos es el error central:

- **λ ≫ 1** (boleto popular): `EV₁₄ ≈ α₁₄·0,75·(P/Q)`. Solo importa el cociente
  de valor. **Apartarse de la masa paga mucho.**
- **λ ≪ 1** (boleto exótico): `EV₁₄ ≈ W₁₄·P(c)`. Ya eres acertante único.
  **Ser más raro deja de aportar; solo resta probabilidad.**

### La trampa del p/q

> **Maximizar `∏(p/q)` es una trampa.** Es la regla que parece seguirse de "apuesta
> a lo infravalorado", y es incorrecta: la columna resultante puede ser tan
> improbable que no gane nunca.

Verificado en nuestro propio motor exacto. El factor de reparto `(1−e^(−λ))/λ`
recorre todo su rango **antes de λ≈1**:

| λ (rivales esperados) | Factor de reparto |
|---|---|
| 756 | 0,1 % |
| 50 | 2,0 % |
| 13 | 7,7 % |
| 3,4 | 28,8 % |
| **1** | **63,2 %** |
| 0,1 | 95,2 % |
| 0,01 | 99,5 % |

De λ=20 a λ=1 se gana un **1.100 %**. De λ=1 a λ=0,01, solo un **57 %**.

→ **Sé contrario hasta que el público espere jugar 1–4 apuestas a tu
combinación. Ni un paso más.** Formalmente: `max P(c) s.a. N·Q(c) ≲ λ*`.
Implementado en `optimizer.ts` (`optimizeBaseColumn`).

> Nota de implementación: la primera versión del optimizador usaba relajación
> lagrangiana y hubo que descartarla. Al cruzar cada umbral de θ, **todos los
> partidos del mismo perfil cambian de signo a la vez**, así que solo se
> obtienen los vértices de la envolvente convexa — en pruebas, una frontera de
> 3 puntos con saltos de cinco órdenes de magnitud en λ. La construcción voraz
> de un partido cada vez da 11 puntos con transiciones finas.

### El teorema de la planitud

```
Σ_c Q(c)·EV_k(c) = W_k/N     para toda categoría k
```

> **Si el público apostara exactamente según las probabilidades reales (`q = p`),
> todas las combinaciones tendrían idéntico EV y ninguna estrategia añadiría
> valor.** Todo el valor explotable procede exacta y únicamente de `q ≠ p`.

Y su corolario incómodo: **el retorno medio ponderado por las apuestas del
público es exactamente el 55 %. Es una identidad, no una estimación.** Toda
estrategia contraria es *redistribución pura* entre quinielistas: lo que ganas
de más sale del bolsillo de otro jugador, nunca de SELAE.

### Las categorías bajas no se dejan explotar

Para k ≤ 13, el número de acertantes `n_k(r)` **no depende de tu boleto**: te
viene dado por el resultado de la jornada.

> **No basta con que TU boleto sea raro. Lo que paga en las categorías bajas es
> que el RESULTADO de la jornada sea raro y tú estés cerca.** Por eso el 10 y el
> 11 son casi inmunes a la estrategia contraria.

Descomposición del EV (modelo calibrado, N=4 M):

| Boleto | % del EV en el 14 |
|---|---|
| Consenso (favoritos) | **9,6 %** |
| Óptimo contrario | **28,7 %** |

→ Tu hipótesis inicial ("el EV viene de las categorías bajas") **se confirma,
con un matiz importante: cuanto más contrario es el boleto, más EV migra hacia
el 14.** La estrategia contraria funciona *convirtiendo* EV de categorías bajas
y densas en EV de categoría 14 y escasa — con el coste de varianza que implica.

### Dónde colocar los dobles: entropía, no valor

Comparación exacta (mismo boleto base, presupuesto 24 €, 32 apuestas):

| Criterio | Retorno |
|---|---|
| 5 dobles por **entropía** (mayor p₂/p₁) | 61,4 % |
| 5 dobles por **valor** (mayor v₂/v₁) | 50,0 % |
| 5 dobles por **greedy exacto sobre ΔEV** | **67,3 %** |

**Entre las dos reglas puras gana la entropía, no el valor** — contra la
intuición. Razón: las combinaciones marginales que añades alimentan sobre todo
las categorías bajas, donde tu rareza no te protege. Y el greedy exacto elige
una **mezcla**, así que **no hay regla cerrada correcta**: hay que evaluar el
ΔEV exacto.

### Las reducidas no mejoran el EV: lo empeoran

Son un dispositivo de **varianza y garantía**, no de valor esperado:

1. El subconjunto se elige por criterio geométrico (cubrir), no por EV. El
   subconjunto óptimo en EV son "los M de mayor `ev(c)`", que están *agrupados*;
   una reducida es por construcción lo contrario.
2. Divide tu probabilidad de acertar el 14 — justo donde vive el efecto contrario.
3. Quien juega "14 triples al 13" gana un 13 **todas las semanas, siempre**, e
   inunda esa categoría para todos.

Y la selección de M boletos sueltos es **casi trivial**: el EV es aditivo, así
que basta ordenar por `ev(c)`. **Para 20 €, 26 combinaciones bien elegidas baten
a un bloque de 3 triples (27 apuestas)**, porque el bloque te obliga a incluir
combinaciones que jamás elegirías. El formato "múltiple" es una restricción del
boleto, no del problema.

### El cuello de botella no es la optimización combinatoria

| Error en tu estimación de `p` | Retorno real |
|---|---|
| 0 % | 68,8 % |
| 5 % | 58,2 % |
| **10 %** | **53,3 %** ≈ la media del público |

> **Un error del 10 % en las probabilidades devuelve todo a la media.** Y se
> compone multiplicativamente sobre 14 partidos. **El riesgo dominante del
> proyecto es el modelo de `p`, no el optimizador.**

### Y es estadísticamente inverificable

Con `sd/coste ≈ 50` y un edge del 10 %, las jornadas necesarias para un
t-estadístico de 2 son:

```
n = (2·σ/μ)² = (2·50/0,10)² ≈ 1.000.000 jornadas ≈ 16.000 temporadas
```

> **Nunca podrás saber, con el P&L de tu propio juego, si tu sistema funciona.**
> Cualquier peña que presuma de 6 temporadas presenta ~360 jornadas cuando el
> error estándar exige 10⁶. **Seis temporadas de beneficio son perfectamente
> compatibles con un EV del 55 %.**
>
> **Corolario metodológico: la única validación posible es indirecta.** Valida el
> modelo de `p` (log-loss contra cuotas de cierre, miles de partidos al año) y el
> modelo de `q` (predicción de `n₁₀…n₁₄`, 5 observaciones por jornada).
> **Nunca valides sobre el P&L.**

### Por qué "comprar el pozo" no funciona aquí

Los casos documentados de EV+ (Cash WinFall/MIT, Irish Lotto 1992, Stefan
Mandel) son **loterías**, y todos consisten en comprar (casi) todas las
combinaciones. La aritmética de la quiniela lo impide:

- Comprar las 4.782.969 combinaciones cuesta **3.587.226,75 €**.
- De esos 4,78 M de boletos, **solo 19.321 ganan algo**.
- Tu propia compra infla la recaudación a 6,59 M€. Incluso capturando el **100 %**
  de todos los premios (imposible), obtendrías 3,62 M€ frente a un coste de
  3,59 M€: **empate técnico en el mejor caso absoluto**.

**Razón estructural:** en una lotería el premio se reparte entre *billetes
ganadores* y comprar todo te da exactamente uno. En la quiniela se reparte entre
*apuestas ganadoras* y comprar todo te da 19.321 diluidas entre sí. **La palanca
no existe.**

### La única recomendación que no necesita modelo

> **Nunca juegues la columna de consenso.** El boleto de favoritos se degrada de
> forma monótona conforme aumenta el sesgo del público (del 91 % con `q = p`
> hasta el 13 % con sesgo fuerte). No hace falta un modelo bueno para saberlo:
> basta con los porcentajes de LAE.

Implementado como `consensusWarning`, que además cuantifica con cuánta gente
compartirías.

### Kelly: el número que pone todo en perspectiva

| Bote | Retorno | sd/coste | Banco necesario para 1 apuesta de 0,75 € |
|---|---|---|---|
| 0 | 69,5 % | 164 | — (EV<0, no jugar) |
| 4 M € | 127 % | 630 | **714.715 €** |
| 6 M € | 154 % | 852 | **481.814 €** |
| 30 M € | 482 % | 3.510 | 283.147 € |

Incluso con un edge del **+54 %**, Kelly dice que arriesgues 1,56 millonésimas
de tu banco por apuesta. Para jugar un boleto de 20 € en régimen Kelly harían
falta **~13 millones de euros**.

---

## 9. Expectativas realistas

Hay que decirlo sin adornos:

- **Sin bote, el RTP es del 55 %.** Cualquier estrategia pierde dinero en
  esperanza. No hay sistema que arregle un margen del 45 %.
- **Con bote grande el RTP agregado supera el 100 %**, a veces el 200 %, pero el
  excedente está encerrado tras el Pleno al 15 y la autodilución impide cubrirlo.
- **No existe ningún estudio revisado por pares** que concluya que la quiniela con
  bote es EV-positiva de forma explotable. Lo que hay son peñas cuantitativas
  (Q84 Sports y similares) que declaran rentabilidad con backtests **propios y no
  auditados**, y foros donde se discute abiertamente por qué el método de
  esperanza matemática **ha fallado** en temporadas concretas — con el argumento
  razonable de que la propia difusión del método erosiona la ineficiencia.
- **Techo de predicción:** Primera Brier ≈ 0,565 y ~55 % de acierto del favorito;
  Segunda ≈ 0,624 y ~47 %. **Ese es el límite del mercado, no el de tu modelo.**

### El umbral exacto

Simulación sobre modelo calibrado, barriendo la intensidad del sesgo del público:

| TVD(p,q) media por partido | Mejor boleto | Boleto favorito |
|---|---|---|
| 0,007 (`q ≈ p`) | 91,2 % | 91,2 % |
| **0,040 (realista)** | **69,5 %** | **42,6 %** |
| 0,061 | 80,1 % | 31,4 % |
| **≈0,095 (equilibrio)** | **≈100 %** | ≈20 % |

> **Respuesta cuantitativa:** con RTP del 55 %, la selección contraria alcanza
> EV≥0 **solo si la discrepancia media entre los porcentajes del público y las
> probabilidades reales supera ~9–10 puntos porcentuales por partido,
> sostenidamente en los 14.** Es decir, el signo de mejor valor debería estar de
> media un ~35 % infrajugado. **No es plausible.**

Para contexto: el caso extremo documentado (público 82 % vs probabilidad real
67 %) es TVD ≈ 0,10 en *ese* partido. Harían falta catorce así, cada semana.

Con bote, en cambio, el punto de equilibrio cae a **~1,5–2 M €** para un boleto
optimizado. Y ojo al matiz: **un bote grande desplaza el óptimo LEJOS del
contrarianismo hacia la probabilidad pura** (λ óptimo salta de ~4 a ~14–21). Con
bote manda acertar; sin bote, manda ser distinto.

### Cuándo jugar

De todo lo anterior se sigue una regla operativa simple: **jugar solo cuando
(a) hay bote ≥ ~1,5–2 M €, y/o (b) la discrepancia modelo/público de esa jornada
está en el decil alto histórico. El resto de semanas, no jugar es la jugada
óptima.**

---

**Qué es este proyecto, entonces:** un ejercicio serio de modelado estadístico y
teoría de juegos sobre un problema con datos públicos excelentes, que puede
reducir mucho la pérdida esperada y **probablemente encontrar jornadas
puntuales con valor real** (bote grande + discrepancia fuerte con el público).
No es una máquina de hacer dinero, y cualquiera que te diga lo contrario te está
vendiendo algo.

Con esa expectativa bien puesta, es un proyecto excelente.

---

## 10. Decisiones de diseño que salen de todo esto

1. **Abstracción de competición desde el día 1** — el boleto lleva Liga F,
   Champions y ligas extranjeras.
2. **Dixon-Coles con corrección tau**, no Poisson independiente: la tau es lo que
   evita infra-predecir empates, y el empate decide la quiniela.
3. **Reestimar la ventaja de campo por temporada y división**, nunca una constante.
4. **Las cuotas de cierre como feature más pesado**, no el modelo propio.
5. **Calibrar la probabilidad de empate por separado**, con el techo del 34 % como
   barandilla.
6. **Optimizar EV, no probabilidad de acierto.** Son cosas distintas en un juego
   mutualista, y confundirlas es el error central de casi todos los sistemas que
   circulan.
7. **El contrarianismo pertenece a la columna BASE; los dobles y triples se
   gastan sobre todo en probabilidad.** Mezclar ambos criterios en la misma
   decisión es el error conceptual típico — y es el que yo mismo cometí en la
   primera versión de este documento. Ver §9.bis.
8. **Validación walk-forward con corte estricto por fecha.** Cortar por índice
   deja entrar partidos de la misma jornada: fuga sutil y muy común.
9. **Todo lo que toca red, detrás de una interfaz con fixtures grabados**, para
   poder testear sin red y sobrevivir a que las fuentes caigan.
