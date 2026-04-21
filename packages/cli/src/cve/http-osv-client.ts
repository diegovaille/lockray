import { createOsvClient, type OSVClient, type OsvTransport } from "@lockray/analyzer-npm";

const transport: OsvTransport = async (url, body) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed };
};

export function createHttpOsvClient(): OSVClient {
  return createOsvClient(transport);
}
