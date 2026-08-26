import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';

let isConfigured = false;

export function initCloudinary() {
  if (!isConfigured) {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true
      });
      isConfigured = true;
      console.log('☁️ Cloudinary initialized successfully.');
    }
  }
  return isConfigured;
}

/**
 * Uploads a local file to Cloudinary if configured; otherwise returns the local URL.
 * @param {string} localFilePath - Path to local file
 * @param {string} localUrl - Fallback URL e.g. /uploads/filename.jpg
 * @returns {Promise<string>} Uploaded or fallback image URL
 */
export async function uploadImage(localFilePath, localUrl) {
  if (!localFilePath || !fs.existsSync(localFilePath)) {
    return localUrl || '';
  }

  try {
    if (initCloudinary()) {
      const result = await cloudinary.uploader.upload(localFilePath, {
        folder: 'civicfix_complaints',
        resource_type: 'image'
      });
      if (result && result.secure_url) {
        return result.secure_url;
      }
    }
  } catch (err) {
    console.warn('Cloudinary upload warning (using local file fallback):', err.message);
  }

  return localUrl;
}
