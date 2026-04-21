import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';

dotenv.config();

const app = express();
app.use(cors({
  origin: [
    'https://dnbrwn11.github.io',
    'http://localhost:3000',
    'http://127.0.0.1:5500'
  ],
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an expert construction cost estimator with 20+ years of experience in North American commercial construction. You produce detailed, realistic quantity takeoffs and cost estimates for DIRECT COSTS ONLY.

When given a project description and target budget, return ONLY a valid JSON object — no markdown, no code fences, no explanation. The JSON must exactly match this structure:

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
- The totalCost MUST come within 5% above or below the target budget provided — this is mandatory
- ALL costs are DIRECT COSTS ONLY:
  * Do NOT include contingency line items
  * Do NOT include overhead or markup line items
  * Do NOT include contractor fee line items
  * Do NOT include soft costs (design, permits, testing, insurance)
  * Do NOT include escalation line items
  * Do NOT include HST/GST/tax line items
- The "General Conditions & Fees" category must include ONLY these types of items:
  * Site supervision
  * Site trailer & temporary facilities
  * Safety program
  * Project management
  * Do NOT include markup, fee, or overhead lines under any circumstance
- Adjust quantities and unit costs intelligently to hit the budget — think like an experienced estimator and vary line items thoughtfully, do not just scale everything proportionally
- If the budget seems too low for the project type and scope described, note it in the projectTitle field by appending " (Budget-Constrained)"
- Return ONLY the JSON object, nothing else`;

app.post('/api/estimate', async (req, res) => {
  const { description, budget } = req.body;

  if (!description || typeof description !== 'string' || !description.trim()) {
    return res.status(400).json({ error: 'A project description is required.' });
  }

  const parsedBudget = Number(budget);
  if (!parsedBudget || parsedBudget <= 0 || !isFinite(parsedBudget)) {
    return res.status(400).json({ error: 'A valid budget is required.' });
  }

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Target budget (direct costs only): $${parsedBudget.toLocaleString('en-US')}\nProject description: ${description.trim()}`,
        },
      ],
    });

    const rawText = message.content.find(b => b.type === 'text')?.text ?? '';

    let estimate;
    try {
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
    console.log(`Estimate AI server running on http://localhost:${PORT}`);
  });
}
