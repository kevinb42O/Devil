// Full co-op courtyard flow, including six real gameplay connections.
process.env.CREW_SIZE??='6';
await import('./courtyard-browser.mjs');
