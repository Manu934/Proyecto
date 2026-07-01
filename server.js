import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import pruebasRoutes from "./routes/pruebas.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import geminiRoutes from "./routes/gemini.routes.js";
import authRoutes from "./routes/auth.routes.js";
import passport from "./config/passport.js";

dotenv.config();

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
app.use("/api/ia", geminiRoutes);
app.use("/api/auth", authRoutes);

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "tuspruebas API corriendo" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});