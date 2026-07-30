/**
 * Service configuration layer.
 * Reads environment variables for a given service and returns a typed
 * config object, or null when the service is unconfigured. Returning null
 * (rather than throwing) is load-bearing: callers use it to fall back to
 * fixture data when a service has no URL or API key set.
 */

export interface ServiceConfig {
  url: string;
  apiKey: string;
  userId?: string;
}

export function getServiceConfig(service: string): ServiceConfig | null {
  const prefix = service.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const url = process.env[`${prefix}_URL`];
  const apiKey = process.env[`${prefix}_API_KEY`];

  if (!url || !apiKey) {
    return null;
  }

  const userId = process.env[`${prefix}_USER_ID`];
  return {
    url,
    apiKey,
    ...(userId ? { userId } : {}),
  };
}
