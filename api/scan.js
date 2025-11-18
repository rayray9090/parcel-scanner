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

    const imageDataUrl = `data:image/jpeg;base64,${imageBase64}`;

    // ============= 1) Call OpenAI with strict JSON schema =============
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
              content:
                'You read shipping labels and return ONLY JSON that matches the given schema.'
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Extract the shipping info from this label.'
                },
                {
                  type: 'image_url',
                  image_url: { url: imageDataUrl }
                }
              ]
            }
          ],
          max_tokens: 300,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'package',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  recipient_name: { type: 'string', nullable: true },
                  recipient_email: { type: 'string', nullable: true },
                  carrier: { type: 'string', nullable: true },
                  tracking_number: { type: 'string', nullable: true }
                },
                required: [
                  'recipient_name',
                  'recipient_email',
                  'carrier',
                  'tracking_number'
                ],
                additionalProperties: false
              }
            }
          }
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
      const content = openaiJson.choices[0].message.content;
      // content should already be JSON because of response_format
      parsed = typeof content === 'string' ? JSON.parse(content) : content;
    } catch (e) {
      console.error('Failed to parse JSON from model:', openaiJson);
      res.status(500).json({
        success: false,
        error: 'Failed to parse JSON from OpenAI response',
        raw: openaiJson
      });
      return;
    }

    // ============= 2) Supabase directory lookup =============
    let emailFromDirectory = null;
    let directoryDebug = null;

    if (parsed.recipient_name && SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      try {
        const rawName = parsed.recipient_name.trim();

        // Fuzzy match: *Name*
        const pattern = `*${rawName}*`;
        const encodedPattern = encodeURIComponent(pattern);

        const urlUsed = `${SUPABASE_URL}/rest/v1/directory?full_name=ilike.${encodedPattern}&select=email,full_name&limit=3`;

        const directoryResponse = await fetch(urlUsed, {
          headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json'
          }
        });

        const rows = await directoryResponse.json();

        directoryDebug = {
          searched_name: rawName,
          url_used: urlUsed,
          status: directoryResponse.status,
          rows
        };

        if (directoryResponse.ok && Array.isArray(rows) && rows.length > 0) {
          emailFromDirectory = rows[0].email || null;
        } else {
          console.log('No directory match for name:', rawName, rows);
        }
      } catch (dirErr) {
        console.error('Error looking up directory email:', dirErr);
        directoryDebug = {
          error: String(dirErr),
          searched_name: parsed.recipient_name
        };
      }
    }

    // ============= 3) Build final package object =============
    const pkg = {
      recipient_name: parsed.recipient_name || null,
      recipient_email: parsed.recipient_email || emailFromDirectory || null,
      carrier: parsed.carrier || null,
      tracking_number: parsed.tracking_number || null,
      time_received: new Date().toISOString(),
      status: 'Waiting for pickup'
    };

    res.status(200).json({
      success: true,
      email_sent: false,
      package: pkg,
      directory_debug: directoryDebug
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
