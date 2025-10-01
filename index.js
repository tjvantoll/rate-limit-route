import express from "express";
import fetch from "node-fetch";

const app = express();
const WEBHOOK_URL = "https://api.thingspeak.com/update.json";

let lastRequestTime = 0;
const requestQueue = [];
const THROTTLE_MS = 15000; // 15 seconds

// Processes the queue and sends requests respecting the rate limit
async function processQueue() {
  if (requestQueue.length === 0) return;

  const now = Date.now();
  if (now - lastRequestTime < THROTTLE_MS) {
    // Not enough time has passed, schedule next check
    const waitTime = THROTTLE_MS - (now - lastRequestTime);
    setTimeout(processQueue, waitTime);
    return;
  }

  // Process the next request in queue
  const nextRequest = requestQueue.shift();
  try {
    lastRequestTime = Date.now();
    console.log(`Sending request at ${new Date().toISOString()}`);

    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextRequest.data),
    });

    nextRequest.resolve({
      status: response.status,
      ok: response.ok,
      timestamp: new Date(),
    });
  } catch (error) {
    nextRequest.reject(error);
  }

  // Check if there are more items to process
  if (requestQueue.length > 0) {
    setTimeout(processQueue, THROTTLE_MS);
  }
}

// Middleware to queue requests to the external endpoint
const throttledWebhook = async (req, res, next) => {
  const requestData = req.body;

  // Add this request to the queue (fire and forget)
  requestQueue.push({
    data: requestData,
    resolve: () => {}, // No-op since we don't wait for completion
    reject: (error) => console.error("Error sending webhook:", error),
  });

  // Start processing if this is the only item in the queue
  if (requestQueue.length === 1) {
    processQueue();
  }

  // Respond immediately without waiting for the webhook to complete
  next();
};

// Example route using the throttled webhook middleware
app.post("/", express.json(), throttledWebhook, (_req, res) => {
  res.status(200).json({
    message: "Request queued successfully",
  });
});

const port = process.env.PORT || 8080;
app.listen(port);
console.log(`Server running on port ${port}`);
