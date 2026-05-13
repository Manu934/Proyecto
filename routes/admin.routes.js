import { Router } from "express";
import { getPendientes, cambiarEstado } from "../controllers/admin.controller.js";
import { verificarToken, verificarAdmin } from "../middlewares/auth.middleware.js";

const router = Router();

router.get("/pendientes", verificarToken, verificarAdmin, getPendientes);
router.patch("/:id/estado", verificarToken, verificarAdmin, cambiarEstado);

export default router;