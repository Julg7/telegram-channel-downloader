const fs = require("fs");
const path = require("path");
const { logMessage } = require("./helper");

const CONFIG_FILE = path.join(__dirname, "../config.json");
const LAST_SELECTION_FILE = path.join("Q:/SITES/pierre2_Chaines/export", "last_selection.json");

/**
 * Reads the content of a file synchronously.
 *
 * @param {string} filePath - The path to the file to be read.
 * @returns {string} The content of the file.
 * @throws Will throw an error if the file cannot be read.
 */
const readFileSync = (filePath, showError = true) => {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (err) {
    showError ? logMessage.error(`Error reading file: ${filePath}`, err) : null;
    throw err;
  }
};

/**
 * Writes data to a file synchronously.
 *
 * @param {string} filePath - The path to the file where data should be written.
 * @param {Object} data - The data to be written to the file.
 * @throws Will throw an error if writing to the file fails.
 */
const writeFileSync = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    logMessage.success(`File written successfully: ${filePath}`);
  } catch (err) {
    logMessage.error(`Error writing file: ${filePath}`, err);
    throw err;
  }
};

/**
 * Updates the credentials in the configuration file with the provided object.
 *
 * @param {Object} obj - The object containing the new credentials to be updated.
 * @throws Will log an error message if reading or writing to the configuration file fails.
 */
const updateCredentials = (obj) => {
  try {
    const data = readFileSync(CONFIG_FILE);
    const credentials = { ...JSON.parse(data), ...obj };
    writeFileSync(CONFIG_FILE, credentials);
  } catch (err) {
    logMessage.error("Failed to update credentials", err);
  }
};

/**
 * Reads and parses the credentials from the configuration file.
 *
 * @returns {Object} The parsed credentials from the config file.
 * @throws Will log an error message and exit the process if the config file cannot be read or parsed.
 */
const getCredentials = () => {
  try {
    const data = readFileSync(CONFIG_FILE);
    return JSON.parse(data);
  } catch (err) {
    logMessage.error(
      "Please add your credentials in config.json file, follow https://github.com/abhishekjnvk/telegram-channel-downloader#setup for more info"
    );
    process.exit(1);
  }
};

/**
 * Retrieves the last selection from a file.
 *
 * @returns {Object} The last selection data parsed from the file. Returns an empty object if an error occurs.
 */
const getLastSelection = () => {
  try {
    if (fs.existsSync(LAST_SELECTION_FILE)) {
      return JSON.parse(fs.readFileSync(LAST_SELECTION_FILE));
    }
  } catch (err) {
    console.error("Error reading last selection:", err);
  }
  return {};
};

/**
 * Updates the last selection with the provided object.
 *
 * This function merges the provided object with the last selection
 * and writes the result to the LAST_SELECTION_FILE. If an error occurs
 * during the process, it logs an error message.
 *
 * @param {Object} object - The object to merge with the last selection.
 */
const updateLastSelection = (object) => {
  try {
    let currentData = {};
    if (fs.existsSync(LAST_SELECTION_FILE)) {
      currentData = JSON.parse(fs.readFileSync(LAST_SELECTION_FILE));
    }
    const newData = { ...currentData, ...object };
    
    // Ensure directory exists
    const dir = path.dirname(LAST_SELECTION_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(LAST_SELECTION_FILE, JSON.stringify(newData, null, 2));
  } catch (err) {
    console.error("Error updating last selection:", err);
  }
};

module.exports = {
  updateCredentials,
  getCredentials,
  getLastSelection,
  updateLastSelection,
};
