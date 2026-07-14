const jwt = require("jsonwebtoken");

const { getJwtSecret } = require("../config/jwt");

const SESSION_EXPIRED_MESSAGE = "Invalid or expired session";

function authenticateUser(req, res, next) {
  const authHeader = req.get("Authorization") || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    const payload = jwt.verify(token, getJwtSecret());
    req.user = {
      userId: payload.userId,
      email: payload.email,
    };
    return next();
  } catch {
    return res.status(401).json({ message: SESSION_EXPIRED_MESSAGE });
  }
}

module.exports = { authenticateUser };
