/**
 * FinBot v4 - Optimized Import Utilities
 * Tree-shakable imports and dynamic loading utilities
 */

// Optimized lodash imports (tree-shakable)
export { default as debounce } from 'lodash-es/debounce';
export { default as throttle } from 'lodash-es/throttle';
export { default as groupBy } from 'lodash-es/groupBy';
export { default as sortBy } from 'lodash-es/sortBy';
export { default as uniqBy } from 'lodash-es/uniqBy';
export { default as pick } from 'lodash-es/pick';
export { default as omit } from 'lodash-es/omit';
export { default as merge } from 'lodash-es/merge';
export { default as cloneDeep } from 'lodash-es/cloneDeep';

// Optimized date-fns imports (tree-shakable)
export { format } from 'date-fns/format';
export { parseISO } from 'date-fns/parseISO';
export { formatDistanceToNow } from 'date-fns/formatDistanceToNow';
export { isAfter } from 'date-fns/isAfter';
export { isBefore } from 'date-fns/isBefore';
export { addDays } from 'date-fns/addDays';
export { subDays } from 'date-fns/subDays';
export { startOfDay } from 'date-fns/startOfDay';
export { endOfDay } from 'date-fns/endOfDay';

// Dynamic imports for heavy libraries
export const loadChartLibrary = async () => {
  const [
    { Chart, registerables },
    { Line, Bar, Pie }
  ] = await Promise.all([
    import('chart.js'),
    import('react-chartjs-2')
  ]);
  
  Chart.register(...registerables);
  
  return { Chart, Line, Bar, Pie };
};

export const loadExcelLibrary = async () => {
  const XLSX = await import('xlsx');
  return XLSX;
};

export const loadPDFLibrary = async () => {
  const jsPDF = await import('jspdf');
  return jsPDF;
};

export const loadDatePickerLibrary = async () => {
  const DatePicker = await import('react-datepicker');
  return DatePicker;
};

// Optimized icon imports (tree-shakable)
export const loadIcon = async (iconName: string) => {
  try {
    const iconModule = await import(`lucide-react`);
    return iconModule[iconName];
  } catch (error) {
    console.warn(`Failed to load icon: ${iconName}`, error);
    // Return a default icon
    const { HelpCircle } = await import('lucide-react');
    return HelpCircle;
  }
};

// Batch icon loading for better performance
export const loadIcons = async (iconNames: string[]) => {
  const iconModule = await import('lucide-react');
  const icons: Record<string, any> = {};
  
  iconNames.forEach(iconName => {
    if (iconModule[iconName]) {
      icons[iconName] = iconModule[iconName];
    }
  });
  
  return icons;
};

// Commonly used icons (preloaded)
export const preloadCommonIcons = async () => {
  return loadIcons([
    'Bell',
    'User',
    'Settings',
    'Search',
    'Filter',
    'Download',
    'Upload',
    'Edit',
    'Trash2',
    'Plus',
    'Minus',
    'Check',
    'X',
    'ChevronDown',
    'ChevronUp',
    'ChevronLeft',
    'ChevronRight',
    'AlertTriangle',
    'Info',
    'CheckCircle',
    'XCircle'
  ]);
};

// Utility for dynamic component imports with error handling
export const dynamicImport = async <T>(
  importFn: () => Promise<T>,
  fallback?: T
): Promise<T> => {
  try {
    return await importFn();
  } catch (error) {
    console.error('Dynamic import failed:', error);
    if (fallback) {
      return fallback;
    }
    throw error;
  }
};

// Preload critical dependencies
export const preloadCriticalDependencies = async () => {
  const criticalImports = [
    () => import('react'),
    () => import('react-dom'),
    () => preloadCommonIcons()
  ];

  const results = await Promise.allSettled(
    criticalImports.map(importFn => importFn())
  );

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.warn(`Failed to preload critical dependency ${index}:`, result.reason);
    }
  });
};

// Bundle size monitoring utility
export const getBundleInfo = () => {
  if (typeof window !== 'undefined' && 'performance' in window) {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    
    const jsResources = resources.filter(resource => 
      resource.name.endsWith('.js') && !resource.name.includes('node_modules')
    );
    
    const cssResources = resources.filter(resource => 
      resource.name.endsWith('.css')
    );
    
    const totalJSSize = jsResources.reduce((total, resource) => 
      total + (resource.transferSize || 0), 0
    );
    
    const totalCSSSize = cssResources.reduce((total, resource) => 
      total + (resource.transferSize || 0), 0
    );
    
    return {
      totalSize: totalJSSize + totalCSSSize,
      jsSize: totalJSSize,
      cssSize: totalCSSSize,
      jsFiles: jsResources.length,
      cssFiles: cssResources.length,
      loadTime: navigation.loadEventEnd - navigation.fetchStart
    };
  }
  
  return null;
};

// Performance monitoring for imports
export const monitorImportPerformance = (importName: string) => {
  return async <T>(importFn: () => Promise<T>): Promise<T> => {
    const startTime = performance.now();
    
    try {
      const result = await importFn();
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      console.log(`Import "${importName}" took ${duration.toFixed(2)}ms`);
      
      // Send to analytics if available
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'import_performance', {
          import_name: importName,
          duration: Math.round(duration),
          custom_parameter: 'bundle_optimization'
        });
      }
      
      return result;
    } catch (error) {
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      console.error(`Import "${importName}" failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  };
};