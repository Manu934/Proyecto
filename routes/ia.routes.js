import { Router } from "express";
import { chat, preguntarSobrePrueba, preguntarLibre, generarPrueba } from "../controllers/ia.controller.js";
import { verificarToken } from "../middlewares/auth.middleware.js";

const router = Router();

// Contrato actual del front: manda toda la conversación de una.
router.post("/",               verificarToken, chat);    // POST /api/ia

// Rutas viejas: ya no las usa el front (que ahora habla con /api/ia a secas),
// las dejamos por si algo externo todavía les pega.
router.post("/preguntar",      preguntarLibre);         // POST /api/ia/preguntar (sin prueba asociada)
router.post("/:id/preguntar",  preguntarSobrePrueba);    // POST /api/ia/5/preguntar
router.post("/:id/generar",    generarPrueba);           // POST /api/ia/5/generar

export default router;