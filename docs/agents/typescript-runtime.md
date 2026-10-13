# TypeScript Runtime Boundaries

This repo has more than one TypeScript runtime. Do not apply one import-extension rule everywhere.

## Runtime classes

| Class | Workspaces | Runtime rule |
|---|---|---|
| Nest/CommonJS backend apps | `apps/api`, `apps/worker` | Compile app code to CommonJS (`module: CommonJS` with `moduleResolution: Bundler`). Do not execute workspace package `src/*.ts` directly from Node. |
| Runtime-shared packages | `packages/db`, `packages/contracts` | Build to ignored `dist/` before consumers run. Package `exports` must point at `dist`, not `src`. |
| True ESM service | `apps/sms-gateway` | `type: "module"` + NodeNext. Relative runtime imports in `.ts` source use `.js` specifiers because TypeScript preserves them for emitted JS. |
| Bundler-only UI package | `packages/ui` | Source exports are allowed because Next/Metro consume them through bundlers, not raw Node. Do not import this package from API/worker. |

`packages/db/generated/` is ignored. `pnpm --filter @auto-tm/db build` runs `prisma generate` before `tsc`, so do not hand-edit or commit generated Prisma client files. The Prisma generator uses `moduleFormat = "cjs"` to avoid emitting ESM-only generated code into the DB package's CommonJS build.

`apps/api`, `apps/worker`, and `apps/mobile` run the needed package build before `dev`. For `build`, `test`, and `typecheck`, either use the root Turbo scripts or run the package builds listed below first.

## Which compiler runs where

Two TypeScript compilers are installed side by side, both from the pnpm default catalog. TypeScript 7 is the native compiler and ships no compiler API before 7.1, so tools that load the API keep TypeScript 6.

| Package name in `package.json` | Version | Binary | Runs |
|---|---|---|---|
| `@typescript/native` (`npm:typescript@^7.0.2`) | 7.0 | `tsc` | Every `typecheck` script (`tsc --noEmit`), so `pnpm typecheck` is TypeScript 7. Also the `tsc` emit in the `packages/contracts` and `packages/db` builds and the `apps/sms-gateway` build. |
| `typescript` (`npm:@typescript/typescript6@^6.0.2`) | 6.0 | `tsc6` | Whatever imports `typescript`: typescript-eslint during `pnpm lint` (it supports TypeScript <6.1), `nest build` for `apps/api` and `apps/worker`, `next build` type checking for `apps/admin` and `apps/web`, and Expo's TypeScript config loader. |

Every package that type-checks must pass both. Check TypeScript 6 with `pnpm --filter <package> exec tsc6 --noEmit`. Do not set `ignoreDeprecations`: TypeScript 7 removed the options TypeScript 6 deprecated, such as `moduleResolution: node10` and `baseUrl`. TypeScript 6 changed two defaults, so each tsconfig states them where they matter: `rootDir` (now the tsconfig directory) where output paths depend on it, and `types` (now `[]`) where code uses `@types` globals such as `node`. Leave `typescript` on TypeScript 6 until typescript-eslint, the Nest CLI and Next.js support TypeScript 7's API.

The shared compiler options live in `packages/tsconfig/base.json` itself. A config in `@auto-tm/tsconfig` must not `extends` a file outside that package: Vitest's transform (Vite 8's Oxc) resolves a relative `extends` from the package's `node_modules` symlink, not its real path, and fails to load the config.

## Why the API crashed

Rules confirmed against the TypeScript and Node documentation:

- Node ESM requires fully specified relative imports. If source says `./prisma.service.js`, Node looks for exactly `prisma.service.js`; it does not fall back to `prisma.service.ts`.
- TypeScript normally preserves import specifier strings during emit. It does not rewrite `./x` to `./x.js`, except when using `rewriteRelativeImportExtensions`.
- A passing `tsc --noEmit` is not proof that Node can load a package at runtime.

The crash happened because `@auto-tm/db` exported `./src/index.ts`, so Node 24 loaded raw TypeScript from a workspace package. Changing `./prisma.service` to `./prisma.service.js` then made Node search for a source-side `.js` file that does not exist.

## Rules for agents

1. Never point runtime-shared package exports at `src/*.ts`.
2. Never fix `ERR_MODULE_NOT_FOUND` by blindly adding or removing `.js`.
3. First inspect all four things:
   - nearest `package.json` `type`
   - package `main` / `exports`
   - workspace `tsconfig.json` `module` and `moduleResolution`
   - actual runtime command (`nest start`, `node dist/...`, `tsx`, Next, Expo)
4. In `apps/sms-gateway`, keep `.js` relative specifiers in TS source.
5. In `apps/api`, `apps/worker`, `packages/db`, and `packages/contracts`, keep existing extensionless local imports unless a package-specific ADR says otherwise.
6. In `packages/ui`, source exports are bundler-only. If a Node app needs code from it, create a separate built runtime package instead of importing UI source.

## Required checks after module/export changes

Run these before claiming a TypeScript runtime fix is done:

```bash
pnpm --filter @auto-tm/db build
pnpm --filter @auto-tm/contracts build
pnpm check:runtime-imports
pnpm --filter @auto-tm/api typecheck
pnpm --filter @auto-tm/worker typecheck
pnpm --filter @auto-tm/mobile typecheck
```

If the error happened while running the API, also run:

```bash
pnpm --filter @auto-tm/api build
```

## Fast diagnosis loop

For package import failures, reduce the bug before touching code:

```bash
node -e "require('@auto-tm/db'); console.log('db ok')"
node -e "require('@auto-tm/contracts'); console.log('contracts ok')"
node --input-type=module -e "import('@auto-tm/db').then(() => console.log('db esm ok'))"
node --input-type=module -e "import('@auto-tm/contracts').then(() => console.log('contracts esm ok'))"
```

If these fail, fix the package boundary first. Do not start by editing the consuming Nest module.
