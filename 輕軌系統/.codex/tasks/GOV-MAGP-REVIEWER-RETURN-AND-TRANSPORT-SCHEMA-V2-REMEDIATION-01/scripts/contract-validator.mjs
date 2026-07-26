import crypto from "node:crypto";
import fs from "node:fs";

export function canonicalize(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
    .join(",")}}`;
}

export function sha256Bytes(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

export function sha256File(filePath) {
  return sha256Bytes(fs.readFileSync(filePath));
}

export function sha256Jcs(value) {
  return sha256Bytes(Buffer.from(canonicalize(value), "utf8"));
}

function equalJson(left, right) {
  return canonicalize(left) === canonicalize(right);
}

function resolveLocalRef(rootSchema, ref) {
  if (!ref.startsWith("#/")) {
    throw new Error(`Only local JSON Pointer refs are supported by the task-local validator: ${ref}`);
  }
  return ref
    .slice(2)
    .split("/")
    .reduce(
      (value, token) => value[token.replace(/~1/g, "/").replace(/~0/g, "~")],
      rootSchema,
    );
}

function typeMatches(value, type) {
  switch (type) {
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    case "integer":
      return Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "null":
      return value === null;
    default:
      return false;
  }
}

export function validate(instance, schema, rootSchema = schema, instancePath = "$", schemaPath = "#") {
  if (schema === true) return [];
  if (schema === false) return [{ instancePath, schemaPath, keyword: "falseSchema" }];

  const errors = [];

  if (schema.$ref) {
    const referenced = resolveLocalRef(rootSchema, schema.$ref);
    errors.push(...validate(instance, referenced, rootSchema, instancePath, schema.$ref));
    const siblingSchema = { ...schema };
    delete siblingSchema.$ref;
    if (Object.keys(siblingSchema).length > 0) {
      errors.push(...validate(instance, siblingSchema, rootSchema, instancePath, schemaPath));
    }
    return errors;
  }

  if (schema.type) {
    const acceptedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!acceptedTypes.some((type) => typeMatches(instance, type))) {
      errors.push({ instancePath, schemaPath: `${schemaPath}/type`, keyword: "type", expected: schema.type });
      return errors;
    }
  }

  if (Object.prototype.hasOwnProperty.call(schema, "const") && !equalJson(instance, schema.const)) {
    errors.push({ instancePath, schemaPath: `${schemaPath}/const`, keyword: "const", expected: schema.const, actual: instance });
  }

  if (schema.enum && !schema.enum.some((candidate) => equalJson(instance, candidate))) {
    errors.push({ instancePath, schemaPath: `${schemaPath}/enum`, keyword: "enum", expected: schema.enum, actual: instance });
  }

  if (typeof instance === "string") {
    if (schema.minLength !== undefined && Array.from(instance).length < schema.minLength) {
      errors.push({ instancePath, schemaPath: `${schemaPath}/minLength`, keyword: "minLength", expected: schema.minLength });
    }
    if (schema.maxLength !== undefined && Array.from(instance).length > schema.maxLength) {
      errors.push({ instancePath, schemaPath: `${schemaPath}/maxLength`, keyword: "maxLength", expected: schema.maxLength });
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, "u").test(instance)) {
      errors.push({ instancePath, schemaPath: `${schemaPath}/pattern`, keyword: "pattern", expected: schema.pattern });
    }
  }

  if (typeof instance === "number" && Number.isFinite(instance)) {
    if (schema.minimum !== undefined && instance < schema.minimum) {
      errors.push({ instancePath, schemaPath: `${schemaPath}/minimum`, keyword: "minimum", expected: schema.minimum, actual: instance });
    }
    if (schema.maximum !== undefined && instance > schema.maximum) {
      errors.push({ instancePath, schemaPath: `${schemaPath}/maximum`, keyword: "maximum", expected: schema.maximum, actual: instance });
    }
    if (schema.exclusiveMinimum !== undefined && instance <= schema.exclusiveMinimum) {
      errors.push({ instancePath, schemaPath: `${schemaPath}/exclusiveMinimum`, keyword: "exclusiveMinimum", expected: schema.exclusiveMinimum, actual: instance });
    }
  }

  if (Array.isArray(instance)) {
    if (schema.minItems !== undefined && instance.length < schema.minItems) {
      errors.push({ instancePath, schemaPath: `${schemaPath}/minItems`, keyword: "minItems", expected: schema.minItems, actual: instance.length });
    }
    if (schema.maxItems !== undefined && instance.length > schema.maxItems) {
      errors.push({ instancePath, schemaPath: `${schemaPath}/maxItems`, keyword: "maxItems", expected: schema.maxItems, actual: instance.length });
    }
    if (schema.items) {
      instance.forEach((value, index) => {
        errors.push(...validate(value, schema.items, rootSchema, `${instancePath}/${index}`, `${schemaPath}/items`));
      });
    }
    if (schema.contains) {
      const matches = instance.filter(
        (value, index) => validate(value, schema.contains, rootSchema, `${instancePath}/${index}`, `${schemaPath}/contains`).length === 0,
      ).length;
      const minimumMatches = schema.minContains ?? 1;
      const maximumMatches = schema.maxContains ?? Number.POSITIVE_INFINITY;
      if (matches < minimumMatches || matches > maximumMatches) {
        errors.push({ instancePath, schemaPath: `${schemaPath}/contains`, keyword: "contains", matches, minimumMatches, maximumMatches });
      }
    }
  }

  if (instance !== null && typeof instance === "object" && !Array.isArray(instance)) {
    if (schema.required) {
      for (const propertyName of schema.required) {
        if (!Object.prototype.hasOwnProperty.call(instance, propertyName)) {
          errors.push({ instancePath, schemaPath: `${schemaPath}/required`, keyword: "required", missingProperty: propertyName });
        }
      }
    }
    if (schema.properties) {
      for (const [propertyName, propertySchema] of Object.entries(schema.properties)) {
        if (Object.prototype.hasOwnProperty.call(instance, propertyName)) {
          errors.push(
            ...validate(
              instance[propertyName],
              propertySchema,
              rootSchema,
              `${instancePath}/${propertyName}`,
              `${schemaPath}/properties/${propertyName}`,
            ),
          );
        }
      }
    }
    if (schema.additionalProperties === false) {
      const allowedProperties = new Set(Object.keys(schema.properties ?? {}));
      for (const propertyName of Object.keys(instance)) {
        if (!allowedProperties.has(propertyName)) {
          errors.push({ instancePath, schemaPath: `${schemaPath}/additionalProperties`, keyword: "additionalProperties", propertyName });
        }
      }
    }
  }

  if (schema.allOf) {
    schema.allOf.forEach((subschema, index) => {
      errors.push(...validate(instance, subschema, rootSchema, instancePath, `${schemaPath}/allOf/${index}`));
    });
  }

  if (schema.anyOf) {
    const matches = schema.anyOf.filter(
      (subschema, index) => validate(instance, subschema, rootSchema, instancePath, `${schemaPath}/anyOf/${index}`).length === 0,
    ).length;
    if (matches === 0) {
      errors.push({ instancePath, schemaPath: `${schemaPath}/anyOf`, keyword: "anyOf", matches });
    }
  }

  if (schema.oneOf) {
    const matches = schema.oneOf.filter(
      (subschema, index) => validate(instance, subschema, rootSchema, instancePath, `${schemaPath}/oneOf/${index}`).length === 0,
    ).length;
    if (matches !== 1) {
      errors.push({ instancePath, schemaPath: `${schemaPath}/oneOf`, keyword: "oneOf", matches });
    }
  }

  if (schema.not && validate(instance, schema.not, rootSchema, instancePath, `${schemaPath}/not`).length === 0) {
    errors.push({ instancePath, schemaPath: `${schemaPath}/not`, keyword: "not" });
  }

  if (schema.if) {
    const conditionMatches = validate(instance, schema.if, rootSchema, instancePath, `${schemaPath}/if`).length === 0;
    if (conditionMatches && schema.then) {
      errors.push(...validate(instance, schema.then, rootSchema, instancePath, `${schemaPath}/then`));
    }
    if (!conditionMatches && schema.else) {
      errors.push(...validate(instance, schema.else, rootSchema, instancePath, `${schemaPath}/else`));
    }
  }

  return errors;
}

export function lintSchema(schema) {
  const errors = [];
  const refs = [];
  const ids = [];

  function visit(value, path = "#") {
    if (value === null || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}/${index}`));
      return;
    }
    if (value.$id) ids.push({ path, id: value.$id });
    if (value.$ref) refs.push({ path, ref: value.$ref });
    if (value.required && new Set(value.required).size !== value.required.length) {
      errors.push({ path: `${path}/required`, error: "DUPLICATE_REQUIRED_PROPERTY" });
    }
    if (value.oneOf && value.oneOf.length < 2) {
      errors.push({ path: `${path}/oneOf`, error: "ONE_OF_REQUIRES_AT_LEAST_TWO_BRANCHES" });
    }
    for (const [key, child] of Object.entries(value)) visit(child, `${path}/${key}`);
  }

  visit(schema);
  for (const { path, ref } of refs) {
    try {
      resolveLocalRef(schema, ref);
    } catch (error) {
      errors.push({ path, error: "UNRESOLVED_LOCAL_REF", ref, detail: error.message });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    local_ref_count: refs.length,
    schema_ids: ids,
  };
}
