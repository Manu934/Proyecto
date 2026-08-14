import pkg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;

if (!process.env.DATABASE_URL) {
  throw new Error("Falta DATABASE_URL en el .env");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Neon cierra las conexiones inactivas de vez en cuando. Sin este listener,
// ese error de un cliente ocioso del pool queda como "error" sin escuchar y
// Node lo trata como fatal: tira abajo TODO el servidor, no solo esa query.
pool.on("error", (err) => {
  console.error("Error inesperado en una conexión inactiva del pool de Postgres:", err.message);
});

export default pool;