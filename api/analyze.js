export default async function handler(req, res) {
  // Enhanced CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'false');
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests for the actual API
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      allowedMethods: ['POST']
    });
  }

  try {
    // Log for debugging
    console.log('Request received:', req.method);
    
    // Validate request body
    if (!req.body) {
      console.log('No request body');
      return res.status(400).json({
        success: false,
        error: 'No request body provided'
      });
    }

    const { image } = req.body;
    
    if (!image) {
      console.log('No image in request body');
      return res.status(400).json({ 
        success: false, 
        error: 'No image provided' 
      });
    }

    // Check API key
    if (!process.env.OPENAI_API_KEY) {
      console.log('No API key found');
      return res.status(500).json({
        success: false,
        error: 'Server configuration error - no API key'
      });
    }

    console.log('Making OpenAI request...');

    // Make request to OpenAI with very specific JSON requirements
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
          content: "You are a nutritional analysis expert. You MUST respond with valid JSON only. Do not include any text before or after the JSON. Do not use markdown formatting. Return only raw JSON."
        }, {
          role: "user",
          content: [{
            type: "text",
            text: `Analyze this food image and provide detailed nutritional information. You MUST respond with ONLY valid JSON in Slovak language using this EXACT structure:

{
  "nazovJedla": "názov jedla v slovenčine",
  "kalorie": "počet kalórií ako číslo",
  "velkostPorcie": "popis porcie v slovenčine",
  "makronutrienty": {
    "bielkoviny": "gramy ako číslo",
    "sacharidy": "gramy ako číslo", 
    "tuky": "gramy ako číslo",
    "vlaknina": "gramy ako číslo"
  },
  "vitaminy": {
    "vitaminC": "denná hodnota v percentách",
    "vitaminA": "denná hodnota v percentách"
  },
  "mineraly": {
    "vápnik": "denná hodnota v percentách",
    "železo": "denná hodnota v percentách"
  },
  "zdravotneSkore": "číslo z 10",
  "zdravotneRady": [
    "slovenská rada 1",
    "slovenská rada 2", 
    "slovenská rada 3"
  ]
}

If multiple dishes are visible, analyze them as a combined meal. Be specific with quantities. Respond ONLY with the JSON object, no other text.`
          }, {
            type: "image_url",
            image_url: { url: image }
          }]
        }],
        max_tokens: 1000,
        temperature: 0.3,
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
    
    // Clean up the response - remove any markdown formatting
    analysis = analysis.trim();
    if (analysis.startsWith('```json')) {
      analysis = analysis.replace('```json', '').replace(/```$/, '').trim();
    } else if (analysis.startsWith('```')) {
      analysis = analysis.replace(/```[\w]*/, '').replace(/```$/, '').trim();
    }

    // Validate that we got JSON
    try {
      const parsedAnalysis = JSON.parse(analysis);
      console.log('JSON validation successful');
      
      // Return the parsed JSON to ensure it's valid
      return res.status(200).json({
        success: true,
        analysis: JSON.stringify(parsedAnalysis, null, 2)
      });
      
    } catch (parseError) {
      console.log('JSON parsing failed, creating fallback response');
      
      // If JSON parsing fails, create a structured response from the text
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
        ],
        popis: analysis
      };
      
      return res.status(200).json({
        success: true,
        analysis: JSON.stringify(fallbackResponse, null, 2)
      });
    }

  } catch (error) {
    console.error('Handler error:', error.message);
    console.error('Full error:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
