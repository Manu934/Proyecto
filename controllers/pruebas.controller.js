import fs from "fs";
import Prueba from "../models/Prueba.js";
import pool from "../config/db.js";
import { ensureFavoritosTable } from "../models/Favorito.js";

// Borra un archivo ya subido cuando el request termina en error, para no dejar
// huérfanos en uploads/ que nadie referencia.
const descartarArchivo = (file) => {
  if (file?.path) fs.unlink(file.path, () => {});
};

export const getPruebas = async (req, res) => {
  try {
    const pruebas = await Prueba.getAll(req.query, req.usuario?.id ?? null);
    res.json({ ok: true, data: pruebas });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error al obtener pruebas", error: error.message });
  }
};

export const getPruebaById = async (req, res) => {
  try {
    const prueba = await Prueba.getById(req.params.id, req.usuario?.id ?? null);
    if (!prueba) return res.status(404).json({ ok: false, message: "Prueba no encontrada" });
    res.json({ ok: true, data: prueba });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error al obtener la prueba", error: error.message });
  }
};

// GET /api/pruebas/favoritos — las pruebas que el usuario logueado guardó.
export const getFavoritos = async (req, res) => {
  if (!req.usuario) return res.status(401).json({ ok: false, message: "No autenticado" });
  try {
    const pruebas = await Prueba.getFavoritos(req.usuario.id);
    res.json({ ok: true, data: pruebas });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error al obtener favoritos", error: error.message });
  }
};

// GET /api/pruebas/mis — todo lo que subió el usuario logueado.
export const getMisPruebas = async (req, res) => {
  if (!req.usuario) return res.status(401).json({ ok: false, message: "No autenticado" });
  try {
    const pruebas = await Prueba.getByUsuario(req.usuario.id);
    res.json({ ok: true, data: pruebas });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error al obtener tus pruebas", error: error.message });
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
      // req.usuario viene de verificarToken si mandaron sesión; si no, usamos
      // el usuario_id que haya venido suelto en el body (compat con el front viejo).
      usuario_id: req.usuario?.id ?? usuario_id,
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

const esFavorito = async (usuarioId, pruebaId) => {
  const { rows } = await pool.query(
    "SELECT EXISTS(SELECT 1 FROM favoritos WHERE usuario_id = $1 AND prueba_id = $2) AS favorito",
    [usuarioId, pruebaId]
  );
  return rows[0]?.favorito === true;
};

// POST /api/pruebas/:id/favorito — el body puede mandar el estado que quiere
// ({favorito: true|false}); si no manda nada, se comporta como toggle. Mandar
// el estado explícito hace que dos clicks rápidos converjan al mismo resultado
// en vez de pisarse entre sí.
export const toggleFavorito = async (req, res) => {
  const usuario_id = req.usuario.id;
  const prueba_id = Number(req.params.id);
  if (!Number.isInteger(prueba_id) || prueba_id <= 0) {
    return res.status(400).json({ ok: false, message: "Prueba inválida" });
  }

  try {
    await ensureFavoritosTable();

    // Un favorito de una prueba borrada quedaría huérfano y rompería el listado.
    const existe = await pool.query("SELECT 1 FROM pruebas WHERE id = $1", [prueba_id]);
    if (existe.rowCount === 0) {
      return res.status(404).json({ ok: false, message: "Prueba no encontrada" });
    }

    const deseado = typeof req.body?.favorito === "boolean"
      ? req.body.favorito
      : !(await esFavorito(usuario_id, prueba_id));

    if (deseado) {
      await pool.query(
        `INSERT INTO favoritos (usuario_id, prueba_id) VALUES ($1, $2)
         ON CONFLICT (usuario_id, prueba_id) DO NOTHING`,
        [usuario_id, prueba_id]
      );
    } else {
      await pool.query(
        "DELETE FROM favoritos WHERE usuario_id = $1 AND prueba_id = $2",
        [usuario_id, prueba_id]
      );
    }

    // Devolvemos lo que quedó realmente guardado, no lo que pidió el cliente.
    res.json({ ok: true, favorito: await esFavorito(usuario_id, prueba_id) });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error al guardar favorito", error: error.message });
  }
};
