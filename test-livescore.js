const https = require('https');

const options = {
    hostname: 'free-livescore-api.p.rapidapi.com',
    port: 443,
    path: '/livescore-get-search?sportname=soccer&search=all%20matches',
    method: 'GET',
    headers: {
        'x-rapidapi-host': 'free-livescore-api.p.rapidapi.com',
        'x-rapidapi-key': '9a760334c6msh67e4033f2f737c0p18e3f1jsnab6aa5197889'
    }
};

const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log(JSON.stringify(json, null, 2).substring(0, 1500));
        } catch (e) {
            console.log("Raw response:", data.substring(0, 1500));
        }
        process.exit(0);
    });
});

req.on('error', (e) => {
    console.error("Error:", e);
    process.exit(1);
});

req.setTimeout(10000, () => {
    console.error("Timeout");
    req.abort();
    process.exit(1);
});

req.end();
