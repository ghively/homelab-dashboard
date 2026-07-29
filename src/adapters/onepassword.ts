import { CredentialEntry } from "./types";

/**
 * Resolve credentials from 1Password via environment variables
 *
 * The production deployment will fetch keys from 1Password at container startup
 * and inject them as environment variables. This module provides the adapter
 * contract for reading those values.
 *
 * In development, keys can be set directly in .env or fetched via `op` CLI.
 */
export class CredentialResolver {
  private vault: string;

  constructor(vault: string = "Gregory") {
    this.vault = vault;
  }

  /**
   * Get a credential value from environment
   * @param spec - Credential specification (item, optional field, optional envVar)
   * @returns The credential value or null if not found
   */
  get(spec: CredentialEntry): string | null {
    // Check explicit environment variable first
    if (spec.envVar && process.env[spec.envVar]) {
      return process.env[spec.envVar] || null;
    }

    // Derive env var name from item/field if not specified
    const envVar = spec.envVar || this.deriveEnvVar(spec.item, spec.field);

    return process.env[envVar] || null;
  }

  /**
   * Get a required credential or throw
   */
  require(spec: CredentialEntry): string {
    const value = this.get(spec);
    if (!value) {
      const envVar = spec.envVar || this.deriveEnvVar(spec.item, spec.field);
      throw new Error(
        `Credential not found: ${spec.item}${spec.field ? `.${spec.field}` : ""} ` +
        `(env var: ${envVar})`
      );
    }
    return value;
  }

  /**
   * Check if a credential is available without revealing its value
   */
  has(spec: CredentialEntry): boolean {
    return this.get(spec) !== null;
  }

  /**
   * Derive environment variable name from 1Password item and field
   * Format: SERVICE_CREDENTIAL or SERVICE_FIELD
   */
  private deriveEnvVar(item: string, field?: string): string {
    const normalized = item
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toUpperCase();

    if (field) {
      const normalizedField = field
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toUpperCase();
      return `${normalizedField}_${normalized}`;
    }

    return normalized;
  }

  /**
   * Get the vault name this resolver is using
   */
  getVault(): string {
    return this.vault;
  }
}

// Singleton instance for the application
export const credentials = new CredentialResolver("Gregory");