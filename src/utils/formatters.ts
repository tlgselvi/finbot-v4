/**
 * Utility functions for formatting currency, percentages, and other values
 */

// Format currency values
export const formatCurrency = (amount: number, currency: string = 'USD', locale: string = 'en-US'): string => {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
};

// Format percentage values
export const formatPercentage = (value: number, decimals: number = 1): string => {
  return `${value.toFixed(decimals)}%`;
};

// Format large numbers with abbreviations
export const formatNumber = (num: number): string => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
};

// Format date values
export const formatDate = (date: Date, format: 'short' | 'long' | 'relative' = 'short'): string => {
  if (format === 'relative') {
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.ceil(diffDays / 30)} months ago`;
    return `${Math.ceil(diffDays / 365)} years ago`;
  }
  
  return date.toLocaleDateString('en-US', {
    year: format === 'long' ? 'numeric' : '2-digit',
    month: format === 'long' ? 'long' : 'short',
    day: 'numeric'
  });
};

// Format time duration
export const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
};

// Format file size
export const formatFileSize = (bytes: number): string => {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 Bytes';
  
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
};

// Truncate text with ellipsis
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
};

// Format phone number
export const formatPhoneNumber = (phoneNumber: string): string => {
  const cleaned = phoneNumber.replace(/\D/g, '');
  const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
  
  if (match) {
    return `(${match[1]}) ${match[2]}-${match[3]}`;
  }
  
  return phoneNumber;
};

// Format credit card number
export const formatCreditCard = (cardNumber: string): string => {
  const cleaned = cardNumber.replace(/\D/g, '');
  const match = cleaned.match(/^(\d{4})(\d{4})(\d{4})(\d{4})$/);
  
  if (match) {
    return `${match[1]} ${match[2]} ${match[3]} ${match[4]}`;
  }
  
  return cardNumber;
};

// Mask sensitive information
export const maskString = (str: string, visibleChars: number = 4, maskChar: string = '*'): string => {
  if (str.length <= visibleChars) return str;
  
  const visible = str.slice(-visibleChars);
  const masked = maskChar.repeat(str.length - visibleChars);
  
  return masked + visible;
};

// Format account number
export const formatAccountNumber = (accountNumber: string): string => {
  return maskString(accountNumber, 4);
};

// Calculate percentage change
export const calculatePercentageChange = (oldValue: number, newValue: number): number => {
  if (oldValue === 0) return newValue > 0 ? 100 : 0;
  return ((newValue - oldValue) / oldValue) * 100;
};

// Format percentage change with sign
export const formatPercentageChange = (oldValue: number, newValue: number): string => {
  const change = calculatePercentageChange(oldValue, newValue);
  const sign = change > 0 ? '+' : '';
  return `${sign}${formatPercentage(change)}`;
};

// Format compact currency (for charts and small spaces)
export const formatCompactCurrency = (amount: number): string => {
  if (Math.abs(amount) >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  } else if (Math.abs(amount) >= 1000) {
    return `$${(amount / 1000).toFixed(1)}K`;
  }
  return `$${amount.toFixed(0)}`;
};

// Format budget category name
export const formatCategoryName = (category: string): string => {
  return category
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

// Format trend indicator
export const formatTrend = (value: number): { text: string; color: string; icon: string } => {
  if (value > 0) {
    return {
      text: `+${formatPercentage(value)}`,
      color: 'success',
      icon: '↗️'
    };
  } else if (value < 0) {
    return {
      text: formatPercentage(value),
      color: 'error', 
      icon: '↘️'
    };
  } else {
    return {
      text: '0%',
      color: 'neutral',
      icon: '→'
    };
  }
};

// Format budget status
export const formatBudgetStatus = (spent: number, budgeted: number): {
  status: 'under' | 'on-track' | 'over';
  percentage: number;
  color: string;
} => {
  const percentage = (spent / budgeted) * 100;
  
  if (percentage < 80) {
    return { status: 'under', percentage, color: 'warning' };
  } else if (percentage <= 100) {
    return { status: 'on-track', percentage, color: 'success' };
  } else {
    return { status: 'over', percentage, color: 'error' };
  }
};

// Format financial goal progress
export const formatGoalProgress = (current: number, target: number): {
  percentage: number;
  remaining: number;
  status: 'not-started' | 'in-progress' | 'completed';
} => {
  const percentage = Math.min((current / target) * 100, 100);
  const remaining = Math.max(target - current, 0);
  
  let status: 'not-started' | 'in-progress' | 'completed';
  if (percentage === 0) {
    status = 'not-started';
  } else if (percentage >= 100) {
    status = 'completed';
  } else {
    status = 'in-progress';
  }
  
  return { percentage, remaining, status };
};

// Format risk level
export const formatRiskLevel = (level: 'low' | 'medium' | 'high'): {
  label: string;
  color: string;
  description: string;
} => {
  switch (level) {
    case 'low':
      return {
        label: 'Low Risk',
        color: 'success',
        description: 'Conservative approach with minimal risk'
      };
    case 'medium':
      return {
        label: 'Medium Risk',
        color: 'warning',
        description: 'Balanced approach with moderate risk'
      };
    case 'high':
      return {
        label: 'High Risk',
        color: 'error',
        description: 'Aggressive approach with higher potential returns'
      };
  }
};