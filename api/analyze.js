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
    console.log('Headers:', req.headers);
    
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

    // Make request to OpenAI with English prompt requesting Slovak output
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{
          role: "user",
          content: [{
            type: "text",
            text: "Analyze this food image and provide detailed nutritional information. Please respond in Slovak language using JSON format with these exact field names: nazovJedla (food name), kalorie (calories), velkostPorcie (serving size), makronutrienty (object containing bielkoviny, sacharidy, tuky in grams), vitaminy (vitamins with daily value percentages), mineraly (minerals with daily value percentages), zdravotneSkore (health score out of 10), and zdravotneRady (array of 3-4 practical health tips). All text content must be translated to Slovak language. If multiple dishes are visible, analyze them as a combined meal. Be specific with quantities and provide accurate nutritional estimates."
          }, {
            type: "image_url",
            image_url: { url: image }
          }]
        }],
        max_tokens: 1000,
        temperature: 0.7
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

    const analysis = openaiData.choices[0].message.content;

    return res.status(200).json({
      success: true,
      analysis: analysis
    });

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
