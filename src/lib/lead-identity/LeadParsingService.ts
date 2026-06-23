import { parseLead as regexParseLead } from "./parser";
import { api } from "@/lib/api/client";
import { toast } from "sonner";
import {
  normalizePhone,
  normalizeDate,
  normalizeBudget,
  normalizeType,
  normalizeRoom,
  normalizeNeed,
  normalizeInBLR,
} from "./normalization";

export interface ParsingAccuracyMetrics {
  fieldsFound: number;
  fieldsMissing: number;
  source: Record<string, "gemini" | "regex" | "heuristic">;
}

export interface AIParsedLead {
  confidence: number;
  fields: {
    name: string | null;
    phone: string | null;
    email: string | null;
    budget: string | null;
    moveIn: string | null;
    area: string | null;
    need: string | null;
    type: string | null;
    room: string | null;
    specialReqs: string | null;
    internalNotes: string | null;
    inBLR: boolean | null;
  };
  missing: string[];
  status: "Success" | "Partial" | "Failed";
  parsedByAI: boolean;
  rawSource: string;
  metrics: ParsingAccuracyMetrics;
}

export class LeadParsingService {
  /**
   * Helper to resolve aliases from a loosely structured object
   */
  private static resolveAlias(obj: any, aliases: string[]): string | null {
    if (!obj || typeof obj !== "object") return null;
    for (const path of aliases) {
      const parts = path.split(".");
      let val = obj;
      for (const part of parts) {
        if (val && typeof val === "object" && part in val) {
          val = val[part];
        } else {
          val = undefined;
          break;
        }
      }
      if (typeof val === "string" && val.trim() !== "") return val.trim();
      if (typeof val === "number") return String(val);
    }
    return null;
  }

  static async parseLead(rawText: string): Promise<AIParsedLead> {
    const rawTrimmed = rawText.trim();
    if (!rawTrimmed || rawTrimmed.length < 4) {
      return this.emptyResult(rawTrimmed);
    }

    // Run BOTH in parallel immediately
    const aiPromise = api.leads.parseLead(rawTrimmed).catch((err) => {
      console.error("[Parser] AI failed:", err);
      toast.error("AI Parser unavailable. Falling back to robust extraction rules.");
      return null; // don't throw — return null so merge handles it
    });

    const regexParsed = regexParseLead(rawTrimmed); // sync, instant

    // Wait for AI (it has its own timeout on server side now — 15s max)
    // But also set a client-side 18s cap so we never block longer than that
    const aiData = await Promise.race([
      aiPromise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000))
    ]);

    if (aiData) {
      console.log("[Parser] Raw Gemini response:", aiData);
    }
    
    // 3. Merging logic
    const fields: AIParsedLead["fields"] = {
      name: null, phone: null, email: null, budget: null, moveIn: null,
      area: null, need: null, type: null, room: null, specialReqs: null, internalNotes: null, inBLR: null,
    };
    const metrics: ParsingAccuracyMetrics = {
      fieldsFound: 0,
      fieldsMissing: 0,
      source: {}
    };

    const attemptField = (
      key: keyof typeof fields,
      aliases: string[],
      regexVal: string | null | undefined,
      normalizeFn?: (val: string | null | undefined) => string | null | boolean
    ) => {
      // 1. Try Gemini
      let rawVal = aiData?.fields ? this.resolveAlias(aiData.fields, aliases) : this.resolveAlias(aiData, aliases);
      let val = normalizeFn ? String(normalizeFn(rawVal) || "") || null : rawVal;
      
      if (val && val.toLowerCase() !== "null") {
        fields[key] = val as any;
        metrics.source[key] = "gemini";
        return;
      }
      
      // 2. Try Regex
      val = normalizeFn ? String(normalizeFn(regexVal) || "") || null : regexVal || null;
      if (val && val.toLowerCase() !== "null") {
        fields[key] = val as any;
        metrics.source[key] = "regex";
        return;
      }
    };

    const tryBoolField = (
      aliases: string[],
      regexVal: boolean | null | undefined,
    ) => {
      let rawVal = aiData?.fields ? this.resolveAlias(aiData.fields, aliases) : this.resolveAlias(aiData, aliases);
      let val = normalizeInBLR(rawVal);
      if (val !== null) return val;
      if (regexVal !== null && regexVal !== undefined) return regexVal;
      return null;
    };

    attemptField("name", ["name", "fullName", "leadName", "contact.name"], regexParsed?.name);
    attemptField("phone", ["phone", "phoneNumber", "mobile", "contact.phone", "contactNumber"], regexParsed?.phone, normalizePhone);
    attemptField("email", ["email", "emailAddress", "contact.email"], regexParsed?.email);
    attemptField("budget", ["budget", "price", "budgetRange", "amount"], regexParsed?.budget, normalizeBudget);
    attemptField("moveIn", ["moveIn", "moveInDate", "movingDate", "date"], regexParsed?.moveIn, normalizeDate);
    attemptField("area", ["area", "location", "preferredLocation", "areas"], regexParsed?.location || (regexParsed?.areas?.length ? regexParsed.areas.join(", ") : null));
    attemptField("need", ["need", "cohort", "gender", "lookingFor"], regexParsed?.need, normalizeNeed);
    attemptField("type", ["type", "profession", "occupation", "role"], regexParsed?.type, normalizeType);
    attemptField("room", ["room", "roomType", "sharing"], regexParsed?.room, normalizeRoom);
    const cleanSpecialReqs = (() => {
      const v = regexParsed?.specialReqs?.trim();
      if (!v || v.length > 100) return null;
      if (/hi\s*team|new\s*lead|gharpayy|currently\s*in|not\s*in\s*(bangalore|blr)/i.test(v)) return null;
      return v;
    })();

    const cleanInternalNotes = (() => {
      const v = regexParsed?.extraContent?.trim();
      if (!v || v.length > 150) return null;
      if (/hi\s*team|new\s*lead|gharpayy/i.test(v)) return null;
      return v;
    })();

    attemptField("specialReqs", ["specialReqs", "specialRequests", "requirements"], cleanSpecialReqs);
    attemptField("internalNotes", ["internalNotes", "summary"], cleanInternalNotes);

    const inBLR = tryBoolField(["inBangalore", "inBLR", "currentlyInBangalore"], regexParsed?.inBLR);
    if (inBLR !== null) {
      fields.inBLR = inBLR;
      metrics.source["inBLR"] = metrics.source["internalNotes"] || "regex"; // Roughly track source
    }

    const missing: string[] = [];
    let found = 0;
    (Object.keys(fields) as Array<keyof typeof fields>).forEach((key) => {
      if (!fields[key]) {
        missing.push(key);
      } else {
        found++;
      }
    });

    metrics.fieldsFound = found;
    metrics.fieldsMissing = missing.length;
    
    const status = missing.length === 0 ? "Success" : found > 1 ? "Partial" : "Failed";

    console.log("[Parser] Normalized Hybrid Fields:", fields);
    console.log("[Parser] Final Metrics:", metrics);

    return {
      confidence: 100, // Confidence is deprecated/ignored by UI but kept for TS compatibility
      fields,
      missing,
      status,
      parsedByAI: !!aiData,
      rawSource: rawTrimmed,
      metrics
    };
  }

  private static emptyResult(rawSource: string): AIParsedLead {
    return {
      confidence: 0,
      fields: {
        name: null, phone: null, email: null, budget: null, moveIn: null,
        area: null, need: null, type: null, room: null, specialReqs: null, internalNotes: null, inBLR: null
      },
      missing: ["name", "phone", "email", "budget", "moveIn", "area", "need", "type", "room", "specialReqs", "internalNotes"],
      status: "Failed",
      parsedByAI: false,
      rawSource,
      metrics: {
        fieldsFound: 0,
        fieldsMissing: 11,
        source: {}
      }
    };
  }
}
