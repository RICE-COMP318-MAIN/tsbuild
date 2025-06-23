/**
 * Load environment variables from .env files and return them as an object.
 *
 * This function loads environment variables from a default .env file, and
 * overrides the defaults from an optional local .env.local file or an optional
 * testing .env.test file.
 *
 * @param testing - If true, loads the testing override environment file instead
 * of the local one.
 * @return an object containing the environment variables and their values.
 * If a variable is defined in both files, the value from the override file will
 * take precedence.
 */
export declare function loadEnv(testing?: boolean): Record<string, string>;
