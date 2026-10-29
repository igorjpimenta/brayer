export function flagValue(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

export function flagMap(args) {
  const out = {};
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith("--") && args[i + 1] !== undefined) {
      out[args[i].slice(2)] = args[i + 1];
      i += 1;
    }
  }
  return out;
}
