import { Router } from "express";
import { preguntarSobrePrueba, preguntarLibre, generarPrueba } from "../controllers/ia.controller.js";

const router = Router();

router.post("/preguntar",      preguntarLibre);         // POST /api/ia/preguntar (sin prueba asociada)
router.post("/:id/preguntar",  preguntarSobrePrueba);    // POST /api/ia/5/preguntar
router.post("/:id/generar",    generarPrueba);           // POST /api/ia/5/generar

export default router;