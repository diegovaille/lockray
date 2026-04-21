/**
 * Parser + analyzer error types for @lockray/analyzer-npm.
 *
 * Kept in a dedicated module so every error-throwing file can import from
 * a single place, and so the error class is trivially movable to
 * @lockray/types once there are multiple analyzers that need it.
 */

export class LockfileParseError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_JSON"
      | "INVALID_YAML"
      | "UNSUPPORTED_VERSION"
      | "SCHEMA_MISMATCH",
  ) {
    super(message);
    this.name = "LockfileParseError";
  }
}

export class OsvClientError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "HTTP_ERROR"
      | "SCHEMA_MISMATCH"
      | "NETWORK_ERROR"
      | "RATE_LIMITED",
  ) {
    super(message);
    this.name = "OsvClientError";
  }
}

export class TarballFetchError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "NOT_FOUND"
      | "NETWORK_ERROR"
      | "EXTRACTION_ERROR"
      | "INVALID_ARCHIVE",
  ) {
    super(message);
    this.name = "TarballFetchError";
  }
}
