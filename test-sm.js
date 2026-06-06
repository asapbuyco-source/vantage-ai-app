import { getPredictionsForDate } from './services/db.js';

async function testFetch() {
    const { getTodaysFixturesServerSide } = await import('./backend/geminiService.js');
    console.log("Fetching Sportmonks...");
    const smFixtures = await getTodaysFixturesServerSide('2026-02-28');
    console.log(`Sportmonks returned ${smFixtures ? smFixtures.length : 0} fixtures.`);

    // fetch directly and see
    const token = process.env.SPORTMONKS_API_TOKEN;
    console.log("Token: ", token);

    // Get predictions
    const existingMatches = await getPredictionsForDate('2026-02-28');
    if (existingMatches) {
        console.log("First Match in DB: ", existingMatches[0]);
        const matchFound = smFixtures.find(f =>
            f.fixture.id.toString() === existingMatches[0].id ||
            (f.teams.home.name === existingMatches[0].homeTeam && f.teams.away.name === existingMatches[0].awayTeam)
        );
        console.log("Match Found in Sportmonks? ", !!matchFound);
    }
}
testFetch();
