const CORS_PROXY_BASE_URL = 'https://corsproxy.io/?url=';

export function buildCorsProxyUrl(url: string): string {
  return `${CORS_PROXY_BASE_URL}${encodeURIComponent(url)}`;
}
