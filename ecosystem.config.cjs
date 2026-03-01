module.exports = {
  apps: [
    {
      name: "btm",
      script: "npm",
      args: "run start:prod",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};
