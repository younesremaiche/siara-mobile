const createError = require("http-errors");
const { v2: cloudinary } = require("cloudinary");

let isConfigured = false;

function getCloudinaryConfig() {
  return {
    cloud_name: String(process.env.CLOUDINARY_CLOUD_NAME || "").trim(),
    api_key: String(process.env.CLOUDINARY_API_KEY || "").trim(),
    api_secret: String(process.env.CLOUDINARY_API_SECRET || "").trim(),
    secure: true,
  };
}

function isCloudinaryConfigured() {
  const config = getCloudinaryConfig();
  return Boolean(config.cloud_name && config.api_key && config.api_secret);
}

function configureCloudinary() {
  if (!isCloudinaryConfigured()) {
    return null;
  }

  if (!isConfigured) {
    cloudinary.config(getCloudinaryConfig());
    isConfigured = true;
  }

  return cloudinary;
}

function ensureCloudinaryConfigured() {
  const client = configureCloudinary();
  if (!client) {
    throw createError(500, "Cloudinary is not configured");
  }
  return client;
}

module.exports = {
  cloudinary,
  configureCloudinary,
  ensureCloudinaryConfigured,
  isCloudinaryConfigured,
};
