import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import pruebasRoutes from "./routes/pruebas.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import iaRoutes from "./routes/ia.routes.js";
import authRoutes from "./routes/auth.routes.js";
import passport from "./config/passport.js";

dotenv.config();

// Falla al arranque y no en medio de un request, que es cuando duele.
const faltantes = ["DATABASE_URL", "JWT_SECRET", "NVIDIA_API_KEY"].filter(
  (v) => !process.env[v]
);
if (faltantes.length) {
  throw new Error(`Faltan variables en el .env: ${faltantes.join(", ")}`);
}
if (process.env.JWT_SECRET.length < 32) {
  throw new Error(
    "JWT_SECRET es demasiado corto: usá al menos 32 caracteres aleatorios. " +
      "Podés generar uno con: node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\""
  );
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(passport.initialize());
app.use(express.static(join(__dirname, "public")));
app.use("/uploads", express.static(join(__dirname, "uploads")));

app.use("/api/pruebas", pruebasRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/ia", iaRoutes);
app.use("/api/auth", authRoutes);

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "tuspruebas API corriendo" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});