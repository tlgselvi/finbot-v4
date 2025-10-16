/**
 * FinBot v4 - Performance Utilities
 * Utility functions for React performance optimizations
 */

import React from 'react';

/**
 * Higher-order component for memoizing components with custom comparison
 */
export const withMemoization = <P extends object>(
  Component: React.ComponentType<P>,
  areEqual?: (prevProps: P, nextProps: P) => boolean
) => {
  return React.memo(Component, areEqual);
};

/**
 * Custom comparison function for shallow equality
 */
export const shallowEqual = <T extends Record<string, any>>(
  prevProps: T,
  nextProps: T
): boolean => {
  const keys1 = Object.keys(prevProps);
  const keys2 = Object.keys(nextProps);

  if (keys1.length !== keys2.length) {
    return false;
  }

  for (const key of keys1) {
    if (prevProps[key] !== nextProps[key]) {
      return false;
    }
  }

  return true;
};

/**
 * Custom comparison function for props with specific keys
 */
export const createPropsComparator = <T extends Record<string, any>>(
  keysToCompare: (keyof T)[]
) => {
  return (prevProps: T, nextProps: T): boolean => {
    return keysToCompare.every(key => prevProps[key] === nextProps[key]);
  };
};

/**
 * Utility for creating stable object references
 */
export const createStableObject = <T extends Record<string, any>>(obj: T): T => {
  const keys = Object.keys(obj).sort();
  const stableObj = {} as T;
  
  keys.forEach(key => {
    stableObj[key as keyof T] = obj[key as keyof T];
  });
  
  return stableObj;
};

/**
 * Utility for batching state updates
 */
export const batchUpdates = (updates: (() => void)[]): void => {
  // In React 18+, updates are automatically batched
  // This is for compatibility and explicit batching
  React.unstable_batchedUpdates(() => {
    updates.forEach(update => update());
  });
};

/**
 * Utility for creating memoized selectors
 */
export const createMemoizedSelector = <TState, TResult>(
  selector: (state: TState) => TResult,
  equalityFn?: (a: TResult, b: TResult) => boolean
) => {
  let lastState: TState;
  let lastResult: TResult;
  
  return (state: TState): TResult => {
    if (state !== lastState) {
      const newResult = selector(state);
      
      if (!equalityFn || !equalityFn(lastResult, newResult)) {
        lastResult = newResult;
      }
      
      lastState = state;
    }
    
    return lastResult;
  };
};

/**
 * Performance measurement utility
 */
export const measurePerformance = <T extends (...args: any[]) => any>(
  fn: T,
  label?: string
): T => {
  return ((...args: Parameters<T>) => {
    const start = performance.now();
    const result = fn(...args);
    const end = performance.now();
    
    if (label) {
      console.log(`${label} took ${end - start} milliseconds`);
    }
    
    return result;
  }) as T;
};

/**
 * Utility for lazy component loading with error boundary
 */
export const createLazyComponent = <T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  fallback?: React.ComponentType
) => {
  const LazyComponent = React.lazy(importFn);
  
  return React.forwardRef<any, React.ComponentProps<T>>((props, ref) => (
    <React.Suspense fallback={fallback ? <fallback /> : <div>Loading...</div>}>
      <LazyComponent {...props} ref={ref} />
    </React.Suspense>
  ));
};

/**
 * Utility for optimizing list rendering
 */
export const optimizeListRendering = <T>(
  items: T[],
  keyExtractor: (item: T, index: number) => string | number,
  renderItem: (item: T, index: number) => React.ReactElement
) => {
  return items.map((item, index) => {
    const key = keyExtractor(item, index);
    return React.cloneElement(renderItem(item, index), { key });
  });
};

/**
 * Utility for creating stable event handlers
 */
export const createStableHandler = <T extends (...args: any[]) => any>(
  handler: T,
  dependencies: React.DependencyList
): T => {
  // This would be used with useCallback in the component
  return React.useCallback(handler, dependencies);
};

/**
 * Utility for preventing unnecessary re-renders in context providers
 */
export const createStableContextValue = <T>(value: T): T => {
  const ref = React.useRef<T>(value);
  
  // Only update if the value has actually changed
  if (JSON.stringify(ref.current) !== JSON.stringify(value)) {
    ref.current = value;
  }
  
  return ref.current;
};