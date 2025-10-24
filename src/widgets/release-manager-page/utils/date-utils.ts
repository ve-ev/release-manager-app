// Format date for display in MMM, DD, YYYY format
export const formatDate = (dateString?: string) => {
  if (!dateString) {
    return '';
  }
  const date = new Date(dateString);
  const options: Intl.DateTimeFormatOptions = { 
    month: 'short', 
    day: '2-digit', 
    year: 'numeric' 
  };
  return date.toLocaleDateString('en-US', options);
};

// Check if a date is today
export const isToday = (dateString?: string): boolean => {
  if (!dateString) {
    return false;
  }
  
  const date = new Date(dateString);
  const today = new Date();
  
  return date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();
};

// Check if a date is expired (before today)
export const isExpired = (dateString?: string): boolean => {
  if (!dateString) {
    return false;
  }
  
  const date = new Date(dateString);
  // Set time to beginning of the day for accurate comparison
  date.setHours(0, 0, 0, 0);
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return date < today;
};