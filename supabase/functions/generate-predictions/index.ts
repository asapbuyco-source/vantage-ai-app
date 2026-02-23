
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { GoogleGenAI } from 'https://esm.sh/@google/genai@0.1.1'

// Declare Deno to avoid TypeScript errors in non-Deno environments
declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// --- FOOTBALL DATA FETCHING LOGIC (Server Side) ---
const fetchFixtures = async (dateStr: string) => {
  // You must set FOOTBALL_DATA_KEY in your Supabase Edge Function Secrets.
  const FD_KEY = Deno.env.get('FOOTBALL_DATA_KEY'); 
  
  try {
    if (FD_KEY) {
      // Priority 1: Football-Data.org
      const res = await fetch(`https://api.football-data.org/v4/matches?dateFrom=${dateStr}&dateTo=${dateStr}`, {
        headers: { "X-Auth-Token": FD_KEY }
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.matches && data.matches.length > 0) {
          return data.matches.map((m: any) => ({
            id: `fd-${m.id}`,
            league: m.competition?.name || "International",
            homeTeam: m.homeTeam.name,
            awayTeam: m.awayTeam.name,
            time: new Date(m.utcDate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
            homeLogo: m.homeTeam.crest,
            awayLogo: m.awayTeam.crest
          })).slice(0, 30); // Limit to 30 matches
        }
      }
    }
  } catch (e) {
    console.error("Football Data Fetch Error:", e);
  }

  // Fallback Data if API fails or Key is missing
  return [
    { id: 'fb-1', league: "Premier League", homeTeam: "Man City", awayTeam: "Liverpool", time: "20:00", homeLogo: "https://media.api-sports.io/football/teams/50.png", awayLogo: "https://media.api-sports.io/football/teams/40.png" },
    { id: 'fb-2', league: "La Liga", homeTeam: "Real Madrid", awayTeam: "Barcelona", time: "21:00", homeLogo: "https://media.api-sports.io/football/teams/541.png", awayLogo: "https://media.api-sports.io/football/teams/529.png" },
    { id: 'fb-3', league: "Serie A", homeTeam: "Inter Milan", awayTeam: "Juventus", time: "19:45", homeLogo: "https://media.api-sports.io/football/teams/505.png", awayLogo: "https://media.api-sports.io/football/teams/496.png" },
    { id: 'fb-4', league: "Bundesliga", homeTeam: "Bayern", awayTeam: "Dortmund", time: "18:30", homeLogo: "https://media.api-sports.io/football/teams/157.png", awayLogo: "https://media.api-sports.io/football/teams/165.png" },
    { id: 'fb-5', league: "Ligue 1", homeTeam: "PSG", awayTeam: "Marseille", time: "21:00", homeLogo: "https://media.api-sports.io/football/teams/85.png", awayLogo: "https://media.api-sports.io/football/teams/81.png" }
  ];
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Get Date Key
    const now = new Date();
    const utcHour = now.getUTCHours();
    const cameroonHour = (utcHour + 1) % 24;
    const targetDate = new Date(now);
    if (cameroonHour < 8) {
       targetDate.setUTCDate(targetDate.getUTCDate() - 1);
    }
    const year = targetDate.getUTCFullYear();
    const month = String(targetDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getUTCDate()).padStart(2, '0');
    const todayKey = `${year}-${month}-${day}`;

    // 2. Check Database First
    const { data: existingData } = await supabaseClient
      .from('daily_predictions')
      .select('matches')
      .eq('date', todayKey)
      .maybeSingle();

    if (existingData && existingData.matches && existingData.matches.length > 0) {
      return new Response(JSON.stringify({ matches: existingData.matches, source: 'cache' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Fetch Fixtures
    const fixtures = await fetchFixtures(todayKey);

    // 4. Call Gemini
    const apiKey = Deno.env.get('API_KEY');
    if (!apiKey) throw new Error("API_KEY not set in Edge Function Secrets");

    const ai = new GoogleGenAI({ apiKey });
    
    const prompt = `
      You are a professional sports betting analyst.
      Analyze these matches: ${JSON.stringify(fixtures)}
      
      Return a JSON Array with this schema:
      [
        {
          "id": "string (match input id)",
          "prediction_en": "string (e.g. 'Home Win')",
          "prediction_fr": "string (e.g. 'Victoire Domicile')",
          "confidence": number (40-99),
          "odds": number,
          "category": "safe" | "value" | "risky",
          "analysis_en": "string (max 15 words)",
          "analysis_fr": "string (max 15 words)"
        }
      ]
    `;

    // CHANGED: Use gemini-2.0-flash-exp to avoid 403 errors with legacy/preview models
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from Gemini");
    
    const aiPredictions = JSON.parse(text);

    // 5. Merge Data
    const mergedMatches = fixtures.map((fixture: any) => {
      const pred = aiPredictions.find((p: any) => String(p.id) === String(fixture.id));
      if (!pred) return null;
      return {
        ...fixture,
        id: String(fixture.id),
        prediction: pred.prediction_en,
        prediction_en: pred.prediction_en,
        prediction_fr: pred.prediction_fr,
        confidence: Number(pred.confidence),
        odds: Number(pred.odds),
        category: pred.category,
        analysis: pred.analysis_en,
        analysis_en: pred.analysis_en,
        analysis_fr: pred.analysis_fr,
        homeTeamLogo: fixture.homeLogo,
        awayTeamLogo: fixture.awayLogo
      };
    }).filter(Boolean);

    // 6. Save to Supabase (Server Side Write)
    const { error: insertError } = await supabaseClient
      .from('daily_predictions')
      .upsert({ 
        date: todayKey, 
        matches: mergedMatches,
        generated_at: new Date().toISOString()
      }, { onConflict: 'date' });

    if (insertError) console.error("DB Insert Error:", insertError);

    return new Response(JSON.stringify({ matches: mergedMatches, source: 'generated' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error("Edge Function Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
})