"use client"

import { useState, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { fetchBudgetData, saveBudgetData, clearBudgetData, AirtableExpense } from "@/lib/airtable"
import { Trash2, Loader2, BarChart, LineChart } from "lucide-react"
import { ChevronLeft, ChevronRight, Plus, User, PieChart, ListOrdered, BarChart2 } from "lucide-react"
import { Bar, BarChart as BarChartComponent, Line, LineChart as LineChartComponent, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

interface Expense {
  id: string
  category: string
  amount: number
  description: string
  date: string // ISO date string
}

interface EditingExpense {
  expense: Expense
  amount: string
}

interface Category {
  name: string
  spent: number
}

const EXPENSE_CATEGORIES = ["food", "shopping", "grocery", "transport", "travel", "bill", "gifting", "other"]

// Spacing variables - adjust these to control the spacing throughout the app
const SPACING = {
  xs: "0.5rem",    // 8px
  sm: "0.75rem",   // 12px
  md: "1rem",      // 16px
  lg: "1.5rem",    // 24px
  xl: "2rem",      // 32px
  
  // Specific spacing for different sections
  sectionGap: "1rem",      // Gap between major sections (was 1.5rem)
  cardPadding: "1rem",     // Padding inside cards (was 1.25rem)
  itemGap: "0.5rem",       // Gap between items in a flex container
  verticalItemGap: "0.75rem", // Gap between stacked items
}

export default function BudgetTracker() {
  const [totalBudget, setTotalBudget] = useState(0)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [showPercentages, setShowPercentages] = useState(false)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [username] = useState("default_user") // Default username
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const [editingExpense, setEditingExpense] = useState<EditingExpense | null>(null)
  const [activeTab, setActiveTab] = useState("budget")
  const [allMonthlyExpenses, setAllMonthlyExpenses] = useState<Record<string, AirtableExpense[]>>({}); // Stores expenses for last 3 months, keyed by monthString
  const [selectedTrendCategory, setSelectedTrendCategory] = useState("combined") // "combined" or a specific category
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(false)
  
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false)
  const [newBudget, setNewBudget] = useState(totalBudget.toString())
  const [newExpense, setNewExpense] = useState({
    category: "",
    amount: "",
    description: "",
  })
  
  // Format month string for Airtable (YYYY-MM)
  const getMonthString = (date: Date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
  
  // Load data from Airtable when component mounts or month changes
  useEffect(() => {
    const loadBudgetData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const monthString = getMonthString(currentDate);
        const data = await fetchBudgetData(username, monthString);
        
        if (data) {
          setTotalBudget(data.budget);
          setNewBudget(data.budget.toString());
          
          // Set the showPercentages state from the database
          if (data.number_or_percent !== undefined) {
            setShowPercentages(data.number_or_percent);
          }
          
          // Convert Airtable expenses to app expenses
          const loadedExpenses: Expense[] = data.expenses.map(exp => {
            // Generate a default date in YYYY-MM-DD format if none exists
            let expenseDate = exp.date;
            if (!expenseDate) {
              const defaultDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 15);
              expenseDate = `${defaultDate.getFullYear()}-${String(defaultDate.getMonth() + 1).padStart(2, '0')}-${String(defaultDate.getDate()).padStart(2, '0')}`;
            }
            
            return {
              id: Math.random().toString(36).substr(2, 9),
              category: exp.category,
              amount: exp.amount,
              description: exp.description || "",
              date: expenseDate
            };
          });
          
          setExpenses(loadedExpenses);
        } else {
          // No data for this month yet - set budget to 0
          setTotalBudget(0);
          setNewBudget("0");
          setExpenses([]);
        }
      } catch (err) {
        setError("Failed to load budget data. Please check your connection.");
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadBudgetData();
  }, [currentDate, username]);

  // Fetch data for analytics tab when it's opened for the first time
  useEffect(() => {
    const fetchAllMonthlyExpenses = async () => {
      setIsAnalyticsLoading(true);
      const monthPromises: Promise<any>[] = [];
      const monthStrings: string[] = [];

      for (let i = 2; i >= 0; i--) {
        const date = new Date();
        date.setDate(1); // Set day to 1 to avoid month overflow issues
        date.setMonth(date.getMonth() - i);
        const monthString = getMonthString(date);
        monthStrings.push(monthString);
        monthPromises.push(fetchBudgetData(username, monthString));
      }

      try {
        const results = await Promise.all(monthPromises);
        const fetchedData: Record<string, AirtableExpense[]> = {};
        results.forEach((monthData, index) => {
          const monthString = monthStrings[index];
          fetchedData[monthString] = monthData ? monthData.expenses : [];
        });
        setAllMonthlyExpenses(fetchedData);
      } catch (err) {
        console.error("Failed to fetch monthly trend data:", err);
        // Optionally set an error state for the analytics tab
      } finally {
        setIsAnalyticsLoading(false);
      }
    };

    if (activeTab === 'analytics' && Object.keys(allMonthlyExpenses).length === 0) {
      fetchAllMonthlyExpenses();
    }
  }, [activeTab, username, allMonthlyExpenses]);

  // Compute monthlyData based on selectedTrendCategory from allMonthlyExpenses
  const monthlyData = useMemo(() => {
    const data = [];
    for (let i = 2; i >= 0; i--) {
      const date = new Date();
      date.setDate(1); // Set day to 1 to avoid month overflow issues
      date.setMonth(date.getMonth() - i);
      const monthString = getMonthString(date);
      const monthExpenses = allMonthlyExpenses[monthString] || [];

      let totalSpent = 0;
      if (selectedTrendCategory === "combined") {
        totalSpent = monthExpenses.reduce((sum, exp) => sum + exp.amount, 0);
      } else {
        totalSpent = monthExpenses
          .filter(exp => exp.category === selectedTrendCategory.toLowerCase())
          .reduce((sum, exp) => sum + exp.amount, 0);
      }

      data.push({
        month: date.toLocaleString('default', { month: 'short' }),
        spent: totalSpent,
      });
    }
    return data;
  }, [allMonthlyExpenses, selectedTrendCategory]);
  
  // Save data to Airtable whenever expenses, budget, or showPercentages changes
  useEffect(() => {
    const saveData = async () => {
      if (isLoading) return; // Don't save while loading
      
      // Only save if there are expenses or budget has been explicitly set
      const filteredExpenses = expenses.filter(expense => {
        const expenseDate = new Date(expense.date);
        return expenseDate.getMonth() === currentDate.getMonth() && 
               expenseDate.getFullYear() === currentDate.getFullYear();
      });
      
      // Don't save if there are no expenses and budget is 0 (default state for a new month)
      if (filteredExpenses.length === 0 && totalBudget === 0) {
        return;
      }
      
      setIsSaving(true);
      try {
        const monthString = getMonthString(currentDate);
        
        // Convert app expenses to Airtable expenses
        const airtableExpenses: AirtableExpense[] = filteredExpenses.map(exp => ({
          category: exp.category,
          amount: exp.amount,
          description: exp.description,
          date: exp.date // Include the date field
        }));
        
        await saveBudgetData({
          username,
          month: monthString,
          budget: totalBudget,
          expenses: airtableExpenses,
          number_or_percent: showPercentages
        });
      } catch (err) {
        console.error("Failed to save data:", err);
        // Don't show error to user for auto-saves
      } finally {
        setIsSaving(false);
      }
    };
    
    // Use a debounce to avoid too many saves
    const timeoutId = setTimeout(saveData, 1000);
    return () => clearTimeout(timeoutId);
  }, [expenses, totalBudget, showPercentages, currentDate, username, isLoading]);
  
  // Filter expenses for the current month
  const currentMonthExpenses = expenses.filter(expense => {
    const expenseDate = new Date(expense.date)
    return expenseDate.getMonth() === currentDate.getMonth() && 
           expenseDate.getFullYear() === currentDate.getFullYear()
  })

  // Calculate categories based on filtered expenses
  const calculateCategories = () => {
    const categoryMap: Record<string, number> = {}
    
    currentMonthExpenses.forEach(expense => {
      const displayName = expense.category.charAt(0).toUpperCase() + expense.category.slice(1)
      categoryMap[displayName] = (categoryMap[displayName] || 0) + expense.amount
    })
    
    return Object.entries(categoryMap).map(([name, spent]) => ({ name, spent }))
  }
  
  const currentCategories = calculateCategories()
  const totalSpent = currentCategories.reduce((sum, cat) => sum + cat.spent, 0)
  const remaining = totalBudget - totalSpent
  const dailyAllowance = Math.floor(remaining / 30)

  const handleBudgetUpdate = async () => {
    const budget = Number.parseFloat(newBudget)
    if (!isNaN(budget) && budget > 0) {
      setTotalBudget(budget)
      setBudgetDialogOpen(false)
    }
  }
  
  // Handle clearing all expenses for the current month - no confirmation
  const handleClearAll = async () => {
    setIsLoading(true);
    try {
      const monthString = getMonthString(currentDate);
      await clearBudgetData(username, monthString);
      setExpenses([]);
    } catch (err) {
      setError("Failed to clear expenses. Please try again.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  // Navigate to previous month
  const goToPreviousMonth = () => {
    setCurrentDate(prevDate => {
      const newDate = new Date(prevDate)
      newDate.setMonth(newDate.getMonth() - 1)
      return newDate
    })
  }
  
  // Navigate to next month
  const goToNextMonth = () => {
    setCurrentDate(prevDate => {
      const newDate = new Date(prevDate)
      newDate.setMonth(newDate.getMonth() + 1)
      return newDate
    })
  }

  const handleAddExpense = () => {
    const amount = Number.parseFloat(newExpense.amount)
    if (!isNaN(amount) && amount > 0 && newExpense.category) {
      // Format date as YYYY-MM-DD
      const today = new Date()
      const formattedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      
      const expense: Expense = {
        id: Date.now().toString(),
        category: newExpense.category,
        amount,
        description: newExpense.description,
        date: formattedDate // Add current date in YYYY-MM-DD format
      }

      // Add with animation effect
      setExpenses(prev => [...prev, expense])
      setNewExpense({ category: "", amount: "", description: "" })
      
      // Don't automatically expand the category
    }
  }
  
  // Handle editing an expense
  const handleEditExpense = (expense: Expense) => {
    setEditingExpense({
      expense,
      amount: expense.amount.toString()
    })
  }
  
  // Save edited expense
  const handleSaveEdit = () => {
    if (editingExpense) {
      const amount = Number.parseFloat(editingExpense.amount)
      if (!isNaN(amount) && amount > 0) {
        setExpenses(prev => 
          prev.map(exp => 
            exp.id === editingExpense.expense.id 
              ? { ...exp, amount } 
              : exp
          )
        )
        setEditingExpense(null)
      }
    }
  }
  
  // Cancel editing
  const handleCancelEdit = () => {
    setEditingExpense(null)
  }
  
  // Delete an expense - no confirmation
  const handleDeleteExpense = (id: string) => {
    // Mark the expense for deletion animation
    const expenseToDelete = expenses.find(exp => exp.id === id);
    if (expenseToDelete) {
      // Remove after a brief delay to allow for exit animation
      setTimeout(() => {
        setExpenses(prev => prev.filter(exp => exp.id !== id));
      }, 300);
    }
  }
  
  // Toggle category expansion
  const toggleCategory = (categoryName: string) => {
    if (expandedCategory === categoryName) {
      setExpandedCategory(null)
    } else {
      setExpandedCategory(categoryName)
    }
  }
  
  // Format date for display
  const formatDate = (dateString: string) => {
    // If the date is already in YYYY-MM-DD format, parse it correctly
    if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year, month, day] = dateString.split('-').map(Number)
      return new Date(year, month - 1, day).toLocaleDateString('en-US', { 
        day: 'numeric', 
        month: 'short',
        year: 'numeric'
      })
    } else {
      // Fall back to standard date parsing for ISO strings
      const date = new Date(dateString)
      return date.toLocaleDateString('en-US', { 
        day: 'numeric', 
        month: 'short',
        year: 'numeric'
      })
    }
  }

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString("en-IN")}`
  }

  return (
    <div className="max-w-sm mx-auto bg-[#F2F2F7] min-h-screen font-sans overflow-hidden">
      {/* iOS-style Header */}
      <div className="flex items-center justify-between p-4 pt-6 pb-6">
        <h1 className="text-2xl font-semibold text-[#1C1C1E]">Simple Budget</h1>
        <Avatar className="w-8 h-8 bg-[#007AFF] text-white">
          <AvatarFallback>
            <User className="w-4 h-4" />
          </AvatarFallback>
        </Avatar>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsContent value="budget" className="m-0 p-0">

      {/* Add Expense Inline Form */}
      <div className="px-4 mb-4">
        <motion.div 
          className="bg-white p-3 rounded-2xl shadow-sm"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 30, delay: 0.1 }}
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <motion.div className="flex-1" whileHover={{ scale: 1.02, rotate: -1 }}>
                <Input
                  type="number"
                  placeholder="Amount"
                  value={newExpense.amount}
                  onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                  className="h-12 rounded-xl border-[#D1D1D6] bg-[#F2F2F7] focus:border-[#007AFF] focus:ring-[#007AFF]"
                />
              </motion.div>
              <motion.div className="flex-1" whileHover={{ scale: 1.02, rotate: 1 }}>
                <Select
                  value={newExpense.category}
                  onValueChange={(value) => setNewExpense({ ...newExpense, category: value })}
                >
                  <SelectTrigger className="h-12 rounded-xl border-[#D1D1D6] bg-[#F2F2F7] focus:border-[#007AFF] focus:ring-[#007AFF]">
                    <SelectValue placeholder="Category" className="capitalize" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-[#D1D1D6] bg-white">
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </motion.div>
              <motion.div whileTap={{ scale: 0.9, rotate: -10 }} whileHover={{ scale: 1.1, rotate: 5 }}>
                <Button
                  onClick={handleAddExpense}
                  className="bg-[#007AFF] hover:bg-[#0063CC] h-12 px-5 rounded-xl text-white font-medium"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </motion.div>
            </div>
            <motion.div whileHover={{ scale: 1.01 }}>
              <Input
                placeholder="Description (optional)"
                value={newExpense.description}
                onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                className="h-12 rounded-xl border-[#D1D1D6] bg-[#F2F2F7] focus:border-[#007AFF] focus:ring-[#007AFF]"
              />
            </motion.div>
          </div>
        </motion.div>
      </div>

      {/* iOS-style Month Navigation */}
      <div className="flex items-center justify-between px-4 py-4">
        <motion.div whileTap={{ scale: 0.9, rotate: -10 }} whileHover={{ scale: 1.1, rotate: -5 }}>
          <Button 
            variant="ghost" 
            size="icon" 
            className="rounded-full bg-[#E9E9EB] text-[#007AFF] w-10 h-10"
            onClick={goToPreviousMonth}
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </motion.div>
        <motion.h2 
          className="text-xl font-medium text-[#1C1C1E]"
          key={currentDate.toString()}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
        >
          {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </motion.h2>
        <motion.div whileTap={{ scale: 0.9, rotate: 10 }} whileHover={{ scale: 1.1, rotate: 5 }}>
          <Button 
            variant="ghost" 
            size="icon" 
            className="rounded-full bg-[#E9E9EB] text-[#007AFF] w-10 h-10"
            onClick={goToNextMonth}
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </motion.div>
      </div>

      {/* Budget Overview */}
      <motion.div 
        className="px-4 mb-4"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 30, delay: 0.2 }}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-[#8E8E93] text-sm mb-1">Remaining </p>
            <motion.p 
              className="text-4xl font-bold text-[#1C1C1E]"
              key={remaining}
              initial={{ opacity: 0, y: -10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
            >
              {showPercentages 
                ? totalBudget > 0 
                  ? `${Math.round((remaining / totalBudget) * 100)}%`
                  : "0%"
                : formatCurrency(remaining)}
            </motion.p>
            <div className="mt-2 w-full">
              <Progress 
                value={totalBudget > 0 ? Math.round((remaining / totalBudget) * 100) : 0} 
                className="h-3 bg-[#E9E9EB]" 
              />
            </div>
          </div>
          <Dialog open={budgetDialogOpen} onOpenChange={setBudgetDialogOpen}>
            <DialogTrigger asChild>
              <motion.div whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.05 }}>
                <Button className="bg-[#007AFF] hover:bg-[#0063CC] text-white px-6 py-3 rounded-full font-medium">
                  Set Budget
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </motion.div>
            </DialogTrigger>
            <DialogContent className="w-[95vw] max-w-md mx-auto rounded-3xl border-0 shadow-lg">
              <DialogHeader className="text-center pb-4">
                <DialogTitle className="text-xl font-semibold">Set Monthly Budget</DialogTitle>
              </DialogHeader>
              <div className="space-y-6 px-2">
                <div className="space-y-2">
                  <Label htmlFor="budget" className="text-sm font-medium text-gray-700">
                    Amount
                  </Label>
                  <Input
                    id="budget"
                    type="number"
                    placeholder="Enter budget amount"
                    value={newBudget}
                    onChange={(e) => setNewBudget(e.target.value)}
                    className="h-14 text-lg rounded-xl border-[#D1D1D6] bg-[#F2F2F7] focus:border-[#007AFF] focus:ring-[#007AFF]"
                  />
                </div>
                <motion.div whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.02 }}>
                  <Button
                    onClick={handleBudgetUpdate}
                    className="w-full bg-[#007AFF] hover:bg-[#0063CC] h-14 rounded-xl text-base font-medium"
                  >
                    Update Budget
                  </Button>
                </motion.div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </motion.div>

      {/* Toggle Switch and Clear All */}
      <div className="px-4 mb-4">
        <motion.div 
          className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.3 }}
        >
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-[#1C1C1E]">
              {showPercentages ? "Show Numbers" : "Show Percentages"}
            </span>
            <Switch
              checked={showPercentages}
              onCheckedChange={setShowPercentages}
              className="data-[state=checked]:bg-[#007AFF]"
            />
          </div>
          <motion.div whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.05 }}>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-[#FF3B30] hover:text-[#D70015] p-0"
              onClick={handleClearAll}
              disabled={isLoading || isSaving}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Clear All
            </Button>
          </motion.div>
        </motion.div>
      </div>
      
      {/* Loading and Error States */}
      {isLoading && (
        <div className="px-4 py-8 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#007AFF]" />
        </div>
      )}
      
      {/* Categories List */}
      <motion.div 
        className="px-4"
        initial="hidden"
        animate="visible"
        variants={{
          visible: {
            opacity: 1,
            transition: {
              delayChildren: 0.4,
              staggerChildren: 0.1
            }
          },
          hidden: { opacity: 0 }
        }}
      >
        <div className="bg-white rounded-2xl shadow-sm">
          <AnimatePresence>
            {currentCategories
              .sort((a, b) => b.spent - a.spent)
              .map((category) => {
                const isExpanded = expandedCategory === category.name
                const categoryExpenses = currentMonthExpenses.filter(
                  (exp) => exp.category.charAt(0).toUpperCase() + exp.category.slice(1) === category.name
                )

                return (
                  <motion.div 
                    key={category.name} 
                    className="border-b border-[#E9E9EB] last:border-b-0"
                    layout
                    variants={{
                      visible: { opacity: 1, y: 0 },
                      hidden: { opacity: 0, y: 20 }
                    }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    <div 
                      className="flex items-center justify-between p-4 cursor-pointer"
                      onClick={() => toggleCategory(category.name)}
                    >
                      <p className="font-medium text-[#1C1C1E]">{category.name}</p>
                      <div className="flex items-center gap-4">
                        <motion.p 
                          className="font-medium text-[#1C1C1E]"
                          key={category.spent}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                        >
                          {showPercentages
                            ? totalBudget > 0
                              ? `${Math.round((category.spent / totalBudget) * 100)}%`
                              : "0%"
                            : formatCurrency(category.spent)}
                        </motion.p>
                        <motion.div
                          animate={{ rotate: isExpanded ? 90 : 0 }}
                          transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        >
                          <ChevronRight className="w-5 h-5 text-[#8E8E93]" />
                        </motion.div>
                      </div>
                    </div>
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ type: "spring", stiffness: 400, damping: 30 }}
                          className="px-4 pb-4"
                        >
                          {categoryExpenses.length === 0 ? (
                            <p className="text-sm text-gray-500">No expenses in this category.</p>
                          ) : (
                            <div className="space-y-3">
                              <AnimatePresence>
                                {categoryExpenses.map(expense => (
                                  <motion.div 
                                    key={expense.id}
                                    layout
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
                                    className="flex items-center justify-between"
                                  >
                                    {editingExpense && editingExpense.expense.id === expense.id ? (
                                      <div className="flex items-center gap-2 w-full">
                                        <Input
                                          type="number"
                                          value={editingExpense.amount}
                                          onChange={(e) => setEditingExpense({
                                            ...editingExpense,
                                            amount: e.target.value
                                          })}
                                          className="h-10 rounded-lg border-[#D1D1D6] bg-[#F2F2F7]"
                                        />
                                        <motion.div whileTap={{ scale: 0.9 }}>
                                          <Button onClick={handleSaveEdit} size="sm" className="bg-[#007AFF] hover:bg-[#0063CC]">Save</Button>
                                        </motion.div>
                                        <Button onClick={handleCancelEdit} size="sm" variant="ghost">Cancel</Button>
                                      </div>
                                    ) : (
                                      <>
                                        <div className="flex-1">
                                          <p className="font-medium">{formatCurrency(expense.amount)}</p>
                                          <p className="text-sm text-gray-500 mt-1">{formatDate(expense.date)}</p>
                                          {expense.description && (
                                            <p className="text-sm text-gray-500">{expense.description}</p>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <motion.div whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.1 }}>
                                            <Button 
                                              size="icon" 
                                              variant="ghost" 
                                              className="text-gray-500"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleEditExpense(expense);
                                              }}
                                            >
                                              <User className="w-4 h-4" />
                                            </Button>
                                          </motion.div>
                                          <motion.div whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.1 }}>
                                            <Button 
                                              size="icon" 
                                              variant="ghost" 
                                              className="text-red-500"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteExpense(expense.id);
                                              }}
                                            >
                                              <Trash2 className="w-4 h-4" />
                                            </Button>
                                          </motion.div>
                                        </div>
                                      </>
                                    )}
                                  </motion.div>
                                ))}
                              </AnimatePresence>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )
              })}
          </AnimatePresence>
        </div>
      </motion.div>
        </TabsContent>
        
        <TabsContent value="transactions" className="m-0 p-0">
          <div className="px-4 py-4">
            <h2 className="text-xl font-medium text-[#1C1C1E] mb-4">All Transactions</h2>
            
            {isLoading ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[#007AFF]" />
              </div>
            ) : (
              <motion.div 
                className="bg-white rounded-2xl shadow-sm"
                initial="hidden"
                animate="visible"
                variants={{
                  visible: {
                    opacity: 1,
                    transition: { staggerChildren: 0.05 }
                  },
                  hidden: { opacity: 0 }
                }}
              >
                {expenses.length === 0 ? (
                  <div className="p-6 text-center text-[#8E8E93]">
                    <p>No transactions yet</p>
                  </div>
                ) : (
                  <AnimatePresence>
                    {expenses
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .map((expense) => (
                        <motion.div 
                          key={expense.id}
                          className="border-b border-[#E9E9EB] last:border-b-0 p-4"
                          layout
                          variants={{
                            visible: { opacity: 1, y: 0 },
                            hidden: { opacity: 0, y: 20 },
                          }}
                          exit={{ opacity: 0, x: -50, transition: { duration: 0.2 } }}
                          transition={{ type: "spring", stiffness: 500, damping: 40 }}
                          drag="x"
                          dragConstraints={{ left: 0, right: 0 }}
                          onDragEnd={(event, info) => {
                            if (info.offset.x < -100) {
                              handleDeleteExpense(expense.id);
                            }
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-[#1C1C1E]">{formatCurrency(expense.amount)}</p>
                              <p className="text-sm text-[#8E8E93] mt-1">{formatDate(expense.date)}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex flex-col items-end">
                                <p className="font-medium text-[#1C1C1E] capitalize">{expense.category}</p>
                                {expense.description && (
                                  <p className="text-sm text-[#8E8E93] mt-1">{expense.description}</p>
                                )}
                              </div>
                              <motion.div whileTap={{ scale: 0.9, rotate: -10 }} whileHover={{ scale: 1.1, rotate: 5 }}>
                                <Button 
                                  size="icon" 
                                  variant="ghost" 
                                  className="text-red-500"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteExpense(expense.id);
                                  }}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </motion.div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                  </AnimatePresence>
                )}
              </motion.div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="m-0 p-0">
          {isAnalyticsLoading ? (
            <div className="px-4 py-8 flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-[#007AFF]" />
            </div>
          ) : (
          <motion.div 
            className="px-4 py-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            
            <motion.div 
              className="bg-white rounded-2xl shadow-sm p-4 mb-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <h3 className="text-lg font-semibold mb-2">Category Spending</h3>
              <ChartContainer config={{
                spent: {
                  color: "#007AFF",
                },
              }} className="h-48">
                <BarChartComponent data={currentCategories.sort((a, b) => b.spent - a.spent)} margin={{ top: 20, right: 10, bottom: 5, left: -30 }}>
                  <CartesianGrid vertical={false} />
                  <YAxis tickFormatter={(value) => `₹${value / 1000}k`} />
                  <Tooltip cursor={false} content={<ChartTooltipContent labelKey="name" formatter={(value, name, item) => [`₹${value.toLocaleString()}`, ` ${item.payload.name}`]} />} />
                  <Bar dataKey="spent" radius={4} />
                </BarChartComponent>
              </ChartContainer>
            </motion.div>

            <motion.div 
              className="bg-white rounded-2xl shadow-sm p-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <h3 className="text-lg font-semibold mb-2">Monthly Spending Trend</h3>
              <div className="mb-4">
                <Select
                  value={selectedTrendCategory}
                  onValueChange={(value) => setSelectedTrendCategory(value)}
                >
                  <SelectTrigger className="h-10 rounded-xl border-[#D1D1D6] bg-[#F2F2F7] focus:border-[#007AFF] focus:ring-[#007AFF]">
                    <SelectValue placeholder="Select Category" className="capitalize" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-[#D1D1D6] bg-white">
                    <SelectItem value="combined">Combined</SelectItem>
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <ChartContainer config={{
                spent: {
                  label: "Spent",
                  color: "#007AFF",
                },
              }} className="h-48">
                <LineChartComponent data={monthlyData} margin={{ top: 20, right: 20, bottom: 5, left: -10 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
                  <YAxis tickFormatter={(value) => `₹${value / 1000}k`} />
                  <Tooltip cursor={false} content={<ChartTooltipContent labelKey="month" formatter={(value, name, item) => [`₹${value.toLocaleString()}`, ` ${item.payload.month}`]} />} />
                  <Legend />
                  <Line type="monotone" dataKey="spent" strokeWidth={2} dot={false} />
                </LineChartComponent>
              </ChartContainer>
            </motion.div>
          </motion.div>
          )}
        </TabsContent>
        
        {/* Tab Navigation */}
        <div className="fixed bottom-0 left-0 right-0 border-t border-[#E9E9EB] bg-white max-w-sm mx-auto">
          <TabsList className="w-full flex bg-transparent p-0 h-16">
            <TabsTrigger 
              value="budget" 
              className="flex-1 h-full w-1/3 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-[#007AFF]"
            >
              <motion.div className="flex flex-col items-center" whileTap={{ scale: 0.9 }}>
                <PieChart className="w-5 h-5 mb-1" />
                <span className="text-xs">Budget</span>
              </motion.div>
            </TabsTrigger>
            <TabsTrigger 
              value="transactions" 
              className="flex-1 h-full w-1/3 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-[#007AFF]"
            >
              <motion.div className="flex flex-col items-center" whileTap={{ scale: 0.9 }}>
                <ListOrdered className="w-5 h-5 mb-1" />
                <span className="text-xs">Transactions</span>
              </motion.div>
            </TabsTrigger>
            <TabsTrigger 
              value="analytics" 
              className="flex-1 h-full w-1/3 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-[#007AFF]"
            >
              <motion.div className="flex flex-col items-center" whileTap={{ scale: 0.9 }}>
                <BarChart2 className="w-5 h-5 mb-1" />
                <span className="text-xs">Analytics</span>
              </motion.div>
            </TabsTrigger>
          </TabsList>
        </div>
      </Tabs>
    </div>
  )
}