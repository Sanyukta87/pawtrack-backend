const mongoose = require("mongoose");

// 🏥 Health Record Schema
const healthRecordSchema = new mongoose.Schema({
  vaccinationDate: Date,
  nextDueDate: Date,
  treatment: {
    type: String,
    required: true,
  },
  notes: String,
  type: {
    type: String,
    enum: ["vaccination", "treatment"],
    default: "treatment",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// 🐶 Dog Schema
const dogSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },

    location: String,
    color: String,
    gender: String,

    vaccinated: {
      type: Boolean,
      default: false,
    },

    sterilized: {
      type: Boolean,
      default: false,
    },

    earNotch: {
      type: Boolean,
      default: false,
    },

    // 📅 Vaccination Tracking
    lastVaccinationDate: Date,
    nextVaccinationDate: Date,

    // 🧠 Alert System
    alertStatus: {
      type: String,
      enum: ["none", "dueSoon", "overdue", "attention"],
      default: "none",
    },

    alertMessage: String,

    // 📝 Notes
    notes: String,

    // 🔗 QR Code
    qrCode: String,

    // 🏥 Health Records
    healthRecords: [healthRecordSchema],

    // 🚨 Reports
    reports: [
      {
        message: {
          type: String,
          required: true,
        },
        date: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.models.Dog || mongoose.model("Dog", dogSchema);