async function sendToHydraAI(prompt: string): Promise<string> {
  const baseUrl = process.env.BASE_URL;
  if (!baseUrl) {
    throw new Error("BASE_URL is not defined in environment variables.");
  }

  const hydraApiKey = process.env.HYDRA_AI_API_KEY;
  if (!hydraApiKey) {
    throw new Error("HYDRA_AI_API_KEY is not defined in environment variables.");
  }

  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${hydraApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.GPT_MODEL_NAME || "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 500
    })
  });

  const data = await response.json();
  return data.choices[0].message.content;
}
