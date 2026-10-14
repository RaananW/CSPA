// PostCSS configuration of the fixture app. The plugin renames `--compiler-opacity` to `opacity`, which
// shows that the compiler analyzes the CSS after the application's own PostCSS transforms.
export default {
  plugins: [{
    postcssPlugin: "fixture-opacity",
    Declaration(declaration) {
      if (declaration.prop === "--compiler-opacity") declaration.prop = "opacity";
    },
  }],
};
