"use strict";
const fs = require("fs");
const path = require("path");
const { initAuth } = require("../modules/auth");
const {
  getMessages,
  getMessageDetail,
  downloadMessageMedia,
} = require("../modules/messages");
const {
  getMediaType,
  getMediaPath,
  checkFileExist,
  appendToJSONArrayFile,
  wait,
} = require("../utils/helper");
const {
  updateLastSelection,
  getLastSelection,
} = require("../utils/file-helper");
const logger = require("../utils/logger");
const { getDialogName, getAllDialogs } = require("../modules/dialoges");
const {
  downloadOptionInput,
  selectInput,
} = require("../utils/input-helper");

const MAX_PARALLEL_DOWNLOAD = 5;
const MESSAGE_LIMIT = 10;

/**
 * Handles downloading media from a Telegram channel
 */
class DownloadChannel {
  constructor() {
    this.outputFolder = null;
    this.downloadableFiles = null;
    this.client = null;
    this.stats = {
      totalFiles: 0,
      skippedFiles: 0,
      downloadedFiles: 0,
      updatedFiles: 0
    };

    const exportPath = path.resolve("Q:/SITES/pierre2_Chaines/export");
    if (!fs.existsSync(exportPath)) {
      fs.mkdirSync(exportPath, { recursive: true });
    }
  }

  static description() {
    return "Download all media from a channel";
  }

  /**
   * Checks if a message contains media
   * @param {Object} message The Telegram message object
   */
  hasMedia(message) {
    return Boolean(message.media);
  }

  /**
   * Determines if a message's media should be downloaded
   * @param {Object} message The Telegram message object
   */
  canDownload(message) {
    if (!this.hasMedia(message)) return false;
    const mediaType = getMediaType(message);
    const mediaPath = getMediaPath(message, this.outputFolder);
    
    // Create subdirectories if they don't exist
    const mediaDir = path.dirname(mediaPath);
    if (!fs.existsSync(mediaDir)) {
      fs.mkdirSync(mediaDir, { recursive: true });
    }
    
    this.stats.totalFiles++;
    
    // Check if file exists and get its stats
    const fileExists = checkFileExist(message, this.outputFolder);
    let shouldDownload = false;

    if (fileExists) {
      // Get file stats
      const stats = fs.statSync(mediaPath);
      
      // Check if file is empty (incomplete download)
      if (stats.size === 0) {
        shouldDownload = true;
        this.stats.updatedFiles++;
        logger.info(`File ${path.basename(mediaPath)} exists but is empty - will redownload`);
      }
      // Check if message is newer than file
      else if (message.date * 1000 > stats.mtimeMs) {
        shouldDownload = true;
        this.stats.updatedFiles++;
        logger.info(`File ${path.basename(mediaPath)} has updates - will redownload`);
      } else {
        this.stats.skippedFiles++;
        logger.info(`Skipping ${path.basename(mediaPath)} - already exists and up to date`);
      }
    } else {
      shouldDownload = true;
    }

    const extension = path.extname(mediaPath).toLowerCase().replace(".", "");
    const allowed =
      this.downloadableFiles?.[mediaType] ||
      this.downloadableFiles?.[extension] ||
      this.downloadableFiles?.all;

    if (shouldDownload && allowed) {
      this.stats.downloadedFiles++;
      return true;
    }
    
    return false;
  }

  /**
   * Records messages to a JSON file
   * @param {Array} messages The message objects
   */
  recordMessages(messages) {
    const filePath = path.join(this.outputFolder, "all_message.json");
    if (!fs.existsSync(this.outputFolder)) {
      fs.mkdirSync(this.outputFolder, { recursive: true });
    }

    const data = messages.map((msg) => ({
      id: msg.id,
      message: msg.message,
      date: msg.date,
      out: msg.out,
      hasMedia: !!msg.media,
      sender: msg.fromId?.userId || msg.peerId?.userId,
      mediaType: this.hasMedia(msg) ? getMediaType(msg) : undefined,
      mediaPath: this.hasMedia(msg)
        ? getMediaPath(msg, this.outputFolder)
        : undefined,
      mediaName: this.hasMedia(msg)
        ? path.basename(getMediaPath(msg, this.outputFolder))
        : undefined,
    }));
    appendToJSONArrayFile(filePath, data);
  }

  /**
   * Recursively fetches and downloads all available media from the channel
   * @param {Object} client The Telegram client instance
   * @param {Number} channelId The channel ID
   * @param {Number} offsetMsgId The message offset
   * @param {Number} retryCount The current retry count
   */
  async downloadChannel(client, channelId, offsetMsgId = 0, retryCount = 0) {
    try {
      this.outputFolder = path.join(
        "Q:/SITES/pierre2_Chaines/export",
        channelId.toString()
      );

      // Create channel directory if it doesn't exist
      if (!fs.existsSync(this.outputFolder)) {
        fs.mkdirSync(this.outputFolder, { recursive: true });
      }

      const messages = await getMessages(
        client,
        channelId,
        MESSAGE_LIMIT,
        offsetMsgId
      );
      if (!messages.length) {
        // Print final statistics
        logger.info("Download completed!");
        logger.info(`Total files processed: ${this.stats.totalFiles}`);
        logger.info(`Files downloaded: ${this.stats.downloadedFiles}`);
        logger.info(`Files updated: ${this.stats.updatedFiles}`);
        logger.info(`Files skipped (up to date): ${this.stats.skippedFiles}`);
        return;
      }
      const ids = messages.map((m) => m.id);
      const details = await getMessageDetail(client, channelId, ids);
      const downloadQueue = [];

      for (const msg of details) {
        if (this.canDownload(msg)) {
          logger.info(`Downloading ${msg.id}`);
          downloadQueue.push(
            downloadMessageMedia(
              client,
              msg,
              getMediaPath(msg, this.outputFolder)
            )
          );
        } else {
          // logger.info(`No media to download for ${msg.id}`);
        }
        if (downloadQueue.length >= MAX_PARALLEL_DOWNLOAD) {
          logger.info(`Processing ${MAX_PARALLEL_DOWNLOAD} downloads`);
          await Promise.all(downloadQueue);
          downloadQueue.length = 0;
          await wait(3);
        }
      }

      await Promise.all(downloadQueue);
      this.recordMessages(details);
      updateLastSelection({
        messageOffsetId: messages[messages.length - 1].id,
      });

      await wait(1);
      
      // Reset retry count on successful operation
      await this.downloadChannel(
        client,
        channelId,
        messages[messages.length - 1].id,
        0 // Reset retry count
      );
    } catch (err) {
      logger.error("An error occurred during download:");
      console.error(err);
      
      // Handle timeout errors with exponential backoff
      if (err.message === "TIMEOUT" || err.message.includes("NETWORK") || err.message.includes("CONNECTION")) {
        const maxRetries = 5;
        if (retryCount < maxRetries) {
          const backoffTime = Math.min(3000 * Math.pow(2, retryCount), 30000); // Exponential backoff capped at 30 seconds
          logger.info(`Connection error, retrying in ${backoffTime/1000} seconds (attempt ${retryCount + 1}/${maxRetries})...`);
          await wait(backoffTime / 1000);
          
          // Attempt to reconnect the client if needed
          if (!client.connected) {
            logger.info("Client disconnected. Attempting to reconnect...");
            try {
              await client.connect();
              logger.info("Reconnected successfully");
            } catch (reconnectErr) {
              logger.error("Failed to reconnect:", reconnectErr.message);
            }
          }
          
          // Retry the download with the same offset
          await this.downloadChannel(client, channelId, offsetMsgId, retryCount + 1);
        } else {
          logger.error(`Maximum retry attempts (${maxRetries}) reached. Please try again later.`);
        }
      }
    }
  }

  async configureDownload(options, client) {
    let channelId = options.channelId;
    let downloadableFiles = options.downloadableFiles;
    if (!channelId) {
      logger.info("Please select a channel to download media from");
      const allChannels = await getAllDialogs(client);
      const options = allChannels.map((d) => ({
        name: d.name,
        value: d.id,
      }));

      const selectedChannel = await selectInput(
        "Please select a channel",
        options
      );
      channelId = selectedChannel;
    }
    if (!downloadableFiles) downloadableFiles = await downloadOptionInput();

    this.downloadableFiles = downloadableFiles;

    const lastSelection = getLastSelection();
    let messageOffsetId = lastSelection.messageOffsetId || 0;

    if (Number(lastSelection.channelId) !== Number(channelId)) {
      messageOffsetId = 0;
    }
    updateLastSelection({ messageOffsetId, channelId });
    return { channelId, messageOffsetId };
  }

  /**
   * Main entry point: initializes auth, sets up output folder, and starts download
   */
  async handle(options = {}) {
    await wait(1);
    try {
      this.client = options.client || await initAuth();
      
      // Test connection before starting downloads
      try {
        if (!this.client.connected) {
          logger.info("Connecting to Telegram servers...");
          await this.client.connect();
        }
        logger.info("Connection to Telegram established");
      } catch (connErr) {
        logger.error("Failed to establish connection:", connErr.message);
        throw connErr;
      }
      
      const { channelId, messageOffsetId } = await this.configureDownload(
        options,
        this.client
      );

      const dialogName = await getDialogName(this.client, channelId);
      logger.info(`Downloading media from channel ${dialogName}`);
      await this.downloadChannel(this.client, channelId, messageOffsetId);
    } catch (err) {
      logger.error("An error occurred in main process:");
      console.error(err);
      
      // Add specific handling for timeout errors
      if (err.message === "TIMEOUT" || err.message.includes("CONNECTION")) {
        logger.info("Connection issue detected. Try running the program again with higher timeout values in config.js");
      }
    } finally {
      if (this.client && !options.client) {
        try {
          logger.info("Disconnecting client...");
          await this.client.disconnect();
          logger.info("Client disconnected successfully");
        } catch (disconnectErr) {
          logger.error("Error disconnecting client:", disconnectErr.message);
        }
        process.exit(0);
      }
    }
  }
}

module.exports = DownloadChannel;
