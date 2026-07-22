function valueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value === "object" ? "object" : typeof value;
}

function matchesType(value, expected) {
  const actual = valueType(value);
  const types = Array.isArray(expected) ? expected : [expected];
  return types.some((type) => type === actual || (type === "number" && ["number", "integer"].includes(actual)));
}

export function validateSchema(schema, value, location = "$") {
  const errors = [];
  const resolveRef = (ref) => {
    if (typeof ref !== "string" || !ref.startsWith("#/")) return null;
    return ref.slice(2).split("/").reduce((node, key) => node?.[key.replaceAll("~1", "/").replaceAll("~0", "~")], schema);
  };
  const visit = (nodeSchema, node, pointer) => {
    if (nodeSchema.$ref) {
      const resolved = resolveRef(nodeSchema.$ref);
      if (!resolved) errors.push(`${pointer}: unresolved local schema reference ${nodeSchema.$ref}`);
      else visit(resolved, node, pointer);
      return;
    }
    if (Array.isArray(nodeSchema.oneOf)) {
      const branchResults = nodeSchema.oneOf.map((branch) => {
        const start = errors.length;
        visit(branch, node, pointer);
        const branchErrors = errors.splice(start);
        return branchErrors;
      });
      const matches = branchResults.filter((branchErrors) => branchErrors.length === 0);
      if (matches.length !== 1) errors.push(`${pointer}: must match exactly one oneOf branch; matched ${matches.length}`);
      return;
    }
    if (nodeSchema.type && !matchesType(node, nodeSchema.type)) {
      errors.push(`${pointer}: expected ${JSON.stringify(nodeSchema.type)}, got ${valueType(node)}`);
      return;
    }
    if (Object.hasOwn(nodeSchema, "const") && JSON.stringify(node) !== JSON.stringify(nodeSchema.const)) errors.push(`${pointer}: must equal ${JSON.stringify(nodeSchema.const)}`);
    if (nodeSchema.enum && !nodeSchema.enum.some((candidate) => JSON.stringify(candidate) === JSON.stringify(node))) errors.push(`${pointer}: value is not in the allowed enum`);
    if (typeof node === "string") {
      if (nodeSchema.minLength !== undefined && node.length < nodeSchema.minLength) errors.push(`${pointer}: string is shorter than ${nodeSchema.minLength}`);
      if (nodeSchema.pattern && !new RegExp(nodeSchema.pattern).test(node)) errors.push(`${pointer}: string does not match ${nodeSchema.pattern}`);
      if (nodeSchema.format === "date-time" && Number.isNaN(Date.parse(node))) errors.push(`${pointer}: invalid date-time`);
    }
    if (typeof node === "number" && nodeSchema.minimum !== undefined && node < nodeSchema.minimum) errors.push(`${pointer}: number is below ${nodeSchema.minimum}`);
    if (Array.isArray(node)) {
      if (nodeSchema.minItems !== undefined && node.length < nodeSchema.minItems) errors.push(`${pointer}: requires at least ${nodeSchema.minItems} items`);
      if (nodeSchema.uniqueItems && new Set(node.map((item) => JSON.stringify(item))).size !== node.length) errors.push(`${pointer}: items must be unique`);
      if (nodeSchema.items) node.forEach((item, index) => visit(nodeSchema.items, item, `${pointer}[${index}]`));
    }
    if (node && typeof node === "object" && !Array.isArray(node)) {
      for (const required of nodeSchema.required ?? []) if (!Object.hasOwn(node, required)) errors.push(`${pointer}: missing required property ${required}`);
      const properties = nodeSchema.properties ?? {};
      if (nodeSchema.additionalProperties === false) {
        for (const key of Object.keys(node)) if (!Object.hasOwn(properties, key)) errors.push(`${pointer}: unknown property ${key}`);
      }
      for (const [key, childSchema] of Object.entries(properties)) if (Object.hasOwn(node, key)) visit(childSchema, node[key], `${pointer}.${key}`);
    }
  };
  visit(schema, value, location);
  return errors;
}
