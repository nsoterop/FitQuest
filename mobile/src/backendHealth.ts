export type HealthFetcher = (
  url: string,
  options: { signal: AbortSignal },
) => Promise<Pick<Response, 'status' | 'json'>>;

export async function checkBackendHealth(
  apiUrl: string | undefined,
  signal: AbortSignal,
  fetcher: HealthFetcher = fetch,
): Promise<boolean> {
  try {
    if (!apiUrl || signal.aborted) return false;
    const url = new URL(apiUrl);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    url.pathname = `${url.pathname.replace(/\/$/, '')}/health`;
    url.search = '';
    url.hash = '';

    const response = await fetcher(url.toString(), { signal });
    if (response.status !== 200) return false;
    const body: unknown = await response.json();
    return (
      !signal.aborted &&
      typeof body === 'object' &&
      body !== null &&
      'service' in body &&
      body.service === 'fitquest-api' &&
      'status' in body &&
      body.status === 'ok'
    );
  } catch {
    return false;
  }
}
