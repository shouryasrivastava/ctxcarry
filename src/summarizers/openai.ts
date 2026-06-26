export interface SummarizerInput {
  text: string;
  budgetTokens: number;
}

export interface Summarizer {
  summarize(input: SummarizerInput): Promise<string>;
}

export class OpenAISummarizer implements Summarizer {
  constructor(
    private readonly apiKey = process.env.OPENAI_API_KEY,
    private readonly model = process.env.CTXCARRY_OPENAI_MODEL
  ) {}

  async summarize(input: SummarizerInput): Promise<string> {
    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY is required for OpenAI summarization.");
    }
    if (!this.model) {
      throw new Error("CTXCARRY_OPENAI_MODEL is required for OpenAI summarization.");
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        input: [
          {
            role: "system",
            content: "Summarize coding-agent session history into compact project ctxcarry state. Preserve decisions, failures, files, constraints, and next steps."
          },
          {
            role: "user",
            content: `Budget: ${input.budgetTokens} tokens\n\n${input.text}`
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI summarization failed with HTTP ${response.status}.`);
    }

    const json = (await response.json()) as { output_text?: string };
    return json.output_text?.trim() ?? "";
  }
}
