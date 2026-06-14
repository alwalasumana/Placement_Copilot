import 'dotenv/config';

async function test() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error("GEMINI_API_KEY is not defined");
    process.exit(1);
  }
  console.log("Using Gemini Key:", key.substring(0, 8) + "...");
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error("Failed to list models:", res.status, await res.text());
      process.exit(1);
    }
    const data = await res.json();
    console.log("Available models:");
    const textModels = data.models.filter(m => m.supportedGenerationMethods.includes("generateContent"));
    for (const model of textModels) {
      console.log(`- Name: ${model.name}, DisplayName: ${model.displayName}`);
    }
  } catch (err) {
    console.error("Error listing models:", err.message);
  }
  process.exit(0);
}

test();
