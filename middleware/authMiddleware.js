const jwt = require("jsonwebtoken");

const auth = (req, res, next) => {
  const authHeader = req.header("Authorization");

  // ❌ No token
  if (!authHeader) {
    return res.status(401).json({ msg: "No token, authorization denied" });
  }

  // ✅ Extract token
  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ msg: "Invalid token format" });
  }

  try {
    // ✅ VERIFY USING ENV SECRET (CORRECT)
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ msg: "Token is not valid" });
  }
};

// ✅ ROLE CHECK
const isAuthorized = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ msg: "Access denied: Admins only" });
  }

  next();
};

module.exports = { auth, isAuthorized };