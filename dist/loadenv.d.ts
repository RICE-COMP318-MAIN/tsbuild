/**
 * Load environment variables from .env files into process.env.
 *
 * This function loads environment variables from a default .env file, and
 * overrides the defaults from an optional local .env.local file or an optional
 * testing .env.testing file.
 */
export declare function loadEnv(testing?: boolean): void;
