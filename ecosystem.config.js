module.exports = {
  apps: [
    {
      name: 'soctickdata',
      script: 'server.js',
      cwd: __dirname,

      // Restart policy
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '10s',

      // Auto-restart on crash, but not on manual stop
      autorestart: true,

      // Restart at midnight IST (18:30 UTC) — after broker session reset
      cron_restart: '30 18 * * *',

      // Environment — production
      env_production: {
        NODE_ENV: 'production',
      },

      // Log files
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,

      // Keep 7 days of logs
      max_size: '50M',
      retain: 7,
    },
  ],
};
