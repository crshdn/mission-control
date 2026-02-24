import fetch from "node-fetch";

const LITELLM_URL = process.env.LITELLM_URL || "http://127.0.0.1:5001";

export async function callLiteLLM(model: string, messages: {role:string, content:string}[]) {
  const res = await fetch(`${LITELLM_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`liteLLM error: ${res.status} ${t}`);
  }
  return res.json();
}
