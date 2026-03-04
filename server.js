const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

// 🔁 Retry function
async function sendWithRetry(url, payload, headers, retries = MAX_RETRIES) {
  try {
    console.log(`🚀 Attempt ${MAX_RETRIES - retries + 1} to send message...`);
    const response = await axios.post(url, payload, { headers });
    return response;
  } catch (error) {
    const status = error.response?.status;
    console.error("⚠️ API Error Status:", status || "No response");

    if (retries > 0 && (!status || status >= 500 || status === 429)) {
      console.log(`🔁 Retrying in ${RETRY_DELAY / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return sendWithRetry(url, payload, headers, retries - 1);
    }

    throw error;
  }
}

// 📩 Route
app.post("/send-message", async (req, res) => {
  try {
    const { id, name, phone, message } = req.body;

    if (!id || !name || !phone || !message) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const cleanedMessage = message.replace(/\n\s*\n+/g, "\n").trim();

    const payload = { id, name, phone, message: cleanedMessage };

    const response = await sendWithRetry(
      "https://messagesapi.co.in/chat/sendMessage",
      payload,
      { "Content-Type": "application/json" }
    );

    res.json({ success: true, data: response.data });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed after multiple retry attempts",
      details: error.response?.data || error.message
    });
  }
});

// ✅ Use Render Port
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// ✅ Graceful shutdown (Fixes your previous error)
process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM received. Closing server...");
  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});
