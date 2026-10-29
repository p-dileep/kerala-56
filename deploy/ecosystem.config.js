// pm2 start deploy/ecosystem.config.js
// Keep ONE instance: rooms live in memory, so clustering would split tables across processes.
module.exports = {
  apps: [{ name: 'kerala-56', script: 'src/server.js', instances: 1, env: { PORT: 3056, NODE_ENV: 'production' } }]
};
