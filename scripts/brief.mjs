const port = Number(process.env.AGENTIC_DJ_PORT || 4371);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('Invalid AGENTIC_DJ_PORT.');
try {
  const response = await fetch(
    `http://127.0.0.1:${port}/api/export?format=brief`,
    { signal: AbortSignal.timeout(5000) },
  );
  if (!response.ok)
    throw new Error('The local server could not export your brief.');
  console.log(await response.text());
} catch (error) {
  console.error(`Start Agentic DJ with npm start first. ${error.message}`);
  process.exitCode = 1;
}
