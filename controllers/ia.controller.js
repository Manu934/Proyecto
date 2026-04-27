import geminiService from "../services/gemini.service.js";
import Prueba from "../models/Prueba.js";

export const preguntarSobrePrueba = async (req, res) => {
  try {
    const { id } = req.params;
    const { pregunta } = req.body;

    if (!pregunta) {
      return res.status(400).json({ ok: false, message: "Falta la pregunta" });
    }

    const prueba = await Prueba.getById(id);
    if (!prueba) {
      return res.status(404).json({ ok: false, message: "Prueba no encontrada" });
    }

    const respuesta = await geminiService.askWithContext(pregunta, prueba);
    res.json({ ok: true, respuesta });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error con la IA", error: error.message });
  }
};

export const generarPrueba = async (req, res) => {
  try {
    const prueba = await Prueba.getById(req.params.id);
    if (!prueba) {
      return res.status(404).json({ ok: false, message: "Prueba no encontrada" });
    }

    const nuevaPrueba = await geminiService.generarPrueba(prueba);
    res.json({ ok: true, prueba: nuevaPrueba });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error generando prueba", error: error.message });
  }
};