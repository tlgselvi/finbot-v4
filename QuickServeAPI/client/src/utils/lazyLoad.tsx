/**
 * FinBot v4 - Lazy Loading Utilities
 * Optimized lazy loading with error boundaries and loading states
 */

import React, { Suspense, ComponentType, LazyExoticComponent } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

interface LazyLoadOptions {
  fallback?: React.ComponentType;
  errorFallback?: React.ComponentType<{ error: Error; resetErrorBoundary: () => void }>;
  retryDelay?: number;
  maxRetries?: number;
}

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  message?: string;
}

// Default loading spinner component
const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  size = 'medium', 
  message = 'Loading...' 
}) => {
  const sizeClasses = {
    small: 'w-4 h-4',
    medium: 'w-8 h-8',
    large: 'w-12 h-12'
  };

  return (
    <div className="flex flex-col items-center justify-center p-8">
      <div className={`animate-spin rounded-full border-b-2 border-blue-600 ${sizeClasses[size]}`} />
      <p className="mt-2 text-sm text-gray-600">{message}</p>
    </div>
  );
};

// Default error fallback component
const ErrorFallback: React.FC<{ error: Error; resetErrorBoundary: () => void }> = ({ 
  error, 
  resetErrorBoundary 
}) => (
  <div className="flex flex-col items-center justify-center p-8 bg-red-50 border border-red-200 rounded-lg">
    <div className="text-red-600 mb-4">
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
    </div>
    <h3 className="text-lg font-medium text-red-900 mb-2">Something went wrong</h3>
    <p className="text-sm text-red-700 mb-4 text-center">
      {error.message || 'Failed to load component'}
    </p>
    <button
      onClick={resetErrorBoundary}
      className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
    >
      Try again
    </button>
  </div>
);

/**
 * Enhanced lazy loading with retry mechanism
 */
export function lazyLoadWithRetry<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  options: LazyLoadOptions = {}
): LazyExoticComponent<T> {
  const {
    retryDelay = 1000,
    maxRetries = 3
  } = options;

  let retryCount = 0;

  const retryImport = async (): Promise<{ default: T }> => {
    try {
      return await importFn();
    } catch (error) {
      if (retryCount < maxRetries) {
        retryCount++;
        console.warn(`Lazy load failed, retrying (${retryCount}/${maxRetries})...`, error);
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, retryDelay * retryCount));
        return retryImport();
      }
      
      console.error('Lazy load failed after max retries:', error);
      throw error;
    }
  };

  return React.lazy(retryImport);
}

/**
 * HOC for wrapping lazy components with error boundary and suspense
 */
export function withLazyLoading<P extends object>(
  LazyComponent: LazyExoticComponent<ComponentType<P>>,
  options: LazyLoadOptions = {}
) {
  const {
    fallback: FallbackComponent = LoadingSpinner,
    errorFallback: ErrorFallbackComponent = ErrorFallback
  } = options;

  return React.forwardRef<any, P>((props, ref) => (
    <ErrorBoundary
      FallbackComponent={ErrorFallbackComponent}
      onError={(error, errorInfo) => {
        console.error('Lazy component error:', error, errorInfo);
        // Could send to error reporting service here
      }}
    >
      <Suspense fallback={<FallbackComponent />}>
        <LazyComponent {...props} ref={ref} />
      </Suspense>
    </ErrorBoundary>
  ));
}

/**
 * Preload a lazy component
 */
export function preloadComponent<T extends ComponentType<any>>(
  lazyComponent: LazyExoticComponent<T>
): Promise<{ default: T }> {
  // Access the internal _payload to trigger loading
  const componentImporter = (lazyComponent as any)._payload;
  
  if (componentImporter && typeof componentImporter._result === 'undefined') {
    return componentImporter._result;
  }
  
  // Fallback: create a temporary element to trigger loading
  return new Promise((resolve, reject) => {
    const tempElement = React.createElement(lazyComponent);
    try {
      // This will trigger the lazy loading
      resolve(tempElement.type as any);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Hook for preloading components on hover or focus
 */
export function usePreloadOnHover<T extends ComponentType<any>>(
  lazyComponent: LazyExoticComponent<T>
) {
  const preload = React.useCallback(() => {
    preloadComponent(lazyComponent).catch(error => {
      console.warn('Failed to preload component:', error);
    });
  }, [lazyComponent]);

  return {
    onMouseEnter: preload,
    onFocus: preload
  };
}

/**
 * Component for lazy loading images with intersection observer
 */
interface LazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  placeholder?: string;
  threshold?: number;
  rootMargin?: string;
}

export const LazyImage: React.FC<LazyImageProps> = ({
  src,
  alt,
  placeholder = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkxvYWRpbmcuLi48L3RleHQ+PC9zdmc+',
  threshold = 0.1,
  rootMargin = '50px',
  ...props
}) => {
  const [isLoaded, setIsLoaded] = React.useState(false);
  const [isInView, setIsInView] = React.useState(false);
  const imgRef = React.useRef<HTMLImageElement>(null);

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  const handleLoad = () => {
    setIsLoaded(true);
  };

  return (
    <img
      ref={imgRef}
      src={isInView ? src : placeholder}
      alt={alt}
      onLoad={handleLoad}
      style={{
        opacity: isLoaded ? 1 : 0.7,
        transition: 'opacity 0.3s ease-in-out'
      }}
      {...props}
    />
  );
};

/**
 * Higher-order component for lazy loading any component based on intersection
 */
export function withIntersectionLazyLoading<P extends object>(
  Component: ComponentType<P>,
  options: {
    threshold?: number;
    rootMargin?: string;
    placeholder?: ComponentType;
  } = {}
) {
  const {
    threshold = 0.1,
    rootMargin = '50px',
    placeholder: Placeholder = LoadingSpinner
  } = options;

  return React.forwardRef<any, P>((props, ref) => {
    const [isInView, setIsInView] = React.useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        },
        { threshold, rootMargin }
      );

      if (containerRef.current) {
        observer.observe(containerRef.current);
      }

      return () => observer.disconnect();
    }, [threshold, rootMargin]);

    return (
      <div ref={containerRef}>
        {isInView ? (
          <Component {...props} ref={ref} />
        ) : (
          <Placeholder />
        )}
      </div>
    );
  });
}