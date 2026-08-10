import jwt from "jsonwebtoken";

export const verificarToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token)
    return res.status(401).json({ ok: false, message: "Token requerido" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ ok: false, message: "Token inválido o expirado" });
  }
};

// Para rutas públicas que igual quieren saber quién está mirando (por ejemplo,
// para marcar qué pruebas tiene como favoritas el usuario logueado). A
// diferencia de verificarToken, nunca corta la petición: sin token, o con uno
// inválido, sigue de largo con req.usuario en null.
export const identificarUsuario = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    req.usuario = null;
    return next();
  }

  try {
    req.usuario = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    req.usuario = null;
  }
  next();
};

export const verificarAdmin = (req, res, next) => {
  if (req.usuario?.rol !== "admin")
    return res.status(403).json({ ok: false, message: "Acceso solo para administradores" });
  next();
};