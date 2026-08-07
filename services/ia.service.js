import fs from "fs";
import { fileURLToPath } from "url";
import { basename, dirname, extname, join } from "path";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

// NVIDIA NIM expone una API compatible con la de OpenAI, por eso usamos ese SDK.
const client = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: "https://integrate.api.nvidia.com/v1",
  timeout: 120000,
  maxRetries: 2,
});

// Modelos chicos y rápidos (~2-5 s). Los modelos grandes del free tier de NVIDIA
// están saturados y tardan entre 40 s y 3 minutos, así que no sirven acá.
const MODEL_CHAT = process.env.NVIDIA_MODEL_CHAT || "meta/llama-3.1-8b-instruct";
const MODEL_GENERACION = process.env.NVIDIA_MODEL_GENERACION || "meta/llama-3.1-8b-instruct";
// Cuando la prueba es una foto, este modelo la lee directamente.
const MODEL_VISION = process.env.NVIDIA_MODEL_VISION || "nvidia/nemotron-nano-12b-v2-vl";

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

const completar = async (model, userPrompt, { maxTokens, temperature = 0.6, imagen = null }) => {
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: imagen
          ? [
              { type: "text", text: userPrompt },
              { type: "image_url", image_url: { url: imagen } },
            ]
          : userPrompt,
      },
    ],
    temperature,
    max_tokens: maxTokens,
  });

  const texto = completion.choices[0]?.message?.content?.trim();
  if (!texto) {
    throw new Error(`El modelo ${model} devolvió una respuesta vacía`);
  }
  return texto;
};

const iaService = {

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
