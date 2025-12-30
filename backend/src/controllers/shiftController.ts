import { Request, Response } from 'express';
import Shift, { IShift } from '../models/Shift';

// Get all shifts
export const getAllShifts = async (req: Request, res: Response): Promise<void> => {
  try {
    const shifts = await Shift.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: shifts });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching shifts', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

// Get single shift by ID
export const getShiftById = async (req: Request, res: Response): Promise<void> => {
  try {
    const shift = await Shift.findById(req.params.id);
    
    if (!shift) {
      res.status(404).json({ success: false, message: 'Shift not found' });
      return;
    }
    
    res.status(200).json({ success: true, data: shift });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching shift', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

// Create new shift
export const createShift = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, startTime, endTime, employees = [] } = req.body;

    // Basic validation
    if (!name || !startTime || !endTime) {
      res.status(400).json({ 
        success: false, 
        message: 'Name, startTime, and endTime are required' 
      });
      return;
    }

    const newShift: IShift = new Shift({
      name,
      startTime,
      endTime,
      employees,
    });

    const savedShift = await newShift.save();
    
    res.status(201).json({ 
      success: true, 
      message: 'Shift created successfully', 
      data: savedShift 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error creating shift', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

// Update shift
export const updateShift = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, startTime, endTime, employees } = req.body;
    
    const updatedShift = await Shift.findByIdAndUpdate(
      req.params.id,
      { name, startTime, endTime, employees },
      { new: true, runValidators: true }
    );

    if (!updatedShift) {
      res.status(404).json({ success: false, message: 'Shift not found' });
      return;
    }

    res.status(200).json({ 
      success: true, 
      message: 'Shift updated successfully', 
      data: updatedShift 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error updating shift', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

// Delete shift
export const deleteShift = async (req: Request, res: Response): Promise<void> => {
  try {
    const deletedShift = await Shift.findByIdAndDelete(req.params.id);

    if (!deletedShift) {
      res.status(404).json({ success: false, message: 'Shift not found' });
      return;
    }

    res.status(200).json({ 
      success: true, 
      message: 'Shift deleted successfully' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting shift', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

// Assign employee to shift
export const assignEmployeeToShift = async (req: Request, res: Response): Promise<void> => {
  try {
    const { employeeId } = req.body;
    
    if (!employeeId) {
      res.status(400).json({ success: false, message: 'Employee ID is required' });
      return;
    }

    const shift = await Shift.findById(req.params.id);
    
    if (!shift) {
      res.status(404).json({ success: false, message: 'Shift not found' });
      return;
    }

    // Check if employee already assigned
    if (shift.employees.includes(employeeId)) {
      res.status(400).json({ success: false, message: 'Employee already assigned to this shift' });
      return;
    }

    shift.employees.push(employeeId);
    const updatedShift = await shift.save();

    res.status(200).json({ 
      success: true, 
      message: 'Employee assigned successfully', 
      data: updatedShift 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error assigning employee', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

// Remove employee from shift
export const removeEmployeeFromShift = async (req: Request, res: Response): Promise<void> => {
  try {
    const { employeeId } = req.body;
    
    if (!employeeId) {
      res.status(400).json({ success: false, message: 'Employee ID is required' });
      return;
    }

    const shift = await Shift.findById(req.params.id);
    
    if (!shift) {
      res.status(404).json({ success: false, message: 'Shift not found' });
      return;
    }

    // Remove employee from array
    shift.employees = shift.employees.filter(id => id !== employeeId);
    const updatedShift = await shift.save();

    res.status(200).json({ 
      success: true, 
      message: 'Employee removed successfully', 
      data: updatedShift 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error removing employee', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};