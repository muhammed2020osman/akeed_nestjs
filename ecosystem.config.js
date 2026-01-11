module.exports = {
  apps: [{
    name: 'souglink-nestjs',
    script: './dist/main.js',
    cwd: '/www/wwwroot/souglink.com',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/www/wwwroot/souglink.com/logs/pm2-error.log',
    out_file: '/www/wwwroot/souglink.com/logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    watch: false,
    max_memory_restart: '1G'
  }]
};

