module.exports = {
  apps: [{
    name: 'mission-control',
    script: 'npx',
    args: 'next start -p 4000',
    cwd: __dirname,
    env: {
      NODE_ENV: 'production',
      PORT: '4000'
    },
    // PM2 settings
    instances: 1,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 3000,
    watch: false,
    max_memory_restart: '512M'
  }]
};
