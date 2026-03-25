require("dotenv").config(); // ✅ MUST BE FIRST

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

// 🔐 Routes
const authRoutes = require("./routes/authRoutes");
const dogRoutes = require("./routes/dogRoutes");

const app = express();

// ✅ MIDDLEWARE (ORDER MATTERS)
app.use(cors()); // 🔥 enable CORS
app.use(express.json());

// 🧪 Test route
app.get("/", (req, res) => {
  res.send("PawTrack API running 🚀");
});

// 🔗 API ROUTES
app.use("/api/auth", authRoutes);
app.use("/api/dogs", dogRoutes);

// 🚀 CONNECT DB + START SERVER
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB Connected");

    app.listen(5000, () => {
      console.log("Server running on port 5000");
    });
  })
  .catch((err) => console.log(err));