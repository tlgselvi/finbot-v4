/**
 * FinBot v4 - Optimized Data Table
 * High-performance table component with virtualization and state optimization
 */

import React, { memo, useMemo, useCallback } from 'react';
import { VirtualScrollList } from './VirtualScrollList';
import { useOptimizedPagination, useOptimizedSelection, useOptimizedFiltering } from '@/hooks/useOptimizedState';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { 
  ChevronLeft, 
  ChevronRight, 
  Search,
  Filter,
  MoreHorizontal
} from 'lucide-react';

interface Column<T> {
  key: keyof T;
  title: string;
  width?: number;
  sortable?: boolean;
  filterable?: boolean;
  render?: (value: any, item: T, index: number) => React.ReactNode;
}

interface OptimizedDataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (item: T) => string;
  className?: string;
  selectable?: boolean;
  searchable?: boolean;
  filterable?: boolean;
  paginated?: boolean;
  virtualized?: boolean;
  itemHeight?: number;
  containerHeight?: number;
  onRowClick?: (item: T, index: number) => void;
  onSelectionChange?: (selectedItems: T[]) => void;
}

export const OptimizedDataTable = memo(<T extends Record<string, any>>({
  data,
  columns,
  keyExtractor,
  className = '',
  selectable = false,
  searchable = true,
  filterable = true,
  paginated = true,
  virtualized = false,
  itemHeight = 60,
  containerHeight = 400,
  onRowClick,
  onSelectionChange
}: OptimizedDataTableProps<T>) => {
  const {
    filters,
    setSearchFilter,
    setStatusFilter,
    clearFilters
  } = useOptimizedFiltering();

  const {
    selectedIds,
    selectedWorkflows,
    isAllSelected,
    isPartiallySelected,
    selectAll,
    selectNone,
    toggleSelection
  } = useOptimizedSelection();

  const {
    currentPage,
    pageSize,
    totalPages,
    totalItems,
    paginatedWorkflows,
    hasNextPage,
    hasPreviousPage,
    goToPage,
    nextPage,
    previousPage,
    setPageSize
  } = useOptimizedPagination();

  // Memoized filtered data
  const filteredData = useMemo(() => {
    let filtered = data;
    
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      filtered = filtered.filter(item =>
        Object.values(item).some(value =>
          String(value).toLowerCase().includes(searchTerm)
        )
      );
    }
    
    return filtered;
  }, [data, filters.search]);

  // Memoized display data (paginated or virtualized)
  const displayData = useMemo(() => {
    if (paginated && !virtualized) {
      return paginatedWorkflows;
    }
    return filteredData;
  }, [paginated, virtualized, paginatedWorkflows, filteredData]);

  // Memoized row renderer
  const renderRow = useCallback((item: T, index: number) => {
    const key = keyExtractor(item);
    const isSelected = selectedIds.includes(key);
    
    return (
      <div
        key={key}
        className={`flex items-center border-b hover:bg-gray-50 cursor-pointer ${
          isSelected ? 'bg-blue-50' : ''
        }`}
        onClick={() => onRowClick?.(item, index)}
      >
        {selectable && (
          <div className="w-12 flex justify-center">
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => toggleSelection(key)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
        
        {columns.map((column) => {
          const value = item[column.key];
          const cellContent = column.render ? column.render(value, item, index) : value;
          
          return (
            <div
              key={String(column.key)}
              className="px-4 py-3 flex-1"
              style={{ width: column.width }}
            >
              {cellContent}
            </div>
          );
        })}
        
        <div className="w-12 flex justify-center">
          <Button variant="ghost" size="sm">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }, [columns, keyExtractor, selectedIds, selectable, toggleSelection, onRowClick]);

  // Memoized header
  const tableHeader = useMemo(() => (
    <div className="flex items-center border-b bg-gray-50 font-medium">
      {selectable && (
        <div className="w-12 flex justify-center">
          <Checkbox
            checked={isAllSelected}
            indeterminate={isPartiallySelected}
            onCheckedChange={isAllSelected ? selectNone : selectAll}
          />
        </div>
      )}
      
      {columns.map((column) => (
        <div
          key={String(column.key)}
          className="px-4 py-3 flex-1"
          style={{ width: column.width }}
        >
          {column.title}
        </div>
      ))}
      
      <div className="w-12"></div>
    </div>
  ), [columns, selectable, isAllSelected, isPartiallySelected, selectAll, selectNone]);

  // Handle selection change callback
  React.useEffect(() => {
    if (onSelectionChange) {
      onSelectionChange(selectedWorkflows);
    }
  }, [selectedWorkflows, onSelectionChange]);

  return (
    <div className={`border rounded-lg ${className}`}>
      {/* Toolbar */}
      {(searchable || filterable) && (
        <div className="p-4 border-b bg-gray-50">
          <div className="flex items-center space-x-4">
            {searchable && (
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search..."
                  className="pl-10"
                  onChange={(e) => setSearchFilter(e.target.value)}
                />
              </div>
            )}
            
            {filterable && (
              <div className="flex items-center space-x-2">
                <Select onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
                
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  <Filter className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              </div>
            )}
          </div>
          
          {selectable && selectedIds.length > 0 && (
            <div className="mt-3 flex items-center space-x-2">
              <Badge variant="secondary">
                {selectedIds.length} selected
              </Badge>
              <Button size="sm" variant="outline">
                Bulk Actions
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden">
        {tableHeader}
        
        {virtualized ? (
          <VirtualScrollList
            items={displayData}
            itemHeight={itemHeight}
            containerHeight={containerHeight}
            renderItem={renderRow}
            keyExtractor={keyExtractor}
          />
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {displayData.map((item, index) => renderRow(item, index))}
          </div>
        )}
        
        {displayData.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            No data available
          </div>
        )}
      </div>

      {/* Pagination */}
      {paginated && !virtualized && (
        <div className="p-4 border-t bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Showing {((currentPage - 1) * pageSize) + 1} to{' '}
              {Math.min(currentPage * pageSize, totalItems)} of {totalItems} results
            </div>
            
            <div className="flex items-center space-x-2">
              <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
              
              <Button
                variant="outline"
                size="sm"
                onClick={previousPage}
                disabled={!hasPreviousPage}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <span className="text-sm">
                Page {currentPage} of {totalPages}
              </span>
              
              <Button
                variant="outline"
                size="sm"
                onClick={nextPage}
                disabled={!hasNextPage}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}) as <T extends Record<string, any>>(props: OptimizedDataTableProps<T>) => React.ReactElement;

OptimizedDataTable.displayName = 'OptimizedDataTable';