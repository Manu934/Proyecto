import pool from "../config/db.js";

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
    favorito:       false,
  };
}

const Prueba = {
  getAll: async ({ materia, anio, escuela, profesor, tema } = {}) => {
    let query = "SELECT * FROM pruebas WHERE estado = 'aprobada'";
    const params = [];
    let i = 1;
    if (materia)  { query += ` AND materia = $${i++}`;       params.push(materia); }
    if (anio)     { query += ` AND anio = $${i++}`;          params.push(anio); }
    if (escuela)  { query += ` AND escuela = $${i++}`;       params.push(escuela); }
    if (profesor) { query += ` AND profesor ILIKE $${i++}`; params.push(`%${profesor}%`); }
    if (tema)     { query += ` AND tema ILIKE $${i++}`;     params.push(`%${tema}%`); }
    query += " ORDER BY fecha DESC";
    const result = await pool.query(query, params);
    return result.rows.map(mapRow);
  },

  getById: async (id) => {
    const result = await pool.query("SELECT * FROM pruebas WHERE id = $1", [id]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  },

  create: async ({ titulo, materia, anio, profesor, tema, escuela, contenido }) => {
    const result = await pool.query(
      `INSERT INTO pruebas (titulo, materia, anio, profesor, tema, escuela, contenido, estado, fecha)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pendiente',NOW()) RETURNING id`,
      [titulo, materia, anio, profesor || null, tema || null, escuela, JSON.stringify(contenido)]
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
