import mongoose, { Schema, Document } from 'mongoose';

export interface IDocument extends Document {
  employeeId: string;
  employee: mongoose.Types.ObjectId;
  documentType: string;
  documentName: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  fileType: string;
  description?: string;
  uploadedBy: string;
  status: 'pending' | 'verified' | 'rejected';
  verifiedBy?: string;
  verifiedAt?: Date;
  expiryDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DocumentSchema: Schema = new Schema(
  {
    employeeId: {
      type: String,
      required: true,
      ref: 'Employee'
    },
    employee: {
      type: Schema.Types.ObjectId,
      ref: 'Employee',
      required: true
    },
    documentType: {
      type: String,
      required: [true, 'Document type is required'],
      enum: [
        'aadhar',
        'pan',
        'passport',
        'voter_id',
        'driving_license',
        'educational_certificate',
        'experience_letter',
        'bank_details',
        'photo',
        'signature',
        'medical_certificate',
        'police_verification',
        'epf_form',
        'esic_form',
        'appointment_letter',
        'resume',
        'other'
      ]
    },
    documentName: {
      type: String,
      required: [true, 'Document name is required'],
      trim: true
    },
    fileName: {
      type: String,
      required: [true, 'File name is required'],
      trim: true
    },
    filePath: {
      type: String,
      required: [true, 'File path is required']
    },
    fileSize: {
      type: Number,
      required: [true, 'File size is required']
    },
    fileType: {
      type: String,
      required: [true, 'File type is required'],
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    uploadedBy: {
      type: String,
      required: [true, 'Uploaded by is required'],
      trim: true
    },
    status: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending'
    },
    verifiedBy: {
      type: String,
      trim: true
    },
    verifiedAt: {
      type: Date
    },
    expiryDate: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

// Indexes
DocumentSchema.index({ employeeId: 1 });
DocumentSchema.index({ documentType: 1 });
DocumentSchema.index({ status: 1 });
DocumentSchema.index({ expiryDate: 1 });

export default mongoose.model<IDocument>('Document', DocumentSchema);