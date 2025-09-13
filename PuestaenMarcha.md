# Guía técnica (setup, ingesta y personalización)

## 0) Qué es cada pieza

* **apps/api** (Express): endpoint `/chat` que orquesta **cache → memoria → retriever → LLM → fallback** y persiste el turno.
* **apps/web** (Vite/React): chat simple; muestra respuestas y **Fuentes** en acordeón.
* **packages/core**: “motor” de turnos (maneja cache/memoria/retriever/LLM/fallback y persistencias).
* **packages/llm**: construcción de prompts, trims y parámetros del modelo; destilado de memoria larga.
* **packages/retriever**: acceso al índice **Redis** de ayudas; normaliza los docs a `chunks`.
* **packages/memory**:

  * **Redis** → historial breve del chat (`chat:<id>:messages`) + **short summary** (`chat:<id>:summary_short`).
  * **Neon/Postgres** → **memoria larga** (resúmenes destilados) + **(opcional) catálogo/ayudas** si decides mantenerlo como “fuente de verdad”.
* **packages/cache**: cache exacta por texto de entrada (preguntas idénticas → respuesta inmediata).

---

## 1) Requisitos

* **Node.js** 20+ (recomendado 22.x)
* **pnpm** 9+ (`npm i -g pnpm`)
* **Docker** (para Redis/Redis Stack)
* Cuenta **OpenAI** (clave)
* **Neon** (o Postgres compatible con SSL)

---

## 2) Variables de entorno (`.env` **en la raíz del repo**)

> El API carga **solo** el `.env` de la **raíz**. Si pones `.env` dentro de `apps/`, no lo leerá.

Ejemplo mínimo:

```ini
# --- OpenAI ---
OPENAI_API_KEY=sk-xxx
CHAT_MODEL=gpt-4o-mini

# --- Timeouts & tuning ---
CORE_LLM_TIMEOUT_MS=20000
CORE_RETRIEVER_TIMEOUT_MS=12000
RETRIEVER_TOP_K=5
UPDATE_SHORT_SUMMARY_EVERY_TURNS=6
LLM_TRIM_HISTORY_TURNS=12
LLM_MAX_CHUNKS=5
LLM_MAX_DESC_CHARS=1200
LLM_MAX_TOKENS=900
LLM_TEMPERATURE=0.2

# --- Redis ---
REDIS_URL=redis://127.0.0.1:6379

# --- Neon/Postgres ---
DATABASE_URL=postgresql://<user>:<pass>@<host>/<db>?sslmode=require

# --- API ---
PORT=3001

# --- Logs ---
CORE_VERBOSE=1
LLM_VERBOSE=0
```

**Comprobación**: al arrancar la API verás logs tipo:

```
[boot] .env file = C:\...\agenteRAG\.env
[boot] CORE_LLM_TIMEOUT_MS = 20000
[boot] DATABASE_URL = postgresql:/…require
```

---

## 3) Levantar servicios

### 3.1 Redis

* **Rápido (solo Redis)**

  ```bash
  docker run -d --name redis -p 6379:6379 redis:7-alpine
  ```

* **Con UI (Redis Stack + RedisInsight en 8001)**

  ```bash
  docker run -d --name redis-stack -p 6379:6379 -p 8001:8001 redis/redis-stack:latest
  ```

  UI: [http://localhost:8001](http://localhost:8001)

### 3.2 Instalar dependencias

```bash
pnpm install
```

### 3.3 API

```bash
pnpm --filter @agent-rag/api dev
# o:
cd apps/api && pnpm dev
```

Health check: `GET http://localhost:3001/health` → `{ ok: true }`

### 3.4 Web

```bash
pnpm --filter @agent-rag/web dev
# o:
cd apps/web && pnpm dev
```

Si la API está en otra URL:
`apps/web/.env.local`

```ini
VITE_API_URL=http://localhost:3001
```

---

## 4) Ingesta de datos (Excel → Neon → Redis)

### 4.1 Estructura esperada

* **Excel fuente:** en `data/` (p. ej. `data/ayudas.xlsx`)
  Debe contener columnas coherentes con los campos que usa el sistema (ver §7).

* **scripts/**: contiene dos scripts clave:

  1. **Ingesta Excel → Neon** (crea/ajusta tabla y carga filas)
  2. **Ingesta Neon → Redis** (lee filas de Neon y **crea/actualiza el índice en Redis**; no necesitas tocar Redis a mano).

> Ejecútalos con `tsx`, p. ej.:
>   `pnpm tsx scripts/ingest_excel_to_neon.ts data/ayudas.xlsx`
>   `pnpm tsx scripts/ingest_neon_to_redis.ts`

### 4.2 Pasos

1. **Excel → Neon**

   * Crea el **proyecto** en Neon y copia su `DATABASE_URL` (con `sslmode=require`).
   * Ejecuta el script de ingesta Excel → Neon.
   * El script se encargará de:

     * Crear/alterar la **tabla catálogo** (por ejemplo `public.ayudas`) si no existe.
     * Insertar/actualizar las filas desde `data/ayudas.xlsx`.

2. **Neon → Redis**

   * Ejecuta el script de ingesta Neon → Redis.
   * El script:

     * Lee `public.ayudas`.
     * **Construye el índice** en Redis (FT.CREATE / Schema), si no existe.
     * Inserta/actualiza cada ayuda como documento en el índice (hash/json).

> Al finalizar, en Redis verás el índice (p. ej. `idx:ayudas`) y documentos accesibles vía **packages/retriever**.

---

## 5) Flujo de petición `/chat` (con fallback)

```
UI → POST /chat
       ├─ cache exacta (packages/cache)
       ├─ memoria (packages/memory · Redis: historial + short summary)
       ├─ retriever (packages/retriever · Redis: índice ayudas)
       ├─ LLM (packages/llm)
       │    ├─ Si OK → respuesta
       │    └─ Si timeout/error → fallback con “Fichas completas” (solo RAG)
       └─ persistencias (appendTurn, shortSummary, cache y, si toca, destilar a Neon)
```

* **Timeout LLM** ajustable con `CORE_LLM_TIMEOUT_MS`.
* **Top K** del retriever con `RETRIEVER_TOP_K`.
* **Fallback** usa únicamente los campos que vinieron de RAG (no inventa).

---

## 6) Dónde están los datos de memoria

* **Historial corto** y **short summary** → **Redis**

  * `chat:<chatId>:messages`
  * `chat:<chatId>:summary_short`
* **Memoria larga** (destilada cada *N* turnos) → **Neon/Postgres**

  * Tabla de **resúmenes largos** (p. ej. `public.long_summaries`) que el módulo `packages/memory` gestiona.
  * Umbral de destilado: `DISTILL_EVERY_TURNS` (en `packages/llm`).

> El **chatId** lo genera el front y se persiste en `localStorage` (p. ej. `web-<ts>-<rand>`). Ese ID “hila” Redis y Neon.

---

## 7) Campos y **schemas** (qué espera el sistema hoy)

Cuando el **retriever** devuelve documentos, `packages/core` **normaliza** cada doc en un `chunk` con estas **keys** (ver mapping en `core`):

```ts
{
  titulo,
  descripcion,
  url,
  estado_tramite,
  tipo_tramite,
  tema_subtema,
  dirigido_a,
  normativa,
  documentacion,
  resultados,
  otros,
  servicio
}
```

* El **LLM** usa `titulo | descripcion | url` como contexto principal.
* El **fallback** construye “Fichas completas” con **todas** las keys anteriores.
  Si cambias nombres o añades campos, **tienes que tocar**:

  1. **packages/retriever** → mapeo DB→Redis→chunk
  2. **packages/core** → construcción de `chunks` y el template del **fallback**
  3. **scripts de ingesta** → columnas de Excel y columnas SQL de Neon

> Recomendación: centraliza el **schema** (interfaz/const) en un fichero compartido (p. ej. `packages/source/src/schema.ts`) y que **retriever**, **ingestas** y **fallback** consuman de ahí.

---

## 8) Cambiar esquemas (procedimiento)

1. **Decidir nombres de columnas** (Excel y SQL) y **keys de chunk** (JS/TS).
2. **Actualizar scripts**:

   * Excel → Neon: mapping columnas Excel → SQL
   * Neon → Redis: mapping SQL → documento Redis (y schema FT.CREATE)
3. **Actualizar retriever**: lectura del índice y mapping final a `chunks`.
4. **Actualizar core**:

   * Donde se construyen los `chunks` (ya visto).
   * Donde el **fallback** imprime “Fichas completas”.
5. (Opcional) Ajustar prompts del **LLM** si aprovechas nuevos campos.

**Pro tip**: versiona el índice Redis (p. ej. `idx:ayudas:v2`) para reindexar sin romper producción.

---

## 9) Comandos útiles

```bash
# Arrancar API
pnpm --filter @agent-rag/api dev

# Arrancar Web
pnpm --filter @agent-rag/web dev

# Health API
curl http://localhost:3001/health

# Ver timeout que carga la API (aparece en logs)
# [boot] CORE_LLM_TIMEOUT_MS = 20000

# Borrar claves de chat en Redis (PowerShell, fuera del prompt de redis-cli)
redis-cli --scan --pattern "chat:*" | % { redis-cli DEL $_ }

# Revisar Redis Stack UI (si usaste Redis Stack)
# http://localhost:8001
```

---

## 10) Troubleshooting


* **No veo resultados RAG**

  * Reingesta **Neon → Redis** (índice puede no existir).
  * Verifica `RETRIEVER_TOP_K` y logs `[core] retriever: XXXms`.

* **El LLM timeoutea a menudo**

  * Sube `CORE_LLM_TIMEOUT_MS`.
  * Reduce `LLM_TRIM_HISTORY_TURNS`, `LLM_MAX_CHUNKS` o `LLM_MAX_DESC_CHARS`.
  * El **fallback** seguirá garantizando respuesta con datos del RAG.

---

## 11) Validación rápida del flujo

1. Carga UI → “Hola”.
2. Pregunta por una ayuda: el log del API debería mostrar:

   * `[core] retriever: …ms`
   * `[llm] history msgs: N chunks: K`
   * Si el LLM falla: `llm error/fallback: Timeout…` y la respuesta incluirá **“Fichas completas”**.
3. En la UI, abre el **acordeón “Fuentes”** y comprueba los enlaces.

---

## 12) Próximos pasos (resumen operativo)

* **Memoria larga en Neon** (ya integrada): ajusta `DISTILL_EVERY_TURNS` en `packages/llm`.
* **Panel admin (futuro)**: explotar tablas de Neon (memoria larga + catálogo) para auditoría.
* **Guardarraíles**: añadir plantillas de “frases seguras” si LLM falla (sección fallback del `core`).
* **Onboarding guiado**: primer turno con preguntas (“tamaño, sector, internacionalización…”) para filtrar RAG y afinar respuestas.

---

