import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

const token = process.env.VITE_SPORTMONKS_API_TOKEN || process.env.SPORTMONKS_API_TOKEN;
const url = `https://api.sportmonks.com/v3/football/livescores/latest?include=events;events.type;events.player;events.related_player&api_token=${token}`;

fetch(url).then(r => r.json()).then(data => {
    if (!data.data || data.data.length === 0) {
        console.log("No live matches right now.");
        return;
    }
    const events = data.data[0].events;
    console.log("Events array size:", events ? events.length : 0);
    if (events && events.length > 0) {
        console.log("Sample event:", JSON.stringify(events[0], null, 2));
    }
});
