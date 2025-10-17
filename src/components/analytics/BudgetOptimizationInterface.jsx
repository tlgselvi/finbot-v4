/**
 * Budget Optimization Interface Component
 * Interactive budget planning and optimization tools
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  PieChart, BarChart3, TrendingUp, DollarSign, Target,
  Settings, Save, RefreshCw, AlertTriangle, CheckCircle,
  Plus, Minus, Edit3, Trash2, ArrowRight, Lightbulb,
  Calendar, Clock, Star, Award, Zap
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';

const BudgetOptimizationInterface = ({ userId, currentBudget, onBudgetUpdate }) => {
  const [budgetCategories, setBudgetCategories] = useState([]);
  const [optimizations, setOptimizations] = useState([]);
  const [selectedOptimization, setSelectedOptimization] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState('optimization'); // 'optimization', 'manual', 'comparison'

  useEffect(() => {
    loadBudgetData();
  }, [userId]);

  const loadBudgetData = async () => {
    setLoading(true);
    try {
      const [categoriesRes, optimizationsRes] = await Promise.all([
        fetch(`/api/budget/categories/${userId}`),
        fetch(`/api/budget/optimizations/${userId}`)
      ]);

      const categoriesData = await categoriesRes.json();
      const optimizationsData = await optimizationsRes.json();

      if (categoriesData.success) {
        setBudgetCategories(categoriesData.categories);
      }
      
      if (optimizationsData.success) {
        setOptimizations(optimizationsData.optimizations);
      }
    } catch (error) {
      console.error('Failed to load budget data:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveBudgetChanges = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/budget/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          categories: budgetCategories
        })
      });

      const data = await response.json();
      
      if (data.success && onBudgetUpdate) {
        onBudgetUpdate(data.budget);
      }
    } catch (error) {
      console.error('Failed to save budget:', error);
    } finally {
      setSaving(false);
    }
  };

  const updateCategoryAllocation = (categoryId, newAmount) => {
    setBudgetCategories(prev => 
      prev.map(cat => 
        cat.id === categoryId 
          ? { ...cat, allocated: newAmount }
          : cat
      )
    );
  };

  const addNewCategory = () => {
    const newCategory = {
      id: Date.now(),
      name: 'New Category',
      allocated: 0,
      spent: 0,
      usage: 0,
      color: '#3B82F6',
      isNew: true
    };
    setBudgetCategories(prev => [...prev, newCategory]);
    setEditingCategory(newCategory.id);
  };

  const deleteCategory = (categoryId) => {
    setBudgetCategories(prev => prev.filter(cat => cat.id !== categoryId));
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const items = Array.from(budgetCategories);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setBudgetCategories(items);
  };

  const applyOptimization = async (optimization) => {
    try {
      const response = await fetch('/api/budget/apply-optimization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          optimizationId: optimization.id
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setBudgetCategories(data.updatedCategories);
        setOptimizations(prev => prev.filter(opt => opt.id !== optimization.id));
      }
    } catch (error) {
      console.error('Failed to apply optimization:', error);
    }
  };

  const getTotalBudget = () => {
    return budgetCategories.reduce((total, cat) => total + cat.allocated, 0);
  };

  const getTotalSpent = () => {
    return budgetCategories.reduce((total, cat) => total + cat.spent, 0);
  };

  const getBudgetHealth = () => {
    const totalBudget = getTotalBudget();
    const totalSpent = getTotalSpent();
    const usage = totalBudget > 0 ? totalSpent / totalBudget : 0;
    
    if (usage <= 0.7) return { status: 'healthy', color: 'text-green-600', message: 'On track' };
    if (usage <= 0.9) return { status: 'warning', color: 'text-yellow-600', message: 'Monitor closely' };
    return { status: 'danger', color: 'text-red-600', message: 'Over budget' };
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="space-y-3">
            <div className="h-20 bg-gray-200 rounded"></div>
            <div className="h-20 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Target className="text-blue-600 mr-3" size={24} />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Budget Optimization</h2>
              <p className="text-sm text-gray-600">Optimize your budget allocation with AI assistance</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {/* View Mode Toggle */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              {[
                { id: 'optimization', name: 'AI Optimize', icon: Zap },
                { id: 'manual', name: 'Manual Edit', icon: Edit3 },
                { id: 'comparison', name: 'Compare', icon: BarChart3 }
              ].map((mode) => {
                const Icon = mode.icon;
                return (
                  <button
                    key={mode.id}
                    onClick={() => setViewMode(mode.id)}
                    className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      viewMode === mode.id
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <Icon size={16} className="mr-2" />
                    {mode.name}
                  </button>
                );
              })}
            </div>
            
            <button
              onClick={saveBudgetChanges}
              disabled={saving}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Save size={16} className="mr-2" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* Budget Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-800">Total Budget</p>
                <p className="text-2xl font-bold text-blue-600">${getTotalBudget().toLocaleString()}</p>
              </div>
              <DollarSign className="text-blue-600" size={24} />
            </div>
          </div>
          
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-800">Total Spent</p>
                <p className="text-2xl font-bold text-green-600">${getTotalSpent().toLocaleString()}</p>
              </div>
              <TrendingUp className="text-green-600" size={24} />
            </div>
          </div>
          
          <div className="bg-purple-50 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-800">Remaining</p>
                <p className="text-2xl font-bold text-purple-600">
                  ${(getTotalBudget() - getTotalSpent()).toLocaleString()}
                </p>
              </div>
              <Target className="text-purple-600" size={24} />
            </div>
          </div>
          
          <div className={`${getBudgetHealth().status === 'healthy' ? 'bg-green-50' : getBudgetHealth().status === 'warning' ? 'bg-yellow-50' : 'bg-red-50'} p-4 rounded-lg`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm font-medium ${getBudgetHealth().color.replace('text-', 'text-').replace('-600', '-800')}`}>
                  Budget Health
                </p>
                <p className={`text-lg font-bold ${getBudgetHealth().color}`}>
                  {getBudgetHealth().message}
                </p>
              </div>
              {getBudgetHealth().status === 'healthy' ? (
                <CheckCircle className="text-green-600" size={24} />
              ) : (
                <AlertTriangle className={getBudgetHealth().color.replace('text-', 'text-')} size={24} />
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* AI Optimization View */}
        {viewMode === 'optimization' && (
          <AIOptimizationView
            optimizations={optimizations}
            onApplyOptimization={applyOptimization}
            budgetCategories={budgetCategories}
          />
        )}

        {/* Manual Edit View */}
        {viewMode === 'manual' && (
          <ManualEditView
            budgetCategories={budgetCategories}
            setBudgetCategories={setBudgetCategories}
            editingCategory={editingCategory}
            setEditingCategory={setEditingCategory}
            onUpdateCategory={updateCategoryAllocation}
            onAddCategory={addNewCategory}
            onDeleteCategory={deleteCategory}
            onDragEnd={handleDragEnd}
          />
        )}

        {/* Comparison View */}
        {viewMode === 'comparison' && (
          <ComparisonView
            budgetCategories={budgetCategories}
            optimizations={optimizations}
          />
        )}
      </div>
    </div>
  );
};

const AIOptimizationView = ({ optimizations, onApplyOptimization, budgetCategories }) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">AI Optimization Recommendations</h3>
        <div className="flex items-center text-sm text-gray-600">
          <Lightbulb size={16} className="mr-1" />
          {optimizations.length} recommendations available
        </div>
      </div>

      {optimizations.length === 0 ? (
        <div className="text-center py-8">
          <CheckCircle className="mx-auto text-green-500 mb-4" size={48} />
          <h4 className="text-lg font-medium text-gray-900 mb-2">Budget Already Optimized!</h4>
          <p className="text-gray-600">Your current budget allocation looks great. Check back later for new recommendations.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {optimizations.map((optimization) => (
            <OptimizationCard
              key={optimization.id}
              optimization={optimization}
              onApply={onApplyOptimization}
            />
          ))}
        </div>
      )}

      {/* Current Budget Visualization */}
      <div className="mt-8">
        <h4 className="font-medium text-gray-900 mb-4">Current Budget Allocation</h4>
        <BudgetVisualization categories={budgetCategories} />
      </div>
    </div>
  );
};

const ManualEditView = ({ 
  budgetCategories, 
  setBudgetCategories,
  editingCategory,
  setEditingCategory,
  onUpdateCategory,
  onAddCategory,
  onDeleteCategory,
  onDragEnd
}) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Manual Budget Editor</h3>
        <button
          onClick={onAddCategory}
          className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          <Plus size={16} className="mr-2" />
          Add Category
        </button>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="budget-categories">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-3">
              {budgetCategories.map((category, index) => (
                <Draggable key={category.id} draggableId={category.id.toString()} index={index}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className={`bg-white border border-gray-200 rounded-lg p-4 ${
                        snapshot.isDragging ? 'shadow-lg' : 'hover:shadow-md'
                      } transition-shadow`}
                    >
                      <CategoryEditor
                        category={category}
                        isEditing={editingCategory === category.id}
                        onStartEdit={() => setEditingCategory(category.id)}
                        onStopEdit={() => setEditingCategory(null)}
                        onUpdate={onUpdateCategory}
                        onDelete={onDeleteCategory}
                        dragHandleProps={provided.dragHandleProps}
                      />
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
};

const ComparisonView = ({ budgetCategories, optimizations }) => {
  const [selectedOptimization, setSelectedOptimization] = useState(optimizations[0]);

  const getOptimizedCategories = () => {
    if (!selectedOptimization) return budgetCategories;
    
    return budgetCategories.map(category => {
      const change = selectedOptimization.changes.find(c => c.categoryId === category.id);
      return change 
        ? { ...category, allocated: category.allocated + change.amount }
        : category;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Budget Comparison</h3>
        {optimizations.length > 0 && (
          <select
            value={selectedOptimization?.id || ''}
            onChange={(e) => setSelectedOptimization(optimizations.find(opt => opt.id === e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="">Select optimization to compare</option>
            {optimizations.map(opt => (
              <option key={opt.id} value={opt.id}>{opt.title}</option>
            ))}
          </select>
        )}
      </div>

      {selectedOptimization ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-gray-900 mb-4">Current Budget</h4>
            <BudgetVisualization categories={budgetCategories} />
          </div>
          <div>
            <h4 className="font-medium text-gray-900 mb-4">Optimized Budget</h4>
            <BudgetVisualization categories={getOptimizedCategories()} />
          </div>
        </div>
      ) : (
        <div className="text-center py-8">
          <BarChart3 className="mx-auto text-gray-400 mb-4" size={48} />
          <h4 className="text-lg font-medium text-gray-900 mb-2">No Optimizations Available</h4>
          <p className="text-gray-600">Generate new optimizations to see comparisons</p>
        </div>
      )}
    </div>
  );
};

const OptimizationCard = ({ optimization, onApply }) => {
  const [applying, setApplying] = useState(false);

  const handleApply = async () => {
    setApplying(true);
    try {
      await onApply(optimization);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-2">
            <h4 className="font-medium text-gray-900">{optimization.title}</h4>
            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
              +${optimization.monthlySavings}/mo
            </span>
          </div>
          <p className="text-sm text-gray-600 mb-3">{optimization.description}</p>
          
          <div className="space-y-2">
            {optimization.changes.map((change, index) => (
              <div key={index} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{change.categoryName}</span>
                <span className={`font-medium ${change.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {change.amount > 0 ? '+' : ''}${change.amount}
                </span>
              </div>
            ))}
          </div>
        </div>
        
        <button
          onClick={handleApply}
          disabled={applying}
          className="ml-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {applying ? 'Applying...' : 'Apply'}
        </button>
      </div>
    </div>
  );
};

const CategoryEditor = ({ 
  category, 
  isEditing, 
  onStartEdit, 
  onStopEdit, 
  onUpdate, 
  onDelete,
  dragHandleProps 
}) => {
  const [name, setName] = useState(category.name);
  const [allocated, setAllocated] = useState(category.allocated);

  const handleSave = () => {
    onUpdate(category.id, allocated);
    onStopEdit();
  };

  const handleCancel = () => {
    setName(category.name);
    setAllocated(category.allocated);
    onStopEdit();
  };

  return (
    <div className="flex items-center space-x-4">
      <div {...dragHandleProps} className="cursor-move text-gray-400">
        <Settings size={16} />
      </div>
      
      <div className="flex-1">
        {isEditing ? (
          <div className="flex items-center space-x-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
            />
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">$</span>
              <input
                type="number"
                value={allocated}
                onChange={(e) => setAllocated(parseFloat(e.target.value) || 0)}
                className="w-24 px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleSave}
                className="p-2 text-green-600 hover:bg-green-50 rounded"
              >
                <CheckCircle size={16} />
              </button>
              <button
                onClick={handleCancel}
                className="p-2 text-red-600 hover:bg-red-50 rounded"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-gray-900">{category.name}</h4>
              <div className="flex items-center space-x-4 text-sm text-gray-600">
                <span>Allocated: ${category.allocated}</span>
                <span>Spent: ${category.spent}</span>
                <span className={`${category.usage > 0.9 ? 'text-red-600' : category.usage > 0.7 ? 'text-yellow-600' : 'text-green-600'}`}>
                  {(category.usage * 100).toFixed(0)}% used
                </span>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={onStartEdit}
                className="p-2 text-blue-600 hover:bg-blue-50 rounded"
              >
                <Edit3 size={16} />
              </button>
              <button
                onClick={() => onDelete(category.id)}
                className="p-2 text-red-600 hover:bg-red-50 rounded"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const BudgetVisualization = ({ categories }) => {
  const total = categories.reduce((sum, cat) => sum + cat.allocated, 0);

  return (
    <div className="space-y-3">
      {categories.map((category) => {
        const percentage = total > 0 ? (category.allocated / total * 100) : 0;
        const usage = category.allocated > 0 ? (category.spent / category.allocated) : 0;
        
        return (
          <div key={category.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-900">{category.name}</span>
              <div className="text-sm text-gray-600">
                ${category.allocated} ({percentage.toFixed(1)}%)
              </div>
            </div>
            
            <div className="relative">
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-blue-500 h-3 rounded-full"
                  style={{ width: `${percentage}%` }}
                ></div>
              </div>
              <div 
                className={`absolute top-0 h-3 rounded-full ${
                  usage > 0.9 ? 'bg-red-500' : usage > 0.7 ? 'bg-yellow-500' : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(percentage * usage, percentage)}%` }}
              ></div>
            </div>
            
            <div className="flex justify-between text-xs text-gray-500">
              <span>Spent: ${category.spent}</span>
              <span>{(usage * 100).toFixed(0)}% used</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default BudgetOptimizationInterface;