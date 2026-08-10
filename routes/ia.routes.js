import { Router } from "express";
import {
  chat, preguntarSobrePrueba, preguntarLibre, generarPrueba,
  listarConversaciones, obtenerConversacion, eliminarConversacion,
} from "../controllers/ia.controller.js";
import { verificarToken } from "../middlewares/auth.middleware.js";

const router = Router();

// Contrato actual del front: manda toda la conversación de una.
router.post("/",               verificarToken, chat);    // POST /api/ia

// Historial de chats, para retomarlos como en Claude/ChatGPT.
router.get("/conversaciones",      verificarToken, listarConversaciones);   // GET /api/ia/conversaciones
router.get("/conversaciones/:id",  verificarToken, obtenerConversacion);    // GET /api/ia/conversaciones/5
router.delete("/conversaciones/:id", verificarToken, eliminarConversacion); // DELETE /api/ia/conversaciones/5

// Rutas viejas: ya no las usa el front (que ahora habla con /api/ia a secas),
// las dejamos por si algo externo todavía les pega.
router.post("/preguntar",      preguntarLibre);         // POST /api/ia/preguntar (sin prueba asociada)
router.post("/:id/preguntar",  preguntarSobrePrueba);    // POST /api/ia/5/preguntar
router.post("/:id/generar",    generarPrueba);           // POST /api/ia/5/generar

export default router;