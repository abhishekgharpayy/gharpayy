import { z } from "zod";
import * as dotenv from "dotenv";

dotenv.config({ path: "./.env" });

const apiKey = process.env.GROQ_API_KEY;

async function test() {
  const dayContext = "tomorrow";
  const promptContext = `
Tour 1:
Time: 9:00 AM
Property: FORUM PRO BOYS
Lead Name: Ananya Sharma
Lead Budget: 14000
Lead Intent: warm
Lead Preferences/Notes: None
  `;
  const userName = "Gorav";
  const systemPrompt = `You are an expert Tour Community Manager (TCM) Coach for a real estate / co-living platform called Gharpayy. 
Your goal is to give a professional, concise, and highly actionable daily briefing to a TCM${userName ? ` named ${userName}` : ''} who is about to conduct tours.
Focus on the practical aspects: what to highlight based on budget, how to address their specific intent/objections, and how to close the loop.
DO NOT use excessive emojis. Keep it extremely professional, clean, and simple. Avoid Gamification terms like XP, Streaks, or Leaderboards.
Make sure to greet the TCM by name in the advice overview.

Format your response exactly as a JSON object with this schema:
{
  "advice": "A brief 2-3 sentence overview of the strategy for ${dayContext}, greeting the TCM by name.",
  "tours": [
    {
      "tourId": "the id of the tour from the prompt",
      "briefing": "A concise 1-2 sentence actionable tip for this specific tour, tailored to the lead's budget and notes."
    }
  ]
}`;

  const userPrompt = `Here are the tours for ${dayContext}:\n${promptContext}\n\nPlease provide the coaching briefing in JSON. Tour IDs are: tour-123`;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.5,
    })
  });

  const text = await response.text();
  console.log("STATUS:", response.status);
  console.log("BODY:", text);
}

test().catch(console.error);
