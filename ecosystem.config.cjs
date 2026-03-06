module.exports = {
  apps: [
    {
      name: 'front',
      cwd: './Express1',
      script: 'index2.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    },
    {
      name: 'server',
      cwd: './Express1Back',
      script: 'server.mjs',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      }
    },
    {
      name: 'index',
      cwd: './Express1Back',
      script: 'index.mjs',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'results_parser',
      cwd: './Express1Back',
      script: 'results_parser.mjs',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'billing-service',
      cwd: './Express1Back/tbank',
      script: 'src/server.mjs',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        PORT: 3010,
        BILLING_ENV_FILE: './.env'
      }
    }
  ]
};
