"use strict";
const fs = require("fs");
const path = require("path");
const { initAuth } = require("../modules/auth");
const DownloadChannel = require("./download-channel");
const logger = require("../utils/logger");

async function batchDownloadChannels(channelsFile) {
  try {
    // Read channels from file
    const channels = fs
      .readFileSync(channelsFile, "utf8")
      .split("\n")
      .map(line => line.trim())
      .filter(line => line && !line.startsWith("#"));

    logger.info(`Found ${channels.length} channels to download`);

    // Initialize auth once for all downloads
    const client = await initAuth();

    try {
      // Set default download options to download all files
      const downloadableFiles = {
        all: true  // This will download all file types
      };

      // Process each channel
      for (const channelId of channels) {
        const downloader = new DownloadChannel();
        await downloader.handle({
          channelId,
          downloadableFiles,
          client
        });
      }
    } finally {
      // Disconnect client after all downloads are complete
      if (client) {
        await client.disconnect();
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