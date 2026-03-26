const express = require("express");
const router = express.Router();

const mongoose = require("mongoose");
const Dog = require("../models/Dog");
const QRCode = require("qrcode");

// 🔐 AUTH
const { auth, isAuthorized } = require("../middleware/authMiddleware");


// 🟢 1. GET ALL DOGS (WITH SMART ALERTS 🔥)
router.get("/", async (req, res) => {
  try {
    const dogs = await Dog.find();
    const today = new Date();

    const dogsWithAlerts = dogs.map((dog) => {
      let alertStatus = "none";
      let alertMessage = "";

      // 🚨 Priority 1: Reports
      if (dog.reports.length > 0) {
        alertStatus = "attention";
        alertMessage = "Dog needs attention ❗";
      }

      // 💉 Priority 2: Vaccination
      else if (dog.nextVaccinationDate) {
        const nextDate = new Date(dog.nextVaccinationDate);
        const diff =
          (nextDate - today) / (1000 * 60 * 60 * 24);

        if (diff < 0) {
          alertStatus = "overdue";
          alertMessage = "Vaccination overdue 🚨";
        } else if (diff <= 3) {
          alertStatus = "dueSoon";
          alertMessage = "Vaccination due soon ⚠️";
        }
      }

      return {
        ...dog._doc,
        alertStatus,
        alertMessage,
      };
    });

    res.json(dogsWithAlerts);

  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Error fetching dogs" });
  }
});


// 🟢 2. ADD DOG (ADMIN ONLY)
router.post("/", auth, isAuthorized, async (req, res) => { 
  try {
    const dog = new Dog(req.body);
    await dog.save();

    const qr = await QRCode.toDataURL(
  `https://pawtrack-frontend.vercel.app/dog/${dog._id}`
);

    dog.qrCode = qr;
    await dog.save();

    res.json(dog);

  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Error adding dog" });
  }
});


// 🟢 3. UPDATE DOG (ADMIN ONLY)
router.put("/update/:id", auth, isAuthorized, async (req, res) => {
  try {
    const dog = await Dog.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    res.json(dog);

  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Error updating dog" });
  }
});


// 🟢 4. 🚨 REPORT ISSUE (PUBLIC)
router.post("/report/:id", async (req, res) => {
  try {
    const dog = await Dog.findById(req.params.id);

    if (!dog) return res.status(404).json({ msg: "Dog not found" });

    dog.reports.push({
      message: req.body.message,
      date: new Date(),
    });

    await dog.save();

    res.json({ msg: "Report added 🚨" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Error reporting issue" });
  }
});


// 🟢 5. 🏥 ADD HEALTH RECORD (ADMIN ONLY 🔥)
router.post("/health/:id", auth, isAuthorized, async (req, res) => {
  try {
    const { vaccinationDate, treatment, notes, type } = req.body;

    const dog = await Dog.findById(req.params.id);
    if (!dog) return res.status(404).json({ msg: "Dog not found" });

    let nextDueDate = null;

    // 💉 If vaccination → auto calculate next date
    if (type === "vaccination" && vaccinationDate) {
      nextDueDate = new Date(vaccinationDate);
      nextDueDate.setMonth(nextDueDate.getMonth() + 12);

      dog.lastVaccinationDate = vaccinationDate;
      dog.nextVaccinationDate = nextDueDate;
      dog.vaccinated = true;
    }

    const newRecord = {
      vaccinationDate,
      nextDueDate,
      treatment,
      notes,
      type,
    };

    dog.healthRecords.push(newRecord);

    await dog.save();

    res.json({ msg: "Health record added 🏥", dog });

  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Error adding health record" });
  }
});


// 🟢 6. 🚨 ALERTS API (SMART 🔥)
router.get("/alerts", async (req, res) => {
  try {
    const dogs = await Dog.find();
    const today = new Date();

    const alerts = dogs.map((dog) => {
      let status = "safe";
      let message = "";

      // 🚨 Priority: Reports
      if (dog.reports.length > 0) {
        status = "attention";
        message = "Dog needs attention ❗";
      }

      // 💉 Vaccination
      else if (dog.nextVaccinationDate) {
        const diff =
          (new Date(dog.nextVaccinationDate) - today) /
          (1000 * 60 * 60 * 24);

        if (diff < 0) {
          status = "overdue";
          message = "Vaccination overdue 🚨";
        } else if (diff <= 3) {
          status = "dueSoon";
          message = "Vaccination due soon ⚠️";
        }
      }

      return {
        dogId: dog._id,
        name: dog.name,
        status,
        message,
        nextVaccinationDate: dog.nextVaccinationDate,
      };
    });

    res.json(alerts);

  } catch (err) {
    res.status(500).json({ msg: "Error fetching alerts" });
  }
});


// 🟢 7. 📊 STATS API
router.get("/stats", async (req, res) => {
  try {
    const dogs = await Dog.find();
    const today = new Date();

    let total = dogs.length;
    let vaccinated = 0;
    let overdue = 0;
    let dueSoon = 0;
    let attention = 0;

    dogs.forEach((dog) => {
      if (dog.vaccinated) vaccinated++;

      if (dog.reports.length > 0) {
        attention++;
      }

      if (dog.nextVaccinationDate) {
        const diff =
          (new Date(dog.nextVaccinationDate) - today) /
          (1000 * 60 * 60 * 24);

        if (diff < 0) overdue++;
        else if (diff <= 3) dueSoon++;
      }
    });

    res.json({ total, vaccinated, overdue, dueSoon, attention });

  } catch (err) {
    res.status(500).json({ msg: "Error fetching stats" });
  }
});


// 🟢 8. GET SINGLE DOG (ALWAYS LAST ⚠️)
router.get("/:id", async (req, res) => {
  try {
    const id = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ msg: "Invalid Dog ID" });
    }

    const dog = await Dog.findById(id);

    if (!dog) {
      return res.status(404).json({ msg: "Dog not found" });
    }

    res.json(dog);

  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Error fetching dog" });
  }
});

module.exports = router;