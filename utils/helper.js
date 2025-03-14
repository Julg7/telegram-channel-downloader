const mimeDB = require("mime-db");
const fs = require("fs");
const path = require("path");

// Define media types
const MEDIA_TYPES = {
  IMAGE: "image",
  VIDEO: "video",
  AUDIO: "audio",
  WEBPAGE: "webpage",
  POLL: "poll",
  GEO: "geo",
  VENUE: "venue",
  CONTACT: "contact",
  STICKER: "sticker",
  DOCUMENT: "document",
  OTHERS: "others",
};

// Define console colors for logging
const consoleColors = {
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  reset: "\x1b[0m",
};

// Get the media type of a message
const getMediaType = (message) => {
  if (!message.media) return MEDIA_TYPES.OTHERS;

  const { media } = message;
  if (media.photo) return MEDIA_TYPES.IMAGE;
  if (media.video) return MEDIA_TYPES.VIDEO;
  if (media.audio) return MEDIA_TYPES.AUDIO;
  if (media.webpage) return MEDIA_TYPES.WEBPAGE;
  if (media.poll) return MEDIA_TYPES.POLL;
  if (media.geo) return MEDIA_TYPES.GEO;
  if (media.contact) return MEDIA_TYPES.CONTACT;
  if (media.venue) return MEDIA_TYPES.VENUE;
  if (media.sticker) return MEDIA_TYPES.STICKER;
  if (media.document) {
    const { mimeType } = media.document;
    if (mimeType) {
      if (mimeType.includes(MEDIA_TYPES.IMAGE)) return MEDIA_TYPES.IMAGE;
      if (mimeType.includes(MEDIA_TYPES.VIDEO)) return MEDIA_TYPES.VIDEO;
      if (mimeType.includes(MEDIA_TYPES.AUDIO)) return MEDIA_TYPES.AUDIO;
      if (mimeType.includes(MEDIA_TYPES.STICKER)) return MEDIA_TYPES.STICKER;
    }
    return MEDIA_TYPES.DOCUMENT;
  }

  return MEDIA_TYPES.OTHERS;
};

// Check if a file already exists
const checkFileExist = (message, outputFolder) => {
  if (!message || !message.media) return false;
  const filePath = getMediaPath(message, outputFolder);
  return fs.existsSync(filePath);
};

// Get the path to save the media file
const getMediaPath = (message, outputFolder) => {
  const mediaType = getMediaType(message);
  let fileName = '';
  let extension = '';
  let subfolder = '';

  // Determine subfolder based on media type
  switch (mediaType) {
    case 'video':
      subfolder = 'video';
      break;
    case 'image':
      subfolder = 'image';
      break;
    case 'webpage':
      subfolder = 'webpage';
      break;
    default:
      subfolder = mediaType; // Use the media type as subfolder name
  }

  if (message.media?.document?.attributes) {
    // Try to get original filename first
    const fileAttr = message.media.document.attributes.find(attr => attr.fileName);
    if (fileAttr) {
      const parsedPath = path.parse(fileAttr.fileName);
      fileName = parsedPath.name;
      // Only use the extension from the filename if it matches the media type
      if (parsedPath.ext.toLowerCase() === '.mp4' && mediaType === 'video') {
        extension = parsedPath.ext.toLowerCase();
      } else if (parsedPath.ext.toLowerCase() === '.mp3' && mediaType === 'audio') {
        extension = parsedPath.ext.toLowerCase();
      } else if (['.jpg', '.jpeg', '.png', '.gif'].includes(parsedPath.ext.toLowerCase()) && mediaType === 'image') {
        extension = parsedPath.ext.toLowerCase();
      }
    }
  }

  // If no filename found, use message ID
  if (!fileName) {
    fileName = message.id.toString();
  }

  // If no extension found or it doesn't match media type, determine it from media type
  if (!extension) {
    switch (mediaType) {
      case 'video':
        extension = '.mp4';
        break;
      case 'image':
        extension = '.jpg';
        break;
      case 'document':
        extension = '.doc';
        break;
      case 'audio':
        extension = '.mp3';
        break;
      case 'webpage':
        extension = '.html';
        break;
      default:
        extension = '';
    }
  }

  // Ensure the extension starts with a dot
  if (extension && !extension.startsWith('.')) {
    extension = '.' + extension;
  }

  // Create the full path with subfolder
  const fullPath = path.join(outputFolder, subfolder, `${fileName}${extension}`);
  
  // Ensure the subfolder exists
  const subfolderPath = path.join(outputFolder, subfolder);
  if (!fs.existsSync(subfolderPath)) {
    fs.mkdirSync(subfolderPath, { recursive: true });
  }

  return fullPath;
};

// Get the type of dialog
const getDialogType = (dialog) => {
  if (dialog.isChannel) return "Channel";
  if (dialog.isGroup) return "Group";
  if (dialog.isUser) return "User";
  return "Unknown";
};

// Logging utility
const logMessage = {
  info: (message, icon=true) => {
    console.log(`📢: ${consoleColors.magenta}${message}${consoleColors.reset}`);
  },
  error: (message) => {
    console.log(`❌ ${consoleColors.red}${message}${consoleColors.reset}`);
  },
  success: (message) => {
    console.log(`✅ ${consoleColors.cyan}${message}${consoleColors.reset}`);
  },
  debug: (message) => {
    console.log(`⚠️ ${message}`);
  },
};

// Wait for a specified number of seconds
const wait = (seconds) => {
  return new Promise((resolve) => {
    setTimeout(resolve, seconds * 1000);
  });
};

// Filter a string to remove non-alphanumeric characters
const filterString = (string) => {
  return string.replace(/[^a-zA-Z0-9]/g, "");
};

// Stringify an object with circular references
const circularStringify = (obj, indent = 2) => {
  const cache = new Set();
  const retVal = JSON.stringify(
    obj,
    (key, value) =>
      typeof value === "object" && value !== null
        ? cache.has(value)
          ? undefined
          : cache.add(value) && value
        : value,
    indent
  );
  cache.clear();
  return retVal;
};

// Append data to a JSON array file
const appendToJSONArrayFile = (filePath, dataToAppend) => {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, circularStringify(dataToAppend, null, 2));
    } else {
      const data = fs.readFileSync(filePath);
      const json = JSON.parse(data);
      json.push(dataToAppend);
      fs.writeFileSync(filePath, circularStringify(json, null, 2));
    }
  } catch (e) {
    logMessage.error(`Error appending to JSON Array file ${filePath}`);
    console.error(e);
  }
};

const downloadMessageMedia = async (client, message, outputPath) => {
  try {
    // Ensure the directory exists before downloading
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    await client.downloadMedia(message, {
      outputFile: outputPath,
    });
    return true;
  } catch (err) {
    logger.error(`Failed to download media for message ${message.id}`);
    console.error(err);
    return false;
  }
};

module.exports = {
  getMediaType,
  checkFileExist,
  getMediaPath,
  getDialogType,
  logMessage,
  wait,
  filterString,
  appendToJSONArrayFile,
  circularStringify,
  MEDIA_TYPES,
  downloadMessageMedia,
};
