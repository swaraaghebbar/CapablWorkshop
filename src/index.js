import express from "express";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import cookieSession from "cookie-session";
import { google } from "googleapis";

const app = express();

// 🔹 Replace with your credentials from Google Cloud Console
const CLIENT_ID = "273590343-ofp6vg104lf6rcl3p0vbbho34mr261c8.apps.googleusercontent.com";
const CLIENT_SECRET = "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";
const REDIRECT_URI = "http://localhost:5174/auth/google/callback";

// Session setup
app.use(cookieSession({
  name: 'session',
  keys: ['secret'],
  maxAge: 24 * 60 * 60 * 1000
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// Google OAuth setup
passport.use(new GoogleStrategy({
  clientID: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  callbackURL: REDIRECT_URI,
  scope: [
    "profile",
    "email",
    "https://www.googleapis.com/auth/fitness.activity.read",
    "https://www.googleapis.com/auth/fitness.heart_rate.read",
    "https://www.googleapis.com/auth/fitness.sleep.read"
  ]
}, (accessToken, refreshToken, profile, done) => {
  profile.accessToken = accessToken;
  return done(null, profile);
}));

// Routes
app.get("/auth/google", passport.authenticate("google", { scope: [] }));

app.get("/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => {
    res.redirect("/fit");
  }
);

app.get("/fit", async (req, res) => {
  if (!req.user) return res.redirect("/auth/google");

  const fitness = google.fitness({ version: "v1", auth: req.user.accessToken });

  const result = await fitness.users.dataSources.list({ userId: "me" });
  res.json(result.data);
});

app.listen(3000, () => console.log("✅ Server running at http://localhost:5174/auth/google"));
