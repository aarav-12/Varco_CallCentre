import React from 'react';

const variants = {
  green: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  red: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  yellow: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  gray: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  primary: 'bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-400',
  purple: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
};

export default function Badge({ children, variant = 'gray', className = '' }) {
  return (
    <span className={`badge ${variants[variant] || variants.gray} ${className}`}>
      {children}
    </span>
  );
}

export const statusBadge = (status) => {
  const map = {
    not_contacted: { label: 'Not Contacted', variant: 'gray' },
    no_answer: { label: 'No Answer', variant: 'yellow' },
    busy: { label: 'Busy', variant: 'amber' },
    interested: { label: 'Interested', variant: 'blue' },
    follow_up_required: { label: 'Follow-Up', variant: 'purple' },
    order_confirmed: { label: 'Order Confirmed', variant: 'green' },
    not_interested: { label: 'Not Interested', variant: 'red' },
    invalid_number: { label: 'Invalid Number', variant: 'red' },
  };
  return map[status] || { label: status, variant: 'gray' };
};

export const attendanceBadge = (status) => {
  const map = {
    online: { label: 'Online', variant: 'green' },
    offline: { label: 'Offline', variant: 'gray' },
    on_break: { label: 'On Break', variant: 'amber' },
    late: { label: 'Late', variant: 'red' },
  };
  return map[status] || { label: status, variant: 'gray' };
};
