/**
 * Vitest setup. jsdom provides localStorage, fetch-stubs are unnecessary for
 * these units, and stores reset themselves between tests via their own
 * `setState` calls. Kept intentionally minimal.
 */
export {};
