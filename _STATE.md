# _STATE.md — remotion (EU AI Act / SGI video)

## En qué voy

Pipeline en Remotion para convertir scripts en videos verticales cortos, uno a la vez
por ahora -> una vez probado el concepto, se batchea. Primer script: explainer de
~60s sobre EU AI Act / "SGI" (Synthetically Generated Information). Se generaron 4
estilos visuales distintos; **Terminal quedó elegido** como la dirección final. Los
otros 3 (BoldImpact, Regulatory, BreakingNews) existen pero están congelados — no
recibieron las mejoras posteriores (captions por oración, MDGraph, ImageBeats, etc.).

Ver `handoff.md` para la narrativa completa de la sesión.

## Decisiones

- **TTS**: switchable por provider (`edge` / `fish` vía env `TTS_PROVIDER`).
  **Fish CONECTADO (2026-08-18)**, corriendo la voz de **Borat**
  (`FISH_AUDIO_DEFAULT_VOICE_ID=403c9c7352a84018b1d1de4b3d33b06f`) por el
  **endpoint GRATIS `s2.1-pro-free`** (header `model`, gratis hasta 2026-08-31,
  fair use, usan requests p/ mejorar el modelo, sin SLA). Config: `FISH_MODEL`
  en `.env`/default en `tts.ts`. Key en `.env` (gitignored). Audio tags de Fish
  (`[angry]`, `[groaning]`, `[emphasis]`) van **inline en el `text`** — no hay
  param aparte; se pueden meter en el script si querés más expresividad. Lista
  completa de tags + workflow en la skill `video-visual-assets`.
- **Banco de expresiones cacheado (2026-08-18)**: 50 interjecciones de Borat
  ("Aha!", "Hmm", laughs, "Great success!"…) en `public/brand/voice/<id>.mp3` +
  `manifest.json`. Fuente editable: `content/voice/expressions.json`. Regenerar/
  re-rolear: `npx tsx scripts/generate-expressions.ts [id...]` (1 llamada Fish
  por expresión — el split de una sola pista desalinea por las pausas internas).
  Se dropean en cualquier video sin volver a llamar a Fish.
- **Timing robusto a la voz (refactor 2026-08-18)**: cambiar de voz cambia toda
  la duración. Los beats de imagen y el diagrama YA NO tienen ms hardcodeados —
  se derivan de los `stepRanges` reales (captions) en el componente. Cambiar de
  voz/script re-sincroniza todo solo.
- **Captions**: whisper.cpp vía `@remotion/install-whisper-cpp`, agrupadas por
  **oración** (no por ventana de tiempo fija) — `src/lib/useSentencePages.ts`.
- **Diagramas**: la librería propia del usuario, `mdgraph.js`
  (github.com/juanpe500/mdgraphs), integrada vía un script de build
  (`scripts/generate-diagram.ts`, usa Puppeteer) que genera un SVG estático.
  Remotion controla el timing de revelado él mismo — el motor de animación
  propio de MDGraph corre en tiempo real (setTimeout/rAF) y **no es
  frame-determinístico**, no se puede usar en vivo dentro de un render.
- **Imágenes / visuales**: tarjetas de "fuente/ejemplo" en el tercio inferior
  (`src/lib/ImageBeats.tsx`), timeline en `Terminal.tsx`, no rompen nada si el
  archivo no existe todavía — ver `content/eu-ai-act-sgi/images/README.md`.
  **Doctrina (JP, 2026-08-18): BUILD, don't hunt.** Somos tech — los visuales se
  CONSTRUYEN en HTML/SVG/artifacts, no se buscan screenshots de stock. Ver la
  skill `.claude/skills/video-visual-assets/SKILL.md` (principios + pipeline +
  requisitos legales + tips de JP; **mantenerla viva**). `ImageBeat` ahora acepta
  `width`/`bottom` por beat: los beats hero se renderizan grandes y legibles
  (hook y step1 a 940px), no como thumbnails.
- **Pipeline de assets reproducible**: `scripts/generate-images.ts <slug>` +
  manifest `content/<slug>/images/sources.json` (jobs `url` = screenshot web real,
  `html` = mockup propio bajo `mockups/`). No más screenshots a mano.
- **Identidad del canal (confirmada 2026-08-18):** username **JP**, handle
  **@JP_Valat**, avatar `public/brand/jp-avatar.png` (el escarabajo). Consts
  `USERNAME`/`HANDLE`/`AVATAR` en `Terminal.tsx`; se usan en el `Watermark` de
  esquina (avatar + handle) y en el `OutroCard` (avatar grande + JP + handle +
  "FOLLOW FOR THE NEXT ONE"). Ya no hay `@sizth`.

## Siguiente paso

**Las 4 imágenes fuente/ejemplo YA ESTÁN generadas** (2026-08-18) y verificadas
componiendo en la composición real (stills de los 4 beats revisados). Mezcla:
- `hook-eu-ai-act.jpg` → screenshot real de artificialintelligenceact.eu/article/50
  (Artículo 50, muestra "Date of entry into force: 2 August 2026" + párrafos 1-2).
- `step1-label-example.jpg` → screenshot real de contentcredentials.org (C2PA,
  con el popup de procedencia sobre la foto del pingüino + badge "cr").
- `step2-consent-example.jpg` → mockup HTML propio (consent gate, paleta terminal).
- `step3-log-example.jpg` → mockup HTML propio (generation log inmutable).
Todo reproducible vía `npx tsx scripts/generate-images.ts eu-ai-act-sgi` +
manifest `content/eu-ai-act-sgi/images/sources.json` (jobs tipo url|html).

Ya resuelto: imágenes ✅, Fish + voz Borat ✅ (endpoint gratis), identidad JP ✅,
layout + code block de steps ✅. Pendiente/opcional:
1. Opcional: pista de música de fondo (no arrancado — no hay fuente royalty-free
   conectada todavía).
2. Opcional: meter audio tags de Fish (`[angry]`, etc.) en el script para más
   expresividad estilo Borat.
3. Revisar si el timing del tecleo del code block / reveal del diagrama quedó bien
   con la voz de Borat (73.6s) — se re-sincroniza solo pero conviene ojearlo.

Siguiente paso concreto: pipeline completo tras cualquier cambio de voz/script es
`generate-audio` → `generate-captions` → `remotion render` (en ese orden).
Después de aprobado: decidir si se portan las mejoras (diagrama, imágenes, efecto
de tipeo) a los otros 3 estilos, o si se pasa directo a batchear (varios scripts
por el mismo pipeline).

## Gotchas

- **Marcadores de step en el transcript**: según la voz, whisper transcribe
  "One:/Two:/Three:" como palabras **o como dígitos "1./2./3."** (la voz de Borat
  dio dígitos). `STEP_REGEX` en `Terminal.tsx` matchea ambas formas
  (`/\b(one|1)[.,:]/i`, etc.). Si agregás una voz nueva y los steps no aparecen,
  revisá cómo quedaron esos marcadores en `captions.json`.
- whisper.cpp + modelo se descargan a `./whisper.cpp/` (gitignored, ~1.5GB) — el
  primer `npm run captions` es lento, los siguientes son rápidos (cacheado).
- `generate-captions.ts` necesita paths **absolutos** para el proceso que spawnea
  whisper.cpp — con paths relativos falla silenciosamente ("input file not found")
  porque el binario corre con un cwd distinto al del script.
- Los íconos de MDGraph usan `theme.bg` como color de "knockout" — poner
  `bg:"transparent"` los deja invisibles. Hay que renderizar con el bg real y
  quitarlo después en post-proceso (buscar `rgb(...)`, no el string hex — el
  navegador re-serializa el hex a rgb() en el outerHTML).
- `CaptionSequence` mantiene cada página visible hasta que empieza la siguiente
  (no una duración fija) — solo corta antes si hay >=1s de silencio real. No
  reintroducir un cap de duración fija, eso causó el bug original de "pantallazo
  negro entre oraciones".
- Las anotaciones rough-notation (Circle/CrossedOff) necesitan espacio: si la
  palabra objetivo es la última o penúltima de su página, la página cambia antes
  de que la anotación termine de dibujarse. Verificar el "runway" antes de elegir
  una palabra nueva para anotar.
- La fecha real importa para el framing del script ("as of August 2nd") — era
  correcta al 2026-08-15 (las obligaciones del Artículo 50 entraron en vigor el
  2 de agosto de 2026, entonces "earlier this month" era preciso). Se va a
  desactualizar — revisar el wording si este video se reusa/re-renderiza mucho
  después.
