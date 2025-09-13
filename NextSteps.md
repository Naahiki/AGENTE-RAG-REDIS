# Roadmap funcional y técnico (próximos pasos)

## 1) Guardarraíles (cuando falle el LLM o el RAG sea insuficiente)

**Objetivo:** asegurar respuestas útiles y consistentes en fallos/lagunas.

* **Escenarios cubiertos:** timeout/error LLM, RAG sin resultados, consulta fuera de ámbito, consulta demasiado genérica.
* **Mensajes estándar:**

  * *Fallo del modelo/timeout:* “No he podido generar la respuesta completa con el modelo… Te dejo el contexto recuperado (fuentes oficiales)… ¿Quieres que afine con tu perfil?”
  * *RAG vacío:* “No he encontrado ayudas que encajen… Indica área (digitalización/inversión/internacionalización), tamaño y sector…”
  * *Fuera de ámbito:* “Puedo ayudarte con ayudas del Gobierno de Navarra… Si buscas otra cosa, te indico dónde mirar.”
  * *Demasiado genérica:* “Para recomendar bien, dime: tamaño, sector y objetivo (contratar/invertir/digitalizar/energía/internacionalizar)…”
* **Aceptación:** ante cualquiera de esos casos, la app muestra mensaje de guardarraíl + fuentes/”fichas completas” si existen.

## 2) Intro guiada (perfilado del usuario)

**Objetivo:** captar datos mínimos para afinar RAG y respuesta.

* **Campos base:** tamaño (micro/pequeña/mediana/grande), nº empleados, sector/CNAE, objetivos (digitalización/inversión/internacionalización/energía/contratación), fase exportación, presupuesto y horizonte temporal (opcional).
* **Uso del perfil:**

  * **Retriever:** filtro/boost por tema/subtema, tamaño y sector.
  * **LLM:** contexto adicional para priorizar ayudas.
  * **Memoria:** persistencia por `chatId` (y futuro `userId`).
* **Aceptación:** si la consulta es genérica o al primer acceso, se propone perfilar; el perfil influye en top-K y en la respuesta.

## 3) Salida estructurada para “Fichas completas”

**Objetivo:** separar contenido libre de las fichas para presentarlas mejor (acordeón).

* **Cambios previstos:**

  * LLM devuelve *también* un bloque estructurado de fichas (JSON/estructura interna).
  * El front renderiza el texto principal + acordeones por ficha (ya contemplado a nivel de UI).
* **Aceptación:** cada ayuda citada contiene todos los campos de la plantilla; si un campo no existe → “N/D”.

## 4) Tuning del Retriever con el perfil

**Objetivo:** subir precisión y relevancia.

* **Acciones:**

  * **Boost temático**: si objetivo incluye “digitalización”, priorizar docs con subtema Digitalización; si “internacionalización”, priorizar Internacionalización, etc.
  * **Filtro por tamaño**: excluir ayudas explícitas para “gran empresa” cuando la empresa es pyme, y viceversa si procede.
  * **Penalizar ruido**: bajar score a páginas genéricas sin ficha oficial.
* **Aceptación:** mayor ratio de clic en “Fuentes” y menos fallback por RAG vacío.

## 5) Observabilidad y telemetría de calidad

**Objetivo:** medir utilidad y detectar cuellos de botella.

* **Eventos:** consultas, tiempo de retriever y LLM, motivos de fallback, fuentes usadas, fichas renderizadas.
* **KPIs:** % de respuestas con fuentes, % de fallbacks, tiempo p95, CTR en enlaces, satisfacción (reacción del usuario si se añade).
* **Aceptación:** panel básico de métricas (interno) y logs agregados.

## 6) Memoria larga en Neon (auditoría y reporting)

**Objetivo:** traza completa del uso y de la respuesta.

* **Persistir:**

  * Perfil de usuario asociado a `chatId` (y futuro `userId`).
  * Turnos completos (user/assistant), snapshot de chunks RAG, modelo usado, tiempos, y resultado (ok/fallback).
  * Resumen largo periódico (“distill”) para hilos extensos.
* **Consultas típicas (panel admin futuro):**

  * Qué ayudas se recomiendan más por sector/tamaño.
  * Fallbacks más comunes y sus causas.
  * Fuentes oficiales más citadas y rotas (404/actualizar índice).
* **Aceptación:** tablas y vistas listas para explotar desde el panel.

## 7) Panel admin (fase posterior)

**Objetivo:** gobernanza del agente y mejora continua.

* **Features:** búsqueda por `chatId`/rango fechas, re-play de turnos, KPIs, export CSV, health del índice, ver fuentes más usadas.
* **Roles:** lectura (auditoría) y mantenimiento (edición de guardarraíles/FAQ/plantillas de sistema).

## 8) Mantenimiento del índice RAG

**Objetivo:** que el contenido esté siempre vigente.

* **Tareas:**

  * Re-ingesta periódica (cron) de fuentes oficiales.
  * Detección de enlaces caídos/cambiados.
  * Versionado de fichas y trazabilidad (qué versión se usó en cada respuesta).
* **Aceptación:** índice libre de roturas y actualizado.

## 9) Calidad, evaluación y pruebas

**Objetivo:** asegurar consistencia antes de cambios.

* **Conjunto de pruebas:**

  * *Golden questions* por objetivo/sector/tamaño.
  * Casos de borde (sin resultados, duplicados, enlaces rotos).
  * Non-regression en formato de “Fichas completas”.
* **Aceptación:** checklist verde antes de cada despliegue.

## 10) Configuración, seguridad y cumplimiento

**Objetivo:** robustez operativa.

* **Config:** timeouts (LLM/Retriever), top-K, toggles (guardarraíles/onboarding).
* **Seguridad:** sanitizar URLs, CORS, rate-limit (ya en uso), protección ante prompt-injection en chunks.
* **Cumplimiento:** trazabilidad de fuentes oficiales, descargo al usuario, accesibilidad (acordeones navegables), i18n (ES/EU si aplica).

---

## Secuencia recomendada (sin estimar tiempos)

1. **Guardarraíles + Intro guiada**
2. **Salida estructurada de fichas**
3. **Tuning Retriever con perfil**
4. **Telemetría + memoria larga Neon**
5. **Mantenimiento índice + suite de evaluación**
6. **Panel admin (lectura) y, después, edición de reglas**

---
