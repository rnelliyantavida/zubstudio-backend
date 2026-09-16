const mongoose = require("mongoose");

/* =========================================================
   IMAGE SCHEMA

   Each product stores its Cloudinary image.
========================================================= */

const imageSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
    },

    publicId: {
      type: String,
      required: true,
    },
  },
  {
    _id: false,
  },
);

/* =========================================================
   PRODUCT SCHEMA
========================================================= */

const productSchema = new mongoose.Schema(
  {
    /* -----------------------------------------------------
       PRODUCT / COLLECTION NAME
    ----------------------------------------------------- */

    name: {
      type: String,
      required: true,
      trim: true,
    },

    /* -----------------------------------------------------
       PRODUCT CODE

       OPTIONAL.

       Multiple clothes are allowed
       to have the same code.

       Some clothes may have no code.
    ----------------------------------------------------- */

    code: {
      type: String,
      trim: true,
      default: "",
    },

    /* -----------------------------------------------------
       PRICE
    ----------------------------------------------------- */

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    /* -----------------------------------------------------
       CATEGORY

       Examples:

       Sets
       Kurtas
       Sarees
       Abayas
       Dresses
       Churidars

       New categories can be added
       without changing this schema.
    ----------------------------------------------------- */

    category: {
      type: String,
      trim: true,
      default: "Other",
    },

    /* -----------------------------------------------------
       DESCRIPTION

       OPTIONAL because some supplier
       posts may not contain one.
    ----------------------------------------------------- */

    description: {
      type: String,
      trim: true,
      default: "",
    },

    /* -----------------------------------------------------
       PRODUCT IMAGES

       Normally our new admin will create
       one product for each uploaded cloth
       photo.

       Keeping this as an array gives us
       flexibility to support multiple
       photos of the SAME cloth later.
    ----------------------------------------------------- */

    images: {
      type: [imageSchema],
      default: [],
    },

    /* -----------------------------------------------------
       AVAILABILITY
    ----------------------------------------------------- */

    status: {
      type: String,

      enum: ["available", "sold-out"],

      default: "available",
    },
  },

  /* =======================================================
     AUTOMATIC MONGODB DATES

     Mongoose automatically creates:

     createdAt
     updatedAt

     We use createdAt to determine
     New Arrivals.
  ======================================================= */

  {
    timestamps: true,
  },
);

/* =========================================================
   INDEXES

   We intentionally DO NOT make
   product code unique.

   MongoDB's _id uniquely identifies
   every individual clothing item.
========================================================= */

productSchema.index({
  createdAt: -1,
});

productSchema.index({
  category: 1,
});

/* =========================================================
   EXPORT
========================================================= */

module.exports = mongoose.model("Product", productSchema);
