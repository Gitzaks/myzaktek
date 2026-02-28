/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    proxyClientMaxBodySize: '250mb',
  },
  // Keep xlsx as an external (not bundled by webpack) so worker_threads
  // eval-mode workers can require() it at runtime on Vercel.
  serverExternalPackages: ['xlsx'],
};
