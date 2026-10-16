// Loan maths for the debts "Update" sheet.

/**
 * Work out what is left on a loan from its EMI and the number of EMIs left.
 * With an annual interest rate, outstanding principal is the present value
 * of the remaining EMIs (standard reducing-balance loan). Without a rate,
 * every rupee of EMI is treated as principal.
 */
export function loanStatus({ principal, emi, remainingEmis, interestRate }) {
  const n = Math.max(0, Math.round(remainingEmis || 0));
  const r = (interestRate || 0) / 12 / 100;
  const totalPayable = emi * n;
  const outstanding = r > 0 ? (emi * (1 - Math.pow(1 + r, -n))) / r : totalPayable;
  const roundedOutstanding = Math.round(outstanding);
  const paidOff = Math.max(0, (principal || 0) - roundedOutstanding);
  return {
    outstanding: roundedOutstanding,
    totalPayable: Math.round(totalPayable),
    interestLeft: Math.max(0, Math.round(totalPayable - outstanding)),
    paidOff,
    paidPct: principal > 0 ? Math.min((paidOff / principal) * 100, 100) : 0,
    endsOn: endMonthLabel(n),
  };
}

// Last EMI month, assuming one EMI a month starting next month.
export function endMonthLabel(remainingEmis, from = new Date()) {
  if (!remainingEmis || remainingEmis <= 0) return null;
  const end = new Date(from.getFullYear(), from.getMonth() + Math.round(remainingEmis), 1);
  return end.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}
