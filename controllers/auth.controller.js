import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import Usuario from "../models/Usuario.js";

export const register = async (req, res) => {
  try {
    const { nombre, email, password } = req.body;
    if (!nombre || !email || !password)
      return res.status(400).json({ ok: false, message: "Faltan campos obligatorios" });

    const existe = await Usuario.getByEmail(email);
    if (existe)
      return res.status(409).json({ ok: false, message: "El email ya está registrado" });

    const usuario = await Usuario.create({ nombre, email, password });
    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, rol: usuario.rol },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.status(201).json({ ok: true, token, usuario });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error al registrar", error: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ ok: false, message: "Faltan campos obligatorios" });

    const usuario = await Usuario.getByEmail(email);
    if (!usuario)
      return res.status(401).json({ ok: false, message: "Credenciales inválidas" });

    const passwordOk = await bcrypt.compare(password, usuario.password);
    if (!passwordOk)
      return res.status(401).json({ ok: false, message: "Credenciales inválidas" });

    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, rol: usuario.rol },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({ ok: true, token, usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol } });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error al iniciar sesión", error: error.message });
  }
};

export const googleCallback = (req, res) => {
  const usuario = req.user;
  const token = jwt.sign(
    { id: usuario.id, email: usuario.email, rol: usuario.rol },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const params = new URLSearchParams({
    token,
    id:     String(usuario.id),
    nombre: usuario.nombre,
    email:  usuario.email,
    rol:    usuario.rol || "usuario",
  });
  res.redirect(`${frontendUrl}/auth/callback?${params}`);
};
