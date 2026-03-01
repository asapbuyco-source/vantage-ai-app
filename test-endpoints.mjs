import fetch from 'node-fetch';

async function testEndpoint(name, path) {
    const token = 'jFxFL5OlyrkkV9Aa1WcgwNV5kPpMuCCGfvNgmgLx5FGJ21joEHsHG47809Bn';
    const separator = path.includes('?') ? '&' : '?';
    const url = `https://api.sportmonks.com/v3/football${path}${separator}api_token=${token}`;

    console.log(`\nTesting ${name}:`);
    const res = await fetch(url);
    if (!res.ok) {
        console.log(`Failed! Status: ${res.status}`);
        const text = await res.text();
        console.log(`Body: ${text}`);
    } else {
        const json = await res.json();
        console.log(`Success! Status: ${res.status}`);
        console.log(`Message/Data: `, json.message || "Data present");
    }
}

async function run() {
    await testEndpoint('Statistics', '/teams/520?include=statistics&filters=coreLeagues:636');
    await testEndpoint('Odds', '/odds/pre-match/fixtures/19636416');
    await testEndpoint('Sidelined', '/sidelined/teams/520?include=player;type');
    await testEndpoint('H2H', '/head-to-head/9999/520?include=participants;scores');
}

run();
