import fetch from 'node-fetch';

async function run() {
    const token = process.env.SPORTMONKS_API_TOKEN;
    if (!token) {
        console.error('SPORTMONKS_API_TOKEN environment variable is not set');
        process.exit(1);
    }
    
    // Just fetch first few pages of leagues and find them
    for (let i = 1; i <= 3; i++) {
        const url = `https://api.sportmonks.com/v3/football/leagues?page=${i}&api_token=${token}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.data) {
            data.data.forEach(l => {
                const name = l.name.toLowerCase();
                if (name.includes('la liga') || name.includes('serie a') || name.includes('ligue 1') || name.includes('mls') || name.includes('major league soccer') || name.includes('brasileir') || name.includes('primera')) {
                    console.log(l.id, l.name);
                }
            });
        }
    }
}
run();
