import fs from "fs";
import { fileURLToPath } from "url";
import { basename, dirname, extname, join } from "path";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

// NVIDIA NIM expone una API compatible con la de OpenAI, por eso usamos ese SDK.
// Timeout corto y poco reintento a propósito: si NVIDIA está caída del todo,
// preferimos pasar rápido al respaldo de Gemini en vez de que el estudiante
// espere varios minutos antes de que el backend ni siquiera lo intente.
const client = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: "https://integrate.api.nvidia.com/v1",
  timeout: 20000,
  maxRetries: 1,
});

// Modelos chicos y rápidos (~2-5 s). Los modelos grandes del free tier de NVIDIA
// están saturados y tardan entre 40 s y 3 minutos, así que no sirven acá.
const MODEL_CHAT = process.env.NVIDIA_MODEL_CHAT || "meta/llama-3.1-8b-instruct";
const MODEL_GENERACION = process.env.NVIDIA_MODEL_GENERACION || "meta/llama-3.1-8b-instruct";
// Cuando la prueba es una foto, este modelo la lee directamente. Es el más
// inestable del free tier de NVIDIA (se cae seguido con fotos grandes/reales),
// por eso tiene respaldo en Gemini más abajo.
const MODEL_VISION = process.env.NVIDIA_MODEL_VISION || "nvidia/nemotron-nano-12b-v2-vl";

// Respaldo cuando NVIDIA falla: mismo proveedor que ya usa el front en
// producción (Vercel), así el chat no corta en seco solo porque el free tier
// de NVIDIA tuvo un mal momento.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

const UPLOADS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "uploads");

const SYSTEM_PROMPT = `Sos un asistente educativo especializado en ayudar a estudiantes
de colegios secundarios de Argentina. Respondés siempre en español rioplatense,
de forma clara y adaptada al nivel secundario.`;

// Datos personales de quien subió la prueba: no aportan nada al modelo y no
// tienen por qué salir hacia la API de NVIDIA.
const CAMPOS_PRIVADOS = ["usuario_id", "usuario_nombre", "usuario_email"];

const contenidoParaPrompt = (contenido) => {
  if (!contenido || typeof contenido !== "object") return contenido;
  const limpio = { ...contenido };
  for (const campo of CAMPOS_PRIVADOS) delete limpio[campo];
  return limpio;
};

// Devuelve la foto de la prueba como data URI, o null si no hay imagen.
const cargarImagen = (contenido) => {
  if (contenido?.archivo_tipo !== "image" || !contenido.archivo_url) return null;

  // Subida actual del front: la foto viaja comprimida y en base64 (data URL)
  // directo dentro de contenido.archivo_url, nunca toca el disco del server.
  if (contenido.archivo_url.startsWith("data:")) return contenido.archivo_url;

  // Subida vieja vía multer: archivo_url es "/uploads/<nombre>". Nos quedamos
  // solo con el nombre: si no, un valor tipo "/uploads/../../.env" leería
  // archivos fuera de la carpeta.
  const ruta = join(UPLOADS_DIR, basename(contenido.archivo_url));
  if (!fs.existsSync(ruta)) return null;

  const mime = extname(ruta).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${fs.readFileSync(ruta).toString("base64")}`;
};

// Convierte nuestros mensajes estilo OpenAI (role/content, content puede ser
// string o [{type:"text"|"image_url", ...}]) al formato de Gemini.
const mensajesParaGemini = (messages) => {
  const systemMsg = messages.find((m) => m.role === "system");
  const resto = messages.filter((m) => m.role !== "system");

  const contents = resto.map((m) => {
    const role = m.role === "assistant" ? "model" : "user";
    if (!Array.isArray(m.content)) return { role, parts: [{ text: m.content }] };

    const parts = m.content.map((parte) => {
      if (parte.type === "image_url") {
        const match = /^data:([^;,]+);base64,([\s\S]*)$/.exec(parte.image_url?.url || "");
        if (match) return { inlineData: { mimeType: match[1], data: match[2] } };
        return { text: "" };
      }
      return { text: parte.text || "" };
    });
    return { role, parts };
  });

  return { systemInstruction: systemMsg ? { parts: [{ text: systemMsg.content }] } : undefined, contents };
};

const llamarGemini = async (messages, { maxTokens, temperature = 0.6 }) => {
  if (!GEMINI_API_KEY) {
    throw new Error("Gemini no está configurado (falta GEMINI_API_KEY)");
  }

  const { systemInstruction, contents } = mensajesParaGemini(messages);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(systemInstruction ? { systemInstruction } : {}),
        contents,
        generationConfig: { temperature, maxOutputTokens: maxTokens },
      }),
      signal: AbortSignal.timeout(60000),
    }
  );

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error?.message || `Gemini respondió ${res.status}`);
  }

  const texto = data?.candidates?.[0]?.content?.parts
    ?.map((p) => p.text || "")
    .join("")
    .trim();
  if (!texto) throw new Error("Gemini devolvió una respuesta vacía");
  return texto;
};

// Si NVIDIA falló hace poco con este modelo, nos salteamos el intento (que de
// todos modos iba a tardar y fallar igual) y vamos directo a Gemini. Sin esto,
// cada pregunta pierde 20-40s reintentando NVIDIA mientras dura una caída.
// Es memoria en RAM del proceso (no en la base): se resetea solo al reiniciar
// el server, y con un modelo por vez, no mezcla "NVIDIA anda mal" entre el
// chat de texto y el de visión si solo uno de los dos está fallando.
const NVIDIA_COOLDOWN_MS = 3 * 60 * 1000;
const nvidiaCooldownHasta = new Map();

// Punto único de llamada al modelo: intenta NVIDIA primero (que ya tiene sus
// propios reintentos por dentro vía el SDK) y, si igual falla, reintenta una
// vez con Gemini antes de rendirse. Así el chat casi nunca corta en seco solo
// porque el free tier de NVIDIA tuvo un mal momento.
const completarMensajes = async (model, messages, { maxTokens, temperature = 0.6 }) => {
  const enCooldown = (nvidiaCooldownHasta.get(model) || 0) > Date.now();
  let errorNvidia;

  if (!enCooldown) {
    try {
      const completion = await client.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      });
      const texto = completion.choices[0]?.message?.content?.trim();
      if (!texto) throw new Error(`El modelo ${model} devolvió una respuesta vacía`);
      nvidiaCooldownHasta.delete(model); // se recuperó: sacamos el cooldown si había uno
      return texto;
    } catch (e) {
      errorNvidia = e;
      nvidiaCooldownHasta.set(model, Date.now() + NVIDIA_COOLDOWN_MS);
    }
  } else {
    console.log(`NVIDIA (${model}) sigue en cooldown tras una falla reciente: salto directo a Gemini.`);
    errorNvidia = new Error(`NVIDIA (${model}) no disponible (cooldown tras falla reciente)`);
  }

  if (!GEMINI_API_KEY) throw errorNvidia;

  // Un intento extra acá: Gemini también puede tener un momento de
  // saturación puntual, y ya que NVIDIA falló no vale la pena rendirse
  // por una sola mala pasada del respaldo.
  let errorGemini;
  for (let intento = 0; intento < 2; intento++) {
    try {
      return await llamarGemini(messages, { maxTokens, temperature });
    } catch (e) {
      errorGemini = e;
      if (intento === 0) await new Promise((r) => setTimeout(r, 1500));
    }
  }

  // Si los dos proveedores fallan, el error de NVIDIA es el que más dice
  // sobre qué pasó (Gemini es solo el respaldo).
  console.error("Gemini también falló como respaldo:", errorGemini.message);
  throw errorNvidia;
};

const completar = (model, userPrompt, { maxTokens, temperature = 0.6, imagen = null }) => {
  const content = imagen
    ? [
        { type: "text", text: userPrompt },
        { type: "image_url", image_url: { url: imagen } },
      ]
    : userPrompt;

  return completarMensajes(
    model,
    [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content }],
    { maxTokens, temperature }
  );
};

// Prompt de sistema para /api/ia (chat con historial completo). Separado del
// SYSTEM_PROMPT de arriba porque acá sí conviene describir el rol con más
// detalle: es la única ruta que arma una conversación de varias vueltas.
// Materias donde las respuestas suelen tener fórmulas/cálculos: ahí conviene
// el formato con LaTeX y pasos numerados. El chat ya sabe renderizar Markdown
// + LaTeX ($...$ en línea, $$...$$ en bloque), así que tiene sentido pedírselo.
const MATERIAS_CON_FORMULAS = new Set(["Matemática", "Física", "Química", "Físico-Química"]);

const construirSystemPrompt = (contexto = {}, prueba = null) => {
  const { colegio, año, materia, profesor, tema } = contexto;
  const contenido = prueba ? contenidoParaPrompt(prueba.contenido) || {} : {};
  const preguntas = typeof contenido.preguntas === "string" ? contenido.preguntas.trim() : "";
  const notas = typeof contenido.notas === "string" ? contenido.notas.trim() : "";
  const materiaEfectiva = prueba?.materia || materia || "";

  const partes = [
    SYSTEM_PROMPT,
    "",
    "CONTEXTO DEL ESTUDIANTE",
    `- Colegio: ${colegio || "No especificado"}`,
    `- Año: ${año || "No especificado"}`,
    `- Materia: ${materia || "No especificada"}`,
    `- Profesor/a: ${profesor || "No especificado"}`,
    `- Tema: ${tema || "No especificado"}`,
  ];

  if (MATERIAS_CON_FORMULAS.has(materiaEfectiva)) {
    partes.push(
      "",
      "CÓMO RESOLVÉS EJERCICIOS DE ESTA MATERIA",
      "El chat renderiza Markdown y LaTeX de verdad (no muestres el código, se ve como fórmula), " +
        "así que resolvé los ejercicios con esta estructura:",
      "1. Arrancá con un saludo corto, de tu propia redacción (no copies este renglón tal cual), " +
        "contando en una oración qué vas a resolver.",
      "2. Si hace falta, seguí con un recordatorio breve con la fórmula clave en bloque ($$...$$) " +
        "y una lista de qué es cada término.",
      "3. Después poné un separador (---), la consigna transcripta tal cual como cita (> ...), y otro separador.",
      "4. Seguí con un título \"### Resolución\" y, si hay varios incisos, un \"#### Parte a)\" por cada uno.",
      "5. Desarrollá pasos numerados (\"Paso 1:\", \"Paso 2:\"...), cada uno con una frase tuya " +
        "explicando qué hacés y la cuenta correspondiente en LaTeX: $...$ para algo en medio de una " +
        "oración, $$...$$ en línea aparte para desarrollos o el resultado de un paso.",
      "6. Cerrá con el resultado final en **negrita**.",
      "No hace falta este formato completo para preguntas cortas o conceptuales: usalo cuando " +
        "estés resolviendo un ejercicio de verdad."
    );
  }

  if (prueba) {
    partes.push(
      "",
      "PRUEBA QUE ESTÁ MIRANDO EL ESTUDIANTE",
      `- Tema: ${prueba.tema || "—"}`,
      `- Materia: ${prueba.materia || "—"}`,
      `- Colegio y año: ${prueba.escuela || "—"} · ${prueba.anio || "—"}`,
      `- Profesor/a: ${prueba.profesor || "—"}`
    );
    if (preguntas) partes.push("", "PREGUNTAS DE LA PRUEBA (transcriptas por quien la subió):", preguntas);
    if (notas) partes.push("", "NOTAS DE QUIEN LA SUBIÓ:", notas);
    partes.push(
      "",
      "Si además te adjuntan la foto de la prueba, leela con atención: transcribí cada " +
        "consigna antes de resolverla para no confundir números ni signos."
    );
  }

  return partes.join("\n");
};

const iaService = {

  // Chat con historial completo (POST /api/ia): así es como habla el front hoy.
  // Recibe la conversación entera, no solo la última pregunta, y arma un
  // system prompt más completo con la prueba (si hay una asociada).
  chat: async ({ mensajes, contexto = {}, prueba = null }) => {
    const imagen = prueba ? cargarImagen(prueba.contenido) : null;
    const systemPrompt = construirSystemPrompt(contexto, prueba);

    let fotoYaAdjuntada = false;
    const mensajesConvertidos = mensajes.map((m) => {
      const role = m.role === "assistant" ? "assistant" : "user";
      // La foto va sólo en el primer turno del usuario: alcanza para que el
      // modelo la tenga en cuenta el resto de la charla sin reenviarla cada vez.
      if (imagen && role === "user" && !fotoYaAdjuntada) {
        fotoYaAdjuntada = true;
        return {
          role,
          content: [
            { type: "text", text: m.content },
            { type: "image_url", image_url: { url: imagen } },
          ],
        };
      }
      return { role, content: m.content };
    });

    return completarMensajes(
      imagen ? MODEL_VISION : MODEL_CHAT,
      [{ role: "system", content: systemPrompt }, ...mensajesConvertidos],
      // Una resolución paso a paso con LaTeX (fórmulas de recordatorio +
      // consigna transcripta + varios pasos) puede necesitar bastante más
      // que 2048 tokens; con eso se cortaba a mitad de la respuesta.
      { maxTokens: 4096, temperature: 0.7 }
    );
  },

  // Pregunta libre: no hay una prueba guardada de por medio, solo el
  // contexto que el estudiante eligió a mano en el chat (materia, año, etc.).
  askFreeform: async (pregunta, contexto = {}) => {
    const { colegio, año, materia, profesor, tema } = contexto;

    const prompt = `
      Contexto del estudiante:
      - Colegio: ${colegio || "no especificado"}
      - Año: ${año || "no especificado"}
      - Materia: ${materia || "no especificada"}
      - Profesor/a: ${profesor || "no especificado"}
      - Tema: ${tema || "no especificado"}

      El estudiante pregunta: "${pregunta}"

      Respondé de forma clara, paso a paso si es necesario.
    `;

    return completar(MODEL_CHAT, prompt, { maxTokens: 1024 });
  },

  askWithContext: async (pregunta, prueba) => {
    const imagen = cargarImagen(prueba.contenido);

    const prompt = `
      Tenés acceso a la siguiente prueba escolar:
      - Título: ${prueba.titulo}
      - Materia: ${prueba.materia}
      - Año: ${prueba.anio}
      - Escuela: ${prueba.escuela}
      - Tema: ${prueba.tema}
      ${imagen
        ? "- La prueba es la foto adjunta: leela para responder."
        : `- Contenido: ${JSON.stringify(contenidoParaPrompt(prueba.contenido))}`}

      El estudiante pregunta: "${pregunta}"

      Respondé de forma clara, paso a paso si es necesario.
    `;

    return completar(imagen ? MODEL_VISION : MODEL_CHAT, prompt, { maxTokens: 1024, imagen });
  },

  // Genera una nueva prueba similar a la existente
  generarPrueba: async (prueba) => {
    const imagen = cargarImagen(prueba.contenido);

    // El formato de salida va explícito y al final: si no, el modelo tiende a
    // copiar la estructura del contexto (materia, año, tema) en vez de la prueba.
    const prompt = `
      Generá una prueba escolar NUEVA de ${prueba.materia} para ${prueba.anio}
      sobre el tema "${prueba.tema}".

      ${imagen
        ? "Los ejercicios de referencia están en la foto adjunta. Leelos y tomalos como referencia de dificultad y estilo, pero NO los repitas:"
        : `Tomá estos ejercicios como referencia de dificultad y estilo, pero NO los repitas:
      ${JSON.stringify(contenidoParaPrompt(prueba.contenido))}`}

      Formato de salida obligatorio: una lista numerada solo con los ejercicios nuevos.
      No repitas el enunciado de esta consigna ni agregues títulos, materia, año,
      resoluciones ni explicaciones.
    `;

    return completar(imagen ? MODEL_VISION : MODEL_GENERACION, prompt, {
      maxTokens: 2048,
      temperature: 0.8,
      imagen,
    });
  },
};

export default iaService;
