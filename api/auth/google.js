import { setCorsHeaders } from "../_cors.js";
import {
  buildSessionCookie,
  createSessionToken,
  isEmailAllowed,
  verifyGoogleIdToken
} from "../_auth.js";

export default async function handler(req, res) {
  setCorsHeaders(req, res, "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const credential = req.body?.credential;
  if (!credential) {
    return res.status(400).json({ error: "Missing Google credential" });
  }

  if (!process.env.SESSION_SECRET) {
    return res.status(500).json({ error: "Server auth is not configured" });
  }

  const profile = await verifyGoogleIdToken(credential);
  if (!profile) {
    return res.status(401).json({ error: "Invalid Google sign-in" });
  }

  if (!isEmailAllowed(profile.email)) {
    return res.status(403).json({ error: "This Google account is not allowed" });
  }

  const token = createSessionToken(profile);
  if (!token) {
    return res.status(500).json({ error: "Could not create session" });
  }

  res.setHeader("Set-Cookie", buildSessionCookie(token, req));

  return res.status(200).json({
    ok: true,
    user: {
      email: profile.email,
      name: profile.name,
      picture: profile.picture
    }
  });
}
