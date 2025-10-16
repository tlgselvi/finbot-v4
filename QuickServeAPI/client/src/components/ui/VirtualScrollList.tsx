/**
 * FinBot v4 - Virtual Scroll List Component
 * High-performance virtual scrolling for large datasets
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

interface VirtualScrollListProps<T> {
  items: T[];
  itemHeight: number | ((index: number, item: T) => number);
  containerHeight: number;
  renderItem: (item: T, index: number, style: React.CSSProperties) => React.ReactNode;
  overscan?: number;
  className?: string;
  onScroll?: (scrollTop: number, scrollLeft: number) => void;
  scrollToIndex?: number;
  scrollToAlignment?: 'start' | 'center' | 'end' | 'auto';
}

interface ItemStyle {
  position: 'absolute';
  top: number;
  left: number;
  width: string;
  height: number;
}

export function VirtualScrollList<T>({
  items,
  itemHeight,
  containerHeight,
  renderItem,
  overscan = 5,
  className = '',
  onScroll,
  scrollToIndex,
  scrollToAlignment = 'auto'
}: VirtualScrollListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollElementRef = useRef<HTMLDivElement>(null);

  // Calculate item heights and positions
  const itemMetadata = useMemo(() => {
    const metadata: Array<{ offset: number; size: number }> = [];
    let offset = 0;

    for (let i = 0; i < items.length; i++) {
      const size = typeof itemHeight === 'function' 
        ? itemHeight(i, items[i]) 
        : itemHeight;
      
      metadata[i] = { offset, size };
      offset += size;
    }

    return metadata;
  }, [items, itemHeight]);

  // Total height of all items
  const totalHeight = useMemo(() => {
    return itemMetadata.length > 0 
      ? itemMetadata[itemMetadata.length - 1].offset + itemMetadata[itemMetadata.length - 1].size
      : 0;
  }, [itemMetadata]);

  // Find the range of visible items
  const visibleRange = useMemo(() => {
    if (itemMetadata.length === 0) {
      return { start: 0, end: 0 };
    }

    // Binary search for start index
    let start = 0;
    let end = itemMetadata.length - 1;
    
    while (start <= end) {
      const mid = Math.floor((start + end) / 2);
      const itemTop = itemMetadata[mid].offset;
      const itemBottom = itemTop + itemMetadata[mid].size;

      if (itemBottom <= scrollTop) {
        start = mid + 1;
      } else if (itemTop >= scrollTop + containerHeight) {
        end = mid - 1;
      } else {
        start = mid;
        break;
      }
    }

    // Find end index
    let visibleEnd = start;
    while (
      visibleEnd < itemMetadata.length &&
      itemMetadata[visibleEnd].offset < scrollTop + containerHeight
    ) {
      visibleEnd++;
    }

    // Apply overscan
    const startIndex = Math.max(0, start - overscan);
    const endIndex = Math.min(itemMetadata.length - 1, visibleEnd + overscan);

    return { start: startIndex, end: endIndex };
  }, [scrollTop, containerHeight, itemMetadata, overscan]);

  // Handle scroll events
  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const newScrollTop = event.currentTarget.scrollTop;
    setScrollTop(newScrollTop);
    
    if (onScroll) {
      onScroll(newScrollTop, event.currentTarget.scrollLeft);
    }
  }, [onScroll]);

  // Scroll to specific index
  const scrollToItem = useCallback((index: number, alignment: string = 'auto') => {
    if (!scrollElementRef.current || index < 0 || index >= itemMetadata.length) {
      return;
    }

    const itemMetadata_ = itemMetadata[index];
    const itemTop = itemMetadata_.offset;
    const itemBottom = itemTop + itemMetadata_.size;

    let scrollTop = 0;

    switch (alignment) {
      case 'start':
        scrollTop = itemTop;
        break;
      case 'end':
        scrollTop = itemBottom - containerHeight;
        break;
      case 'center':
        scrollTop = itemTop - (containerHeight - itemMetadata_.size) / 2;
        break;
      case 'auto':
      default:
        if (itemTop < scrollElementRef.current.scrollTop) {
          scrollTop = itemTop;
        } else if (itemBottom > scrollElementRef.current.scrollTop + containerHeight) {
          scrollTop = itemBottom - containerHeight;
        } else {
          return; // Item is already visible
        }
        break;
    }

    scrollElementRef.current.scrollTop = Math.max(0, Math.min(scrollTop, totalHeight - containerHeight));
  }, [itemMetadata, containerHeight, totalHeight]);

  // Effect for scrollToIndex prop
  useEffect(() => {
    if (typeof scrollToIndex === 'number') {
      scrollToItem(scrollToIndex, scrollToAlignment);
    }
  }, [scrollToIndex, scrollToAlignment, scrollToItem]);

  // Render visible items
  const visibleItems = useMemo(() => {
    const items_ = [];
    
    for (let i = visibleRange.start; i <= visibleRange.end; i++) {
      const item = items[i];
      const metadata = itemMetadata[i];
      
      if (!item || !metadata) continue;

      const style: ItemStyle = {
        position: 'absolute',
        top: metadata.offset,
        left: 0,
        width: '100%',
        height: metadata.size
      };

      items_.push(
        <div key={i} style={style}>
          {renderItem(item, i, style)}
        </div>
      );
    }

    return items_;
  }, [visibleRange, items, itemMetadata, renderItem]);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-auto ${className}`}
      style={{ height: containerHeight }}
      onScroll={handleScroll}
    >
      <div
        ref={scrollElementRef}
        style={{ height: totalHeight, position: 'relative' }}
      >
        {visibleItems}
      </div>
    </div>
  );
}

// Hook for managing virtual scroll state
export function useVirtualScroll<T>(
  items: T[],
  itemHeight: number | ((index: number, item: T) => number),
  containerHeight: number
) {
  const [scrollTop, setScrollTop] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout>();

  const handleScroll = useCallback((newScrollTop: number) => {
    setScrollTop(newScrollTop);
    setIsScrolling(true);

    // Clear existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // Set scrolling to false after scroll ends
    scrollTimeoutRef.current = setTimeout(() => {
      setIsScrolling(false);
    }, 150);
  }, []);

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  return {
    scrollTop,
    isScrolling,
    handleScroll
  };
}

// Virtual Grid Component for 2D virtualization
interface VirtualGridProps<T> {
  items: T[];
  rowCount: number;
  columnCount: number;
  rowHeight: number | ((rowIndex: number) => number);
  columnWidth: number | ((columnIndex: number) => number);
  containerWidth: number;
  containerHeight: number;
  renderCell: (
    item: T | undefined,
    rowIndex: number,
    columnIndex: number,
    style: React.CSSProperties
  ) => React.ReactNode;
  overscan?: number;
  className?: string;
}

export function VirtualGrid<T>({
  items,
  rowCount,
  columnCount,
  rowHeight,
  columnWidth,
  containerWidth,
  containerHeight,
  renderCell,
  overscan = 2,
  className = ''
}: VirtualGridProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  // Calculate row positions
  const rowMetadata = useMemo(() => {
    const metadata: Array<{ offset: number; size: number }> = [];
    let offset = 0;

    for (let i = 0; i < rowCount; i++) {
      const size = typeof rowHeight === 'function' ? rowHeight(i) : rowHeight;
      metadata[i] = { offset, size };
      offset += size;
    }

    return metadata;
  }, [rowCount, rowHeight]);

  // Calculate column positions
  const columnMetadata = useMemo(() => {
    const metadata: Array<{ offset: number; size: number }> = [];
    let offset = 0;

    for (let i = 0; i < columnCount; i++) {
      const size = typeof columnWidth === 'function' ? columnWidth(i) : columnWidth;
      metadata[i] = { offset, size };
      offset += size;
    }

    return metadata;
  }, [columnCount, columnWidth]);

  // Calculate visible range
  const visibleRange = useMemo(() => {
    // Find visible rows
    let startRow = 0;
    let endRow = rowCount - 1;

    for (let i = 0; i < rowCount; i++) {
      if (rowMetadata[i].offset + rowMetadata[i].size > scrollTop) {
        startRow = i;
        break;
      }
    }

    for (let i = startRow; i < rowCount; i++) {
      if (rowMetadata[i].offset > scrollTop + containerHeight) {
        endRow = i - 1;
        break;
      }
    }

    // Find visible columns
    let startColumn = 0;
    let endColumn = columnCount - 1;

    for (let i = 0; i < columnCount; i++) {
      if (columnMetadata[i].offset + columnMetadata[i].size > scrollLeft) {
        startColumn = i;
        break;
      }
    }

    for (let i = startColumn; i < columnCount; i++) {
      if (columnMetadata[i].offset > scrollLeft + containerWidth) {
        endColumn = i - 1;
        break;
      }
    }

    return {
      startRow: Math.max(0, startRow - overscan),
      endRow: Math.min(rowCount - 1, endRow + overscan),
      startColumn: Math.max(0, startColumn - overscan),
      endColumn: Math.min(columnCount - 1, endColumn + overscan)
    };
  }, [scrollTop, scrollLeft, containerHeight, containerWidth, rowMetadata, columnMetadata, rowCount, columnCount, overscan]);

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
    setScrollLeft(event.currentTarget.scrollLeft);
  }, []);

  // Render visible cells
  const visibleCells = useMemo(() => {
    const cells = [];

    for (let rowIndex = visibleRange.startRow; rowIndex <= visibleRange.endRow; rowIndex++) {
      for (let columnIndex = visibleRange.startColumn; columnIndex <= visibleRange.endColumn; columnIndex++) {
        const itemIndex = rowIndex * columnCount + columnIndex;
        const item = items[itemIndex];
        
        const rowMeta = rowMetadata[rowIndex];
        const columnMeta = columnMetadata[columnIndex];

        const style: React.CSSProperties = {
          position: 'absolute',
          top: rowMeta.offset,
          left: columnMeta.offset,
          width: columnMeta.size,
          height: rowMeta.size
        };

        cells.push(
          <div key={`${rowIndex}-${columnIndex}`} style={style}>
            {renderCell(item, rowIndex, columnIndex, style)}
          </div>
        );
      }
    }

    return cells;
  }, [visibleRange, items, rowMetadata, columnMetadata, columnCount, renderCell]);

  const totalHeight = rowMetadata.length > 0 
    ? rowMetadata[rowMetadata.length - 1].offset + rowMetadata[rowMetadata.length - 1].size
    : 0;

  const totalWidth = columnMetadata.length > 0
    ? columnMetadata[columnMetadata.length - 1].offset + columnMetadata[columnMetadata.length - 1].size
    : 0;

  return (
    <div
      className={`relative overflow-auto ${className}`}
      style={{ width: containerWidth, height: containerHeight }}
      onScroll={handleScroll}
    >
      <div
        style={{
          position: 'relative',
          width: totalWidth,
          height: totalHeight
        }}
      >
        {visibleCells}
      </div>
    </div>
  );
}