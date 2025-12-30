import express from 'express';
import {
  getAllShifts,
  getShiftById,
  createShift,
  updateShift,
  deleteShift,
  assignEmployeeToShift,
  removeEmployeeFromShift,
} from '../controllers/shiftController';

const router = express.Router();

// Shift routes
router.get('/', getAllShifts);
router.get('/:id', getShiftById);
router.post('/', createShift);
router.put('/:id', updateShift);
router.delete('/:id', deleteShift);

// Employee assignment routes
router.post('/:id/assign', assignEmployeeToShift);
router.post('/:id/remove', removeEmployeeFromShift);

export default router;