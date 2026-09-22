// Stands in for the `server-only` package under Vitest. The real module throws unless the bundler
// sets the react-server condition; the tests exercise server modules directly, the way a route
// handler does, so here it does nothing.
export {};
