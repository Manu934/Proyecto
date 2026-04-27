import { Router } from "express";
import { preguntarSobrePrueba, generarPrueba } from "../controllers/ia.controller.js";

const router = Router();

router.post("/:id/preguntar",  preguntarSobrePrueba);  // POST /api/ia/5/preguntar
router.post("/:id/generar",    generarPrueba);          // POST /api/ia/5/generar

export default router;