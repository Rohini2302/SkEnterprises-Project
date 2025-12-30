// controllers/upload.controller.ts
import type { Request, Response } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import Document from '../models/documents.model';
import { IUser, User } from '../models/User';

const streamifier = require('streamifier');

// Custom Request interface with user property
// export interface AuthenticatedRequest extends Request {
//   user?: {
//     _id: string;
//     email?: string;
//     name?: string;
//     role?: string;
//   };
//   file?: Express.Multer.File;
//   files?: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] };
// }
export interface AuthenticatedRequest extends Request {
  user?: IUser;
  file?: Express.Multer.File;
  files?: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] };
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export class UploadController {
  static async uploadSingle(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded'
        });
      }

      if (!process.env.CLOUDINARY_CLOUD_NAME || 
          !process.env.CLOUDINARY_API_KEY || 
          !process.env.CLOUDINARY_API_SECRET) {
        throw new Error('Cloudinary configuration is missing');
      }

      const result = await new Promise<any>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            resource_type: 'auto',
            folder: req.body.folder || 'documents',
          },
          (error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve(result);
            }
          }
        );

        const bufferStream = streamifier.createReadStream(req.file!.buffer);
        bufferStream.pipe(uploadStream);
      });

      const documentData: any = {
        url: result.secure_url,
        public_id: result.public_id,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        folder: req.body.folder || 'documents',
      };

      if (req.body.description) {
        documentData.description = req.body.description;
      }
      
      if (req.body.tags) {
        documentData.tags = Array.isArray(req.body.tags) 
          ? req.body.tags 
          : req.body.tags.split(',').map((tag: string) => tag.trim());
      }

      // TypeScript now recognizes req.user
      if (req.user && req.user._id) {
        documentData.uploadedBy = req.user._id;
      }

      const document = new Document(documentData);
      const savedDocument = await document.save();
      
      res.status(201).json({
        success: true,
        message: 'File uploaded successfully',
        data: {
          url: result.secure_url,
          public_id: result.public_id,
          format: result.format,
          size: result.bytes,
          width: result.width,
          height: result.height,
          document: {
            id: savedDocument._id,
            url: savedDocument.url,
            public_id: savedDocument.public_id,
            originalname: savedDocument.originalname,
            mimetype: savedDocument.mimetype,
            size: savedDocument.size,
            folder: savedDocument.folder,
            category: savedDocument.category,
            description: savedDocument.description,
            tags: savedDocument.tags,
            uploadedAt: savedDocument.uploadedAt,
            createdAt: savedDocument.createdAt,
            updatedAt: savedDocument.updatedAt
          }
        }
      });

    } catch (error: any) {
      if (error.message.includes('Invalid credentials')) {
        return res.status(401).json({
          success: false,
          message: 'Cloudinary credentials are invalid',
          error: error.message
        });
      }
      
      if (error.message.includes('ENOTFOUND')) {
        return res.status(503).json({
          success: false,
          message: 'Cannot connect to Cloudinary service',
          error: 'Network error'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Upload failed'
      });
    }
  }

  static async uploadMultiple(req: AuthenticatedRequest, res: Response) {
    try {
      const files = req.files as Express.Multer.File[];
      
      if (!files || !Array.isArray(files) || files.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No files uploaded'
        });
      }

      if (!process.env.CLOUDINARY_CLOUD_NAME || 
          !process.env.CLOUDINARY_API_KEY || 
          !process.env.CLOUDINARY_API_SECRET) {
        throw new Error('Cloudinary configuration is missing');
      }

      const uploadPromises = files.map((file: Express.Multer.File, index: number) => {
        return new Promise<any>(async (resolve, reject) => {
          try {
            const result = await new Promise<any>((resolveUpload, rejectUpload) => {
              const uploadStream = cloudinary.uploader.upload_stream(
                {
                  resource_type: 'auto',
                  folder: req.body.folder || 'documents',
                },
                (error, result) => {
                  if (error) {
                    rejectUpload(error);
                  } else {
                    resolveUpload(result);
                  }
                }
              );

              const bufferStream = streamifier.createReadStream(file.buffer);
              bufferStream.pipe(uploadStream);
            });

            const documentData: any = {
              url: result.secure_url,
              public_id: result.public_id,
              originalname: file.originalname,
              mimetype: file.mimetype,
              size: file.size,
              folder: req.body.folder || 'documents',
            };

            if (req.body.descriptions && req.body.descriptions[index]) {
              documentData.description = req.body.descriptions[index];
            }
            
            if (req.body.tags && req.body.tags[index]) {
              documentData.tags = Array.isArray(req.body.tags[index]) 
                ? req.body.tags[index] 
                : req.body.tags[index].split(',').map((tag: string) => tag.trim());
            }

            // TypeScript now recognizes req.user
            if (req.user && req.user._id) {
              documentData.uploadedBy = req.user._id;
            }

            const document = new Document(documentData);
            const savedDocument = await document.save();
            
            resolve({
              cloudinary: result,
              document: savedDocument
            });
            
          } catch (error: any) {
            reject(error);
          }
        });
      });

      const results = await Promise.all(uploadPromises);
      
      const formattedResults = results.map((result: any, index: number) => ({
        index: index + 1,
        url: result.cloudinary.secure_url,
        public_id: result.cloudinary.public_id,
        format: result.cloudinary.format,
        size: result.cloudinary.bytes,
        width: result.cloudinary.width,
        height: result.cloudinary.height,
        document: {
          id: result.document._id,
          originalname: result.document.originalname,
          category: result.document.category,
          uploadedAt: result.document.uploadedAt
        }
      }));
      
      res.status(201).json({
        success: true,
        message: 'Files uploaded successfully',
        count: formattedResults.length,
        data: formattedResults
      });

    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Upload failed'
      });
    }
  }

  static async deleteFile(req: Request, res: Response) {
    try {
      const { publicId } = req.params;
      
      if (!process.env.CLOUDINARY_CLOUD_NAME || 
          !process.env.CLOUDINARY_API_KEY || 
          !process.env.CLOUDINARY_API_SECRET) {
        throw new Error('Cloudinary configuration is missing');
      }

      if (!publicId || publicId.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Public ID is required'
        });
      }

      const document = await Document.findOne({ public_id: publicId });
      
      if (document) {
        document.isArchived = true;
        await document.save();
      }

      const result = await cloudinary.uploader.destroy(publicId);
      
      if (result.result === 'ok') {
        res.status(200).json({
          success: true,
          message: 'File deleted successfully',
          documentArchived: !!document
        });
      } else if (result.result === 'not found') {
        if (document) {
          res.status(200).json({
            success: true,
            message: 'File marked as archived in database (not found in Cloudinary)',
            documentArchived: true
          });
        } else {
          res.status(404).json({
            success: false,
            message: 'File not found'
          });
        }
      } else {
        res.status(400).json({
          success: false,
          message: 'Failed to delete file',
          details: result
        });
      }

    } catch (error: any) {
      if (error.message.includes('Invalid credentials')) {
        return res.status(401).json({
          success: false,
          message: 'Cloudinary credentials are invalid',
          error: error.message
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Delete failed'
      });
    }
  }
}

export default UploadController;