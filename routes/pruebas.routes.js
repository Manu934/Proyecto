import { Router } from "express";
import { getPruebas, getPruebaById, createPrueba, deletePrueba } from "../controllers/pruebas.controller.js";

const router = Router();

router.get("/",        getPruebas);       // GET  /api/pruebas
router.get("/:id",     getPruebaById);    // GET  /api/pruebas/5
router.post("/",       createPrueba);     // POST /api/pruebas
router.delete("/:id",  deletePrueba);     // DELETE /api/pruebas/5

export default router;