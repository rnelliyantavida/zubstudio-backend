require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const productRoutes = require("./routes/products");

const app = express();


/* =========================================================
   MIDDLEWARE
========================================================= */

app.use(
  cors({
    origin: true,
  })
);

app.use(
  express.json({
    limit: "10mb",
  })
);


/* =========================================================
   ROUTES
========================================================= */

app.get("/", (req, res) => {

  res.json({
    message: "ZUBSTUDIO API is running",
  });

});


app.use(
  "/api/products",
  productRoutes
);


/* =========================================================
   DATABASE + SERVER
========================================================= */

const PORT = process.env.PORT || 5000;


async function startServer() {

  try {

    await mongoose.connect(
      process.env.MONGODB_URI,
      {
        dbName: "zubstudio",
      }
    );

    console.log("MongoDB connected");

    app.listen(PORT, () => {

      console.log(
        `ZUBSTUDIO API running on port ${PORT}`
      );

    });

  } catch (error) {

    console.error(
      "MongoDB connection failed:",
      error.message
    );

    process.exit(1);

  }

}


startServer();