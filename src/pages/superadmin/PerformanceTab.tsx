// src/components/hrms/tabs/DeductionListTab.tsx
import { useState, useMemo, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, Plus, Edit, Trash2, Eye, Download, IndianRupee, Loader2 } from "lucide-react";
import { Deduction, Employee } from "./types";
import Pagination from "./Pagination";

// Dialog Components
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface DeductionListTabProps {
  // Optional props if you need to manage deductions from parent component
}

// Use import.meta.env for Vite
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5001/api";

// Create a cache object to prevent unnecessary refetches
const cache = {
  employees: {
    data: null as Employee[] | null,
    timestamp: 0,
    ttl: 5 * 60 * 1000 // 5 minutes cache TTL
  },
  deductions: {
    data: null as any,
    timestamp: 0,
    ttl: 2 * 60 * 1000 // 2 minutes cache TTL
  }
};

const DeductionListTab = ({}: DeductionListTabProps) => {
  // State for deductions (now managed locally)
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  
  const [deductionPage, setDeductionPage] = useState(1);
  const [deductionItemsPerPage, setDeductionItemsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [isAddingDeduction, setIsAddingDeduction] = useState(false);
  const [editingDeduction, setEditingDeduction] = useState<Deduction | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; deduction: Deduction | null }>({ open: false, deduction: null });
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [totalDeductionsCount, setTotalDeductionsCount] = useState(0);
  
  // State for employee loading
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(false);

  // Use refs to track mounted state
  const isMounted = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Deduction form state
  const [deductionForm, setDeductionForm] = useState({
    employeeId: "",
    type: "advance",
    amount: "",
    description: "",
    deductionDate: new Date().toISOString().split('T')[0],
    status: "pending",
    repaymentMonths: "",
    installmentAmount: "",
    fineAmount: "",
    appliedMonth: new Date().toISOString().slice(0, 7)
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Custom fetch function with cache control
  const fetchWithCache = async (url: string, options: RequestInit = {}, cacheKey: string, ttl: number) => {
    const now = Date.now();
    const cached = cache[cacheKey as keyof typeof cache];
    
    // Return cached data if it exists and is not expired
    if (cached.data && (now - cached.timestamp) < cached.ttl) {
      console.log(`Using cached data for ${cacheKey}`);
      return cached.data;
    }

    try {
      // Create new abort controller for this request
      abortControllerRef.current = new AbortController();
      
      const response = await fetch(url, {
        ...options,
        signal: abortControllerRef.current.signal,
        headers: {
          ...options.headers,
          'Cache-Control': 'no-cache', // Prevent browser cache
          'Pragma': 'no-cache',
        }
      });

      if (!isMounted.current) return null;

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // Update cache
      if (data.success) {
        cache[cacheKey as keyof typeof cache] = {
          data: data,
          timestamp: now,
          ttl
        };
      }
      
      return data;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Fetch aborted');
        return null;
      }
      throw error;
    }
  };

  // Fetch employees from MongoDB with caching
  const fetchEmployees = async (forceRefresh = false) => {
    if (!forceRefresh && cache.employees.data && (Date.now() - cache.employees.timestamp) < cache.employees.ttl) {
      // Use cached employees data
      const cachedData = cache.employees.data;
      if (isMounted.current) {
        setEmployees(cachedData);
      }
      return;
    }

    setIsLoadingEmployees(true);
    try {
      const data = await fetchWithCache(
        `${API_BASE_URL}/employees?status=active&limit=1000&_t=${Date.now()}`, // Add timestamp to prevent cache
        {},
        'employees',
        5 * 60 * 1000 // 5 minutes cache
      );

      if (!isMounted.current) return;

      if (data && data.success) {
        // Transform MongoDB data to match frontend type
        const transformedEmployees = data.data.map((employee: any) => ({
          id: employee._id, // Use MongoDB _id as id
          employeeId: employee.employeeId || `EMP${employee._id.toString().slice(-6)}`,
          name: employee.name,
          email: employee.email,
          phone: employee.phone,
          department: employee.department,
          position: employee.position,
          status: employee.status,
          salary: employee.salary || 0
        }));
        
        // Update cache
        cache.employees = {
          data: transformedEmployees,
          timestamp: Date.now(),
          ttl: 5 * 60 * 1000
        };
        
        setEmployees(transformedEmployees);
      } else if (data) {
        toast.error("Failed to fetch employees", {
          description: data.message || "Please try again"
        });
      }
    } catch (error: any) {
      console.error('Error fetching employees:', error);
      toast.error("Network Error", {
        description: "Unable to fetch employees. Please check your connection."
      });
    } finally {
      if (isMounted.current) {
        setIsLoadingEmployees(false);
      }
    }
  };

  // Fetch deductions from MongoDB
  const fetchDeductions = async (forceRefresh = false) => {
    if (!forceRefresh && cache.deductions.data && (Date.now() - cache.deductions.timestamp) < cache.deductions.ttl) {
      // Use cached deductions data
      const cachedData = cache.deductions.data;
      if (isMounted.current) {
        const transformedDeductions = cachedData.data.map((deduction: any) => ({
          id: deduction._id,
          employeeId: deduction.employeeId,
          type: deduction.type,
          amount: deduction.amount,
          description: deduction.description,
          deductionDate: new Date(deduction.deductionDate).toISOString().split('T')[0],
          status: deduction.status,
          repaymentMonths: deduction.repaymentMonths || 0,
          installmentAmount: deduction.installmentAmount || 0,
          fineAmount: deduction.fineAmount || 0,
          appliedMonth: deduction.appliedMonth
        }));
        
        setDeductions(transformedDeductions);
        setTotalDeductionsCount(cachedData.pagination?.totalItems || 0);
      }
      return;
    }

    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: deductionPage.toString(),
        limit: deductionItemsPerPage.toString(),
        ...(statusFilter !== 'all' && { status: statusFilter }),
        ...(typeFilter !== 'all' && { type: typeFilter }),
        ...(searchTerm && { search: searchTerm }),
        _t: Date.now().toString() // Add timestamp to prevent caching
      });

      const data = await fetchWithCache(
        `${API_BASE_URL}/deductions?${params}`,
        {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
          }
        },
        'deductions',
        2 * 60 * 1000 // 2 minutes cache
      );

      if (!isMounted.current) return;

      if (data && data.success) {
        // Transform MongoDB data to match frontend type
        const transformedDeductions = data.data.map((deduction: any) => ({
          id: deduction._id,
          employeeId: deduction.employeeId,
          type: deduction.type,
          amount: deduction.amount,
          description: deduction.description,
          deductionDate: new Date(deduction.deductionDate).toISOString().split('T')[0],
          status: deduction.status,
          repaymentMonths: deduction.repaymentMonths || 0,
          installmentAmount: deduction.installmentAmount || 0,
          fineAmount: deduction.fineAmount || 0,
          appliedMonth: deduction.appliedMonth
        }));
        
        setDeductions(transformedDeductions);
        setTotalDeductionsCount(data.pagination?.totalItems || 0);
      } else if (data) {
        toast.error("Failed to fetch deductions", {
          description: data.message || "Please try again"
        });
      }
    } catch (error: any) {
      console.error('Error fetching deductions:', error);
      toast.error("Network Error", {
        description: "Unable to connect to the server. Please check your connection."
      });
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
      }
    }
  };

  // Fetch deduction statistics
  const fetchDeductionStats = async () => {
    try {
      // Add timestamp to prevent caching
      const response = await fetch(`${API_BASE_URL}/deductions/stats?_t=${Date.now()}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          return data.data;
        }
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
    return null;
  };

  // Load employees and deductions on component mount
  useEffect(() => {
    fetchEmployees();
    fetchDeductions();
  }, []);

  // Load deductions when filters or pagination changes
  useEffect(() => {
    fetchDeductions(true); // Force refresh when filters change
  }, [deductionPage, deductionItemsPerPage, statusFilter, typeFilter]);

  // Load deductions when search term changes (with debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm !== undefined && isMounted.current) {
        setDeductionPage(1);
        fetchDeductions(true); // Force refresh on search
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Filter deductions based on search and filters with safe defaults
  const filteredDeductions = useMemo(() => {
    return (deductions || []).filter(deduction => {
      if (!deduction) return false;
      
      const employee = (employees || []).find(emp => emp && emp.employeeId === deduction.employeeId);
      const matchesSearch = 
        employee?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        employee?.employeeId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        deduction.description?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === "all" || deduction.status === statusFilter;
      const matchesType = typeFilter === "all" || deduction.type === typeFilter;
      
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [deductions, employees, searchTerm, statusFilter, typeFilter]);

  const paginatedDeductions = filteredDeductions.slice(
    (deductionPage - 1) * deductionItemsPerPage,
    deductionPage * deductionItemsPerPage
  );

  // Add new deduction to MongoDB
  const handleAddDeduction = async () => {
    if (!deductionForm.employeeId || !deductionForm.amount) {
      toast.error("Validation Error", {
        description: "Please fill in all required fields (Employee and Amount)"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const employee = employees.find(emp => emp.employeeId === deductionForm.employeeId);
      
      if (!employee) {
        toast.error("Employee Not Found", {
          description: "Selected employee not found"
        });
        return;
      }
      
      const deductionData = {
        employeeId: deductionForm.employeeId,
        employeeName: employee.name,
        employeeCode: employee.employeeId,
        type: deductionForm.type,
        amount: parseFloat(deductionForm.amount),
        description: deductionForm.description,
        deductionDate: deductionForm.deductionDate,
        status: deductionForm.status,
        repaymentMonths: deductionForm.repaymentMonths ? parseInt(deductionForm.repaymentMonths) : 0,
        fineAmount: deductionForm.fineAmount ? parseFloat(deductionForm.fineAmount) : 0,
        appliedMonth: deductionForm.appliedMonth
      };

      const response = await fetch(`${API_BASE_URL}/deductions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify(deductionData),
      });

      const data = await response.json();

      if (data.success) {
        // Invalidate cache
        cache.deductions.data = null;
        cache.deductions.timestamp = 0;
        
        // Transform MongoDB response to match frontend type
        const newDeduction: Deduction = {
          id: data.data._id,
          employeeId: data.data.employeeId,
          type: data.data.type,
          amount: data.data.amount,
          description: data.data.description,
          deductionDate: new Date(data.data.deductionDate).toISOString().split('T')[0],
          status: data.data.status,
          repaymentMonths: data.data.repaymentMonths || 0,
          installmentAmount: data.data.installmentAmount || 0,
          fineAmount: data.data.fineAmount || 0,
          appliedMonth: data.data.appliedMonth
        };

        setDeductions(prev => [...(prev || []), newDeduction]);
        setIsAddingDeduction(false);
        resetDeductionForm();
        
        toast.success("Success", {
          description: "Deduction added successfully!"
        });
        
        // Refresh the list
        fetchDeductions(true); // Force refresh
      } else {
        toast.error("Failed to add deduction", {
          description: data.message || "Please try again"
        });
      }
    } catch (error) {
      console.error('Error adding deduction:', error);
      toast.error("Network Error", {
        description: "Unable to save deduction. Please check your connection."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Update deduction in MongoDB
  const handleUpdateDeduction = async () => {
    if (!editingDeduction) return;

    setIsSubmitting(true);
    try {
      const employee = employees.find(emp => emp.employeeId === deductionForm.employeeId);
      
      if (!employee) {
        toast.error("Employee Not Found", {
          description: "Selected employee not found"
        });
        return;
      }
      
      const updateData = {
        employeeId: deductionForm.employeeId,
        employeeName: employee.name,
        employeeCode: employee.employeeId,
        type: deductionForm.type,
        amount: parseFloat(deductionForm.amount),
        description: deductionForm.description,
        deductionDate: deductionForm.deductionDate,
        status: deductionForm.status,
        repaymentMonths: deductionForm.repaymentMonths ? parseInt(deductionForm.repaymentMonths) : 0,
        fineAmount: deductionForm.fineAmount ? parseFloat(deductionForm.fineAmount) : 0,
        appliedMonth: deductionForm.appliedMonth
      };

      const response = await fetch(`${API_BASE_URL}/deductions/${editingDeduction.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify(updateData),
      });

      const data = await response.json();

      if (data.success) {
        // Invalidate cache
        cache.deductions.data = null;
        cache.deductions.timestamp = 0;
        
        // Update local state with transformed data
        const updatedDeduction: Deduction = {
          id: data.data._id,
          employeeId: data.data.employeeId,
          type: data.data.type,
          amount: data.data.amount,
          description: data.data.description,
          deductionDate: new Date(data.data.deductionDate).toISOString().split('T')[0],
          status: data.data.status,
          repaymentMonths: data.data.repaymentMonths || 0,
          installmentAmount: data.data.installmentAmount || 0,
          fineAmount: data.data.fineAmount || 0,
          appliedMonth: data.data.appliedMonth
        };

        setDeductions(prev => (prev || []).map(d => 
          d.id === updatedDeduction.id ? updatedDeduction : d
        ));
        setEditingDeduction(null);
        resetDeductionForm();
        
        toast.success("Success", {
          description: "Deduction updated successfully!"
        });
        
        // Refresh the list
        fetchDeductions(true); // Force refresh
      } else {
        toast.error("Failed to update deduction", {
          description: data.message || "Please try again"
        });
      }
    } catch (error) {
      console.error('Error updating deduction:', error);
      toast.error("Network Error", {
        description: "Unable to update deduction. Please check your connection."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete deduction from MongoDB
  const handleDeleteDeduction = async (id: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/deductions/${id}`, {
        method: 'DELETE',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });

      const data = await response.json();

      if (data.success) {
        // Invalidate cache
        cache.deductions.data = null;
        cache.deductions.timestamp = 0;
        
        setDeductions(prev => (prev || []).filter(d => d.id !== id));
        setDeleteDialog({ open: false, deduction: null });
        
        toast.success("Success", {
          description: "Deduction deleted successfully!"
        });
        
        // Refresh the list
        fetchDeductions(true); // Force refresh
      } else {
        toast.error("Failed to delete deduction", {
          description: data.message || "Please try again"
        });
      }
    } catch (error) {
      console.error('Error deleting deduction:', error);
      toast.error("Network Error", {
        description: "Unable to delete deduction. Please check your connection."
      });
    }
  };

  // Edit deduction
  const handleEditDeduction = (deduction: Deduction) => {
    setEditingDeduction(deduction);
    setDeductionForm({
      employeeId: deduction.employeeId.toString(),
      type: deduction.type,
      amount: deduction.amount.toString(),
      description: deduction.description || "",
      deductionDate: deduction.deductionDate || new Date().toISOString().split('T')[0],
      status: deduction.status,
      repaymentMonths: deduction.repaymentMonths?.toString() || "",
      installmentAmount: deduction.installmentAmount?.toString() || "",
      fineAmount: deduction.fineAmount?.toString() || "",
      appliedMonth: deduction.appliedMonth || new Date().toISOString().slice(0, 7)
    });
  };

  // Reset deduction form
  const resetDeductionForm = () => {
    setDeductionForm({
      employeeId: "",
      type: "advance",
      amount: "",
      description: "",
      deductionDate: new Date().toISOString().split('T')[0],
      status: "pending",
      repaymentMonths: "",
      installmentAmount: "",
      fineAmount: "",
      appliedMonth: new Date().toISOString().slice(0, 7)
    });
  };

  // Get status badge
  const getStatusBadge = (status: string) => {
    const variants = {
      pending: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100 hover:text-yellow-800",
      approved: "bg-blue-100 text-blue-800 hover:bg-blue-100 hover:text-blue-800",
      rejected: "bg-red-100 text-red-800 hover:bg-red-100 hover:text-red-800",
      completed: "bg-green-100 text-green-800 hover:bg-green-100 hover:text-green-800"
    };

    return (
      <Badge variant="secondary" className={variants[status as keyof typeof variants]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  // Get type badge
  const getTypeBadge = (type: string) => {
    const variants = {
      advance: "bg-purple-100 text-purple-800 hover:bg-purple-100 hover:text-purple-800",
      fine: "bg-orange-100 text-orange-800 hover:bg-orange-100 hover:text-orange-800",
      other: "bg-gray-100 text-gray-800 hover:bg-gray-100 hover:text-gray-800"
    };

    return (
      <Badge variant="secondary" className={variants[type as keyof typeof variants]}>
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </Badge>
    );
  };

  // Calculate summary statistics
  const [deductionStats, setDeductionStats] = useState({
    totalDeductions: 0,
    totalAdvances: 0,
    totalFines: 0,
    pendingCount: 0
  });

  // Fetch stats on component mount and when deductions change
  useEffect(() => {
    const loadStats = async () => {
      const stats = await fetchDeductionStats();
      if (stats) {
        setDeductionStats({
          totalDeductions: stats.totalDeductions || 0,
          totalAdvances: stats.totalAdvances || 0,
          totalFines: stats.totalFines || 0,
          pendingCount: stats.pendingCount || 0
        });
      } else {
        // Calculate locally if API fails
        const localStats = deductions.reduce(
          (acc, deduction) => {
            if (!deduction) return acc;
            acc.totalDeductions += deduction.amount || 0;
            if (deduction.type === 'advance') acc.totalAdvances += deduction.amount || 0;
            if (deduction.type === 'fine') acc.totalFines += deduction.fineAmount || deduction.amount || 0;
            if (deduction.status === 'pending') acc.pendingCount += 1;
            return acc;
          },
          { totalDeductions: 0, totalAdvances: 0, totalFines: 0, pendingCount: 0 }
        );
        setDeductionStats(localStats);
      }
    };
    loadStats();
  }, [deductions]);

  // Export deductions data to CSV
  const handleExportDeductions = () => {
    if (!deductions || deductions.length === 0) {
      toast.error("No Data", {
        description: "No deduction data to export"
      });
      return;
    }

    const csvContent = [
      ["Employee ID", "Employee Name", "Type", "Amount", "Fine Amount", "Description", "Deduction Date", "Status", "Repayment Months", "Installment Amount", "Applied Month"],
      ...(deductions || []).map(deduction => {
        if (!deduction) return [];
        const employee = (employees || []).find(emp => emp && emp.employeeId === deduction.employeeId);
        return [
          employee?.employeeId || "N/A",
          employee?.name || "N/A",
          deduction.type || "N/A",
          (deduction.amount || 0).toString(),
          (deduction.fineAmount || 0).toString(),
          deduction.description || "N/A",
          deduction.deductionDate || "N/A",
          deduction.status || "N/A",
          (deduction.repaymentMonths || 0).toString(),
          (deduction.installmentAmount || 0).toString(),
          deduction.appliedMonth || "N/A"
        ];
      })
    ].map(row => row.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `deductions_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success("Export Successful", {
      description: "Deduction data exported to CSV file"
    });
  };

  // Handle form input changes with calculation
  const handleFormChange = (field: string, value: string) => {
    if (field === 'amount' || field === 'repaymentMonths') {
      const amount = field === 'amount' ? parseFloat(value) || 0 : parseFloat(deductionForm.amount) || 0;
      const months = field === 'repaymentMonths' ? parseInt(value) || 0 : parseInt(deductionForm.repaymentMonths) || 0;
      const installment = months > 0 ? amount / months : amount;
      
      setDeductionForm(prev => ({
        ...prev,
        [field]: value,
        installmentAmount: installment.toFixed(2)
      }));
    } else {
      setDeductionForm(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };

  // Manual refresh function
  const handleManualRefresh = () => {
    // Clear all caches
    cache.employees.data = null;
    cache.employees.timestamp = 0;
    cache.deductions.data = null;
    cache.deductions.timestamp = 0;
    
    // Force refresh
    fetchEmployees(true);
    fetchDeductions(true);
  };

  return (
    <div className="space-y-6">
      {/* Add/Edit Deduction Dialog */}
      <Dialog open={isAddingDeduction || !!editingDeduction} onOpenChange={(open) => {
        if (!open) {
          setIsAddingDeduction(false);
          setEditingDeduction(null);
          resetDeductionForm();
        }
      }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingDeduction ? "Edit Deduction" : "Add New Deduction"}
            </DialogTitle>
            <DialogDescription>
              {editingDeduction ? "Update deduction information" : "Add a new salary deduction or advance"}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="employeeId">Employee *</Label>
              <Select 
                value={deductionForm.employeeId} 
                onValueChange={(value) => handleFormChange('employeeId', value)}
                disabled={isLoadingEmployees}
              >
                <SelectTrigger>
                  {isLoadingEmployees ? (
                    <div className="flex items-center">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Loading employees...
                    </div>
                  ) : (
                    <SelectValue placeholder="Select employee" />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {(employees || []).map(employee => (
                    employee && (
                      <SelectItem key={employee.employeeId} value={employee.employeeId}>
                        {employee.name} ({employee.employeeId}) - {employee.department}
                      </SelectItem>
                    )
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="type">Deduction Type *</Label>
              <Select 
                value={deductionForm.type} 
                onValueChange={(value) => handleFormChange('type', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="advance">Salary Advance</SelectItem>
                  <SelectItem value="fine">Fine/Penalty</SelectItem>
                  <SelectItem value="other">Other Deduction</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (₹) *</Label>
              <Input
                id="amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="Enter amount"
                value={deductionForm.amount}
                onChange={(e) => handleFormChange('amount', e.target.value)}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select 
                value={deductionForm.status} 
                onValueChange={(value) => handleFormChange('status', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="deductionDate">Deduction Date</Label>
              <Input
                id="deductionDate"
                type="date"
                value={deductionForm.deductionDate}
                onChange={(e) => handleFormChange('deductionDate', e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="appliedMonth">Applied Month</Label>
              <Input
                id="appliedMonth"
                type="month"
                value={deductionForm.appliedMonth}
                onChange={(e) => handleFormChange('appliedMonth', e.target.value)}
              />
            </div>
            
            {deductionForm.type === "advance" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="repaymentMonths">Repayment Months</Label>
                  <Input
                    id="repaymentMonths"
                    type="number"
                    min="0"
                    placeholder="Number of months for repayment"
                    value={deductionForm.repaymentMonths}
                    onChange={(e) => handleFormChange('repaymentMonths', e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="installmentAmount">Monthly Installment (₹)</Label>
                  <Input
                    id="installmentAmount"
                    type="number"
                    readOnly
                    placeholder="Monthly installment amount"
                    value={deductionForm.installmentAmount}
                  />
                </div>
              </>
            )}
            
            {deductionForm.type === "fine" && (
              <div className="space-y-2">
                <Label htmlFor="fineAmount">Fine Amount (₹)</Label>
                <Input
                  id="fineAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Fine amount"
                  value={deductionForm.fineAmount}
                  onChange={(e) => handleFormChange('fineAmount', e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              placeholder="Enter description for the deduction"
              value={deductionForm.description}
              onChange={(e) => handleFormChange('description', e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsAddingDeduction(false);
                setEditingDeduction(null);
                resetDeductionForm();
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button 
              onClick={editingDeduction ? handleUpdateDeduction : handleAddDeduction}
              disabled={isSubmitting || !deductionForm.employeeId || !deductionForm.amount}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingDeduction ? "Update Deduction" : "Add Deduction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ open, deduction: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Deduction</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this deduction record? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteDialog.deduction && handleDeleteDeduction(deleteDialog.deduction.id.toString())}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Deduction Management</h2>
          <p className="text-muted-foreground">Manage salary advances, fines, and other deductions</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handleExportDeductions}
            disabled={deductions.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button onClick={() => setIsAddingDeduction(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Deduction
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Deductions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center">
              <IndianRupee className="h-5 w-5 mr-1" />
              {deductionStats.totalDeductions.toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {totalDeductionsCount} total records
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Salary Advances</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600 flex items-center">
              <IndianRupee className="h-5 w-5 mr-1" />
              {deductionStats.totalAdvances.toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Fines/Penalties</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600 flex items-center">
              <IndianRupee className="h-5 w-5 mr-1" />
              {deductionStats.totalFines.toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {deductionStats.pendingCount}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle>Deduction Records</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by employee name, ID, or description..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      fetchDeductions(true);
                    }
                  }}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[160px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="advance">Salary Advance</SelectItem>
                  <SelectItem value="fine">Fine/Penalty</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <Button 
                variant="outline" 
                onClick={handleManualRefresh}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Refresh"
                )}
              </Button>
            </div>
          </div>

          {/* Deductions Table */}
          <div className="rounded-md border">
            {isLoading ? (
              <div className="flex justify-center items-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-2">Loading deductions...</span>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Fine Amount</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Installment</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Applied Month</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedDeductions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          {deductions && deductions.length === 0 ? "No deductions added yet" : "No deductions match your filters"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedDeductions.map((deduction) => {
                        if (!deduction) return null;
                        
                        const employee = (employees || []).find(emp => emp && emp.employeeId === deduction.employeeId);
                        
                        return (
                          <TableRow key={deduction.id}>
                            <TableCell>
                              <div>
                                <div className="font-medium">{employee?.name || "Unknown Employee"}</div>
                                <div className="text-sm text-muted-foreground">{employee?.employeeId || "N/A"}</div>
                                <div className="text-xs text-muted-foreground">{employee?.department || "N/A"}</div>
                              </div>
                            </TableCell>
                            <TableCell>{getTypeBadge(deduction.type)}</TableCell>
                            <TableCell>
                              <div className="flex items-center font-medium">
                                <IndianRupee className="h-4 w-4 mr-1" />
                                {(deduction.amount || 0).toLocaleString('en-IN', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2
                                })}
                              </div>
                            </TableCell>
                            <TableCell>
                              {deduction.type === "fine" ? (
                                <div className="flex items-center font-medium text-orange-600">
                                  <IndianRupee className="h-4 w-4 mr-1" />
                                  {(deduction.fineAmount || deduction.amount || 0).toLocaleString('en-IN', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2
                                  })}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="max-w-xs truncate" title={deduction.description || ""}>
                              {deduction.description || "No description"}
                            </TableCell>
                            <TableCell>
                              {deduction.type === "advance" && (deduction.installmentAmount || 0) > 0 ? (
                                <div className="flex items-center text-sm">
                                  <IndianRupee className="h-3 w-3 mr-1" />
                                  {(deduction.installmentAmount || 0).toLocaleString('en-IN', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2
                                  })}/month
                                  {deduction.repaymentMonths && deduction.repaymentMonths > 0 && (
                                    <span className="text-xs text-muted-foreground ml-2">
                                      ({deduction.repaymentMonths} months)
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>{getStatusBadge(deduction.status)}</TableCell>
                            <TableCell>{deduction.appliedMonth || "N/A"}</TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => handleEditDeduction(deduction)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => setDeleteDialog({ open: true, deduction })}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
                
                {filteredDeductions.length > 0 && (
                  <Pagination
                    currentPage={deductionPage}
                    totalPages={Math.ceil(totalDeductionsCount / deductionItemsPerPage)}
                    totalItems={totalDeductionsCount}
                    itemsPerPage={deductionItemsPerPage}
                    onPageChange={setDeductionPage}
                    onItemsPerPageChange={(value) => {
                      setDeductionItemsPerPage(value);
                      setDeductionPage(1); // Reset to first page when changing items per page
                    }}
                  />
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DeductionListTab;