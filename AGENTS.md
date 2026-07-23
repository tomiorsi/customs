# Guía para agentes de IA — Estudio de Despachantes

Este archivo es el **punto de entrada** cuando trabajás en este repositorio sin supervisión constante del usuario. Leé esto primero; después las reglas en `.cursor/rules/`.

## Qué es este proyecto

**Plataforma de control documental y operativo para un estudio aduanero (despachante de aduana) en Argentina.**

No es solo una web bonita: es un sistema que **controla que cada operación de comercio exterior esté completa, coherente y legal** antes de avanzar.

| Actor | Portal | Qué hace |
|-------|--------|----------|
| **Admin / operadores** | `/admin` | Ven todos los clientes; mesa de trabajo; checklist; clasificación NCM; cruce de documentos |
| **Cliente** (importador/exportador) | `/inicio` | Abre operaciones, sube documentos, ve estado y cotización |

**Objetivo de negocio:** que el estudio pueda seguir cada carpeta (impo/expo) de punta a punta — documentos, NCM, intervenciones, tributos, logística — con la IA leyendo PDFs, cruzando fuentes y alertando inconsistencias. El humano decide; la plataforma **controla y no deja pasar cosas mal armadas**.

## Stack técnico

- **Frontend/API:** Next.js 16, React 19, TypeScript, Tailwind v4
- **Auth/DB usuarios:** SQLite (`data/app.db`) — solo usuarios y sesiones
- **Datos de operaciones:** Parquet por cliente en `data/clientes/<id>/`
- **PDFs:** lectura embebida (Node) + OCR/render (Python: PyMuPDF, EasyOCR en `.venv`)
- **IA:** Anthropic (clasificación NCM, lectura documentos, validación legal)
- **Arranque local:** `python3 run.py` → `http://localhost:3000`

## Mapa rápido del código

```
src/app/                    # Rutas Next (admin, inicio, api)
src/lib/
  clasificador/             # Pipeline NCM (Fases 1–3, motor parquet, IA)
  ia-extraccion.ts          # Lectura + interpretación de documentos
  pdf-preparar.ts           # Puente Node → scripts Python
  resolucion-documentos.ts  # Reconciliación y cruce multi-doc
  workflow.ts               # Etapas reales de una operación (guía operador)
  parquet-store.ts          # Persistencia operaciones/documentos
  db.ts                     # SQLite usuarios/sesiones
scripts/                    # Python (pdf_texto, pdf_imagenes, build nomenclatura)
docs/                       # Marco de dominio aduanero (NCM, valoración, VUCE…)
data/                       # NO en git: DB, clientes, nomenclatura, modelos OCR
```

## Pipeline mental (todo el sistema)

```
Documento subido
  → lectura real (texto embebido u OCR)
  → extracción estructurada (IA)
  → caché por archivo
  → cruce con otros docs + datos de la operación
  → checklist / requisitos / alertas
  → UI refleja el resultado (no al revés)

Clasificación NCM (línea de factura)
  → HECHOS (descripción + respuestas importador)
  → menú candidatos desde parquet (motor.ts)
  → IA cruza con marco legal RGI (principios-clasificacion.ts)
  → cierre o preguntas al importador
```

**Regla de oro:** todas las etapas que juzgan lo mismo deben ver **el mismo contexto**. Ver `.cursor/rules/motor-ia-global.mdc`.

## Cómo trabajar acá (resumen)

1. **Entender antes de tocar** — leé el módulo relacionado y trazá el pipeline de punta a punta.
2. **Fix global, no parche de muestra** — un bug con un PDF/ejemplo implica arreglar el flujo para inputs equivalentes.
3. **Código orquesta; IA razona** — no reemplazar dominio aduanero con `if (tipo === X)` ni keywords mágicas.
4. **Cambio mínimo** — no refactorizar de más ni tocar archivos no relacionados.
5. **Verificar con 2 casos** — el reportado y otro distinto del mismo pipeline.
6. **Preguntar antes** si la tarea implica algo de la lista en `.cursor/rules/archivos-sensibles.mdc`.
7. **No commitear ni pushear** salvo que el usuario lo pida explícitamente.

## Reglas Cursor (siempre leer)

| Archivo | Contenido |
|---------|-----------|
| `motor-ia-global.mdc` | Principios del pipeline IA — **ya existe, obligatorio** |
| `proyecto-objetivo.mdc` | Misión, usuarios, qué significa “control” |
| `arquitectura.mdc` | Carpetas, datos, rutas API, dependencias |
| `como-trabajar.mdc` | Protocolo paso a paso para cada tarea |
| `archivos-sensibles.mdc` | Qué no tocar sin preguntar |
| `clasificador-ncm.mdc` | Capas del clasificador arancelario |
| `pipeline-documentos.mdc` | Lectura PDF, extracción, cruce y validación |

## Documentación de dominio

- `docs/clasificacion-ncm.md` — RGI, cómo usa el sistema la NCM
- `docs/valoracion-aduanera.md` — CIF, valor en aduana
- `docs/intervenciones-certificados.md` — organismos, certificados
- `docs/regimen-origen-mercosur.md` — origen, acuerdos
- `docs/retiro-bl-logistica.md` — BL, embarque, logística

## Benchmarks y pruebas

- `scripts/benchmark-ia-ncm.mjs` — clasificador NCM
- `scripts/benchmark-motor-partidas.mjs` — motor parquet
- `scripts/benchmark_pdf_texto.py` — extracción PDF
- Fixtures en `scripts/fixtures/` — **no editar para “hacer pasar” un caso**; son regresión

## Agente supervisor

Existe `.cursor/agents/supervisor-cambios.md` para revisar diffs y bloquear parches locales. Después de cambios grandes en clasificador o IA, conviene invocarlo.

## Checklist antes de dar por terminado

- [ ] ¿Entendí qué etapa del pipeline toca mi cambio?
- [ ] ¿El fix aplica a un segundo caso distinto?
- [ ] ¿Evité ramas `if (tipo/país/caso)` que no sean dinámicas por operación?
- [ ] ¿La UI solo muestra lo que el pipeline ya resolvió?
- [ ] ¿Corrí lint o el benchmark relevante si toqué esa área?
- [ ] ¿Pregunté al usuario si iba a tocar algo sensible?
