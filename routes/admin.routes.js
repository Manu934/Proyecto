import { Router } from "express";
import { getPendientes, getAllPruebas, cambiarEstado } from "../controllers/admin.controller.js";
import { verificarToken, verificarAdmin } from "../middlewares/auth.middleware.js";

const router = Router();

router.get("/pruebas",              verificarToken, verificarAdmin, getAllPruebas);
router.patch("/pruebas/:id/estado", verificarToken, verificarAdmin, cambiarEstado);
router.patch("/:id/estado",         verificarToken, verificarAdmin, cambiarEstado);
router.get("/pendientes",           verificarToken, verificarAdmin, getPendientes);

export default router;
