# quiniela-ai

Motor de predicción y optimización de carteras para **La Quiniela** (SELAE).

No es un "sistema para ganar la quiniela". Es un motor de análisis construido
sobre una idea concreta: la quiniela es un juego **mutualista**, así que el
objetivo no es acertar más que los demás sino **acertar distinto** cuando hay
razones para creer que la masa se equivoca — y SELAE publica lo que juega la masa.

> **Lee [`docs/INVESTIGACION.md`](docs/INVESTIGACION.md) antes de tocar nada.**
> Contiene la investigación que fundamenta cada decisión de diseño, con el nivel
> de evidencia de cada afirmación, e incluye la expectativa realista: sin bote el
> retorno es del 55 % y ninguna estrategia arregla eso.

## Estado

Núcleo matemático completo y probado. Sin capa de datos ni interfaz todavía.

```
src/core/
├── model/
│   ├── dixon-coles.ts    Modelo con corrección tau y decaimiento temporal
│   ├── devig.ts          Extracción del margen de las cuotas (5 métodos)
│   ├── blend.ts          Combinación de fuentes + ajuste acotado para la IA
│   └── calibration.ts    Isotónica, curva de calibración, ECE
├── quiniela/
│   ├── rules.ts          Reglas oficiales verificadas y reducidas
│   ├── baselines.ts      Líneas base de 14.314 partidos reales
│   ├── ticket.ts         Combinatoria del boleto
│   ├── pleno15.ts        Distribución conjunta del Pleno al 15
│   ├── parimutuel.ts     Valor esperado con premio compartido
│   ├── exact-ev.ts       EV exacto por enumeración de esferas de Hamming
│   └── optimizer.ts      Frontera de Pareto probabilidad / rareza
└── eval/
    ├── metrics.ts        RPS, Brier, log loss
    └── backtest.ts       Walk-forward con corte estricto por fecha
```

## Uso

```bash
npm install
npm test          # 134 tests
npm run typecheck
```

## Las tres ideas que lo sostienen

**1. El valor esperado, no la probabilidad.** En un juego mutualista no son lo
mismo. Un 14 compartido con 400 personas paga 470 €.

**2. La rareza satura.** `EV₁₄ = W₁₄·P(c)·(1−e^(−λ))/λ` con `λ = N·Q(c)`. Todo el
beneficio de apartarse de la masa se agota antes de λ≈1; pasado ese punto solo se
pierde probabilidad. Maximizar `p/q` es una trampa.

**3. Calibración por encima de acierto.** El suelo de ruido del fútbol es
RPS ≈ 0,202 y el mercado ya está en 0,198. No hay margen para acertar más; sí lo
hay para estimar mejor.

## Advertencia

La Quiniela devuelve el **55 %** de lo que recauda. Cualquier estrategia pierde
dinero en esperanza salvo en jornadas de bote grande, y el excedente del bote
está encerrado tras el Pleno al 15 de forma que no se puede cubrir por fuerza
bruta. Este proyecto es un ejercicio de modelado, no un vehículo de inversión.
