import pool from "../config/db.js";

const Prueba = {
  getAll: async ({ materia, anio, escuela, profesor, tema } = {}) => {
    let query = "SELECT * FROM pruebas WHERE estado = 'aprobada'";
    const params = [];
    let i = 1;
    if (materia)  { query += ` AND materia = $${i++}`;      params.push(materia); }
    if (anio)     { query += ` AND anio = $${i++}`;         params.push(anio); }
    if (escuela)  { query += ` AND escuela = $${i++}`;      params.push(escuela); }
    if (profesor) { query += ` AND profesor = $${i++}`;     params.push(profesor); }
    if (tema)     { query += ` AND tema LIKE $${i++}`;      params.push(`%${tema}%`); }
    query += " ORDER BY fecha DESC";
    const result = await pool.query(query, params);
    return result.rows;
  },
  getById: async (id) => {
    const result = await pool.query("SELECT * FROM pruebas WHERE id = $1", [id]);
    return result.rows[0] || null;
  },
  create: async ({ titulo, materia, anio, profesor, tema, escuela, contenido }) => {
    const result = await pool.query(
      `INSERT INTO pruebas (titulo, materia, anio, profesor, tema, escuela, contenido, estado, fecha)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pendiente', NOW()) RETURNING id`,
      [titulo, materia, anio, profesor, tema, escuela, JSON.stringify(contenido)]
    );
    return result.rows[0].id;
  },
  updateEstado: async (id, estado) => {
    const result = await pool.query("UPDATE pruebas SET estado = $1 WHERE id = $2", [estado, id]);
    return result.rowCount;
  },
  getPendientes: async () => {
    const result = await pool.query("SELECT * FROM pruebas WHERE estado = 'pendiente' ORDER BY fecha ASC");
    return result.rows;
  },
  delete: async (id) => {
    const result = await pool.query("DELETE FROM pruebas WHERE id = $1", [id]);
    return result.rowCount;
  },
};

export default Prueba;