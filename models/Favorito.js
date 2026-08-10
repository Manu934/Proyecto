import pool from "../config/db.js";

// No hay sistema de migraciones en este proyecto: la tabla "favoritos" se crea
// sola la primera vez que hace falta, en vez de depender de que alguien la
// haya creado a mano en la consola de Postgres. Se cachea para no pagar el
// costo de chequearla en cada request. Misma base que usan las funciones de
// Vercel del front, así que el esquema tiene que ser idéntico al de ahí.
let favoritosReady = null;

const YA_EXISTE = new Set(["23505", "42P07", "42710"]);

function ignorarSiYaExiste(e) {
  const code = e?.code;
  if (code && YA_EXISTE.has(code)) return;
  throw e;
}

function crearIndicePorUsuario() {
  return pool
    .query(`CREATE INDEX IF NOT EXISTS favoritos_usuario_idx ON favoritos (usuario_id)`)
    .then(() => undefined)
    .catch(ignorarSiYaExiste);
}

async function crearTablaFavoritos() {
  await pool
    .query(`
      CREATE TABLE IF NOT EXISTS favoritos (
        id          SERIAL PRIMARY KEY,
        usuario_id  INTEGER NOT NULL,
        prueba_id   INTEGER NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (usuario_id, prueba_id)
      )
    `)
    .catch(ignorarSiYaExiste);

  try {
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS favoritos_usuario_prueba_idx
         ON favoritos (usuario_id, prueba_id)`
    );
  } catch (e) {
    if (e?.code !== "23505") {
      ignorarSiYaExiste(e);
      return crearIndicePorUsuario();
    }
    // Duplicados de una versión vieja sin restricción única: los limpiamos y
    // reintentamos, si no un doble click deja la prueba duplicada en "guardadas".
    await pool.query(`
      DELETE FROM favoritos a
        USING favoritos b
       WHERE a.ctid < b.ctid
         AND a.usuario_id = b.usuario_id
         AND a.prueba_id  = b.prueba_id
    `);
    await pool
      .query(
        `CREATE UNIQUE INDEX IF NOT EXISTS favoritos_usuario_prueba_idx
           ON favoritos (usuario_id, prueba_id)`
      )
      .catch(ignorarSiYaExiste);
  }

  await crearIndicePorUsuario();
}

export function ensureFavoritosTable() {
  if (!favoritosReady) {
    favoritosReady = crearTablaFavoritos().catch((e) => {
      favoritosReady = null; // permitir reintentar en el próximo request
      throw e;
    });
  }
  return favoritosReady;
}
