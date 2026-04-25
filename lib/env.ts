export function getEnvWarning() {
  return process.env.OPENAI_API_KEY
    ? null
    : "OPENAI_API_KEY is missing. Catalog browsing still works, but reindex and chat will fail until the key is set.";
}
