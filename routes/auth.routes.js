import { Router } from "express";
import { register, login, googleCallback } from "../controllers/auth.controller.js";
import passport from "../config/passport.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);

router.get("/google",
  passport.authenticate("google", { scope: ["profile", "email"], session: false })
);

router.get("/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: "/" }),
  googleCallback
);

export default router;