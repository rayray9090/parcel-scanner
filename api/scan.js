// api/scan.js
export const config = {
  api: {
    bodyParser: false, // we'll parse the form-data later when we add AI
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Use POST' });
    return;
  }

  try {
    // PHASE 1: ignore the actual file, just pretend we scanned something.
    const now = new Date();

    const fakePackage = {
      id: Date.now(),
      recipient_name: 'Test Recipient',
      recipient_email: 'test@example.com',
      address: '123 Test St, San Francisco, CA',
      carrier: 'UPS',
      tracking_number: '1Z999FAKE123456789',
      time_received: now.toISOString(),
      status: 'Waiting for pickup',
    };

    // In the future, this is where you’ll:
    // 1) Read the uploaded image.
    // 2) Send it to OpenAI Vision.
    // 3) Parse the JSON response.
    // 4) Look up email in Supabase.
    // 5) Insert into Supabase packages table.
    // 6) Send email with SendGrid.

    res.status(200).json({
      success: true,
      package: fakePackage,
      email_sent: true, // pretend we emailed them
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
}
