const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");
const createError = require("http-errors");

const { configureCloudinary, isCloudinaryConfigured } = require("../config/cloudinary");

const LOCAL_STORAGE_KEY_PREFIX = "local:";
const REPORT_MEDIA_UPLOAD_ROOT = path.join(__dirname, "..", "uploads", "report-media");

function sanitizeFilename(value) {
  const baseName = path.parse(String(value || "report-image")).name.toLowerCase();
  const sanitized = baseName
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

  return sanitized || "report-image";
}

function normalizeImageExtension(originalFilename, mimeType) {
  const normalizedMimeType = String(mimeType || "").trim().toLowerCase();

  if (normalizedMimeType === "image/jpeg" || normalizedMimeType === "image/jpg" || normalizedMimeType === "image/pjpeg") {
    return "jpg";
  }
  if (normalizedMimeType === "image/png") {
    return "png";
  }
  if (normalizedMimeType === "image/webp") {
    return "webp";
  }

  const extension = String(path.extname(originalFilename || "")).trim().toLowerCase().replace(/^\./, "");
  if (extension === "jpeg" || extension === "jpg") {
    return "jpg";
  }
  if (extension === "png" || extension === "webp") {
    return extension;
  }

  return "jpg";
}

function buildLocalStorageKey({ reportId, filename }) {
  const normalizedReportId = String(reportId || "unknown").trim() || "unknown";
  return `${LOCAL_STORAGE_KEY_PREFIX}report-media/${normalizedReportId}/${filename}`;
}

function getLocalPathFromStorageKey(storageKey) {
  const normalizedStorageKey = String(storageKey || "").trim();
  if (!normalizedStorageKey.startsWith(LOCAL_STORAGE_KEY_PREFIX)) {
    return null;
  }

  const relativePath = normalizedStorageKey
    .slice(LOCAL_STORAGE_KEY_PREFIX.length)
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");

  const absolutePath = path.join(__dirname, "..", "uploads", relativePath);
  const uploadsRoot = path.join(__dirname, "..", "uploads");

  if (!absolutePath.startsWith(uploadsRoot)) {
    return null;
  }

  return absolutePath;
}

function buildPublicUrlFromStorageKey(storageKey) {
  const normalizedStorageKey = String(storageKey || "").trim();
  if (!normalizedStorageKey.startsWith(LOCAL_STORAGE_KEY_PREFIX)) {
    return "";
  }

  const relativePath = normalizedStorageKey
    .slice(LOCAL_STORAGE_KEY_PREFIX.length)
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");

  return `/uploads/${relativePath}`;
}

async function uploadBufferToLocalStorage(buffer, { reportId, originalFilename, mimeType }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw createError(400, "Image file is empty");
  } 

  const normalizedReportId = String(reportId || "unknown").trim() || "unknown";
  const extension = normalizeImageExtension(originalFilename, mimeType);
  const safeBaseName = sanitizeFilename(originalFilename);
  const randomSuffix = crypto.randomBytes(6).toString("hex");
  const filename = `${Date.now()}-${randomSuffix}-${safeBaseName}.${extension}`;
  const reportDirectory = path.join(REPORT_MEDIA_UPLOAD_ROOT, normalizedReportId);
  const absolutePath = path.join(reportDirectory, filename);

  await fs.mkdir(reportDirectory, { recursive: true });
  await fs.writeFile(absolutePath, buffer);

  const storageKey = buildLocalStorageKey({ reportId: normalizedReportId, filename });

  return {
    secureUrl: buildPublicUrlFromStorageKey(storageKey),
    storageKey,
  };
}

async function uploadBufferToCloudinary(buffer, { reportId, originalFilename, mimeType }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw createError(400, "Image file is empty");
  }

  if (!isCloudinaryConfigured()) {
    return uploadBufferToLocalStorage(buffer, { reportId, originalFilename, mimeType });
  }

  const cloudinary = configureCloudinary();
  if (!cloudinary) {
    return uploadBufferToLocalStorage(buffer, { reportId, originalFilename, mimeType });
  }

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
    console.warn("[reportMediaStorage] cloudinary_upload_failed_fallback_to_local", {
      reportId,
      message: error?.message || "unknown_error",
    });

    return uploadBufferToLocalStorage(buffer, { reportId, originalFilename, mimeType });
  }
}

async function deleteLocalAsset(storageKey) {
  const absolutePath = getLocalPathFromStorageKey(storageKey);
  if (!absolutePath) {
    return "skipped";
  }

  try {
    await fs.unlink(absolutePath);
    return "ok";
  } catch (error) {
    if (error?.code === "ENOENT") {
      return "not found";
    }

    throw createError(502, "Failed to delete report image from local storage");
  }
}

async function deleteCloudinaryAsset(storageKey) {
  const normalizedStorageKey = String(storageKey || "").trim();
  if (!normalizedStorageKey) {
    return "skipped";
  }

  if (normalizedStorageKey.startsWith(LOCAL_STORAGE_KEY_PREFIX)) {
    return deleteLocalAsset(normalizedStorageKey);
  }

  if (!isCloudinaryConfigured()) {
    return "skipped";
  }

  const cloudinary = configureCloudinary();
  if (!cloudinary) {
    return "skipped";
  }

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

async function ensureLocalUploadRoot() {
  await fs.mkdir(REPORT_MEDIA_UPLOAD_ROOT, { recursive: true });
}

module.exports = {
  deleteCloudinaryAsset,
  ensureLocalUploadRoot,
  uploadBufferToCloudinary,
  REPORT_MEDIA_UPLOAD_ROOT,
};
