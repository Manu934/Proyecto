import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import pool from "./db.js";
import dotenv from "dotenv";
dotenv.config();

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/api/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;
        const nombre = profile.displayName;

        // Buscar si ya existe
        const existing = await pool.query(
          "SELECT * FROM usuarios WHERE email = $1",
          [email]
        );

        if (existing.rows[0]) {
          return done(null, existing.rows[0]);
        }

        // Crear usuario nuevo sin password
        const result = await pool.query(
          `INSERT INTO usuarios (nombre, email, password, rol)
           VALUES ($1, $2, $3, 'usuario') RETURNING *`,
          [nombre, email, "google-oauth"]
        );

        return done(null, result.rows[0]);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

export default passport;