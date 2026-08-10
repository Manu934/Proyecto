import pool from "../config/db.js";

let tablaLista = null;

const YA_EXISTE = new Set(["23505", "42P07", "42710"]);
const ignorarSiYaExiste = (e) => {
  if (e?.code && YA_EXISTE.has(e.code)) return;
  throw e;
};

async function crearTablas() {
  await pool
    .query(`
      CREATE TABLE IF NOT EXISTS conversaciones (
        id          SERIAL PRIMARY KEY,
        usuario_id  INTEGER NOT NULL,
        prueba_id   INTEGER,
        titulo      VARCHAR(120) NOT NULL DEFAULT 'Nueva conversación',
        contexto    JSONB NOT NULL DEFAULT '{}',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
    .catch(ignorarSiYaExiste);

  await pool
    .query(`
      CREATE TABLE IF NOT EXISTS mensajes_ia (
        id               SERIAL PRIMARY KEY,
        conversacion_id  INTEGER NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
        role             VARCHAR(20) NOT NULL,
        content          TEXT NOT NULL,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
    .catch(ignorarSiYaExiste);

  await pool
    .query(`CREATE INDEX IF NOT EXISTS conversaciones_usuario_idx ON conversaciones (usuario_id, updated_at DESC)`)
    .catch(ignorarSiYaExiste);
  await pool
    .query(`CREATE INDEX IF NOT EXISTS mensajes_ia_conversacion_idx ON mensajes_ia (conversacion_id, created_at)`)
    .catch(ignorarSiYaExiste);
}

function ensureTablas() {
  if (!tablaLista) {
    tablaLista = crearTablas().catch((e) => {
      tablaLista = null;
      throw e;
    });
  }
  return tablaLista;
}

// Título corto a partir de la primera pregunta, como hacen Claude/ChatGPT
// antes de generar uno con el modelo (acá no vale la pena gastar una llamada
// a la IA solo para titular el chat).
function tituloDesde(texto) {
  const limpio = (texto || "").trim().replace(/\s+/g, " ");
  if (!limpio) return "Nueva conversación";
  return limpio.length > 60 ? `${limpio.slice(0, 60)}…` : limpio;
}

const Conversacion = {
  crear: async ({ usuarioId, pruebaId = null, contexto = {}, primerMensaje = "" }) => {
    await ensureTablas();
    const { rows } = await pool.query(
      `INSERT INTO conversaciones (usuario_id, prueba_id, titulo, contexto)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [usuarioId, pruebaId, tituloDesde(primerMensaje), JSON.stringify(contexto)]
    );
    return rows[0].id;
  },

  agregarMensaje: async (conversacionId, role, content) => {
    await ensureTablas();
    await pool.query(
      "INSERT INTO mensajes_ia (conversacion_id, role, content) VALUES ($1, $2, $3)",
      [conversacionId, role, content]
    );
    await pool.query("UPDATE conversaciones SET updated_at = now() WHERE id = $1", [conversacionId]);
  },

  // Confirma que la conversación exista y sea del usuario, antes de dejarlo
  // escribir o leer mensajes ahí.
  perteneceA: async (conversacionId, usuarioId) => {
    await ensureTablas();
    const { rows } = await pool.query(
      "SELECT 1 FROM conversaciones WHERE id = $1 AND usuario_id = $2",
      [conversacionId, usuarioId]
    );
    return rows.length > 0;
  },

  listarDeUsuario: async (usuarioId) => {
    await ensureTablas();
    const { rows } = await pool.query(
      `SELECT c.id, c.titulo, c.prueba_id, c.contexto, c.updated_at, c.created_at,
          (SELECT content FROM mensajes_ia m WHERE m.conversacion_id = c.id ORDER BY m.id DESC LIMIT 1) AS ultimo_mensaje
        FROM conversaciones c
       WHERE c.usuario_id = $1
       ORDER BY c.updated_at DESC`,
      [usuarioId]
    );
    return rows;
  },

  obtenerConMensajes: async (conversacionId, usuarioId) => {
    await ensureTablas();
    const { rows: convRows } = await pool.query(
      "SELECT id, titulo, prueba_id, contexto, created_at, updated_at FROM conversaciones WHERE id = $1 AND usuario_id = $2",
      [conversacionId, usuarioId]
    );
    if (!convRows[0]) return null;

    const { rows: mensajes } = await pool.query(
      "SELECT id, role, content, created_at FROM mensajes_ia WHERE conversacion_id = $1 ORDER BY id ASC",
      [conversacionId]
    );
    return { ...convRows[0], mensajes };
  },

  eliminar: async (conversacionId, usuarioId) => {
    await ensureTablas();
    const { rowCount } = await pool.query(
      "DELETE FROM conversaciones WHERE id = $1 AND usuario_id = $2",
      [conversacionId, usuarioId]
    );
    return rowCount > 0;
  },
};

export default Conversacion;
