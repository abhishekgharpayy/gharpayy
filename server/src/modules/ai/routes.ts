import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../middleware/auth.js";
import { z } from "zod";
import { env } from "../../config/env.js";

const CoachRequestSchema = z.object({
  tours: z.array(z.any()),
  leads: z.array(z.any()),
  role: z.string(),
  userName: z.string().optional(),
});

export function registerAiRoutes(app: FastifyInstance) {
  app.post(
    "/api/ai/coach",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { tours, leads, role, userName } = CoachRequestSchema.parse(request.body);

      // Groq uses the GROQ_API_KEY environment variable.
      // Make sure the API key is set.
      const apiKey = process.env.GROQ_API_KEY;

      if (!apiKey) {
        // Fallback gracefully if API key isn't provided
        return reply.status(200).send({
          advice: tours.length > 0
            ? "API Key missing. Prepare for your upcoming tours today. Be prompt and address objections carefully."
            : "API Key missing. No upcoming tours today. Use this time to follow up on pending leads.",
          tours: tours.map(t => ({
            tourId: t.id,
            briefing: "API Key missing. Read the lead details carefully before the tour."
          }))
        });
      }

      // Build the prompt context
      const today = new Date().toISOString().split("T")[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
      
      let relevantTours = tours.filter(t => t.scheduledAt && t.scheduledAt.startsWith(today));
      let dayContext = "today";

      if (relevantTours.length === 0) {
        relevantTours = tours.filter(t => t.scheduledAt && t.scheduledAt.startsWith(tomorrow));
        dayContext = "tomorrow";
      }

      const relevantLeads = leads.filter(l => relevantTours.some(t => t.leadId === l.id));

      if (relevantTours.length === 0) {
        return reply.status(200).send({
          advice: `Good morning${userName ? `, ${userName}` : ''}! You have no tours scheduled for today or tomorrow. Spend some time reviewing your follow-ups and reaching out to cold leads.`,
          tours: []
        });
      }

      const promptContext = relevantTours.map((t, index) => {
        const lead = relevantLeads.find(l => l.id === t.leadId);
        return `
Tour ${index + 1}:
Time: ${t.scheduledAt ? new Date(t.scheduledAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'Unknown'}
Property: ${t.propertyName || t.propertyId}
Lead Name: ${lead?.name || "Unknown"}
Lead Budget: ${lead?.budget || "Unknown"}
Lead Intent: ${lead?.intent || "Unknown"}
Lead Preferences/Notes: ${lead?.notes || "None"}
        `.trim();
      }).join("\n\n");

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
      "tourId": "the exact id of the tour from the prompt (e.g. 01KVS...)",
      "briefing": "A concise 1-2 sentence actionable tip for this specific tour, tailored to the lead's budget and notes. IMPORTANT: DO NOT use the raw tour ID in this text. Refer to it as 'For [Lead Name]'s tour' or 'With [Lead Name]'."
    }
  ]
}`;

      const userPrompt = `Here are the tours for ${dayContext}:\n${promptContext}\n\nPlease provide the coaching briefing in JSON. Tour IDs are: ${relevantTours.map(t => t.id).join(", ")}`;

      try {
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

        if (!response.ok) {
          const text = await response.text();
          request.log.error({ status: response.status, text }, "Groq API error");
          return reply.status(500).send({ error: "Failed to generate AI advice" });
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        const parsed = JSON.parse(content);

        return reply.send(parsed);
      } catch (err) {
        request.log.error(err, "Error calling AI API");
        return reply.status(500).send({ error: "Internal server error during AI coaching" });
      }
    }
  );
}
