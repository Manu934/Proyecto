import { Router } from "express";
import { getPendientes, cambiarEstado } from "../controllers/admin.controller.js";

const router = Router();

router.get("/pendientes",       getPendientes);   // GET  /api/admin/pendientes
router.patch("/:id/estado",     cambiarEstado);   // PATCH /api/admin/5/estado

export default router;