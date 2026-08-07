import iaService from "../services/ia.service.js";
import Prueba from "../models/Prueba.js";

// POST /api/ia — contrato que usa el front hoy: manda la conversación entera
// ({ mensajes, contexto, prueba_id }) y espera { reply }.
export const chat = async (req, res) => {
  try {
    const { mensajes, contexto, prueba_id: pruebaIdRaw } = req.body;

    const limpios = (Array.isArray(mensajes) ? mensajes : [])
      .filter((m) => typeof m?.content === "string" && m.content.trim())
      .slice(-20); // últimas vueltas nomás: alcanza y no infla el pedido

    if (limpios.length === 0) {
      return res.status(400).json({ ok: false, message: "No hay ningún mensaje para responder" });
    }

    const pruebaId = Number(pruebaIdRaw);
    let prueba = null;
    if (Number.isInteger(pruebaId) && pruebaId > 0) {
      prueba = await Prueba.getById(pruebaId);
    }

    const reply = await iaService.chat({ mensajes: limpios, contexto: contexto || {}, prueba });
    res.json({ ok: true, reply });
  } catch (error) {
    res.status(502).json({ ok: false, message: `No se pudo contactar a la IA: ${error.message}` });
  }
};

// Chat libre desde /ia sin una prueba puntual: usa el contexto elegido a mano.
export const preguntarLibre = async (req, res) => {
  try {
    const { pregunta, contexto } = req.body;

    if (!pregunta) {
      return res.status(400).json({ ok: false, message: "Falta la pregunta" });
    }

    const respuesta = await iaService.askFreeform(pregunta, contexto);
    res.json({ ok: true, respuesta });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error con la IA", error: error.message });
  }
};

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

    const respuesta = await iaService.askWithContext(pregunta, prueba);
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

    const nuevaPrueba = await iaService.generarPrueba(prueba);
    res.json({ ok: true, prueba: nuevaPrueba });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error generando prueba", error: error.message });
  }
};