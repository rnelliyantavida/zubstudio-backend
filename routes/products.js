const express = require("express");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const mongoose = require("mongoose");
const Product = require("../models/Product");

const router = express.Router();

/* =========================================================
   CLOUDINARY CONFIG
========================================================= */

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* =========================================================
   MULTER

   Images are temporarily kept in memory
   before being uploaded to Cloudinary.
========================================================= */

const storage = multer.memoryStorage();

const upload = multer({
  storage,

  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 6,
  },

  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed."));
    }

    cb(null, true);
  },
});

/* =========================================================
   UPLOAD ONE IMAGE TO CLOUDINARY
========================================================= */

function uploadToCloudinary(file) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "zubstudio/products",
        resource_type: "image",
      },

      (error, result) => {
        if (error) {
          return reject(error);
        }

        resolve({
          url: result.secure_url,
          publicId: result.public_id,
        });
      },
    );

    uploadStream.end(file.buffer);
  });
}

/* =========================================================
   DELETE CLOUDINARY IMAGE

   Helper used if something goes wrong.
========================================================= */

async function deleteCloudinaryImage(publicId) {
  if (!publicId) {
    return;
  }

  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error("Cloudinary cleanup error:", error);
  }
}

/* =========================================================
   GET AVAILABLE PRODUCTS
   CUSTOMER STORE

   Newest products come first.

   createdAt is automatically generated
   by Mongoose timestamps.
========================================================= */

router.get(
  "/",

  async (req, res) => {
    try {
      const products = await Product.find({
        status: "available",
      }).sort({
        createdAt: -1,
      });

      res.json(products);
    } catch (error) {
      console.error("Load products error:", error);

      res.status(500).json({
        message: "Unable to load products.",
      });
    }
  },
);

/* =========================================================
   GET ALL PRODUCTS
   ADMIN

   Includes available + sold-out.
========================================================= */

router.get(
  "/admin/all",

  async (req, res) => {
    try {
      const products = await Product.find().sort({
        createdAt: -1,
      });

      res.json(products);
    } catch (error) {
      console.error("Load admin products error:", error);

      res.status(500).json({
        message: "Unable to load products.",
      });
    }
  },
);

/* =========================================================
   CREATE PRODUCT

   IMPORTANT RULES:

   - Name is required
   - Price is required
   - Code is OPTIONAL
   - Description is OPTIONAL
   - Duplicate codes ARE ALLOWED
   - No duplicate-code check
   - Images go to Cloudinary
   - Product goes to MongoDB

   The frontend sends one request for
   each different cloth image.

   Example:

   Nop37 + photo 1 -> MongoDB Product A
   Nop37 + photo 2 -> MongoDB Product B
   Nop37 + photo 3 -> MongoDB Product C

   Each product has its own MongoDB _id.
========================================================= */

router.post(
  "/",

  upload.array("images", 6),

  async (req, res) => {
    const uploadedImages = [];

    try {
      const { name, code, price, description, status } = req.body;

      /* =====================================================
         CLEAN VALUES
      ===================================================== */

      const cleanName = name?.trim();

      const cleanCode = code?.trim();

      const cleanDescription = description?.trim();

      const numericPrice = Number(price);

      /* =====================================================
         VALIDATE NAME
      ===================================================== */

      if (!cleanName) {
        return res.status(400).json({
          message: "Product name is required.",
        });
      }

      /* =====================================================
         VALIDATE PRICE

         Allows values such as:
         0
         1599
         2499.50
      ===================================================== */

      if (
        price === undefined ||
        price === null ||
        String(price).trim() === "" ||
        !Number.isFinite(numericPrice) ||
        numericPrice < 0
      ) {
        return res.status(400).json({
          message: "Please enter a valid product price.",
        });
      }

      /* =====================================================
         REQUIRE AT LEAST ONE IMAGE
      ===================================================== */

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          message: "Please upload at least one product photo.",
        });
      }

      /* =====================================================
         UPLOAD PHOTOS TO CLOUDINARY
      ===================================================== */

      for (const file of req.files) {
        const image = await uploadToCloudinary(file);

        uploadedImages.push(image);
      }

      /* =====================================================
         BUILD PRODUCT

         We only add optional attributes
         when they actually have values.
      ===================================================== */

      const productData = {
        name: cleanName,

        price: numericPrice,

        images: uploadedImages,

        status: status === "sold-out" ? "sold-out" : "available",
      };

      /* =====================================================
         OPTIONAL CODE

         NO CODE:
         field is not sent to Product.create()

         SAME CODE:
         completely allowed.
      ===================================================== */

      if (cleanCode) {
        productData.code = cleanCode;
      }

      /* =====================================================
         OPTIONAL DESCRIPTION
      ===================================================== */

      if (cleanDescription) {
        productData.description = cleanDescription;
      }

      /* =====================================================
         CREATE PRODUCT IN MONGODB
      ===================================================== */

      const product = await Product.create(productData);

      /* =====================================================
         SUCCESS
      ===================================================== */

      res.status(201).json(product);
    } catch (error) {
      console.error("Create product error:", error);

      /*
        If Cloudinary upload succeeded
        but MongoDB failed, remove the
        uploaded images so we don't
        leave unused images behind.
      */

      for (const image of uploadedImages) {
        await deleteCloudinaryImage(image.publicId);
      }

      /* =====================================================
         DUPLICATE KEY ERROR

         This should no longer happen
         for code after removing code_1.

         This gives us a useful message
         if another unique index ever
         causes the problem.
      ===================================================== */

      if (error?.code === 11000) {
        return res.status(409).json({
          message:
            "A database field that should allow duplicates still has a unique index. Check MongoDB indexes.",
        });
      }

      res.status(500).json({
        message: "Unable to create product.",
      });
    }
  },
);

/* =========================================================
   MARK PRODUCT SOLD OUT
========================================================= */

router.patch(
  "/:id/sold",

  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          message: "Invalid product ID.",
        });
      }

      const product = await Product.findByIdAndUpdate(
        req.params.id,

        {
          status: "sold-out",
        },

        {
          new: true,
          runValidators: true,
        },
      );

      if (!product) {
        return res.status(404).json({
          message: "Product not found.",
        });
      }

      res.json(product);
    } catch (error) {
      console.error("Mark sold error:", error);

      res.status(500).json({
        message: "Unable to mark product sold.",
      });
    }
  },
);

/* =========================================================
   RESTORE SOLD-OUT PRODUCT
========================================================= */

router.patch(
  "/:id/restore",

  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          message: "Invalid product ID.",
        });
      }

      const product = await Product.findByIdAndUpdate(
        req.params.id,

        {
          status: "available",
        },

        {
          new: true,
          runValidators: true,
        },
      );

      if (!product) {
        return res.status(404).json({
          message: "Product not found.",
        });
      }

      res.json(product);
    } catch (error) {
      console.error("Restore product error:", error);

      res.status(500).json({
        message: "Unable to restore product.",
      });
    }
  },
);

/* =========================================================
   DELETE PRODUCT PERMANENTLY

   Deletes:

   1. Cloudinary images
   2. MongoDB product
========================================================= */

router.delete(
  "/:id",

  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          message: "Invalid product ID.",
        });
      }

      const product = await Product.findById(req.params.id);

      if (!product) {
        return res.status(404).json({
          message: "Product not found.",
        });
      }

      /* =====================================================
         DELETE CLOUDINARY IMAGES
      ===================================================== */

      if (Array.isArray(product.images)) {
        for (const image of product.images) {
          if (image?.publicId) {
            await deleteCloudinaryImage(image.publicId);
          }
        }
      }

      /* =====================================================
         DELETE MONGODB PRODUCT
      ===================================================== */

      await Product.findByIdAndDelete(req.params.id);

      res.json({
        message: "Product and images deleted permanently.",
      });
    } catch (error) {
      console.error("Delete product error:", error);

      res.status(500).json({
        message: "Unable to delete product.",
      });
    }
  },
);

/* =========================================================
   GET ONE PRODUCT

   KEEP THIS LAST because /:id
   is a dynamic route.
========================================================= */

router.get(
  "/:id",

  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          message: "Invalid product ID.",
        });
      }

      const product = await Product.findById(req.params.id);

      if (!product) {
        return res.status(404).json({
          message: "Product not found.",
        });
      }

      res.json(product);
    } catch (error) {
      console.error("Get product error:", error);

      res.status(500).json({
        message: "Unable to load product.",
      });
    }
  },
);

/* =========================================================
   MULTER / ROUTER ERROR HANDLER
========================================================= */

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        message: "Each image must be 10 MB or smaller.",
      });
    }

    if (error.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        message: "You can upload a maximum of 6 images at a time.",
      });
    }

    return res.status(400).json({
      message: error.message,
    });
  }

  if (error?.message === "Only image files are allowed.") {
    return res.status(400).json({
      message: error.message,
    });
  }

  next(error);
});

module.exports = router;
