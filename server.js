const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

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

    // 🔹 Remove extra blank lines from message
    const cleanedMessage = message
      .replace(/\n\s*\n+/g, "\n")
      .trim();

    console.log("🧹 Cleaned Message:");
    console.log(cleanedMessage);

    // 🔹 Prepare payload
    const payload = {
      id: id,
      name: name,
      phone: phone,
      message: cleanedMessage
    };

    console.log("🚀 Sending request to external API...");
    console.log("📤 Payload:", payload);

    // 🔹 Call external API
    const response = await axios.post(
      "https://messagesapi.co.in/chat/sendMessage",
      payload,
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    console.log("✅ External API Response:");
    console.log(response.data);

    res.json({
      success: true,
      data: response.data
    });

  } catch (error) {
    console.error("🔥 Error while sending message:");
    console.error(error.response?.data || error.message);

    res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
