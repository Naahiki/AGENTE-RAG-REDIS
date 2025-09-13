## 🧭 OBJETIVO GENERAL

Crear un **agente IA** capaz de:

* Responder preguntas **solo con datos oficiales** sobre ayudas del Gobierno de Navarra.
* Tener **memoria de conversación** (historial + resumen) para mantener el hilo.
* Usar **RAG (Retrieval-Augmented Generation)** sobre una base oficial de datos de ayudas.
* Decidir cuándo usar memoria de búsqueda (Q→A cache), cuándo hacer búsqueda semántica y cuándo pedir precisión al usuario.
* Devolver respuestas con **citaciones enlazables** a la fuente oficial (`navarra.es`), asegurando **transparencia** y **control de frescura**.

🔁 El sistema debe ser **modular y escalable**, de forma que el mismo esqueleto pueda adaptarse a otros contextos (otros departamentos, otras instituciones o incluso nuevos tipos de trámites).

---

## 🏗️ ARQUITECTURA ESCALABLE Y MODULAR

```plaintext
          +-------------------------+
          |    Neon (Postgres)     |
          |  -> Verdad oficial     |
          |  -> CRUD y Admin       |
          +-------------------------+
                    |
                    |    (sync batch o trigger)
                    v
          +-------------------------+
          |  Ingestor (Node script) |
          |  -> Chunk + Embed       |
          |  -> Redis (serving)     |
          +-------------------------+
                    |
      +-------------+--------------+
      |                            |
+-----------+               +-------------+
| Redis     |               | Redis       |
| Vector DB |               | JSON / Cache|
| (RAG)     |               | Memoria chat|
+-----------+               +-------------+
      \                           /
       \                         /
        v                       v
      +-------------------------------+
      |  API Chatbot /chat /search    |
      |  -> policy engine             |
      |  -> cache → retrieve → clarify|
      |  -> citas y respuestas        |
      +-------------------------------+
```

---

## 🧩 COMPONENTES CLAVE

### 🔹 1. **Fuente de verdad: Neon (Postgres)**

* Guarda todas las ayudas oficiales en estructura editable.
* Permite:

  * Crear, editar, cerrar o archivar ayudas desde un panel `/admin`.
  * Versionar contenido y mantener trazabilidad.
* Soporta el CRUD necesario para el equipo gestor.

📌 Tablas mínimas:

* `ayudas`: título, descripción, requisitos, fechas, organismo, estado, url, tags…
* `historial_cambios` (opcional)
* `usuarios_admin` (si gestionas permisos)

---

### 🔹 2. **Redis Stack como “capa de servicio IA”**

* **Vector DB (RediSearch)**: chunks embebidos por semántica (para búsqueda por similitud).
* **JSON**: memoria conversacional (ventana + resumen).
* **Cache Q→A**: respuestas ya dadas para preguntas repetidas (por tema).

> Redis es rápido, con TTLs, estructuras en memoria y búsquedas vectoriales → ideal para responder sin tocar Neon.

---

### 🔹 3. **Proceso de ingesta**

Este módulo sincroniza Neon → Redis.

* Detecta ayudas nuevas o modificadas (`updated_at`).
* Genera `chunks` (título + descripción + requisitos…).
* Calcula `embedding` de cada chunk.
* Guarda en Redis (`doc:{ayuda_id}:{chunk_id}` con metadatos).
* Invalida cache Q→A si cambió el hash del chunk usado.

🕐 Puede ejecutarse:

* Cada hora (cron)
* Tras guardar en `/admin`
* Bajo demanda (`POST /admin/refresh`)

---

### 🔹 4. **Core del agente IA**

**Pipeline por turno de usuario:**

```plaintext
1. Usuario → Input natural
2. Normaliza → Embedding → Detecta intención
3. Memory check → ¿Pregunta ya respondida?
     → Si sí, responde desde caché (Q→A)
4. Retrieve (RAG): chunks desde Redis vector
5. Filtra por `estado=abierta`, organismo, tags
6. Composición del prompt:
    - Instrucciones
    - Chunks citables
    - Memoria resumida
    - Turnos previos relevantes
    - Nueva pregunta
7. LLM genera respuesta con citas
8. Se guarda en memoria + opcionalmente en cache
9. Se entrega al usuario
```

🎯 El prompt final siempre exige:

* Citas a documentos oficiales (URLs)
* No inventar nada
* Decir “no sé” si no hay información

---

### 🔹 5. **Panel de administración**

Ubicado en `/admin`, este módulo permite:

* Ver y buscar ayudas por estado/tags
* Crear, editar o cerrar ayudas
* Ver historial de cambios
* Lanzar sincronización a Redis
* Ver estadísticas (respuestas, preguntas frecuentes)

---

## ✅ FUNCIONALIDADES MÍNIMAS DEL MVP

### 🔍 Para el usuario:

* Preguntar por cualquier ayuda por perfil (“soy pyme”, “para digitalización”).
* Recibir respuestas claras, con pasos, documentos y **enlaces clicables**.
* Ver solo ayudas **abiertas** y **vigentes**.
* Obtener citas fiables (“📄 Resolución 34E/2025 – Gobierno de Navarra”).

### 👤 Para el admin:

* Gestionar ayudas desde `/admin` sin tocar código.
* Actualizar textos y tener sincronización automática con Redis.
* Ver log de respuestas generadas y preguntas frecuentes.
* Forzar sincronización si se detecta un cambio urgente.

---

## ⚙️ STACK TECNOLÓGICO

| Capa          | Tecnología                           |
| ------------- | ------------------------------------ |
| API + Scripts | Node.js (Fastify) + TypeScript       |
| LLM           | OpenAI GPT-4o (configurable)         |
| Embeddings    | OpenAI `text-embedding-3-small`      |
| Vector DB     | Redis Stack (RediSearch + RedisJSON) |
| BBDD          | Neon (Postgres)                      |
| Front admin   | Next.js o SvelteKit                  |
| Infra         | Docker Compose                       |
| DevOps        | Vercel + Neon + Redis Cloud o VPS    |

---

## 🔁 ESCALABILIDAD

Este diseño es fácilmente replicable:

| Proyecto                                  | ¿Qué cambias?                                                         |
| ----------------------------------------- | --------------------------------------------------------------------- |
| Marketplace de negocios                   | `tabla: negocios`, nuevo prompt, nuevos filtros (`precio`, `modelo`)  |
| Directorio de empresas                    | `tabla: empresas`, cambia prompt y filtros (`localidad`, `servicios`) |
| Otros departamentos (Educación, Vivienda) | Nueva tabla `ayudas`, nueva configuración de ingestión y nuevo prompt |

Todo lo demás (capa de IA, cache, memoria, policy) se reutiliza.

---

## 📌 SIGUIENTES PASOS (concretos)

### 🟢 Fase 1: Setup inicial

* [ ] Crear repo `agent-ayudas-navarra`
* [ ] Definir esquema SQL de `ayudas` en Neon
* [ ] Procesar Excel → migrar a Neon
* [ ] Crear `sources.yml` (mapear columnas del Excel)
* [ ] Crear `agent.yml` (política: solo navarra.es, cita obligatoria, thresholds)
* [ ] Crear `prompts/system.txt`

### 🟢 Fase 2: Ingestión y Redis

* [ ] Crear `ingest_from_neon.ts` (detectar cambios, generar chunks, embeddings, guardar en Redis)
* [ ] Indexar vectorialmente en Redis
* [ ] Probar `/search` con filtros (`estado=abierta`, `tema=digitalización`)

### 🟢 Fase 3: Chatbot core

* [ ] API `/chat`: policy → cache → retrieve → clarify
* [ ] Añadir trazas (`turnTrace`, tokens, tiempo)
* [ ] Validar pipeline con respuestas reales

### 🟢 Fase 4: Admin

* [ ] CRUD en `/admin`
* [ ] Trigger a ingestión post-edición
* [ ] Panel simple de ayudas + botón “sincronizar Redis”

---

## 📂 ESTRUCTURA DEL REPO (resumen final)

```
agent-ayudas-navarra/
├── apps/
│   ├── api/                # API del chatbot
│   └── admin/              # Panel CRUD
├── packages/
│   ├── core/               # Lógica del turno
│   ├── retriever/          # Búsqueda semántica
│   ├── memory/             # Memoria chat
│   ├── cache/              # Cache Q→A
│   ├── sources/            # Neon + ingestión
│   ├── embeddings/         # OpenAI
│   ├── llm/                # GPT-4o
│   ├── schema/             # Tipos
│   └── telemetry/          # Trazas
├── config/
│   ├── agent.yml
│   ├── sources.yml
│   └── prompts/system.txt
├── scripts/
│   └── ingest_from_neon.ts
├── infra/
│   └── docker-compose.yml
└── .env
```

---


FT.CREATE ayuda_idx ON JSON PREFIX 1 "ayuda:" SCHEMA $.embedding AS embedding VECTOR FLAT 6 TYPE FLOAT32 DIM 1536 DISTANCE_METRIC COSINE $.titulo AS titulo TEXT $.url AS url TEXT $.descripcion AS descripcion TEXT $.estado_tramite AS estado_tramite TEXT $.tipo_tramite AS tipo_tramite TEXT $.tema_subtema AS tema_subtema TEXT $.dirigido_a AS dirigido_a TEXT $.normativa AS normativa TEXT $.documentacion AS documentacion TEXT $.resultados AS resultados TEXT $.otros AS otros TEXT $.servicio AS servicio TEXT $.metadata AS metadata TEXT

pnpm --filter @agent-rag/api dev

pnpm --filter @agent-rag/web dev