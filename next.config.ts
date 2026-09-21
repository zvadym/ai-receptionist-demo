import type { NextConfig } from 'next';
const config: NextConfig = {
  serverExternalPackages: ['pg', '@electric-sql/pglite', 'nodemailer', 'ws'],
  poweredByHeader: false,
};
export default config;
