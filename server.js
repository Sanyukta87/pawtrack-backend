require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const dogRoutes = require("./routes/dogRoutes");
const reportRoutes = require("./routes/reportRoutes");

const app = express();

// ✅ ENV VARIABLES
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;
const CLIENT_URL = process.env.CLIENT_URL;

// ❌ STOP if MONGO_URI missing (GOOD PRACTICE)
if (!MONGO_URI) {
  console.error("❌ Missing MONGO_URI in .env");
  process.exit(1);
}

// ✅ MIDDLEWARES
app.use(
  cors({
    origin: CLIENT_URL || "*", // allow frontend OR fallback
    credentials: true,
  })
);

app.use(express.json());

// ✅ TEST ROUTE
app.get("/", (req, res) => {
  res.send("🚀 PawTrack API running");
});

// ✅ ROUTES
app.use("/api/auth", authRoutes);
app.use("/api/dogs", dogRoutes);
app.use("/api/reports", reportRoutes);

// ✅ DATABASE CONNECTION + SERVER START
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB Connected");

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });