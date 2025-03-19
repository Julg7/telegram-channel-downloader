module.exports = {
    // Connection settings
    connectionRetries: 5,
    connectionTimeout: 30000, // 30 seconds
    retryDelay: 5000, // 5 seconds between retries
    maxAttempts: 3, // Maximum number of retry attempts
    
    // Update loop settings
    pingInterval: 60000, // 60 seconds
    pingTimeout: 10000, // 10 seconds
    reconnectDelay: 3000, // 3 seconds before reconnecting
    
    // Download settings
    maxParallelDownloads: 5,
    downloadTimeout: 300000, // 5 minutes
    messageLimit: 100
}; 