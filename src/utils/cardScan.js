// Parses OCR text from a payment card to find the card number and expiry.
// Uses the Luhn checksum to avoid false positives from random digits.

const luhnValid = (digits) => {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
};

/**
 * @returns {{ number: string, expiry: string | null } | null}
 */
export const parseCardText = (text) => {
  const cleaned = (text || '').replace(/\n/g, ' ');

  // Candidate digit runs: 12+ digits possibly split by spaces or dashes.
  const candidates = cleaned.match(/\d[\d\s-]{11,27}\d/g) || [];

  let luhnMatch = null;
  let fallbackMatch = null;
  for (const candidate of candidates) {
    const digits = candidate.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) continue;
    if (luhnValid(digits)) {
      if (!luhnMatch || digits.length > luhnMatch.length) luhnMatch = digits;
    } else if (digits.length === 16 && !fallbackMatch) {
      fallbackMatch = digits;
    }
  }

  const number = luhnMatch || fallbackMatch;
  if (!number) return null;

  const expMatch = cleaned.match(/\b(0[1-9]|1[0-2])\s*\/\s*(\d{2})\b/);
  return {
    number,
    expiry: expMatch ? `${expMatch[1]}/${expMatch[2]}` : null,
  };
};
