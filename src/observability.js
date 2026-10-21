// Structured logs (picked up by Workers Logs) and optional Analytics Engine
// data points. The `ANALYTICS` binding is optional; see wrangler.toml.
export function recordScrape(env, entry) {
  console.log(JSON.stringify({ event: 'scrape', ...entry }))

  try {
    env?.ANALYTICS?.writeDataPoint({
      indexes: [entry.host || 'unknown'],
      blobs: [entry.host || 'unknown', String(entry.status), entry.error || ''],
      doubles: [entry.durationMs, entry.upstreamStatus || 0]
    })
  } catch (error) {
    console.warn(JSON.stringify({ event: 'analytics_error', message: error.message }))
  }
}
