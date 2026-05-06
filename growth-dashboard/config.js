// config.js - Configuration for the Growth Dashboard

const path = require('path');

const config = {
  // Database configuration
  db: {
    path: path.join(__dirname, '..', 'mission-control.db')
  },

  // Dashboard settings
  dashboard: {
    title: 'Growth Pipeline Dashboard',
    port: 3456,
    refreshInterval: 30000 // 30 seconds
  },

  // Pipeline metrics to display
  metrics: {
    // Task statuses to track
    statuses: ['inbox', 'pending_dispatch', 'planning', 'assigned', 'in_progress', 'testing', 'review', 'done'],
    // Priority levels
    priorities: ['urgent', 'high', 'normal', 'low']
  }
};

module.exports = config;