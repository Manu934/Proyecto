import { Router } from "express";
import {
  getPruebas, getPruebaById, createPrueba, deletePrueba, toggleFavorito,
  getFavoritos, getMisPruebas,
} from "../controllers/pruebas.controller.js";
import { verificarToken, verificarAdmin, identificarUsuario } from "../middlewares/auth.middleware.js";
import { upload } from "../config/multer.js";

const router = Router();

// "/favoritos" y "/mis" van ANTES de "/:id": si no, Express las confunde con
// una prueba cuyo id sería literalmente "favoritos" o "mis".
router.get("/favoritos",      verificarToken, getFavoritos);
router.get("/mis",            verificarToken, getMisPruebas);
router.get("/",                identificarUsuario, getPruebas);
router.get("/:id",             identificarUsuario, getPruebaById);
router.post("/",               identificarUsuario, upload.single("archivo"), createPrueba);
router.post("/:id/favorito",   verificarToken, toggleFavorito);
router.delete("/:id",          verificarToken, verificarAdmin, deletePrueba);

export default router;
