import Prueba from "../models/Prueba.js";

export const getPruebas = async (req, res) => {
  try {
    // Los filtros vienen como query params: /api/pruebas?materia=Matematica&anio=3
    const filtros = req.query;
    const pruebas = await Prueba.getAll(filtros);
    res.json({ ok: true, data: pruebas });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error al obtener pruebas", error: error.message });
  }
};

export const getPruebaById = async (req, res) => {
  try {
    const prueba = await Prueba.getById(req.params.id);
    if (!prueba) {
      return res.status(404).json({ ok: false, message: "Prueba no encontrada" });
    }
    res.json({ ok: true, data: prueba });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error al obtener la prueba", error: error.message });
  }
};

export const createPrueba = async (req, res) => {
  try {
    const { titulo, materia, anio, profesor, tema, escuela, contenido } = req.body;

    // Validación básica
    if (!titulo || !materia || !anio || !escuela) {
      return res.status(400).json({ ok: false, message: "Faltan campos obligatorios" });
    }

    const id = await Prueba.create({ titulo, materia, anio, profesor, tema, escuela, contenido });
    res.status(201).json({ ok: true, message: "Prueba enviada para revisión", id });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error al crear la prueba", error: error.message });
  }
};

export const deletePrueba = async (req, res) => {
  try {
    const filas = await Prueba.delete(req.params.id);
    if (!filas) {
      return res.status(404).json({ ok: false, message: "Prueba no encontrada" });
    }
    res.json({ ok: true, message: "Prueba eliminada" });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error al eliminar", error: error.message });
  }
};