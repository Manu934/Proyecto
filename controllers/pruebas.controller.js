import fs from "fs";
import Prueba from "../models/Prueba.js";
import pool from "../config/db.js";

// Borra un archivo ya subido cuando el request termina en error, para no dejar
// huérfanos en uploads/ que nadie referencia.
const descartarArchivo = (file) => {
  if (file?.path) fs.unlink(file.path, () => {});
};

export const getPruebas = async (req, res) => {
  try {
    const pruebas = await Prueba.getAll(req.query);
    res.json({ ok: true, data: pruebas });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error al obtener pruebas", error: error.message });
  }
};

export const getPruebaById = async (req, res) => {
  try {
    const prueba = await Prueba.getById(req.params.id);
    if (!prueba) return res.status(404).json({ ok: false, message: "Prueba no encontrada" });
    res.json({ ok: true, data: prueba });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error al obtener la prueba", error: error.message });
  }
};

export const createPrueba = async (req, res) => {
  try {
    const colegio  = req.body.colegio  || req.body.escuela  || "";
    const año      = req.body.año      || req.body.anio     || "";
    const materia  = req.body.materia  || "";
    const profesor = req.body.profesor || "";
    const tema     = req.body.tema     || "";
    const notas    = req.body.notas    || "";
    const usuario_nombre = req.body.usuario_nombre || "";
    const usuario_email  = req.body.usuario_email  || "";
    const usuario_id     = req.body.usuario_id ? Number(req.body.usuario_id) : null;

    if (!materia || !año || !colegio) {
      // multer ya escribió el archivo en disco: si no seguimos, hay que borrarlo.
      descartarArchivo(req.file);
      return res.status(400).json({ ok: false, message: "Faltan campos obligatorios (materia, año, colegio)" });
    }

    const titulo = req.body.titulo || `${materia}${tema ? ` - ${tema}` : ""} (${colegio} ${año})`;

    let contenido = { notas, usuario_id, usuario_nombre, usuario_email };
    if (req.body.contenido) {
      try {
        contenido = typeof req.body.contenido === "string"
          ? JSON.parse(req.body.contenido)
          : req.body.contenido;
      } catch {
        descartarArchivo(req.file);
        return res.status(400).json({ ok: false, message: "El campo contenido no es JSON válido" });
      }
    }

    // Va aparte del if de arriba: mandar contenido y archivo a la vez es válido
    // y antes el archivo se perdía silenciosamente.
    if (req.file) {
      const f = req.file;
      contenido.archivo_url    = `/uploads/${f.filename}`;
      contenido.archivo_nombre = f.originalname;
      contenido.archivo_tipo   = f.mimetype.includes("pdf") ? "pdf"
        : f.mimetype.startsWith("image") ? "image" : "doc";
    }

    const id = await Prueba.create({
      titulo, materia, anio: año, profesor, tema, escuela: colegio, contenido,
    });
    res.status(201).json({ ok: true, message: "Prueba enviada para revisión", id });
  } catch (error) {
    descartarArchivo(req.file);
    res.status(500).json({ ok: false, message: "Error al crear la prueba", error: error.message });
  }
};

export const deletePrueba = async (req, res) => {
  try {
    const filas = await Prueba.delete(req.params.id);
    if (!filas) return res.status(404).json({ ok: false, message: "Prueba no encontrada" });
    res.json({ ok: true, message: "Prueba eliminada" });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error al eliminar", error: error.message });
  }
};

export const toggleFavorito = async (req, res) => {
  try {
    const prueba_id  = req.params.id;
    const usuario_id = req.usuario.id;
    const existing = await pool.query(
      "SELECT id FROM favoritos WHERE prueba_id = $1 AND usuario_id = $2",
      [prueba_id, usuario_id]
    );
    let favorito;
    if (existing.rows.length > 0) {
      await pool.query(
        "DELETE FROM favoritos WHERE prueba_id = $1 AND usuario_id = $2",
        [prueba_id, usuario_id]
      );
      favorito = false;
    } else {
      await pool.query(
        "INSERT INTO favoritos (prueba_id, usuario_id) VALUES ($1, $2)",
        [prueba_id, usuario_id]
      );
      favorito = true;
    }
    res.json({ ok: true, favorito });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error al guardar favorito", error: error.message });
  }
};
