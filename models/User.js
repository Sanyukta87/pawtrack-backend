const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: String,
  email: {
    type: String,
    unique: true,
  },
  password: String,
  role: {
    type: String,
    enum: ["admin", "volunteer", "vet"],
    default: "volunteer",
  },
});

module.exports = mongoose.model("User", userSchema);
