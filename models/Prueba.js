import pool from "../config/db.js";
import { ensureFavoritosTable } from "./Favorito.js";

function safeJson(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

function mapRow(row) {
  const c = safeJson(row.contenido);
  return {
    id:             row.id,
    titulo:         row.titulo,
    materia:        row.materia  || "",
    escuela:        row.escuela  || "",
    año:            row.anio     || "",
    anio:           row.anio     || "",
    profesor:       row.profesor || "",
    tema:           row.tema     || "",
    notas:          c.notas          || "",
    archivo_url:    c.archivo_url    || null,
    archivo_nombre: c.archivo_nombre || null,
    archivo_tipo:   c.archivo_tipo   || null,
    // El jsonb completo: mapRow aplana solo algunos campos conocidos y el resto
    // (ejercicios, etc.) se perdía, así que la IA nunca veía el contenido real.
    contenido:      c,
    estado:         row.estado,
    usuario_id:     row.usuario_id   || c.usuario_id    || null,
    usuario_nombre: row.usuario_nombre || c.usuario_nombre || "Anónimo",
    usuario_email:  row.usuario_email  || c.usuario_email  || "",
    created_at:     row.fecha,
    favorito:       row.favorito === true,
  };
}

// EXISTS(...) contra favoritos para el usuario logueado, o "false" fijo si
// nadie está logueado (usuarioId null): así la misma consulta sirve para
// visitantes anónimos y para usuarios con sesión.
const favoritoSelect = (usuarioId, params) => {
  if (!usuarioId) return "false AS favorito";
  params.push(usuarioId);
  return `EXISTS(SELECT 1 FROM favoritos f WHERE f.prueba_id = p.id AND f.usuario_id = $${params.length}) AS favorito`;
};

const Prueba = {
  getAll: async ({ materia, anio, escuela, profesor, tema } = {}, usuarioId = null) => {
    const params = [];
    const favSelect = favoritoSelect(usuarioId, params);
    let query = `SELECT p.*, ${favSelect} FROM pruebas p WHERE p.estado = 'aprobada'`;
    let i = params.length + 1;
    if (materia)  { query += ` AND p.materia = $${i++}`;       params.push(materia); }
    if (anio)     { query += ` AND p.anio = $${i++}`;          params.push(anio); }
    if (escuela)  { query += ` AND p.escuela = $${i++}`;       params.push(escuela); }
    if (profesor) { query += ` AND p.profesor ILIKE $${i++}`; params.push(`%${profesor}%`); }
    if (tema)     { query += ` AND p.tema ILIKE $${i++}`;     params.push(`%${tema}%`); }
    query += " ORDER BY p.fecha DESC";
    const result = await pool.query(query, params);
    return result.rows.map(mapRow);
  },

  getById: async (id, usuarioId = null) => {
    const params = usuarioId ? [id, usuarioId] : [id];
    const favSelect = usuarioId
      ? "EXISTS(SELECT 1 FROM favoritos f WHERE f.prueba_id = p.id AND f.usuario_id = $2) AS favorito"
      : "false AS favorito";
    const result = await pool.query(
      `SELECT p.*, ${favSelect} FROM pruebas p WHERE p.id = $1`,
      params
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  },

  // "Guardadas": las pruebas que el usuario marcó como favoritas.
  getFavoritos: async (usuarioId) => {
    await ensureFavoritosTable();
    const result = await pool.query(
      `SELECT p.*, true AS favorito
         FROM pruebas p
         INNER JOIN favoritos f ON f.prueba_id = p.id AND f.usuario_id = $1
        ORDER BY p.id DESC`,
      [usuarioId]
    );
    return result.rows.map(mapRow);
  },

  // "Mis pruebas": todo lo que subió el usuario, sin importar el estado.
  getByUsuario: async (usuarioId) => {
    const result = await pool.query(
      `SELECT p.*,
          EXISTS(SELECT 1 FROM favoritos f WHERE f.prueba_id = p.id AND f.usuario_id = $1) AS favorito
        FROM pruebas p
       WHERE p.usuario_id = $1
       ORDER BY p.id DESC`,
      [usuarioId]
    );
    return result.rows.map(mapRow);
  },

  create: async ({ titulo, materia, anio, profesor, tema, escuela, contenido, usuario_id }) => {
    const result = await pool.query(
      `INSERT INTO pruebas (titulo, materia, anio, profesor, tema, escuela, contenido, usuario_id, estado, fecha)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pendiente',NOW()) RETURNING id`,
      [titulo, materia, anio, profesor || null, tema || null, escuela, JSON.stringify(contenido), usuario_id || null]
    );
    return result.rows[0].id;
  },

  updateEstado: async (id, estado) => {
    const result = await pool.query("UPDATE pruebas SET estado = $1 WHERE id = $2", [estado, id]);
    return result.rowCount;
  },

  getAllAdmin: async (estado) => {
    let query = "SELECT * FROM pruebas";
    const params = [];
    if (estado && estado !== "todas") {
      query += " WHERE estado = $1";
      params.push(estado);
    }
    query += " ORDER BY fecha DESC";
    const result = await pool.query(query, params);
    return result.rows.map(mapRow);
  },

  getPendientes: async () => {
    const result = await pool.query(
      "SELECT * FROM pruebas WHERE estado = 'pendiente' ORDER BY fecha ASC"
    );
    return result.rows.map(mapRow);
  },

  delete: async (id) => {
    const result = await pool.query("DELETE FROM pruebas WHERE id = $1", [id]);
    return result.rowCount;
  },
};

export default Prueba;
