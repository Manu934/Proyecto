# AGENTS.md

Contexto para agentes de IA que trabajen en este repo.

## Qué es el proyecto

API REST de "tuspruebas": los estudiantes de secundarios de Argentina suben pruebas
escolares (foto, PDF o texto), un admin las aprueba, y una IA responde preguntas
sobre ellas y genera pruebas nuevas similares para practicar.

## Stack

- **Node 22 + Express 5**, ESM puro (`"type": "module"` en package.json) — usá
  `import`, no `require`.
- **PostgreSQL** en Neon (serverless), vía `pg`. No hay ORM ni migraciones: el
  schema se administra a mano.
- **IA**: NVIDIA NIM a través del SDK `openai` (la API de NVIDIA es compatible con
  la de OpenAI). No usar `@google/generative-ai`, se migró desde Gemini.
- **Auth**: JWT propio + Google OAuth con passport.
- **Uploads**: multer a disco local en `uploads/`.

## Comandos

```bash
npm run dev     # nodemon
npm start       # node server.js
```

No hay tests ni linter configurados. Para verificar un cambio, levantá el servidor
y pegále con `curl` (ver "Cómo probar" abajo).

## Estructura

```
server.js               # entrypoint, monta rutas, valida el .env al arranque
config/db.js            # pool de pg
config/multer.js        # subida de archivos (10MB, pdf/jpeg/png/doc/docx)
config/passport.js      # estrategia de Google OAuth
routes/*.routes.js      # solo routing, sin lógica
controllers/*.js        # validación + respuesta HTTP
models/Prueba.js        # queries SQL de pruebas + mapRow()
models/Usuario.js       # queries SQL de usuarios
services/ia.service.js  # todo lo que toca la API de NVIDIA
public/api-tester.html  # tester de endpoints, servido en /api-tester.html
```

Base de datos: tablas `pruebas`, `usuarios`, `favoritos`.
Los estados de una prueba son `pendiente` / `aprobada` / `rechazada`.

## La capa de IA

Todo vive en [services/ia.service.js](services/ia.service.js). Expone dos funciones,
`askWithContext(pregunta, prueba)` y `generarPrueba(prueba)`.

Si la prueba tiene una foto (`contenido.archivo_tipo === "image"`), el servicio la
lee del disco, la manda en base64 y usa el modelo de visión. Si no, usa el de texto.

Modelos por defecto (todos configurables por `.env`):

| Variable | Default | Para qué |
|---|---|---|
| `NVIDIA_MODEL_CHAT` | `meta/llama-3.1-8b-instruct` | responder preguntas |
| `NVIDIA_MODEL_GENERACION` | `meta/llama-3.1-8b-instruct` | generar pruebas nuevas |
| `NVIDIA_MODEL_VISION` | `nvidia/nemotron-nano-12b-v2-vl` | leer fotos de pruebas |

### Por qué modelos chicos

**El free tier de NVIDIA tiene los modelos grandes saturados.** Medido en agosto 2026
con el mismo prompt:

| Modelo | Latencia |
|---|---|
| `meta/llama-3.1-8b-instruct` | 2-8 s |
| `meta/llama-3.3-70b-instruct` | 36-49 s (y hasta 176 s generando) |
| `nvidia/llama-3.3-nemotron-super-49b-v1.5` | 56 s, y gasta los tokens en `reasoning_content` dejando `content` vacío |
| `gemma-4-31b`, `mistral-medium-3.5`, `gpt-oss-20b` | timeout a los 60 s |

El 8B con un prompt bien escrito le gana al 70B en la práctica. No cambies a un
modelo grande sin medir la latencia primero.

**Verificá siempre los IDs contra la API antes de usarlos** — el catálogo de la web
lista modelos que ya están dados de baja. `qwen/qwen3-next-80b-a3b-instruct` devuelve
`410 Gone` (EOL 27/07/2026).

```bash
curl -s https://integrate.api.nvidia.com/v1/models \
  -H "Authorization: Bearer $NVIDIA_API_KEY" | node -pe \
  "JSON.parse(require('fs').readFileSync(0,'utf8')).data.map(m=>m.id).join('\n')"
```

### Datos personales

`contenido` en la base suele traer `usuario_id`, `usuario_nombre` y `usuario_email`.
El servicio los filtra (`CAMPOS_PRIVADOS`) antes de armar el prompt: son datos de
estudiantes y no tienen por qué salir hacia un tercero. **Si agregás campos nuevos al
jsonb, fijate si hay que sumarlos a esa lista.**

## Trampas conocidas

**`mapRow()` en [models/Prueba.js](models/Prueba.js) aplana `contenido`.** Devuelve
`archivo_url`, `archivo_tipo`, `notas` como campos de primer nivel, y además el jsonb
entero en `contenido`. Ese último campo se agregó porque antes se descartaba y la IA
recibía `Contenido: undefined` en el prompt — nunca veía el contenido de ninguna
prueba. Si tocás `mapRow`, no lo saques.

**En Windows, `pkill -f "node server.js"` desde Git Bash no mata nada.** El servidor
viejo queda corriendo con el código en memoria y vas a debuggear cambios que no están
aplicados. Usá PowerShell:

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

Si un cambio "no tiene efecto", verificá primero que el proceso arrancó después de que
guardaste el archivo (`CreationDate` del proceso vs `LastWriteTime` del archivo).

**El `api-tester.html` apunta a `/api/ia/1/preguntar` y la prueba `id=1` no existe.**
Los IDs arrancan en 7. Si no lo cambiás, te da `404 Prueba no encontrada` y parece que
la IA está rota.

**El api-tester manda solo JSON, no tiene selector de archivos.** Para probar subida de
fotos hay que usar `curl` con `-F`.

**Las rutas de IA no tienen middleware de auth**, aunque el tester las marque con
`auth:true`. No hace falta token.

## Cómo probar

```bash
# preguntar sobre una prueba
curl -X POST http://localhost:3000/api/ia/7/preguntar \
  -H "Content-Type: application/json" \
  -d '{"pregunta":"Como resuelvo el ejercicio 1?"}'

# generar una prueba nueva
curl -X POST http://localhost:3000/api/ia/7/generar

# subir una foto (campo multipart: archivo)
curl -X POST http://localhost:3000/api/pruebas \
  -F "materia=Matematica" -F "año=3er año" -F "colegio=ORT Almagro" \
  -F "archivo=@foto.png;type=image/png"
```

Si creás pruebas de test, borralas después: van a la base de producción de Neon, no
hay entorno separado.

## Secretos

`.env` **no** está trackeado (se sacó con `git rm --cached`). `.env.example` tiene la
lista de variables sin valores.

La key de Gemini original quedó en el historial de git y Google la revocó por eso
(`403 Your API key was reported as leaked`). No commitees el `.env` de nuevo.

`server.js` valida al arranque que estén `DATABASE_URL`, `JWT_SECRET` y
`NVIDIA_API_KEY`, y que el JWT_SECRET tenga 32+ caracteres. Falla rápido y con mensaje
claro en vez de romper en medio de un request.

`node_modules/` también se sacó del tracking. Está en `.gitignore` junto con `.env` y
`*.log`.

## Convenciones

- Nombres de dominio en español (`prueba`, `materia`, `anio`, `escuela`, `contenido`).
  `createPrueba` acepta tanto `anio` como `año`, y tanto `escuela` como `colegio`.
- Respuestas de la API siempre con la forma `{ ok: true, ... }` / `{ ok: false, message, error }`.
- Controllers con `try/catch` que devuelven 500 con `error.message`.
- Comentarios en español, y solo donde el "por qué" no se deduce del código.
- Si un request con archivo falla, borrá el archivo que multer ya escribió
  (`descartarArchivo` en [controllers/pruebas.controller.js](controllers/pruebas.controller.js))
  o se acumulan huérfanos en `uploads/`.

## Pendientes conocidos

- El campo `contenido` es un jsonb sin forma fija. En la mayoría de las pruebas
  cargadas guarda metadata del usuario en vez de los ejercicios, así que la IA no
  tiene mucho con qué trabajar salvo que haya foto. Habría que definir un shape.
- `uploads/` es disco local: no sobrevive a un deploy en Render/Railway/Vercel.
  Para producción hace falta S3, Cloudinary o similar.
- No hay tests.
