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

export const verificarAdmin = (req, res, next) => {
  if (req.usuario?.rol !== "admin")
    return res.status(403).json({ ok: false, message: "Acceso solo para administradores" });
  next();
};