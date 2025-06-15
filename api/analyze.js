export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image } = req.body;
    
    if (!image) {
      return res.status(400).json({ success: false, error: 'No image provided' });
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
          role: "user",
          content: [{
            type: "text",
            text: "Analyzuj túto fotografiu jedla a poskytni nutričné informácie v slovenčine. Odpoveď musí byť v JSON formáte s týmito poľami: nazovJedla, kalorie, velkostPorcie, makronutrienty (objekt s bielkoviny, sacharidy, tuky v gramoch), zdravotneSkore (číslo z 10), zdravotneRady (pole slovenských rád). Všetko v slovenčine."
          }, {
            type: "image_url",
            image_url: { url: image }
          }]
        }],
        max_tokens: 800
      })
    });

    const openaiData = await openaiResponse.json();
    
    if (!openaiResponse.ok) {
      throw new Error(`OpenAI error: ${openaiData.error?.message || 'Unknown error'}`);
    }

    const analysis = openaiData.choices[0].message.content;

    res.status(200).json({
      success: true,
      analysis: analysis
    });

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
