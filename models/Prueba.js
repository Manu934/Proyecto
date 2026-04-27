import pool from "../config/db.js";

const Prueba = {

  getAll: async ({ materia, anio, escuela, profesor, tema } = {}) => {
    let query = "SELECT * FROM pruebas WHERE estado = 'aprobada'";
    const params = [];

    if (materia)  { query += " AND materia = ?";  params.push(materia); }
    if (anio)     { query += " AND anio = ?";     params.push(anio); }
    if (escuela)  { query += " AND escuela = ?";  params.push(escuela); }
    if (profesor) { query += " AND profesor = ?"; params.push(profesor); }
    if (tema)     { query += " AND tema LIKE ?";  params.push(`%${tema}%`); }

    query += " ORDER BY fecha DESC";

    const [rows] = await pool.query(query, params);
    return rows;
  },

  getById: async (id) => {
    const [rows] = await pool.query(
      "SELECT * FROM pruebas WHERE id = ?", [id]
    );
    return rows[0] || null;
  },

  create: async ({ titulo, materia, anio, profesor, tema, escuela, contenido }) => {
    const [result] = await pool.query(
      `INSERT INTO pruebas (titulo, materia, anio, profesor, tema, escuela, contenido, estado, fecha)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente', NOW())`,
      [titulo, materia, anio, profesor, tema, escuela, JSON.stringify(contenido)]
    );
    return result.insertId;
  },

  updateEstado: async (id, estado) => {
    const [result] = await pool.query(
      "UPDATE pruebas SET estado = ? WHERE id = ?", [estado, id]
    );
    return result.affectedRows;
  },

  getPendientes: async () => {
    const [rows] = await pool.query(
      "SELECT * FROM pruebas WHERE estado = 'pendiente' ORDER BY fecha ASC"
    );
    return rows;
  },
  
  delete: async (id) => {
    const [result] = await pool.query(
      "DELETE FROM pruebas WHERE id = ?", [id]
    );
    return result.affectedRows;
  },
};

export default Prueba;