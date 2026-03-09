const nowMs = Date.now();
const oneHourAgo = new Date(nowMs - 60 * 60 * 1000).toISOString();
const twoHoursAhead = new Date(nowMs + 2 * 60 * 60 * 1000).toISOString();
const noDateMatch = undefined;

console.log("Current Time:", new Date().toISOString());
const mockMatches = [
    { name: "PAST MATCH", fixture: { date: oneHourAgo, status: { short: 'FT' } }, teams: { home: { name: 'A' }, away: { name: 'B' } } },
    { name: "FUTURE MATCH", fixture: { date: twoHoursAhead, status: { short: 'NS' } }, teams: { home: { name: 'C' }, away: { name: 'D' } } },
    { name: "NO DATE MATCH", fixture: { date: noDateMatch, status: { short: 'NS' } }, teams: { home: { name: 'E' }, away: { name: 'F' } } },
];

console.log("Total mock matches:", mockMatches.length);

const upcoming = mockMatches.filter(f => {
    if (!f.fixture.date) return true;
    return new Date(f.fixture.date).getTime() > nowMs;
});

const past = mockMatches.length - upcoming.length;
console.log(`Upcoming/Valid matches filtered: ${upcoming.length}`);
console.log(`Past matches discarded: ${past}`);

console.log("\nMatches that passed the filter:");
upcoming.forEach(m => console.log(`- ${m.name} (${m.fixture.date || 'No Date'})`));
