import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import pruebasRoutes from "./routes/pruebas.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import geminiRoutes from "./routes/gemini.routes.js";
import authRoutes from "./routes/auth.routes.js";
import passport from "./config/passport.js";

dotenv.config();

const app = express();

app.use(cors({
  origin: "http://localhost:5173",
  credentials: true
}));
app.use(express.json());
app.use(passport.initialize());

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