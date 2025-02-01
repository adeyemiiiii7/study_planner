const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

// Create a CloudinaryStorage instance for handling various file types
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: (req, file) => {
    let folder = 'documents';
    if (file.mimetype.startsWith('image/')) {
      folder = 'images';
    }
    return {
      folder: folder,
      allowed_formats: ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'gif'],
    };
  },
});

// File filter to restrict file types
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'image/jpeg',
    'image/png',
    'image/gif'
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type. Only PDF, DOCX, JPG, JPEG, PNG, and GIF are allowed.'), false);
  }
};

// Set up multer with Cloudinary storage and file filter
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB file size limit
  },
});

module.exports = upload;