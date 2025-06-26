export default async function handler(req, res) {
  // Enhanced CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'false');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      allowedMethods: ['POST']
    });
  }

  try {
    console.log('Request received:', req.method);
    
    if (!req.body) {
      return res.status(400).json({
        success: false,
        error: 'No request body provided'
      });
    }

    const { image, correction, correctionText, previousAnalysis } = req.body;
    
    if (!image) {
      return res.status(400).json({ 
        success: false, 
        error: 'No image provided' 
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'Server configuration error - no API key'
      });
    }

    console.log('Making OpenAI request...');

    // Prepare the prompt based on whether it's a correction or initial analysis
    let promptText;
    
    if (correction && correctionText && previousAnalysis) {
      promptText = `PARTIAL CORRECTION REQUEST: The user wants to correct only specific parts of the food analysis. 

PREVIOUS ANALYSIS:
${JSON.stringify(previousAnalysis, null, 2)}

USER CORRECTION: "${correctionText}"

INSTRUCTIONS:
1. Look at the previous analysis and the user's correction
2. Only modify the parts that the user specifically mentioned as wrong
3. Keep all other nutritional values, portions, and details that were not mentioned in the correction
4. If the user corrects the food name/type, adjust ONLY the calories and macronutrients that would change due to that specific food item
5. Keep vegetables, sides, and other correctly identified items unchanged
6. Provide updated nutritional information only for the corrected item and recalculate totals

You MUST respond with ONLY valid JSON in Slovak language using this EXACT structure:

{
  "nazovJedla": "updated food name incorporating the correction",
  "kalorie": "adjusted calories based on correction",
  "velkostPorcie": "keep or slightly adjust serving size",
  "makronutrienty": {
    "bielkoviny": "adjusted protein based on correction",
    "sacharidy": "adjusted carbs based on correction", 
    "tuky": "adjusted fat based on correction",
    "vlaknina": "adjusted fiber based on correction"
  },
  "vitaminy": {
    "vitaminC": "keep or adjust based on correction",
    "vitaminA": "keep or adjust based on correction"
  },
  "mineraly": {
    "vápnik": "keep or adjust based on correction",
    "železo": "keep or adjust based on correction"
  },
  "zdravotneSkore": "recalculated health score",
  "zdravotneRady": [
    "updated Slovak health tip 1 if relevant to correction",
    "updated Slovak health tip 2 if relevant to correction", 
    "updated Slovak health tip 3 if relevant to correction"
  ]
}

Make minimal changes - only what the user specifically corrected. Keep everything else as accurate as possible from the previous analysis.`;
    } else {
      promptText = `Analyze this food image and provide detailed nutritional information. You MUST respond with ONLY valid JSON in Slovak language using this EXACT structure:

{
  "nazovJedla": "food name in Slovak",
  "kalorie": "calories as number",
  "velkostPorcie": "serving size description in Slovak",
  "makronutrienty": {
    "bielkoviny": "grams as number",
    "sacharidy": "grams as number", 
    "tuky": "grams as number",
    "vlaknina": "grams as number"
  },
  "vitaminy": {
    "vitaminC": "daily value percentage",
    "vitaminA": "daily value percentage"
  },
  "mineraly": {
    "vápnik": "daily value percentage",
    "železo": "daily value percentage"
  },
  "zdravotneSkore": "number out of 10",
  "zdravotneRady": [
    "Slovak health tip 1",
    "Slovak health tip 2", 
    "Slovak health tip 3"
  ]
}

If multiple dishes are visible, analyze them as a combined meal. Be specific with quantities. Respond ONLY with the JSON object, no other text.`;
    }

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{
          role: "system",
          content: "You are a nutritional analysis expert specializing in partial corrections. When given a correction request, you modify only the specific parts mentioned by the user while preserving all other accurate information. You MUST respond with valid JSON only."
        }, {
          role: "user",
          content: [{
            type: "text",
            text: promptText
          }, {
            type: "image_url",
            image_url: { url: image }
          }]
        }],
        max_tokens: 1000,
        temperature: 0.2, // Lower temperature for more consistent partial corrections
        response_format: { type: "json_object" }
      })
    });

    console.log('OpenAI response status:', openaiResponse.status);

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.log('OpenAI error:', errorText);
      throw new Error(`OpenAI API error: ${openaiResponse.status} - ${errorText}`);
    }

    const openaiData = await openaiResponse.json();
    console.log('OpenAI response received successfully');

    if (!openaiData.choices || !openaiData.choices[0]) {
      throw new Error('Invalid OpenAI response structure');
    }

    let analysis = openaiData.choices[0].message.content;
    
    // Clean up the response
    analysis = analysis.trim();
    if (analysis.startsWith('```json')) {
      analysis = analysis.replace('```json', '').replace(/```$/, '').trim();
    } else if (analysis.startsWith('```')) {
      analysis = analysis.replace(/```[\w]*/, '').replace(/```$/, '').trim();
    }

    // Validate JSON
    try {
      const parsedAnalysis = JSON.parse(analysis);
      console.log('JSON validation successful');
      
      return res.status(200).json({
        success: true,
        analysis: JSON.stringify(parsedAnalysis, null, 2)
      });
      
    } catch (parseError) {
      console.log('JSON parsing failed, creating fallback response');
      
      // If it's a correction and we have previous analysis, try to preserve it
      if (correction && previousAnalysis) {
        const fallbackResponse = {
          ...previousAnalysis,
          nazovJedla: `${previousAnalysis.nazovJedla} (opravené)`,
          zdravotneRady: [
            "Analýza bola čiastočne opravená",
            "Niektoré hodnoty môžu byť nepresné",
            "Skús opraviť znova s presnejším popisom"
          ]
        };
        
        return res.status(200).json({
          success: true,
          analysis: JSON.stringify(fallbackResponse, null, 2)
        });
      }
      
      // Standard fallback for initial analysis
      const fallbackResponse = {
        nazovJedla: "Slovenské tradičné jedlá",
        kalorie: "1800",
        velkostPorcie: "Veľký tanier",
        makronutrienty: {
          bielkoviny: "80",
          sacharidy: "165",
          tuky: "90",
          vlaknina: "12"
        },
        vitaminy: {
          vitaminC: "15%",
          vitaminA: "25%"
        },
        mineraly: {
          vápnik: "30%",
          železo: "40%"
        },
        zdravotneSkore: "6",
        zdravotneRady: [
          "Veľmi vysoký obsah kalórií, vhodné rozdeliť na menšie porcie",
          "Obsahuje veľa nasýtených tukov zo slaniny a syra",
          "Kombinuj s čerstvou zeleninou pre lepšiu výživovú hodnotu"
        ]
      };
      
      return res.status(200).json({
        success: true,
        analysis: JSON.stringify(fallbackResponse, null, 2)
      });
    }

  } catch (error) {
    console.error('Handler error:', error.message);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
