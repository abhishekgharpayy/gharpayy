import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LeadParsingService } from '../LeadParsingService';
import { api } from '@/lib/api/client';

// Mock the API client and sonner toast
vi.mock('@/lib/api/client', () => ({
  api: {
    leads: {
      parseLead: vi.fn(),
    },
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

describe('LeadParsingService - Hybrid Parsing Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should parse a standard WhatsApp message', async () => {
    const rawMsg = `
      Name: Rahul Sharma
      Phone: 9876543210
      Email: rahul@example.com
      Budget: 8k-12k
      Move-in: 30/06/2026
      Location: HSR Layout
    `;

    // Gemini returns standard exact fields
    (api.leads.parseLead as any).mockResolvedValue({
      status: "Success",
      fields: {
        name: "Rahul Sharma",
        phone: "9876543210",
        email: "rahul@example.com",
        budget: "8-12k",
        moveIn: "2026-06-30",
        area: "HSR Layout",
      },
      missing: ["need", "type", "room", "specialReqs", "internalNotes"]
    });

    const result = await LeadParsingService.parseLead(rawMsg);
    
    expect(result.fields.name).toBe("Rahul Sharma");
    expect(result.fields.phone).toBe("9876543210");
    expect(result.fields.email).toBe("rahul@example.com");
    expect(result.fields.budget).toBe("8-12k");
    expect(result.fields.moveIn).toBe("2026-06-30");
    expect(result.fields.area).toBe("HSR Layout");
    
    expect(result.metrics.fieldsFound).toBe(7); // name, phone, email, budget, moveIn, area, internalNotes (Currently in Bangalore inferred from HSR Layout)
    expect(result.metrics.source.name).toBe("gemini");
  });

  it('should handle alias mapping when Gemini hallucinates keys', async () => {
    const rawMsg = "Deepak 8888888888 15k";

    // Gemini returns weird aliases
    (api.leads.parseLead as any).mockResolvedValue({
      contact: {
        name: "Deepak",
        phone: "+91 8888888888",
        email: null
      },
      budgetRange: "15,000"
    });

    const result = await LeadParsingService.parseLead(rawMsg);

    // Alias resolution should extract contact.name and budgetRange
    expect(result.fields.name).toBe("Deepak");
    expect(result.fields.phone).toBe("8888888888"); // Normalized
    expect(result.fields.budget).toBe("15k"); // Normalized

    expect(result.metrics.source.name).toBe("gemini");
    expect(result.metrics.source.budget).toBe("gemini");
  });

  it('should perform hybrid extraction when Gemini misses a field', async () => {
    const rawMsg = `
      Name: Amit Kumar
      Phone: 9999999999
      Budget: 10k
      Looking for a quiet place
    `;

    // Gemini misses the budget and phone completely
    (api.leads.parseLead as any).mockResolvedValue({
      fields: {
        name: "Amit Kumar",
        inBangalore: true
      }
    });

    const result = await LeadParsingService.parseLead(rawMsg);

    expect(result.fields.name).toBe("Amit Kumar"); // from Gemini
    expect(result.fields.phone).toBe("9999999999"); // from Regex Fallback
    expect(result.fields.budget).toBe("10k"); // from Regex Fallback
    expect(result.fields.specialReqs).toBe("Looking for a quiet place");

    expect(result.metrics.source.name).toBe("gemini");
    expect(result.metrics.source.phone).toBe("regex");
    expect(result.metrics.source.budget).toBe("regex");
  });

  it('should correctly normalize values', async () => {
    const rawMsg = `Test`;

    // Gemini returns unnormalized values
    (api.leads.parseLead as any).mockResolvedValue({
      fields: {
        budget: "8k to 12k",
        moveInDate: "June 30 2026",
        phone: "+91 98765-43210",
        type: "Working Professional",
        room: "Private Room",
        cohort: "Boys"
      }
    });

    const result = await LeadParsingService.parseLead(rawMsg);

    expect(result.fields.budget).toBe("8-12k");
    expect(result.fields.moveIn).toBe("2026-06-30");
    expect(result.fields.phone).toBe("9876543210");
    expect(result.fields.type).toBe("Working");
    expect(result.fields.room).toBe("Private");
    expect(result.fields.need).toBe("Boys");
  });

  it('should fallback entirely to Regex if Gemini throws an error', async () => {
    const rawMsg = `
      Name: Rahul Regex
      Phone: 7777777777
      Budget: 9k
    `;

    (api.leads.parseLead as any).mockRejectedValue(new Error("Network Error"));

    const result = await LeadParsingService.parseLead(rawMsg);

    expect(result.parsedByAI).toBe(false);
    expect(result.fields.name).toBe("Rahul Regex");
    expect(result.fields.phone).toBe("7777777777");
    expect(result.fields.budget).toBe("9k");

    expect(result.metrics.source.name).toBe("regex");
    expect(result.metrics.source.phone).toBe("regex");
  });
});
