import pool from "../config/db.js";
import bcrypt from "bcryptjs";

const Usuario = {
  create: async ({ nombre, email, password, rol = "usuario" }) => {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO usuarios (nombre, email, password, rol)
       VALUES ($1, $2, $3, $4) RETURNING id, nombre, email, rol`,
      [nombre, email, hash, rol]
    );
    return result.rows[0];
  },
  getByEmail: async (email) => {
    const result = await pool.query(
      "SELECT * FROM usuarios WHERE email = $1",
      [email]
    );
    return result.rows[0] || null;
  },
  getById: async (id) => {
    const result = await pool.query(
      "SELECT id, nombre, email, rol FROM usuarios WHERE id = $1",
      [id]
    );
    return result.rows[0] || null;
  },
};

export default Usuario;