"use strict";
const fs = require("fs");
const path = require("path");
const { initAuth } = require("../modules/auth");
const DownloadChannel = require("./download-channel");
const logger = require("../utils/logger");

function extractChannelIdentifier(line) {
  // Remove any whitespace
  line = line.trim();
  
  // Handle t.me links
  if (line.includes('t.me/')) {
    return line.split('t.me/')[1].trim();
  }
  
  // Handle direct channel names or IDs
  return line;
}

async function resolveChannelId(client, identifier) {
  try {
    // If it's already a numeric ID, return it
    if (/^-?\d+$/.test(identifier)) {
      return parseInt(identifier, 10);
    }

    // Try to resolve the username to get the channel ID
    const result = await client.getEntity(identifier);
    return result.id;
  } catch (err) {
    logger.error(`Could not resolve channel: ${identifier}`);
    return null;
  }
}

async function batchDownloadChannels(channelsFile) {
  try {
    // Initialize auth first to resolve channel IDs
    const client = await initAuth();

    try {
      // Read channels from file
      const channelIdentifiers = fs
        .readFileSync(channelsFile, "utf8")
        .split("\n")
        .map(line => line.trim())
        .filter(line => line && !line.startsWith("#"))
        .map(extractChannelIdentifier);

      logger.info(`Found ${channelIdentifiers.length} channels to process`);

      // Resolve all channel IDs
      const channelIds = [];
      for (const identifier of channelIdentifiers) {
        const channelId = await resolveChannelId(client, identifier);
        if (channelId) {
          channelIds.push(channelId);
        }
      }

      logger.info(`Successfully resolved ${channelIds.length} channel IDs`);

      const downloadableFiles = {
        all: true
      };

      // Process each channel
      for (const channelId of channelIds) {
        logger.info(`Starting download for channel ID: ${channelId}`);
        const downloader = new DownloadChannel();
        await downloader.handle({
          channelId,
          downloadableFiles,
          client
        });
      }
    } finally {
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