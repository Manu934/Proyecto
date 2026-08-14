import iaService from "../services/ia.service.js";
import Prueba from "../models/Prueba.js";
import Conversacion from "../models/Conversacion.js";
import { LIMITE_DIARIO, usoUltimas24hs, registrarUso } from "../models/IaUso.js";

// POST /api/ia — contrato que usa el front hoy: manda la conversación entera
// ({ mensajes, contexto, prueba_id, conversacion_id }) y espera { reply, conversacion_id }.
// El historial se guarda solo (como en Claude/ChatGPT): cada chat queda en
// "conversaciones" + "mensajes_ia", listo para retomarlo después.
export const chat = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;

    const usados = await usoUltimas24hs(usuarioId);
    if (usados >= LIMITE_DIARIO) {
      return res.status(429).json({
        ok: false,
        message: `Alcanzaste el límite de ${LIMITE_DIARIO} preguntas a la IA por día. Probá de nuevo más tarde.`,
      });
    }

    const { mensajes, contexto, prueba_id: pruebaIdRaw, conversacion_id: conversacionIdRaw } = req.body;

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

    // El último mensaje del array es siempre el que el estudiante acaba de
    // escribir: el resto ya está guardado de vueltas anteriores.
    const nuevoMensaje = limpios[limpios.length - 1];

    let conversacionId = Number(conversacionIdRaw);
    const esConversacionNueva = !Number.isInteger(conversacionId) || conversacionId <= 0;

    if (esConversacionNueva) {
      conversacionId = await Conversacion.crear({
        usuarioId,
        pruebaId: prueba?.id ?? null,
        contexto: contexto || {},
        primerMensaje: nuevoMensaje.content,
      });
    } else if (!(await Conversacion.perteneceA(conversacionId, usuarioId))) {
      return res.status(404).json({ ok: false, message: "Conversación no encontrada" });
    }

    await Conversacion.agregarMensaje(conversacionId, "user", nuevoMensaje.content);

    const reply = await iaService.chat({ mensajes: limpios, contexto: contexto || {}, prueba });

    await Conversacion.agregarMensaje(conversacionId, "assistant", reply);

    // Se cuenta recién si la IA respondió bien: un error nuestro o de la API
    // no debería gastarle cupo al estudiante.
    await registrarUso(usuarioId);

    res.json({ ok: true, reply, conversacion_id: conversacionId, usados: usados + 1, limite: LIMITE_DIARIO });
  } catch (error) {
    // Log completo del lado del server: si esto se repite seguido, acá queda
    // el detalle técnico para diagnosticarlo sin depender de lo que ve el usuario.
    console.error("Error en /api/ia:", error.status ?? "", error.message);

    // Un 5xx de NVIDIA es un problema transitorio de ellos (su motor de
    // inferencia se cae de vez en cuando en el free tier), no algo que el
    // estudiante pueda solucionar reformulando la pregunta.
    const esErrorTransitorioDeNvidia = typeof error.status === "number" && error.status >= 500;
    const message = esErrorTransitorioDeNvidia
      ? "La IA tuvo un problema momentáneo respondiendo (no es un error tuyo). Probá de nuevo en unos segundos."
      : `No se pudo contactar a la IA: ${error.message}`;

    res.status(502).json({ ok: false, message });
  }
};

// GET /api/ia/conversaciones — lista de chats del usuario, más nuevo primero.
export const listarConversaciones = async (req, res) => {
  try {
    const conversaciones = await Conversacion.listarDeUsuario(req.usuario.id);
    res.json({ ok: true, data: conversaciones });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error al listar conversaciones", error: error.message });
  }
};

// GET /api/ia/conversaciones/:id — un chat completo con todos sus mensajes.
export const obtenerConversacion = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, message: "Conversación inválida" });
    }
    const conversacion = await Conversacion.obtenerConMensajes(id, req.usuario.id);
    if (!conversacion) {
      return res.status(404).json({ ok: false, message: "Conversación no encontrada" });
    }
    res.json({ ok: true, data: conversacion });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error al obtener la conversación", error: error.message });
  }
};

// DELETE /api/ia/conversaciones/:id
export const eliminarConversacion = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, message: "Conversación inválida" });
    }
    const borrada = await Conversacion.eliminar(id, req.usuario.id);
    if (!borrada) {
      return res.status(404).json({ ok: false, message: "Conversación no encontrada" });
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error al eliminar la conversación", error: error.message });
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