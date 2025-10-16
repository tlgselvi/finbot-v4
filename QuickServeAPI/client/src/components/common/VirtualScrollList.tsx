/**
 * FinBot v4 - Virtual Scroll List Component
 * Optimized list component for large datasets
 */

import React, { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react';
import { useVirtualScrolling } from '@/hooks/usePerformanceOptimization';

interface VirtualScrollListProps<T> {
  items: T[];
  itemHeight: number;
  containerHeight: number;
  renderItem: (item: T, index: number) => React.ReactElement;
  keyExtractor: (item: T, index: number) => string | number;
  className?: string;
  overscan?: number; // Number of items to render outside visible area
  onScroll?: (scrollTop: number) => void;
}

export const VirtualScrollList = memo(<T,>({
  items,
  itemHeight,
  containerHeight,
  renderItem,
  keyExtractor,
  className = '',
  overscan = 5,
  onScroll
}: VirtualScrollListProps<T>) => {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const { startIndex, endIndex, offsetY } = useVirtualScrolling(
    items.length,
    itemHeight,
    containerHeight,
    scrollTop
  );

  // Calculate visible range with overscan
  const visibleStartIndex = Math.max(0, startIndex - overscan);
  const visibleEndIndex = Math.min(items.length, endIndex + overscan);

  // Memoize visible items
  const visibleItems = useMemo(() => {
    return items.slice(visibleStartIndex, visibleEndIndex);
  }, [items, visibleStartIndex, visibleEndIndex]);

  // Handle scroll events
  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const newScrollTop = event.currentTarget.scrollTop;
    setScrollTop(newScrollTop);
    onScroll?.(newScrollTop);
  }, [onScroll]);

  // Total height of all items
  const totalHeight = items.length * itemHeight;

  // Offset for visible items
  const visibleOffset = visibleStartIndex * itemHeight;

  return (
    <div
      ref={containerRef}
      className={`overflow-auto ${className}`}
      style={{ height: containerHeight }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div
          style={{
            transform: `translateY(${visibleOffset}px)`,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0
          }}
        >
          {visibleItems.map((item, index) => {
            const actualIndex = visibleStartIndex + index;
            const key = keyExtractor(item, actualIndex);
            
            return (
              <div
                key={key}
                style={{
                  height: itemHeight,
                  overflow: 'hidden'
                }}
              >
                {renderItem(item, actualIndex)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}) as <T>(props: VirtualScrollListProps<T>) => React.ReactElement;

VirtualScrollList.displayName = 'VirtualScrollList';

/**
 * Hook for managing virtual scroll state
 */
export const useVirtualScrollState = (
  itemCount: number,
  itemHeight: number,
  containerHeight: number
) => {
  const [scrollTop, setScrollTop] = useState(0);
  
  const scrollToIndex = useCallback((index: number) => {
    const newScrollTop = index * itemHeight;
    setScrollTop(newScrollTop);
  }, [itemHeight]);

  const scrollToTop = useCallback(() => {
    setScrollTop(0);
  }, []);

  const scrollToBottom = useCallback(() => {
    const maxScrollTop = Math.max(0, (itemCount * itemHeight) - containerHeight);
    setScrollTop(maxScrollTop);
  }, [itemCount, itemHeight, containerHeight]);

  return {
    scrollTop,
    setScrollTop,
    scrollToIndex,
    scrollToTop,
    scrollToBottom
  };
};

/**
 * Virtual Grid Component for 2D virtualization
 */
interface VirtualGridProps<T> {
  items: T[];
  itemWidth: number;
  itemHeight: number;
  containerWidth: number;
  containerHeight: number;
  columnsCount: number;
  renderItem: (item: T, rowIndex: number, colIndex: number) => React.ReactElement;
  keyExtractor: (item: T, index: number) => string | number;
  className?: string;
}

export const VirtualGrid = memo(<T,>({
  items,
  itemWidth,
  itemHeight,
  containerWidth,
  containerHeight,
  columnsCount,
  renderItem,
  keyExtractor,
  className = ''
}: VirtualGridProps<T>) => {
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const rowCount = Math.ceil(items.length / columnsCount);
  
  // Calculate visible rows
  const visibleRowStart = Math.floor(scrollTop / itemHeight);
  const visibleRowEnd = Math.min(
    rowCount,
    visibleRowStart + Math.ceil(containerHeight / itemHeight) + 1
  );

  // Calculate visible columns
  const visibleColStart = Math.floor(scrollLeft / itemWidth);
  const visibleColEnd = Math.min(
    columnsCount,
    visibleColStart + Math.ceil(containerWidth / itemWidth) + 1
  );

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
    setScrollLeft(event.currentTarget.scrollLeft);
  }, []);

  const totalHeight = rowCount * itemHeight;
  const totalWidth = columnsCount * itemWidth;

  const visibleItems = useMemo(() => {
    const result: Array<{ item: T; rowIndex: number; colIndex: number; key: string | number }> = [];
    
    for (let rowIndex = visibleRowStart; rowIndex < visibleRowEnd; rowIndex++) {
      for (let colIndex = visibleColStart; colIndex < visibleColEnd; colIndex++) {
        const itemIndex = rowIndex * columnsCount + colIndex;
        if (itemIndex < items.length) {
          const item = items[itemIndex];
          const key = keyExtractor(item, itemIndex);
          result.push({ item, rowIndex, colIndex, key });
        }
      }
    }
    
    return result;
  }, [items, visibleRowStart, visibleRowEnd, visibleColStart, visibleColEnd, columnsCount, keyExtractor]);

  return (
    <div
      className={`overflow-auto ${className}`}
      style={{ width: containerWidth, height: containerHeight }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, width: totalWidth, position: 'relative' }}>
        {visibleItems.map(({ item, rowIndex, colIndex, key }) => (
          <div
            key={key}
            style={{
              position: 'absolute',
              top: rowIndex * itemHeight,
              left: colIndex * itemWidth,
              width: itemWidth,
              height: itemHeight,
              overflow: 'hidden'
            }}
          >
            {renderItem(item, rowIndex, colIndex)}
          </div>
        ))}
      </div>
    </div>
  );
}) as <T>(props: VirtualGridProps<T>) => React.ReactElement;

VirtualGrid.displayName = 'VirtualGrid';