import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import pruebasRoutes from "./routes/pruebas.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import geminiRoutes from "./routes/gemini.routes.js";

dotenv.config();

const app = express();

app.use(cors());              
app.use(express.json());    

app.use("/api/pruebas", pruebasRoutes);
app.use("/api/admin",   adminRoutes);
app.use("/api/ia",      geminiRoutes);

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "tuspruebas API corriendo" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});