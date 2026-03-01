const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

// 🔁 Retry function
async function sendWithRetry(url, payload, headers, retries = MAX_RETRIES) {
  try {
    console.log(`🚀 Attempt ${MAX_RETRIES - retries + 1} to send message...`);

    const response = await axios.post(url, payload, { headers });

    return response;

  } catch (error) {
    const status = error.response?.status;

    console.error("⚠️ API Error Status:", status || "No response");

    // Retry only if:
    // - No response (network issue)
    // - 5xx error (server issue)
    if (retries > 0 && (!status || status >= 500)) {
      console.log(`🔁 Retrying in ${RETRY_DELAY / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return sendWithRetry(url, payload, headers, retries - 1);
    }

    // If no retries left or 4xx error → throw
    throw error;
  }
}

app.post("/send-message", async (req, res) => {
  console.log("📩 New request received at /send-message");
  console.log("🕒 Time:", new Date().toISOString());
  console.log("📦 Request Body:", req.body);

  try {
    const { id, name, phone, message } = req.body;

    if (!id || !name || !phone || !message) {
      console.log("❌ Missing required fields");
      return res.status(400).json({ error: "Missing required fields" });
    }

    // 🔹 Clean message
    const cleanedMessage = message
      .replace(/\n\s*\n+/g, "\n")
      .trim();

    console.log("🧹 Cleaned Message:");
    console.log(cleanedMessage);

    const payload = {
      id,
      name,
      phone,
      message: cleanedMessage
    };

    console.log("📤 Final Payload:", payload);

    // 🔹 Call external API with retry
    const response = await sendWithRetry(
      "https://messagesapi.co.in/chat/sendMessage",
      payload,
      { "Content-Type": "application/json" }
    );

    console.log("✅ External API Success:");
    console.log(response.data);

    res.json({
      success: true,
      data: response.data
    });

  } catch (error) {
    console.error("🔥 Final Failure After Retries:");
    console.error(error.response?.data || error.message);

    res.status(500).json({
      success: false,
      error: "Failed after multiple retry attempts",
      details: error.response?.data || error.message
    });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
