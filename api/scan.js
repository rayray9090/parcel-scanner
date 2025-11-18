// api/scan.js – Vercel serverless function using OpenAI + Supabase directory

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  if (!OPENAI_API_KEY) {
    res.status(500).json({
      success: false,
      error: 'Missing OPENAI_API_KEY environment variable on server.'
    });
    return;
  }

  try {
    const body = req.body || {};
    const imageBase64 = body.imageBase64;

    if (!imageBase64) {
      res.status(400).json({ success: false, error: 'No imageBase64 provided' });
      return;
    }

    // Turn base64 into a data URL for the vision model
    const imageDataUrl = `data:image/jpeg;base64,${imageBase64}`;

    // 1) Call OpenAI Vision to read the label
    const openaiResponse = await fetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `
You are a mailroom assistant that reads shipping labels and ONLY returns JSON.

Your JSON object MUST have:
- recipient_name
- recipient_email
- carrier
- tracking_number

Rules:
- If the email is printed on the label, extract it. If not printed, use null.
- For carrier, infer from any logos, branding, or tracking format:
  - "UPS", brown logo, 1Z... tracking → carrier = "UPS"
  - "USPS", eagle logo, "United States Postal Service" → carrier = "USPS"
  - "FedEx" logo, purple/orange → carrier = "FedEx"
  - Amazon logo / "AMZL" / Amazon-style tracking → carrier = "Amazon"
- If you truly cannot tell, use null for carrier.
- If something is unknown, set it to null.
Return ONLY valid JSON, no extra text.
`
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Extract the shipping info from this label and return JSON only.'
                },
                {
                  type: 'image_url',
                  image_url: { url: imageDataUrl }
                }
              ]
            }
          ],
          max_tokens: 300
        })
      }
    );

    const openaiJson = await openaiResponse.json();

    if (!openaiResponse.ok) {
      console.error('OpenAI error:', openaiJson);
      res.status(openaiResponse.status).json({
        success: false,
        error:
          openaiJson.error?.message ||
          'OpenAI API error (see raw field for details)',
        raw: openaiJson
      });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(openaiJson.choices[0].message.content);
    } catch (e) {
      console.error('Failed to parse JSON from model:', openaiJson);
      res.status(500).json({
        success: false,
        error: 'Failed to parse JSON from OpenAI response',
        raw: openaiJson
      });
      return;
    }

    // 2) Look up email from Supabase directory if we have a name
    let emailFromDirectory = null;

    if (
      parsed.recipient_name &&
      SUPABASE_URL &&
      SUPABASE_SERVICE_KEY
    ) {
      try {
        // adjust "directory" and "name" if your table/column names are different
        const queryName = encodeURIComponent(parsed.recipient_name);

        const directoryResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/directory?name=ilike.${queryName}&select=email&limit=1`,
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
      email_sent: false, // can wire real email later
      package: pkg
    });
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({
      success: false,
      error: 'Server error on /api/scan',
      details: String(err)
    });
  }
};
