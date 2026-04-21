import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an expert construction cost estimator with 20+ years of experience in North American commercial construction. You produce detailed, realistic quantity takeoffs and cost estimates.

When given a project description, return ONLY a valid JSON object — no markdown, no code fences, no explanation. The JSON must exactly match this structure:

{
  "projectTitle": "Short descriptive title",
  "totalCost": <number>,
  "categories": [
    {
      "name": "Category Name",
      "subtotal": <number>,
      "items": [
        { "item": "Item Name", "unit": "UNIT", "quantity": <number>, "unitCost": <number>, "total": <number> }
      ]
    }
  ]
}

Rules:
- Use these exact category names in this order: Structure, Shell, Interiors, Services, Site Work, General Conditions & Fees
- Include 6–10 items per category
- Use realistic North American commercial construction unit costs (USD or CAD as appropriate)
- Scale quantities realistically based on the project description
- totalCost must equal the sum of all category subtotals
- Each category subtotal must equal the sum of its item totals
- Each item total must equal quantity × unitCost
- Common units: SF, CY, LF, EA, TON, LS, SY, CSF, MBF
- Return ONLY the JSON object, nothing else`;

app.post('/api/estimate', async (req, res) => {
  const { description } = req.body;

  if (!description || typeof description !== 'string' || !description.trim()) {
    return res.status(400).json({ error: 'A project description is required.' });
  }

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Generate a detailed construction cost estimate for the following project:\n\n${description.trim()}`,
        },
      ],
    });

    const rawText = message.content.find(b => b.type === 'text')?.text ?? '';

    let estimate;
    try {
      // Strip any accidental markdown fences before parsing
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      estimate = JSON.parse(cleaned);
    } catch {
      console.error('Failed to parse Claude response:', rawText.slice(0, 500));
      return res.status(500).json({ error: 'The AI returned an unexpected format. Please try again.' });
    }

    res.json(estimate);
  } catch (err) {
    console.error('Anthropic API error:', err.message);
    const status = err.status ?? 500;
    res.status(status).json({ error: err.message || 'An error occurred while generating the estimate.' });
  }
});

// Export for Vercel serverless; listen only when run directly (local dev)
export default app;

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`PCL Estimating server running on http://localhost:${PORT}`);
  });
}
