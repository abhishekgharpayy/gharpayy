import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = "AQ.Ab8RN6IjVl4Q7qHomZtQ0LapjwQ6YAOkTfZGbH4mmwQeOpxCdA";
const genAI = new GoogleGenerativeAI(apiKey);

async function run() {
  console.log("Attempting to connect to Gemini API...");
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent("Hello, this is a test. Reply with 'Gemini is active'.");
    console.log("Success! Gemini response:", result.response.text());
  } catch (err) {
    console.error("Gemini connection failed:", err);
  }
}
run();
