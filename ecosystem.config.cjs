module.exports = {
  apps: [
    {
      name: "gharpayy-ops",
      cwd: __dirname,
      script: "serve.mjs",
      env: {
        NODE_ENV: "production",
        PORT: 3001,
      },
    },
  ],
};
