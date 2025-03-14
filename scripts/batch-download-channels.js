"use strict";
const fs = require("fs");
const path = require("path");
const { initAuth } = require("../modules/auth");
const DownloadChannel = require("./download-channel");
const logger = require("../utils/logger");

const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds
const CONNECTION_TIMEOUT = 30000; // 30 seconds

async function resetClient(oldClient) {
  try {
    if (oldClient) {
      try {
        await oldClient.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
    }
    // Wait a bit before reconnecting
    await new Promise(resolve => setTimeout(resolve, 3000));
    return await initAuth();
  } catch (err) {
    logger.error("Error resetting client: " + err.message);
    throw err;
  }
}

async function downloadWithTimeout(downloader, options) {
  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Download operation timed out'));
    }, CONNECTION_TIMEOUT);

    try {
      await downloader.handle(options);
      clearTimeout(timeout);
      resolve();
    } catch (err) {
      clearTimeout(timeout);
      reject(err);
    }
  });
}

async function batchDownloadChannels(channelsFile) {
  let client = null;
  try {
    // Read channels from file
    const channels = fs
      .readFileSync(channelsFile, "utf8")
      .split("\n")
      .map(line => line.trim())
      .filter(line => line && !line.startsWith("#"));

    logger.info(`Found ${channels.length} channels to download`);

    // Initialize auth once for all downloads
    client = await initAuth();

    try {
      // Set default download options to download all files
      const downloadableFiles = {
        all: true  // This will download all file types
      };

      // Process each channel
      for (const channelId of channels) {
        let retryCount = 0;
        let success = false;

        while (retryCount < MAX_RETRIES && !success) {
          try {
            logger.info(`Processing channel ${channelId} (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
            const downloader = new DownloadChannel();
            
            // Use timeout wrapper
            await downloadWithTimeout(downloader, {
              channelId,
              downloadableFiles,
              client
            });
            
            success = true;
            logger.info(`Successfully completed channel ${channelId}`);
          } catch (err) {
            retryCount++;
            logger.error(`Error processing channel ${channelId}: ${err.message}`);
            
            if (retryCount < MAX_RETRIES) {
              logger.info(`Retrying in ${RETRY_DELAY/1000} seconds...`);
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
              
              // Always reset client on error
              logger.info("Resetting Telegram client...");
              client = await resetClient(client);
            } else {
              logger.error(`Failed to process channel ${channelId} after ${MAX_RETRIES} attempts, moving to next channel`);
              // Move to next channel even if this one failed
              break;
            }
          }
        }
      }
    } finally {
      // Disconnect client after all downloads are complete
      if (client) {
        try {
          await client.disconnect();
        } catch (e) {
          // Ignore disconnect error
        }
      }
    }
  } catch (err) {
    logger.error("Error during batch download:");
    console.error(err);
    process.exit(1);
  }
}

// Handle command line argument
const channelsFile = process.argv[2];
if (!channelsFile) {
  logger.error("Please provide a channels file path");
  process.exit(1);
}

batchDownloadChannels(channelsFile);

module.exports = { batchDownloadChannels }; 