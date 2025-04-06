module.exports = {
    // Connection settings
    connectionRetries: 10,
    connectionTimeout: 60000, // 60 seconds
    retryDelay: 5000, // 5 seconds between retries
    maxAttempts: 5, // Maximum number of retry attempts
    
    // Update loop settings
    pingInterval: 120000, // 120 seconds
    pingTimeout: 30000, // 30 seconds
    reconnectDelay: 3000, // 3 seconds before reconnecting
    
    // Download settings
    maxParallelDownloads: 5,
    downloadTimeout: 300000, // 5 minutes
    messageLimit: 100
}; 