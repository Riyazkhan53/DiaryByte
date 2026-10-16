// Ticket helpers. Ticket dates are local 'YYYY-MM-DD' keys, like autopays.
import { daysBetween, todayKey } from './autopay';

export const TICKETS_STORAGE_KEY = '@diarybyte_tickets';

// `travel` types show a From → To route; the rest show a venue.
export const TICKET_TYPES = [
  { key: 'flight', label: 'Flight', icon: 'airplane', gradient: ['#5C6BC0', '#3949AB'], travel: true },
  { key: 'train', label: 'Train', icon: 'train', gradient: ['#26A69A', '#00796B'], travel: true },
  { key: 'bus', label: 'Bus', icon: 'bus', gradient: ['#FFA726', '#EF6C00'], travel: true },
  { key: 'movie', label: 'Movie', icon: 'film', gradient: ['#EC407A', '#C2185B'], travel: false },
  { key: 'event', label: 'Event', icon: 'musical-notes', gradient: ['#AB47BC', '#7B1FA2'], travel: false },
  { key: 'other', label: 'Other', icon: 'ticket', gradient: ['#78909C', '#455A64'], travel: false },
];

export function ticketType(key) {
  return TICKET_TYPES.find((t) => t.key === key) || TICKET_TYPES[TICKET_TYPES.length - 1];
}

export function isUpcoming(ticket, today = todayKey()) {
  return ticket.date >= today;
}

export function daysUntil(ticket, today = todayKey()) {
  return daysBetween(today, ticket.date);
}

export function countdownLabel(ticket, today = todayKey()) {
  const days = daysUntil(ticket, today);
  if (days < 0) return 'Used';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

// Upcoming soonest first, then past most recent first.
export function sortTickets(tickets, today = todayKey()) {
  const upcoming = tickets
    .filter((t) => isUpcoming(t, today))
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  const past = tickets
    .filter((t) => !isUpcoming(t, today))
    .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
  return { upcoming, past };
}
