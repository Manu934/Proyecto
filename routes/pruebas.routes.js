import { Router } from "express";
import {
  getPruebas, getPruebaById, createPrueba, deletePrueba, toggleFavorito,
} from "../controllers/pruebas.controller.js";
import { verificarToken, verificarAdmin } from "../middlewares/auth.middleware.js";
import { upload } from "../config/multer.js";

const router = Router();

router.get("/",               getPruebas);
router.get("/:id",            getPruebaById);
router.post("/",              upload.single("archivo"), createPrueba);
router.post("/:id/favorito",  verificarToken, toggleFavorito);
router.delete("/:id",         verificarToken, verificarAdmin, deletePrueba);

export default router;
