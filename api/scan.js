// api/scan.js – Vercel serverless function

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    const body = req.body || {};
    const imageBase64 = body.imageBase64;

    if (!imageBase64) {
      res.status(400).json({ success: false, error: 'No image provided' });
      return;
    }

    // Turn base64 into a data URL for the vision model
    const imageDataUrl = `data:image/jpeg;base64,${imageBase64}`;

    // Call OpenAI Vision to read the label
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini', // or another vision-capable model
        messages: [
          {
            role: 'system',
            content:
              'You read shipping labels and return a STRICT JSON object with: recipient_name, recipient_email, carrier, tracking_number. If something is missing, use null.'
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract the shipping info from this label.' },
              { type: 'image_url', image_url: { url: imageDataUrl } }
            ]
          }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'package',
            schema: {
              type: 'object',
              properties: {
                recipient_name: { type: 'string', nullable: true },
                recipient_email: { type: 'string', nullable: true },
                carrier: { type: 'string', nullable: true },
                tracking_number: { type: 'string', nullable: true }
              },
              required: ['recipient_name', 'carrier'],
              additionalProperties: false
            }
          }
        }
      })
    });

    const openaiJson = await openaiResponse.json();

    if (!openaiResponse.ok) {
      console.error('OpenAI error:', openaiJson);
      res
        .status(500)
        .json({ success: false, error: 'OpenAI API error', details: openaiJson });
      return;
    }

    // Model returns JSON as a string in message.content
    
    const parsed = JSON.parse(openaiJson.choices[0].message.content);

// Try to look up email from Supabase directory if we have a name
let emailFromDirectory = null;

if (
  parsed.recipient_name &&
  SUPABASE_URL &&
  SUPABASE_SERVICE_KEY
) {
  try {
    const queryName = encodeURIComponent(parsed.recipient_name);

    const directoryResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/directory?name=eq.${queryName}&select=email&limit=1`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const rows = await directoryResponse.json();

    if (directoryResponse.ok && Array.isArray(rows) && rows.length > 0) {
      emailFromDirectory = rows[0].email || null;
    } else {
      console.log('No directory match for name:', parsed.recipient_name, rows);
    }
  } catch (dirErr) {
    console.error('Error looking up directory email:', dirErr);
  }
}

const pkg = {
  recipient_name: parsed.recipient_name || null,

  // Prefer: email on label → directory email → null
  recipient_email:
    parsed.recipient_email || emailFromDirectory || null,

  carrier: parsed.carrier || null,
  tracking_number: parsed.tracking_number || null,
  time_received: new Date().toISOString(),
  status: 'Waiting for pickup'
};

    res.status(200).json({
      success: true,
      email_sent: false, // later we can actually send emails
      package: pkg
    });
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
