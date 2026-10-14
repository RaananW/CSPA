import { layerShader } from "@canvas-spa/react/build";

const literal = value => Number.isInteger(value) ? `${value}.0` : String(value);
const vec = values => `vec${values.length}f(${values.map(literal).join(",")})`;
function easeCode(easing, t, gpu) {
  if (easing === "linear") return t;
  const named = { ease: [0.25, 0.1, 0.25, 1], "ease-in": [0.42, 0, 1, 1],
    "ease-out": [0, 0, 0.58, 1], "ease-in-out": [0.42, 0, 0.58, 1] };
  const points = named[easing] ?? easing.slice(13, -1).split(",").map(Number);
  return gpu ? `compiled_ease(${t}, ${vec(points)})` : `ease(${t}, ${points.join(",")})`;
}
const jsEase = `function ease(t,x1,y1,x2,y2) {
  const f=Math.fround, mul=(a,b)=>f(f(a)*f(b)), add=(a,b)=>f(f(a)+f(b));
  const curve=(p,a,b)=>{const q=f(1-p);return add(add(mul(mul(mul(mul(3,q),q),p),a),mul(mul(mul(mul(3,q),p),p),b)),mul(mul(p,p),p));};
  if(t===0||t===1)return t;
  const mirror=t>0.5;
  if(mirror){t=f(1-t);[x1,y1,x2,y2]=[f(1-f(x2)),f(1-f(y2)),f(1-f(x1)),f(1-f(y1))];}
  let low=0,high=1;
  for(let i=0;i<24;i++){const mid=f(f(low+high)/2);if(curve(mid,x1,x2)<t)low=mid;else high=mid;}
  const value=curve(f(f(low+high)/2),y1,y2);
  return mirror?f(1-value):value;
}`;
const gpuEase = `struct CompiledTransform { position: vec2f, scale: vec2f, rotation: f32, opacity: f32 };
fn compiled_curve(p: f32, a: f32, b: f32) -> f32 {
  return 3.0*(1.0-p)*(1.0-p)*p*a + 3.0*(1.0-p)*p*p*b + p*p*p;
}
fn compiled_ease(t: f32, c: vec4f) -> f32 {
  if (t == 0.0 || t == 1.0) { return t; }
  var progress=t; var controls=c;
  let mirror=t>0.5;
  if(mirror) { progress=1.0-t; controls=vec4f(1.0-c.z,1.0-c.w,1.0-c.x,1.0-c.y); }
  var low=0.0; var high=1.0;
  for(var i=0u; i<24u; i++) { let mid=(low+high)/2.0;
    if(compiled_curve(mid,controls.x,controls.z)<progress) { low=mid; } else { high=mid; }
  }
  let value=compiled_curve((low+high)/2.0,controls.y,controls.w);
  if(mirror) { return 1.0-value; }
  return value;
}`;

export function samplerCode(animation, gpu) {
  const { direction } = animation.timing;
  const maximum = direction === "alternate" ? 2 : 1;
  let code = gpu
    ? `var fraction=clamp(ms,0.0,${literal(maximum)});`
    : `const f=Math.fround;ms=this.normalizeTime(ms);
       let fraction=Math.max(0,Math.min(${maximum},ms));`;
  if (direction === "alternate") code += gpu
    ? "if (fraction>1.0) { fraction=2.0-fraction; }"
    : "if(fraction>1)fraction=f(2-fraction);";
  const fields = ["x", "y", "scaleX", "scaleY", "rotation", "opacity"];
  for (let i = 1; i < animation.values.length; i++) {
    const start = animation.values[i - 1], end = animation.values[i];
    const condition = i === animation.values.length - 1 ? "true" : `fraction<=${gpu ? literal(end.offset) : end.offset}`;
    const progress = gpu ? `(fraction-${literal(start.offset)})/${literal(end.offset - start.offset)}`
      : `f(f(fraction-f(${start.offset}))/f(${end.offset - start.offset}))`;
    const t = easeCode(start.easing, progress, gpu);
    if (gpu) {
      const a = fields.map(key => start[key]), b = fields.map(key => end[key]);
      code += `if(${condition}) { let t=${t};
        return CompiledTransform(mix(${vec(a.slice(0, 2))},${vec(b.slice(0, 2))},t),
          mix(${vec(a.slice(2, 4))},${vec(b.slice(2, 4))},t),
          mix(${literal(a[4])},${literal(b[4])},t),clamp(mix(${literal(a[5])},${literal(b[5])},t),0.0,1.0)); }`;
    } else {
      code += `if(${condition}){const t=${t};return {${fields.map(key => `${key}:f(f(f(${start[key]})*f(1-t))+f(f(${end[key]})*t))`).join(",")}};}`;
    }
  }
  if (gpu) code += "return CompiledTransform(vec2f(0.0),vec2f(1.0),0.0,1.0);";
  return code;
}
export function generateModule(animations) {
  const wgsl = `${gpuEase}\n${animations.map((animation, i) =>
    `fn compiled_${i}(ms:f32)->CompiledTransform {${samplerCode(animation, true)}}`).join("\n")}
    fn compiled_sample(index:u32,ms:f32)->CompiledTransform {
      ${animations.map((_, i) => `if(index==${i + 1}u){return compiled_${i}(ms);}`).join("\n")}
      return CompiledTransform(vec2f(0.0),vec2f(1.0),0.0,1.0);
    }`;
  // One per-layer program; the runtime draws it once per layer, so layer count needs no capacity.
  const programs = [layerShader(undefined, wgsl)];
  const entries = animations.map(animation => {
    const { values, ...publicAnimation } = animation;
    const timing = JSON.stringify(publicAnimation.timing).replace('"iterations":null', '"iterations":Infinity');
    const { duration, delay, iterations, direction } = animation.timing;
    const period = duration * (direction === "alternate" ? 2 : 1);
    const endpoint = direction === "alternate" && iterations % 2 === 0 ? 0 : 1;
    // Upload bounded phase, avoiding delay precision loss and GPU reciprocal rounding near sharp easing endpoints.
    const normalize = `if(!Number.isFinite(ms)||ms<0||ms>1e12)throw new Error("Compiled time must be finite in [0,1e12]");
      const elapsed=Math.max(0,ms-${delay});
      ${Number.isFinite(iterations) ? `if(elapsed>=${duration * iterations})return Math.fround(${endpoint});` : ""}
      return Math.fround((elapsed%${period})/${duration});`;
    return `{...${JSON.stringify({ ...publicAnimation, timing: undefined })},timing:${timing},normalizeTime(ms){${normalize}},sample(ms){${samplerCode(animation, false)}}}`;
  });
  return `${jsEase}\nconst compiled={version:2,animations:[${entries.join(",")}],programs:${JSON.stringify(programs)}};\nexport default compiled;\n`;
}
