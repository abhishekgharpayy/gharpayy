export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d]/g, "");
  // If it's a 10 digit number starting with 6-9, it's valid
  const match10 = cleaned.match(/[6-9]\d{9}$/);
  if (match10) return match10[0];
  return null;
}

export function normalizeDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const t = dateStr.trim().toLowerCase();

  const now = new Date();
  const currentYear = now.getFullYear();

  const pad2 = (n: number): string => String(n).padStart(2, "0");
  const localIso = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  
  const isBeforeToday = (d: Date): boolean => {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const candidate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return candidate < today;
  };
  
  const ymd = (year: number, month: number, day: number, rollForwardPastDate = false): string | null => {
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const check = new Date(year, month - 1, day);
    if (check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) return null;
    if (rollForwardPastDate && isBeforeToday(check)) {
      return ymd(year + 1, month, day, false);
    }
    return `${year}-${pad2(month)}-${pad2(day)}`;
  };
  
  if (/^(immediate|asap|now|today)$/i.test(t)) return localIso(now);
  if (/^tomorrow$/i.test(t)) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return localIso(d);
  }
  
  const months: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };
  
  // "7th May" or "7 May"
  let match = t.match(/^(\d{1,2})(?:st|nd|rd|th)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
  if (match) {
    const monthNum = months[match[2].slice(0, 3).toLowerCase()];
    if (monthNum) return ymd(currentYear, monthNum, parseInt(match[1], 10), true);
  }
  
  // "May 7"
  match = t.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})/i);
  if (match) {
    const monthNum = months[match[1].slice(0, 3).toLowerCase()];
    if (monthNum) return ymd(currentYear, monthNum, parseInt(match[2], 10), true);
  }

  // "YYYY-MM-DD" or "YYYY/MM/DD"
  match = t.match(/^(\d{4})[\/\-.]+(\d{1,2})[\/\-.]+(\d{1,2})$/);
  if (match) {
    return ymd(parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10));
  }
  
  // "DD/MM/YYYY" or "DD-MM-YYYY"
  match = t.match(/^(\d{1,2})[\/\-.]+(\d{1,2})[\/\-.]+(\d{4})$/);
  if (match) {
    return ymd(parseInt(match[3], 10), parseInt(match[2], 10), parseInt(match[1], 10));
  }

  // "DD/MM" or "DD-MM"
  match = t.match(/^(\d{1,2})[\/\-.]+(\d{1,2})$/);
  if (match) {
    return ymd(currentYear, parseInt(match[2], 10), parseInt(match[1], 10), true);
  }
  
  let matchedMonth = 0;
  for (const [mName, mNum] of Object.entries(months)) {
    if (new RegExp("\\b" + mName).test(t)) {
      matchedMonth = mNum;
      break;
    }
  }

  if (matchedMonth > 0) {
    if (/end|last/i.test(t)) return ymd(currentYear, matchedMonth, 28, true);
    if (/mid|2nd/i.test(t)) return ymd(currentYear, matchedMonth, 15, true);
    if (/3rd/i.test(t)) return ymd(currentYear, matchedMonth, 22, true);
    if (/1st|start|beginning/i.test(t)) return ymd(currentYear, matchedMonth, 5, true);
    if (!/\d/.test(t)) return ymd(currentYear, matchedMonth, 1, true);
  }

  return null;
}

export function normalizeBudget(budgetStr: string | null | undefined): string | null {
  if (!budgetStr) return null;
  const t = budgetStr.toLowerCase().replace(/to/g, "-").replace(/[^\d.kK\-–]/g, "");
  
  // Extract all standalone numbers
  const nums = (t.replace(/k/g, "000").match(/\d+(?:\.\d+)?/g) || []).map(Number);
  if (nums.length === 0) return null;

  // Convert pure numbers to "k" format
  const toK = (n: number) => {
    if (n >= 1000) return (n / 1000);
    return n;
  };

  if (nums.length === 1) {
    return toK(nums[0]) + "k";
  } else if (nums.length >= 2) {
    const sorted = [nums[0], nums[1]].sort((a, b) => a - b);
    return `${toK(sorted[0])}-${toK(sorted[1])}k`;
  }

  return null;
}

export function normalizeType(typeStr: string | null | undefined): string | null {
  if (!typeStr) return null;
  const t = typeStr.toLowerCase();
  if (/\b(?:working|professional|employee|job)\b/i.test(t)) return "Working";
  if (/\b(?:student|college)\b/i.test(t)) return "Student";
  if (/\b(?:intern)\b/i.test(t)) return "Intern";
  return null;
}

export function normalizeRoom(roomStr: string | null | undefined): string | null {
  if (!roomStr) return null;
  const t = roomStr.toLowerCase();
  const hasPrivate = /\b(private|single|1\s*sharing|1bhk|studio)\b/.test(t);
  const hasShared = /\b(shared|sharing|double|2\s*sharing|triple|3\s*sharing|twin)\b/.test(t);
  
  if (hasPrivate && hasShared) return "Both";
  if (hasPrivate) return "Private";
  if (hasShared) return "Shared";
  return null;
}

export function normalizeNeed(needStr: string | null | undefined): string | null {
  if (!needStr) return null;
  const t = needStr.toLowerCase();
  const wantGirls = /\b(girl|girls|female)\b/.test(t);
  const wantBoys = /\b(boy|boys|male)\b/.test(t);
  const wantCoed = /\b(coed|unisex)\b/.test(t);

  const needs = [wantGirls && "Girls", wantBoys && "Boys", wantCoed && "Coed"].filter(Boolean);
  if (needs.length > 0) return needs.join(" / ");
  return null;
}

export function normalizeInBLR(text: string | null | undefined): boolean | null {
  if (!text) return null;
  const t = text.toLowerCase();
  const inBLRTrue = /\bin\s*blr\b|in bangalore|currently in bangalore|already here|yes.*blr/i.test(t);
  const inBLRFalse = /not in blr|not in bangalore|outside bangalore|relocating|out.*blr/i.test(t);
  
  if (inBLRTrue) return true;
  if (inBLRFalse) return false;
  return null;
}
