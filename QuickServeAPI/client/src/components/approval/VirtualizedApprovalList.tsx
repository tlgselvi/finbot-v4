/**
 * FinBot v4 - Virtualized Approval List
 * High-performance approval list with virtual scrolling
 */

import React, { useMemo, useState, useCallback } from 'react';
import { VirtualScrollList } from '../ui/VirtualScrollList';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  User, 
  DollarSign,
  Calendar
} from 'lucide-react';

interface ApprovalItem {
  id: string;
  transactionId: string;
  requester: {
    name: string;
    email: string;
  };
  transaction: {
    type: string;
    amount: number;
    currency: string;
    description: string;
  };
  status: 'pending' | 'approved' | 'rejected' | 'escalated';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  currentLevel: number;
  totalLevels: number;
  createdAt: Date;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  timeRemaining?: {
    hours: number;
    isOverdue: boolean;
  };
}

interface VirtualizedApprovalListProps {
  items: ApprovalItem[];
  onItemClick?: (item: ApprovalItem) => void;
  onApprove?: (item: ApprovalItem) => void;
  onReject?: (item: ApprovalItem) => void;
  containerHeight?: number;
  itemHeight?: number;
  className?: string;
  loading?: boolean;
}

export const VirtualizedApprovalList: React.FC<VirtualizedApprovalListProps> = ({
  items,
  onItemClick,
  onApprove,
  onReject,
  containerHeight = 600,
  itemHeight = 120,
  className = '',
  loading = false
}) => {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'approved': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'rejected': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'escalated': return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      default: return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'escalated': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getRiskColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'low': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'critical': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'low': return 'border-l-green-500';
      case 'medium': return 'border-l-yellow-500';
      case 'high': return 'border-l-orange-500';
      case 'critical': return 'border-l-red-500';
      default: return 'border-l-gray-500';
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: currency
    }).format(amount);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const handleItemSelect = useCallback((itemId: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  }, []);

  const renderApprovalItem = useCallback((item: ApprovalItem, index: number, style: React.CSSProperties) => {
    const isSelected = selectedItems.has(item.id);
    
    return (
      <div
        style={style}
        className={`border-l-4 ${getUrgencyColor(item.urgency)} bg-white border border-gray-200 rounded-r-lg shadow-sm hover:shadow-md transition-shadow duration-200 mx-2 my-1`}
      >
        <div className="p-4 h-full flex flex-col justify-between">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => handleItemSelect(item.id)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <h3 
                  className="font-medium text-gray-900 cursor-pointer hover:text-blue-600"
                  onClick={() => onItemClick?.(item)}
                >
                  {item.transaction.description}
                </h3>
                <p className="text-sm text-gray-600">
                  {formatCurrency(item.transaction.amount, item.transaction.currency)} • 
                  {item.transaction.type.toUpperCase()}
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Badge className={getStatusColor(item.status)}>
                {getStatusIcon(item.status)}
                <span className="ml-1">{item.status.toUpperCase()}</span>
              </Badge>
              <Badge className={getRiskColor(item.riskLevel)}>
                Risk: {item.riskLevel.toUpperCase()}
              </Badge>
            </div>
          </div>

          {/* Content */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-4 text-sm text-gray-600">
              <div className="flex items-center">
                <User className="h-4 w-4 mr-1" />
                {item.requester.name}
              </div>
              <div className="flex items-center">
                <Calendar className="h-4 w-4 mr-1" />
                {formatDate(item.createdAt)}
              </div>
              <div className="flex items-center">
                <DollarSign className="h-4 w-4 mr-1" />
                Level {item.currentLevel} of {item.totalLevels}
              </div>
            </div>

            {/* Time remaining */}
            {item.timeRemaining && (
              <div className={`text-sm ${item.timeRemaining.isOverdue ? 'text-red-600' : 'text-gray-600'}`}>
                {item.timeRemaining.isOverdue ? 'Overdue' : `${item.timeRemaining.hours}h remaining`}
              </div>
            )}
          </div>

          {/* Actions */}
          {item.status === 'pending' && (
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-500">
                ID: {item.transactionId}
              </div>
              
              <div className="flex space-x-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReject?.(item);
                  }}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <XCircle className="h-3 w-3 mr-1" />
                  Reject
                </Button>
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onApprove?.(item);
                  }}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Approve
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }, [selectedItems, onItemClick, onApprove, onReject, handleItemSelect]);

  // Memoize sorted items for performance
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      // Sort by urgency first
      const urgencyOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const urgencyDiff = urgencyOrder[b.urgency] - urgencyOrder[a.urgency];
      if (urgencyDiff !== 0) return urgencyDiff;

      // Then by creation date (newest first)
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
  }, [items]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-2" />
        <span>Loading approvals...</span>
      </div>
    );
  }

  if (sortedItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <CheckCircle className="h-12 w-12 mb-4 text-gray-300" />
        <h3 className="text-lg font-medium mb-2">No approvals found</h3>
        <p className="text-sm">All caught up! No pending approvals at the moment.</p>
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      {/* Header with selection info */}
      {selectedItems.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-blue-800">
              {selectedItems.size} item{selectedItems.size > 1 ? 's' : ''} selected
            </span>
            <div className="flex space-x-2">
              <Button size="sm" variant="outline" onClick={() => setSelectedItems(new Set())}>
                Clear Selection
              </Button>
              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white">
                Bulk Approve ({selectedItems.size})
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Virtual scroll list */}
      <VirtualScrollList
        items={sortedItems}
        itemHeight={itemHeight}
        containerHeight={containerHeight}
        renderItem={renderApprovalItem}
        overscan={3}
        className="border border-gray-200 rounded-lg bg-gray-50"
      />

      {/* Footer with stats */}
      <div className="mt-4 text-sm text-gray-600 flex justify-between">
        <span>Showing {sortedItems.length} approval{sortedItems.length > 1 ? 's' : ''}</span>
        <span>
          {sortedItems.filter(item => item.status === 'pending').length} pending • 
          {sortedItems.filter(item => item.urgency === 'critical').length} critical
        </span>
      </div>
    </div>
  );
};