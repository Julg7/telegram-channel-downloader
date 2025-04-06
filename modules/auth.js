const { TelegramClient } = require("telegram");
const { updateCredentials, getCredentials } = require("../utils/file-helper");
const { StringSession } = require("telegram/sessions");
const { logMessage } = require("../utils/helper");
const config = require("../config");

const {
  textInput,
  mobileNumberInput,
  otpInput,
  selectInput,
} = require("../utils/input-helper");

const OTP_METHOD = {
  SMS: "sms",
  APP: "app",
};

let { apiHash, apiId, sessionId } = getCredentials();
const stringSession = new StringSession(sessionId || "");

/**
 * Initializes the authentication process for the Telegram client.
 * @param {string} [otpPreference=OTP_METHOD.APP] - The preferred method for receiving the OTP (either 'app' or 'sms').
 * @returns {Promise<TelegramClient>} - The authenticated Telegram client.
 */
const initAuth = async (otpPreference = OTP_METHOD.APP) => {
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: config.connectionRetries,
    timeout: config.connectionTimeout,
    retryDelay: config.retryDelay,
    maxAttempts: config.maxAttempts,
    useWSS: true, // Use WebSocket Secure
    requestRetries: 5,
    pingInterval: config.pingInterval,
    pingTimeout: config.pingTimeout,
    reconnectDelay: config.reconnectDelay,
    autoReconnect: true,
    floodSleepThreshold: 60
  });

  try {
    if (!sessionId) {
      otpPreference = await selectInput("Where do you want the login OTP:", [
        OTP_METHOD.APP,
        OTP_METHOD.SMS,
      ]);
    }

    const forceSMS = otpPreference === OTP_METHOD.SMS;

    await client.start({
      phoneNumber: async () => await mobileNumberInput(),
      password: async () => await textInput("Enter your password"),
      phoneCode: async (isCodeViaApp) => {
        logMessage.info(`OTP sent over ${isCodeViaApp ? "APP" : "SMS"}`);
        return await otpInput();
      },
      forceSMS,
      onError: (err) => {
        logMessage.error(`Connection error: ${err.message}`);
        
        // Enhanced error handling for timeouts
        if (err.message === "TIMEOUT") {
          logMessage.info("Connection timed out, retrying with backoff...");
          return new Promise((resolve) => {
            const backoffDelay = Math.min(config.retryDelay * 2, 30000); // Max 30 seconds
            setTimeout(resolve, backoffDelay);
          });
        }
        
        // Handle other connection errors
        if (err.message.includes("CONNECTION") || err.message.includes("NETWORK")) {
          logMessage.info("Network issue detected, retrying connection...");
          return new Promise((resolve) => {
            setTimeout(resolve, config.reconnectDelay);
          });
        }
        
        throw err;
      },
    });

    logMessage.success("You should now be connected.");

    if (!sessionId) {
      sessionId = client.session.save();
      updateCredentials({ sessionId });
      logMessage.info(
        "To avoid logging in again and again, the session ID has been saved to config.json. Please don't share it with anyone."
      );
    }
  
    return client;
  } catch (err) {
    logMessage.error(`Authentication error: ${err.message}`);
    throw err;
  }
};

module.exports = {
  initAuth,
};
