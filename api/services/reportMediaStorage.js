const path = require("path");
const createError = require("http-errors");

const { ensureCloudinaryConfigured } = require("../config/cloudinary");

function sanitizeFilename(value) {
  const baseName = path.parse(String(value || "report-image")).name.toLowerCase();
  const sanitized = baseName
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

  return sanitized || "report-image";
}

async function uploadBufferToCloudinary(buffer, { reportId, originalFilename }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw createError(400, "Image file is empty");
  }

  const cloudinary = ensureCloudinaryConfigured();
  const folder = `siara/reports/${reportId}`;
  const publicId = `${Date.now()}-${sanitizeFilename(originalFilename)}`;

  try {
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: publicId,
          resource_type: "image",
          overwrite: false,
        },
        (error, uploadResult) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(uploadResult);
        },
      );

      uploadStream.end(buffer);
    });

    if (!result?.secure_url || !result?.public_id) {
      throw createError(502, "Image upload did not return a valid storage response");
    }

    return {
      secureUrl: result.secure_url,
      storageKey: result.public_id,
    };
  } catch (error) {
    throw createError(502, "Failed to upload report image");
  }
}

async function deleteCloudinaryAsset(storageKey) {
  const normalizedStorageKey = String(storageKey || "").trim();
  if (!normalizedStorageKey) {
    return "skipped";
  }

  const cloudinary = ensureCloudinaryConfigured();

  try {
    const result = await cloudinary.uploader.destroy(normalizedStorageKey, {
      resource_type: "image",
      invalidate: true,
    });

    if (result?.result === "ok" || result?.result === "not found") {
      return result.result;
    }

    throw createError(502, "Failed to delete report image from storage");
  } catch (error) {
    if (error.status && error.expose) {
      throw error;
    }

    throw createError(502, "Failed to delete report image from storage");
  }
}

module.exports = {
  deleteCloudinaryAsset,
  uploadBufferToCloudinary,
};
