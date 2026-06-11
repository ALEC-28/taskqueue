const Groq = require('groq-sdk');

function getClient() {
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

const SYSTEM_PROMPT = `You are a workflow DAG generator for a distributed task queue system.

The user will describe a workflow in plain English. You must convert it into a JSON DAG definition.

Rules:
- Each step must have a unique "name" (snake_case, no spaces)
- "job_name" must be one of: send_welcome_email, resize_image, generate_invoice, fraud_check, send_otp_sms, sync_crm, push_notification, slow_job
- "queue" must be one of: high, default, low
- "depends_on" is an array of step names this step waits for (empty array = runs first)
- Steps with the same depends_on run in PARALLEL
- No cycles allowed

Return ONLY valid JSON in this exact format, no explanation, no markdown backticks:
{
  "name": "workflow_name_here",
  "steps": [
    {
      "name": "step_name",
      "job_name": "actual_job_handler",
      "queue": "default",
      "payload": {},
      "depends_on": []
    }
  ]
}`;

async function generateWorkflowFromText(description) {
  console.log('[ai] generating workflow from:', description);

  const client = getClient();
  const completion = await client.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    max_tokens: 1024,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: description }
    ]
  });

  const raw = completion.choices[0].message.content.trim();
  console.log('[ai] raw response:', raw);

  // Strip markdown backticks if model adds them
  const cleaned = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
  const workflow = JSON.parse(cleaned);

  if (!workflow.name || !Array.isArray(workflow.steps) || workflow.steps.length === 0) {
    throw new Error('invalid workflow structure from AI');
  }

  for (const step of workflow.steps) {
    if (!step.name || !step.job_name || !Array.isArray(step.depends_on)) {
      throw new Error(`invalid step structure: ${JSON.stringify(step)}`);
    }
  }

  console.log(`[ai] generated workflow "${workflow.name}" with ${workflow.steps.length} steps`);
  return workflow;
}

module.exports = { generateWorkflowFromText };