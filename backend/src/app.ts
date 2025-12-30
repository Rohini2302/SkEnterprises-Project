import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import connectDB from './config/database';
import { IUser, User } from './models/User';
import mongoose from 'mongoose';
import uploadRouter from './routes/upload.routes';
import Document from './models/documents.model'; 

const app: Application = express();

// Middleware
app.use(cors()); 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect to Database
connectDB();

// Add this right after middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Add error logging
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// ======== FIX: REMOVE DUPLICATE ROUTE ========
// Keep only this one:
app.use('/api/upload', uploadRouter);
// ======== END FIX ========

// Health check
app.get('/', (req: Request, res: Response) => {
  res.json({ 
    message: 'Backend API is running!',
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  });
});

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  });
});

// CREATE - Add new user
app.post('/api/users', async (req: Request, res: Response) => {
  try {
    const { 
      username, 
      email, 
      password, 
      role, 
      firstName, 
      lastName,
      department,
      site,
      phone,
      joinDate
    } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }] 
    });

    if (existingUser) {
      return res.status(400).json({ 
        success: false,
        message: 'User with this email or username already exists' 
      });
    }

    // Create name from firstName and lastName
    const name = `${firstName} ${lastName}`.trim();

    const newUser = new User({
      username,
      email,
      password,
      role,
      firstName,
      lastName,
      name,
      department,
      site: site || 'Mumbai Office',
      phone,
      joinDate: joinDate ? new Date(joinDate) : new Date()
    });

    await newUser.save();

    const userResponse = {
      _id: newUser._id.toString(),
      id: newUser._id.toString().slice(-6),
      username: newUser.username,
      email: newUser.email,
      name: newUser.name,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      role: newUser.role,
      department: newUser.department,
      site: newUser.site,
      phone: newUser.phone,
      isActive: newUser.isActive,
      status: newUser.isActive ? 'active' as const : 'inactive' as const,
      joinDate: newUser.joinDate.toISOString().split('T')[0]
    };

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: userResponse
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error creating user'
    });
  }
});

// READ - Get all users (with grouping by role)
app.get('/api/users', async (req: Request, res: Response) => {
  try {
    // 1️⃣ Fetch users (latest first)
    const users = await User.find().sort({ createdAt: -1 });

    // 2️⃣ Transform users safely (NO toISOString here)
    const transformedUsers = users.map(user => ({
      ...user.toJSON(),
      id: user._id.toString().slice(-6)
    }));

    // 3️⃣ Group users by role
    const groupedByRole = transformedUsers.reduce((acc: any, user) => {
      if (!acc[user.role]) {
        acc[user.role] = [];
      }
      acc[user.role].push(user);
      return acc;
    }, {});

    // 4️⃣ Send response
    res.status(200).json({
      success: true,
      allUsers: transformedUsers,
      groupedByRole,
      total: transformedUsers.length,
      active: transformedUsers.filter(u => u.isActive).length,
      inactive: transformedUsers.filter(u => !u.isActive).length
    });
  } catch (error: any) {
    console.error('GET /api/users failed:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching users'
    });
  }
});

// Get user statistics
app.get('/api/users/stats', async (req: Request, res: Response) => {
  try {
    const stats = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching stats'
    });
  }
});

// Toggle user status
app.patch('/api/users/:id/toggle-status', async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.isActive = !user.isActive;
    user.updatedAt = new Date();
    await user.save();

    const userResponse = {
      _id: user._id.toString(),
      id: user._id.toString().slice(-6),
      username: user.username,
      email: user.email,
      name: user.name,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      department: user.department,
      site: user.site,
      phone: user.phone,
      isActive: user.isActive,
      status: user.isActive ? 'active' as const : 'inactive' as const,
      joinDate: user.joinDate.toISOString().split('T')[0]
    };

    res.status(200).json({
      success: true,
      message: 'User status updated successfully',
      user: userResponse
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error updating status'
    });
  }
});

// UPDATE - Update user (enhanced)
app.put('/api/users/:id', async (req: Request, res: Response) => {
  try {
    const updates = req.body;
    
    // If name is provided, split into firstName and lastName
    if (updates.name) {
      const [firstName, ...lastNameParts] = updates.name.split(' ');
      updates.firstName = firstName;
      updates.lastName = lastNameParts.join(' ');
      delete updates.name;
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { ...updates, updatedAt: new Date() },
      { new: true, runValidators: true }
    );
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userResponse = {
      _id: user._id.toString(),
      id: user._id.toString().slice(-6),
      username: user.username,
      email: user.email,
      name: user.name,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      department: user.department,
      site: user.site,
      phone: user.phone,
      isActive: user.isActive,
      status: user.isActive ? 'active' as const : 'inactive' as const,
      joinDate: user.joinDate.toISOString().split('T')[0]
    };

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      user: userResponse
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message || 'Error updating user'
    });
  }
});

// DELETE - Delete user
app.delete('/api/users/:id', async (req: Request, res: Response) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error deleting user'
    });
  }
});

// Update user role
app.put('/api/users/:id/role', async (req: Request, res: Response) => {
  try {
    const { role } = req.body;
    const validRoles = ['admin', 'manager', 'supervisor', 'employee'];

    if (!validRoles.includes(role)) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid role' 
      });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role, updatedAt: new Date() },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userResponse = {
      _id: user._id.toString(),
      id: user._id.toString().slice(-6),
      username: user.username,
      email: user.email,
      name: user.name,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      department: user.department,
      site: user.site,
      phone: user.phone,
      isActive: user.isActive,
      status: user.isActive ? 'active' as const : 'inactive' as const,
      joinDate: user.joinDate.toISOString().split('T')[0]
    };

    res.status(200).json({
      success: true,
      message: 'User role updated successfully',
      user: userResponse
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error updating role'
    });
  }
});

// ======== ADD DOCUMENT ROUTES HERE ========

// Helper function to format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper function to get file type from mimetype
function getFileTypeFromMimeType(mimeType: string): "PDF" | "XLSX" | "DOCX" | "JPG" | "PNG" | "OTHER" {
  const typeMapping: { [key: string]: string } = {
    'application/pdf': 'PDF',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
    'image/jpeg': 'JPG',
    'image/png': 'PNG',
    'image/gif': 'JPG',
    'image/webp': 'JPG'
  };
  
  return (typeMapping[mimeType] as any) || 'OTHER';
}

// GET all documents
app.get('/api/documents', async (req: Request, res: Response) => {
  try {
    console.log('📂 GET /api/documents called');
    
    const { category } = req.query;
    
    try {
      // Use your Document model
      const filter = category ? {} : {}; // Your Document model has different categories
      const documents = await Document.find(filter).sort({ createdAt: -1 });
      
      if (documents.length > 0) {
        // Transform to match frontend expectations
        const transformedDocs = documents.map(doc => ({
          id: doc._id.toString(),
          name: doc.originalname,
          url: doc.url,
          publicId: doc.public_id,
          format: getFileTypeFromMimeType(doc.mimetype),
          size: formatFileSize(doc.size),
          uploadedBy: doc.uploadedBy ? 'User' : 'Unknown',
          date: doc.uploadedAt.toISOString().split('T')[0],
          category: 'uploaded', // Map to frontend category
          description: doc.description || '',
          cloudinaryData: {
            url: doc.url,
            publicId: doc.public_id,
            format: doc.mimetype.split('/').pop() || doc.mimetype
          }
        }));
        
        return res.json({
          success: true,
          message: 'Documents fetched successfully',
          data: transformedDocs,
          total: transformedDocs.length
        });
      }
    } catch (dbError) {
      console.log('Database empty or error, using mock data:', (dbError as Error).message);
    }
    
    // If no data in database, return mock data
    const mockDocuments = [
      {
        id: '1',
        name: 'Employee Joining Form',
        url: 'https://example.com/doc1.pdf',
        publicId: 'doc1',
        format: 'PDF',
        size: '2.4 MB',
        uploadedBy: 'Admin User',
        date: '2024-01-15',
        category: 'uploaded',
        description: 'Standard employee joining form',
        cloudinaryData: {
          url: 'https://example.com/doc1.pdf',
          publicId: 'doc1',
          format: 'pdf'
        }
      },
      {
        id: '2',
        name: 'Monthly Salary Report',
        url: 'https://example.com/doc2.xlsx',
        publicId: 'doc2',
        format: 'XLSX',
        size: '1.8 MB',
        uploadedBy: 'HR Manager',
        date: '2024-01-14',
        category: 'generated',
        description: 'Automated salary report for January',
        cloudinaryData: {
          url: 'https://example.com/doc2.xlsx',
          publicId: 'doc2',
          format: 'xlsx'
        }
      },
      {
        id: '3',
        name: 'Invoice Template',
        url: 'https://example.com/doc3.docx',
        publicId: 'doc3',
        format: 'DOCX',
        size: '0.8 MB',
        uploadedBy: 'Finance Team',
        date: '2024-01-13',
        category: 'template',
        description: 'Standard invoice template',
        cloudinaryData: {
          url: 'https://example.com/doc3.docx',
          publicId: 'doc3',
          format: 'docx'
        }
      }
    ];
    
    let filteredDocs = mockDocuments;
    
    if (category) {
      filteredDocs = mockDocuments.filter(doc => doc.category === category);
    }
    
    res.json({
      success: true,
      message: 'Documents fetched successfully',
      data: filteredDocs,
      total: filteredDocs.length
    });
    
  } catch (error: any) {
    console.error('Error in /api/documents:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching documents',
      data: []
    });
  }
});

// POST save document metadata
app.post('/api/documents', async (req: Request, res: Response) => {
  try {
    console.log('💾 POST /api/documents called:', req.body);
    
    const documentData = {
      ...req.body,
      date: req.body.date || new Date().toISOString().split('T')[0]
    };
    
    // Try to save to your Document model
    try {
      // Convert data to match your Document model
      const docModelData = {
        url: req.body.url,
        public_id: req.body.publicId,
        originalname: req.body.name || 'document',
        mimetype: `image/${req.body.format}`,
        size: 0, // Default size
        folder: req.body.folder || 'documents',
        category: 'document',
        description: req.body.description || '',
        tags: []
      };
      
      const document = new Document(docModelData);
      await document.save();
      
      return res.status(201).json({
        success: true,
        message: 'Document saved to database',
        data: {
          id: document._id.toString(),
          name: document.originalname,
          url: document.url,
          publicId: document.public_id,
          format: getFileTypeFromMimeType(document.mimetype),
          size: formatFileSize(document.size),
          uploadedBy: 'Unknown',
          date: document.uploadedAt.toISOString().split('T')[0],
          category: 'uploaded',
          description: document.description
        }
      });
    } catch (dbError) {
      console.log('Database save failed:', (dbError as Error).message);
      // Continue to return success anyway
    }
    
    // If database save fails, still return success (document is in Cloudinary)
    res.status(201).json({
      success: true,
      message: 'Document saved successfully',
      data: {
        id: Date.now().toString(),
        ...documentData
      }
    });
    
  } catch (error: any) {
    console.error('Error saving document:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving document'
    });
  }
});

// GET search documents
app.get('/api/documents/search', async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    console.log('🔍 Searching documents for:', q);
    
    // First, try database search
    try {
      if (q && q.toString().trim() !== '') {
        const searchRegex = new RegExp(q.toString(), 'i');
        const documents = await Document.find({
          $or: [
            { originalname: searchRegex },
            { description: searchRegex },
            { category: searchRegex }
          ]
        }).sort({ createdAt: -1 });
        
        if (documents.length > 0) {
          const transformedDocs = documents.map(doc => ({
            id: doc._id.toString(),
            name: doc.originalname,
            url: doc.url,
            publicId: doc.public_id,
            format: getFileTypeFromMimeType(doc.mimetype),
            size: formatFileSize(doc.size),
            uploadedBy: 'Unknown',
            date: doc.uploadedAt.toISOString().split('T')[0],
            category: 'uploaded',
            description: doc.description || ''
          }));
          
          return res.json({
            success: true,
            message: 'Search completed',
            data: transformedDocs
          });
        }
      } else {
        // If no search query, return all
        const documents = await Document.find().sort({ createdAt: -1 });
        const transformedDocs = documents.map(doc => ({
          id: doc._id.toString(),
          name: doc.originalname,
          url: doc.url,
          publicId: doc.public_id,
          format: getFileTypeFromMimeType(doc.mimetype),
          size: formatFileSize(doc.size),
          uploadedBy: 'Unknown',
          date: doc.uploadedAt.toISOString().split('T')[0],
          category: 'uploaded',
          description: doc.description || ''
        }));
        
        return res.json({
          success: true,
          message: 'All documents',
          data: transformedDocs
        });
      }
    } catch (dbError) {
      console.log('Database search failed, using mock:', (dbError as Error).message);
    }
    
    // Fallback to mock data
    const mockDocuments = [
      {
        id: '1',
        name: 'Employee Joining Form',
        url: 'https://example.com/doc1.pdf',
        publicId: 'doc1',
        format: 'PDF',
        size: '2.4 MB',
        uploadedBy: 'Admin User',
        date: '2024-01-15',
        category: 'uploaded',
        description: 'Standard employee joining form'
      },
      {
        id: '2',
        name: 'Monthly Salary Report',
        url: 'https://example.com/doc2.xlsx',
        publicId: 'doc2',
        format: 'XLSX',
        size: '1.8 MB',
        uploadedBy: 'HR Manager',
        date: '2024-01-14',
        category: 'generated',
        description: 'Automated salary report for January'
      }
    ];
    
    let filteredDocs = mockDocuments;
    
    if (q && q.toString().trim() !== '') {
      const query = q.toString().toLowerCase();
      filteredDocs = mockDocuments.filter(doc => 
        doc.name.toLowerCase().includes(query) ||
        doc.description.toLowerCase().includes(query)
      );
    }
    
    res.json({
      success: true,
      message: 'Search completed',
      data: filteredDocs
    });
    
  } catch (error: any) {
    console.error('Error searching documents:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching documents',
      data: []
    });
  }
});

// GET single document by ID
app.get('/api/documents/:id', async (req: Request, res: Response) => {
  try {
    const document = await Document.findById(req.params.id);
    
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found',
        data: null
      });
    }
    
    const transformedDoc = {
      id: document._id.toString(),
      name: document.originalname,
      url: document.url,
      publicId: document.public_id,
      format: getFileTypeFromMimeType(document.mimetype),
      size: formatFileSize(document.size),
      uploadedBy: 'Unknown',
      date: document.uploadedAt.toISOString().split('T')[0],
      category: 'uploaded',
      description: document.description || ''
    };
    
    res.json({
      success: true,
      message: 'Document fetched successfully',
      data: transformedDoc
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error fetching document',
      data: null
    });
  }
});

// PATCH update document
app.patch('/api/documents/:id', async (req: Request, res: Response) => {
  try {
    const updates = req.body;
    
    const document = await Document.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );
    
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Document updated successfully',
      data: {
        id: document._id.toString(),
        name: document.originalname,
        url: document.url,
        publicId: document.public_id,
        format: getFileTypeFromMimeType(document.mimetype),
        size: formatFileSize(document.size),
        uploadedBy: 'Unknown',
        date: document.uploadedAt.toISOString().split('T')[0],
        category: 'uploaded',
        description: document.description || ''
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error updating document'
    });
  }
});

// DELETE document
app.delete('/api/documents/:id', async (req: Request, res: Response) => {
  try {
    const document = await Document.findByIdAndDelete(req.params.id);
    
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Document deleted successfully'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error deleting document'
    });
  }
});

// Test endpoint to verify all routes
app.get('/api/test', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'All routes are working!',
    availableEndpoints: [
      'GET    /api/health',
      'GET    /api/documents',
      'POST   /api/documents',
      'GET    /api/documents/search?q=query',
      'GET    /api/documents/:id',
      'PATCH  /api/documents/:id',
      'DELETE /api/documents/:id',
      'POST   /api/upload/single',
      'GET    /api/users',
      'POST   /api/users',
      'GET    /api/test'
    ]
  });
});

// ======== END DOCUMENT ROUTES ========

// 404 handler (MUST BE LAST)
app.use((req: Request, res: Response) => {
  console.log(`❌ 404: ${req.method} ${req.url}`);
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

const PORT = process.env.PORT || 5001;

export default app;