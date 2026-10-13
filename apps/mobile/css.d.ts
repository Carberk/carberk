// NativeWind's Metro transformer handles the side-effect `import "../global.css"`.
// TypeScript 6+ checks side-effect imports by default
// (noUncheckedSideEffectImports), so the stylesheet needs a module declaration.
declare module "*.css";
