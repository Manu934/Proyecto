import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const geminiService = {

  
  askWithContext: async (pregunta, prueba) => {
    const prompt = `
      Sos un asistente educativo especializado en ayudar a estudiantes 
      de colegios secundarios de Argentina.

      Tenés acceso a la siguiente prueba escolar:
      - Título: ${prueba.titulo}
      - Materia: ${prueba.materia}
      - Año: ${prueba.anio}
      - Escuela: ${prueba.escuela}
      - Tema: ${prueba.tema}
      - Contenido: ${JSON.stringify(prueba.contenido)}

      El estudiante pregunta: "${pregunta}"

      Respondé de forma clara, paso a paso si es necesario, 
      y siempre orientado al nivel secundario argentino.
    `;

    const result = await model.generateContent(prompt);
    return result.response.text();
  },

  // Genera una nueva prueba similar a la existente
  generarPrueba: async (prueba) => {
    const prompt = `
      Basándote en esta prueba escolar:
      - Materia: ${prueba.materia}
      - Año: ${prueba.anio}
      - Tema: ${prueba.tema}
      - Contenido original: ${JSON.stringify(prueba.contenido)}

      Generá una prueba nueva y diferente sobre el mismo tema, 
      con el mismo nivel de dificultad y formato similar.
      Respondé solo con el contenido de la prueba, sin explicaciones adicionales.
    `;

    const result = await model.generateContent(prompt);
    return result.response.text();
  },
};

export default geminiService;