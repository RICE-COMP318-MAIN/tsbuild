/**
 * Load environment variables from .env files into process.env.
 *
 * This function loads environment variables from a default .env file, and
 * overrides the defaults from an optional local .env.local file or an optional
 * testing .env.testing file.
 *
 * @param testing - If true, loads the testing override environment file instead
 * of the local one.
 */
export declare function loadEnv(testing?: boolean): void;
