const wt = "/Users/bagtyyar/.t3/worktrees/carberk/t3-904e7fe8", admin = wt + "/apps/admin", here = "/tmp/issue915-render";
export default ({
  root: here,
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: admin + "/src/$1" },
      { find: "@auto-tm/contracts", replacement: wt + "/packages/contracts/src/index.ts" },
      { find: "next/headers", replacement: here + "/stubs/headers.ts" },
      { find: "next/navigation", replacement: here + "/stubs/navigation.ts" },
      { find: /^(react|react-dom)(\/.*)?$/, replacement: admin + "/node_modules/$1$2" },
    ],
  },
  define: { "process.env": JSON.stringify({ NODE_ENV: "development", API_BASE_URL: "http://127.0.0.1:5917/api/v1" }) },
  server: { host: "127.0.0.1", port: 5917, strictPort: true, fs: { strict: false } },
  css: { postcss: admin },
  clearScreen: false,
});
