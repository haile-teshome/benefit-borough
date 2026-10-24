/** @type {import('next').NextConfig} */
// StrictMode's double mount opens two SpacetimeDB connections before the first token is saved,
// which spawns a ghost farmer in dev.
export default { reactStrictMode: false };
