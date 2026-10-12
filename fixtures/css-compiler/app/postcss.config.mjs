export default {
  plugins: [{
    postcssPlugin: "fixture-opacity",
    Declaration(declaration) {
      if (declaration.prop === "--compiler-opacity") declaration.prop = "opacity";
    },
  }],
};
