/**
 * Base HTTP client for adapters with credential resolution, error handling,
 * and standard response parsing.
 */
import { ApiClientConfig } from "./types";

export interface AdapterResponse<T> {
  data: T;
  ok: boolean;
  status: number;
  headers: Headers;
}

export class HttpClient {
  protected baseURL: string;
  protected token: string | null;
  protected timeout: number;

  constructor(config: ApiClientConfig) {
    this.baseURL = config.baseURL.replace(/\/$/, "");
    this.token = config.token || null;
    this.timeout = config.timeout || 15000;
  }

  /**
   * Build request headers with auth if token is available
   */
  protected getHeaders(additional?: Record<string, string>): HeadersInit {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...additional,
    };

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    return headers;
  }

  /**
   * Wrap fetch with timeout and error handling
   */
  protected async fetch<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<AdapterResponse<T>> {
    const url = `${this.baseURL}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const headers = new Headers(response.headers);
      let data: T;

      // Handle empty responses
      const contentType = headers.get("content-type");
      if (contentType?.includes("application/json") && response.status !== 204) {
        data = await response.json();
      } else {
        data = {} as T;
      }

      return {
        data,
        ok: response.ok,
        status: response.status,
        headers,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Request timeout after ${this.timeout}ms: ${url}`);
      }

      throw error;
    }
  }

  /**
   * GET request
   */
  async get<T>(path: string, headers?: Record<string, string>): Promise<AdapterResponse<T>> {
    return this.fetch<T>(path, {
      method: "GET",
      headers: this.getHeaders(headers),
    });
  }

  /**
   * POST request
   */
  async post<T>(path: string, body: unknown, headers?: Record<string, string>): Promise<AdapterResponse<T>> {
    return this.fetch<T>(path, {
      method: "POST",
      headers: this.getHeaders(headers),
      body: JSON.stringify(body),
    });
  }

  /**
   * PUT request
   */
  async put<T>(path: string, body: unknown, headers?: Record<string, string>): Promise<AdapterResponse<T>> {
    return this.fetch<T>(path, {
      method: "PUT",
      headers: this.getHeaders(headers),
      body: JSON.stringify(body),
    });
  }

  /**
   * DELETE request
   */
  async delete<T>(path: string, headers?: Record<string, string>): Promise<AdapterResponse<T>> {
    return this.fetch<T>(path, {
      method: "DELETE",
      headers: this.getHeaders(headers),
    });
  }

  /**
   * Build URL with query parameters
   */
  protected buildUrl(path: string, params: Record<string, string | number | boolean>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      search.append(key, String(value));
    }
    const query = search.toString();
    return query ? `${path}?${query}` : path;
  }
}