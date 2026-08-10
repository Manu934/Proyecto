import pool from "../config/db.js";

// Sin límite, un solo usuario (o un bot) puede vaciar la cuota/plata de la API
// de IA en un rato. Un tope diario simple por usuario alcanza para evitar eso
// sin ser invasivo para el uso normal de un estudiante.
export const LIMITE_DIARIO = Number(process.env.IA_LIMITE_DIARIO) || 5;

let tablaLista = null;

const YA_EXISTE = new Set(["23505", "42P07", "42710"]);
const ignorarSiYaExiste = (e) => {
  if (e?.code && YA_EXISTE.has(e.code)) return;
  throw e;
};

async function crearTabla() {
  await pool
    .query(`
      CREATE TABLE IF NOT EXISTS ia_uso (
        id          SERIAL PRIMARY KEY,
        usuario_id  INTEGER NOT NULL,
        creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
    .catch(ignorarSiYaExiste);

  await pool
    .query(`CREATE INDEX IF NOT EXISTS ia_uso_usuario_fecha_idx ON ia_uso (usuario_id, creado_en)`)
    .catch(ignorarSiYaExiste);
}

export function ensureIaUsoTable() {
  if (!tablaLista) {
    tablaLista = crearTabla().catch((e) => {
      tablaLista = null;
      throw e;
    });
  }
  return tablaLista;
}

// Cuántas preguntas hizo el usuario en las últimas 24hs (ventana móvil, no
// "desde la medianoche": así no se puede resetear el contador esperando el
// cambio de día a las 23:59).
export async function usoUltimas24hs(usuarioId) {
  await ensureIaUsoTable();
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM ia_uso WHERE usuario_id = $1 AND creado_en > now() - interval '24 hours'`,
    [usuarioId]
  );
  return rows[0]?.n ?? 0;
}

export async function registrarUso(usuarioId) {
  await ensureIaUsoTable();
  await pool.query("INSERT INTO ia_uso (usuario_id) VALUES ($1)", [usuarioId]);
}
