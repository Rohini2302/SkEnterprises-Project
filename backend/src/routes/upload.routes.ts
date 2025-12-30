import { Router } from 'express';
import multer from 'multer';
import UploadController from '../controllers/upload.controller';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

// Single file upload
router.post('/single', upload.single('file'), UploadController.uploadSingle);

// Multiple files upload
router.post('/multiple', upload.array('files', 10), UploadController.uploadMultiple);

// Delete file
router.delete('/:publicId', UploadController.deleteFile);

export default router;