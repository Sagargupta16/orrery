#!/usr/bin/env node
// orrery 0.6.1 (MIT). Generated from src/ by scripts/build.mjs; do not edit.
// Bundles yaml (ISC, Eemeli Aro). ELK (EPL-2.0) and resvg (MPL-2.0) load from ./vendor.
import { createRequire as __sdwRequire } from "node:module";
const require = __sdwRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/identity.js
var require_identity = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/identity.js"(exports) {
    "use strict";
    var ALIAS = /* @__PURE__ */ Symbol.for("yaml.alias");
    var DOC = /* @__PURE__ */ Symbol.for("yaml.document");
    var MAP = /* @__PURE__ */ Symbol.for("yaml.map");
    var PAIR = /* @__PURE__ */ Symbol.for("yaml.pair");
    var SCALAR = /* @__PURE__ */ Symbol.for("yaml.scalar");
    var SEQ = /* @__PURE__ */ Symbol.for("yaml.seq");
    var NODE_TYPE = /* @__PURE__ */ Symbol.for("yaml.node.type");
    var isAlias = (node3) => !!node3 && typeof node3 === "object" && node3[NODE_TYPE] === ALIAS;
    var isDocument = (node3) => !!node3 && typeof node3 === "object" && node3[NODE_TYPE] === DOC;
    var isMap = (node3) => !!node3 && typeof node3 === "object" && node3[NODE_TYPE] === MAP;
    var isPair = (node3) => !!node3 && typeof node3 === "object" && node3[NODE_TYPE] === PAIR;
    var isScalar = (node3) => !!node3 && typeof node3 === "object" && node3[NODE_TYPE] === SCALAR;
    var isSeq = (node3) => !!node3 && typeof node3 === "object" && node3[NODE_TYPE] === SEQ;
    function isCollection(node3) {
      if (node3 && typeof node3 === "object")
        switch (node3[NODE_TYPE]) {
          case MAP:
          case SEQ:
            return true;
        }
      return false;
    }
    function isNode(node3) {
      if (node3 && typeof node3 === "object")
        switch (node3[NODE_TYPE]) {
          case ALIAS:
          case MAP:
          case SCALAR:
          case SEQ:
            return true;
        }
      return false;
    }
    var hasAnchor = (node3) => (isScalar(node3) || isCollection(node3)) && !!node3.anchor;
    exports.ALIAS = ALIAS;
    exports.DOC = DOC;
    exports.MAP = MAP;
    exports.NODE_TYPE = NODE_TYPE;
    exports.PAIR = PAIR;
    exports.SCALAR = SCALAR;
    exports.SEQ = SEQ;
    exports.hasAnchor = hasAnchor;
    exports.isAlias = isAlias;
    exports.isCollection = isCollection;
    exports.isDocument = isDocument;
    exports.isMap = isMap;
    exports.isNode = isNode;
    exports.isPair = isPair;
    exports.isScalar = isScalar;
    exports.isSeq = isSeq;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/visit.js
var require_visit = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/visit.js"(exports) {
    "use strict";
    var identity = require_identity();
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove node");
    function visit(node3, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node3)) {
        const cd = visit_(null, node3.contents, visitor_, Object.freeze([node3]));
        if (cd === REMOVE)
          node3.contents = null;
      } else
        visit_(null, node3, visitor_, Object.freeze([]));
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    function visit_(key, node3, visitor, path) {
      const ctrl = callVisitor(key, node3, visitor, path);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path, ctrl);
        return visit_(key, ctrl, visitor, path);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node3)) {
          path = Object.freeze(path.concat(node3));
          for (let i = 0; i < node3.items.length; ++i) {
            const ci = visit_(i, node3.items[i], visitor, path);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node3.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node3)) {
          path = Object.freeze(path.concat(node3));
          const ck = visit_("key", node3.key, visitor, path);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node3.key = null;
          const cv = visit_("value", node3.value, visitor, path);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node3.value = null;
        }
      }
      return ctrl;
    }
    async function visitAsync(node3, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node3)) {
        const cd = await visitAsync_(null, node3.contents, visitor_, Object.freeze([node3]));
        if (cd === REMOVE)
          node3.contents = null;
      } else
        await visitAsync_(null, node3, visitor_, Object.freeze([]));
    }
    visitAsync.BREAK = BREAK;
    visitAsync.SKIP = SKIP;
    visitAsync.REMOVE = REMOVE;
    async function visitAsync_(key, node3, visitor, path) {
      const ctrl = await callVisitor(key, node3, visitor, path);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path, ctrl);
        return visitAsync_(key, ctrl, visitor, path);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node3)) {
          path = Object.freeze(path.concat(node3));
          for (let i = 0; i < node3.items.length; ++i) {
            const ci = await visitAsync_(i, node3.items[i], visitor, path);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node3.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node3)) {
          path = Object.freeze(path.concat(node3));
          const ck = await visitAsync_("key", node3.key, visitor, path);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node3.key = null;
          const cv = await visitAsync_("value", node3.value, visitor, path);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node3.value = null;
        }
      }
      return ctrl;
    }
    function initVisitor(visitor) {
      if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) {
        return Object.assign({
          Alias: visitor.Node,
          Map: visitor.Node,
          Scalar: visitor.Node,
          Seq: visitor.Node
        }, visitor.Value && {
          Map: visitor.Value,
          Scalar: visitor.Value,
          Seq: visitor.Value
        }, visitor.Collection && {
          Map: visitor.Collection,
          Seq: visitor.Collection
        }, visitor);
      }
      return visitor;
    }
    function callVisitor(key, node3, visitor, path) {
      if (typeof visitor === "function")
        return visitor(key, node3, path);
      if (identity.isMap(node3))
        return visitor.Map?.(key, node3, path);
      if (identity.isSeq(node3))
        return visitor.Seq?.(key, node3, path);
      if (identity.isPair(node3))
        return visitor.Pair?.(key, node3, path);
      if (identity.isScalar(node3))
        return visitor.Scalar?.(key, node3, path);
      if (identity.isAlias(node3))
        return visitor.Alias?.(key, node3, path);
      return void 0;
    }
    function replaceNode(key, path, node3) {
      const parent = path[path.length - 1];
      if (identity.isCollection(parent)) {
        parent.items[key] = node3;
      } else if (identity.isPair(parent)) {
        if (key === "key")
          parent.key = node3;
        else
          parent.value = node3;
      } else if (identity.isDocument(parent)) {
        parent.contents = node3;
      } else {
        const pt = identity.isAlias(parent) ? "alias" : "scalar";
        throw new Error(`Cannot replace node with ${pt} parent`);
      }
    }
    exports.visit = visit;
    exports.visitAsync = visitAsync;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/doc/directives.js
var require_directives = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/doc/directives.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    var escapeChars = {
      "!": "%21",
      ",": "%2C",
      "[": "%5B",
      "]": "%5D",
      "{": "%7B",
      "}": "%7D"
    };
    var escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);
    var Directives = class _Directives {
      constructor(yaml, tags) {
        this.docStart = null;
        this.docEnd = false;
        this.yaml = Object.assign({}, _Directives.defaultYaml, yaml);
        this.tags = Object.assign({}, _Directives.defaultTags, tags);
      }
      clone() {
        const copy = new _Directives(this.yaml, this.tags);
        copy.docStart = this.docStart;
        return copy;
      }
      /**
       * During parsing, get a Directives instance for the current document and
       * update the stream state according to the current version's spec.
       */
      atDocument() {
        const res = new _Directives(this.yaml, this.tags);
        switch (this.yaml.version) {
          case "1.1":
            this.atNextDocument = true;
            break;
          case "1.2":
            this.atNextDocument = false;
            this.yaml = {
              explicit: _Directives.defaultYaml.explicit,
              version: "1.2"
            };
            this.tags = Object.assign({}, _Directives.defaultTags);
            break;
        }
        return res;
      }
      /**
       * @param onError - May be called even if the action was successful
       * @returns `true` on success
       */
      add(line, onError) {
        if (this.atNextDocument) {
          this.yaml = { explicit: _Directives.defaultYaml.explicit, version: "1.1" };
          this.tags = Object.assign({}, _Directives.defaultTags);
          this.atNextDocument = false;
        }
        const parts = line.trim().split(/[ \t]+/);
        const name = parts.shift();
        switch (name) {
          case "%TAG": {
            if (parts.length !== 2) {
              onError(0, "%TAG directive should contain exactly two parts");
              if (parts.length < 2)
                return false;
            }
            const [handle, prefix] = parts;
            this.tags[handle] = prefix;
            return true;
          }
          case "%YAML": {
            this.yaml.explicit = true;
            if (parts.length !== 1) {
              onError(0, "%YAML directive should contain exactly one part");
              return false;
            }
            const [version] = parts;
            if (version === "1.1" || version === "1.2") {
              this.yaml.version = version;
              return true;
            } else {
              const isValid = /^\d+\.\d+$/.test(version);
              onError(6, `Unsupported YAML version ${version}`, isValid);
              return false;
            }
          }
          default:
            onError(0, `Unknown directive ${name}`, true);
            return false;
        }
      }
      /**
       * Resolves a tag, matching handles to those defined in %TAG directives.
       *
       * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
       *   `'!local'` tag, or `null` if unresolvable.
       */
      tagName(source, onError) {
        if (source === "!")
          return "!";
        if (source[0] !== "!") {
          onError(`Not a valid tag: ${source}`);
          return null;
        }
        if (source[1] === "<") {
          const verbatim = source.slice(2, -1);
          if (verbatim === "!" || verbatim === "!!") {
            onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
            return null;
          }
          if (source[source.length - 1] !== ">")
            onError("Verbatim tags must end with a >");
          return verbatim;
        }
        const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
        if (!suffix)
          onError(`The ${source} tag has no suffix`);
        const prefix = this.tags[handle];
        if (prefix) {
          try {
            return prefix + decodeURIComponent(suffix);
          } catch (error) {
            onError(String(error));
            return null;
          }
        }
        if (handle === "!")
          return source;
        onError(`Could not resolve tag: ${source}`);
        return null;
      }
      /**
       * Given a fully resolved tag, returns its printable string form,
       * taking into account current tag prefixes and defaults.
       */
      tagString(tag) {
        for (const [handle, prefix] of Object.entries(this.tags)) {
          if (tag.startsWith(prefix))
            return handle + escapeTagName(tag.substring(prefix.length));
        }
        return tag[0] === "!" ? tag : `!<${tag}>`;
      }
      toString(doc) {
        const lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
        const tagEntries = Object.entries(this.tags);
        let tagNames;
        if (doc && tagEntries.length > 0 && identity.isNode(doc.contents)) {
          const tags = {};
          visit.visit(doc.contents, (_key, node3) => {
            if (identity.isNode(node3) && node3.tag)
              tags[node3.tag] = true;
          });
          tagNames = Object.keys(tags);
        } else
          tagNames = [];
        for (const [handle, prefix] of tagEntries) {
          if (handle === "!!" && prefix === "tag:yaml.org,2002:")
            continue;
          if (!doc || tagNames.some((tn) => tn.startsWith(prefix)))
            lines.push(`%TAG ${handle} ${prefix}`);
        }
        return lines.join("\n");
      }
    };
    Directives.defaultYaml = { explicit: false, version: "1.2" };
    Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };
    exports.Directives = Directives;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/doc/anchors.js
var require_anchors = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/doc/anchors.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    function anchorIsValid(anchor2) {
      if (/[\x00-\x19\s,[\]{}]/.test(anchor2)) {
        const sa = JSON.stringify(anchor2);
        const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
        throw new Error(msg);
      }
      return true;
    }
    function anchorNames(root) {
      const anchors = /* @__PURE__ */ new Set();
      visit.visit(root, {
        Value(_key, node3) {
          if (node3.anchor)
            anchors.add(node3.anchor);
        }
      });
      return anchors;
    }
    function findNewAnchor(prefix, exclude) {
      for (let i = 1; true; ++i) {
        const name = `${prefix}${i}`;
        if (!exclude.has(name))
          return name;
      }
    }
    function createNodeAnchors(doc, prefix) {
      const aliasObjects = [];
      const sourceObjects = /* @__PURE__ */ new Map();
      let prevAnchors = null;
      return {
        onAnchor: (source) => {
          aliasObjects.push(source);
          prevAnchors ?? (prevAnchors = anchorNames(doc));
          const anchor2 = findNewAnchor(prefix, prevAnchors);
          prevAnchors.add(anchor2);
          return anchor2;
        },
        /**
         * With circular references, the source node is only resolved after all
         * of its child nodes are. This is why anchors are set only after all of
         * the nodes have been created.
         */
        setAnchors: () => {
          for (const source of aliasObjects) {
            const ref = sourceObjects.get(source);
            if (typeof ref === "object" && ref.anchor && (identity.isScalar(ref.node) || identity.isCollection(ref.node))) {
              ref.node.anchor = ref.anchor;
            } else {
              const error = new Error("Failed to resolve repeated object (this should not happen)");
              error.source = source;
              throw error;
            }
          }
        },
        sourceObjects
      };
    }
    exports.anchorIsValid = anchorIsValid;
    exports.anchorNames = anchorNames;
    exports.createNodeAnchors = createNodeAnchors;
    exports.findNewAnchor = findNewAnchor;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/doc/applyReviver.js
var require_applyReviver = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/doc/applyReviver.js"(exports) {
    "use strict";
    function applyReviver(reviver, obj, key, val) {
      if (val && typeof val === "object") {
        if (Array.isArray(val)) {
          for (let i = 0, len = val.length; i < len; ++i) {
            const v0 = val[i];
            const v1 = applyReviver(reviver, val, String(i), v0);
            if (v1 === void 0)
              delete val[i];
            else if (v1 !== v0)
              val[i] = v1;
          }
        } else if (val instanceof Map) {
          for (const k of Array.from(val.keys())) {
            const v0 = val.get(k);
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              val.delete(k);
            else if (v1 !== v0)
              val.set(k, v1);
          }
        } else if (val instanceof Set) {
          for (const v0 of Array.from(val)) {
            const v1 = applyReviver(reviver, val, v0, v0);
            if (v1 === void 0)
              val.delete(v0);
            else if (v1 !== v0) {
              val.delete(v0);
              val.add(v1);
            }
          }
        } else {
          for (const [k, v0] of Object.entries(val)) {
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              delete val[k];
            else if (v1 !== v0)
              val[k] = v1;
          }
        }
      }
      return reviver.call(obj, key, val);
    }
    exports.applyReviver = applyReviver;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/toJS.js
var require_toJS = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/toJS.js"(exports) {
    "use strict";
    var identity = require_identity();
    function toJS(value, arg, ctx) {
      if (Array.isArray(value))
        return value.map((v, i) => toJS(v, String(i), ctx));
      if (value && typeof value.toJSON === "function") {
        if (!ctx || !identity.hasAnchor(value))
          return value.toJSON(arg, ctx);
        const data = { aliasCount: 0, count: 1, res: void 0 };
        ctx.anchors.set(value, data);
        ctx.onCreate = (res2) => {
          data.res = res2;
          delete ctx.onCreate;
        };
        const res = value.toJSON(arg, ctx);
        if (ctx.onCreate)
          ctx.onCreate(res);
        return res;
      }
      if (typeof value === "bigint" && !ctx?.keep)
        return Number(value);
      return value;
    }
    exports.toJS = toJS;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Node.js
var require_Node = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Node.js"(exports) {
    "use strict";
    var applyReviver = require_applyReviver();
    var identity = require_identity();
    var toJS = require_toJS();
    var NodeBase = class {
      constructor(type) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: type });
      }
      /** Create a copy of this node.  */
      clone() {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** A plain JavaScript representation of this node. */
      toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        if (!identity.isDocument(doc))
          throw new TypeError("A document argument is required");
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc,
          keep: true,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this, "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
    };
    exports.NodeBase = NodeBase;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Alias.js
var require_Alias = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Alias.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var visit = require_visit();
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var Alias = class extends Node.NodeBase {
      constructor(source) {
        super(identity.ALIAS);
        this.source = source;
        Object.defineProperty(this, "tag", {
          set() {
            throw new Error("Alias nodes cannot have tags");
          }
        });
      }
      /**
       * Resolve the value of this alias within `doc`, finding the last
       * instance of the `source` anchor before this node.
       */
      resolve(doc, ctx) {
        if (ctx?.maxAliasCount === 0)
          throw new ReferenceError("Alias resolution is disabled");
        let nodes;
        if (ctx?.aliasResolveCache) {
          nodes = ctx.aliasResolveCache;
        } else {
          nodes = [];
          visit.visit(doc, {
            Node: (_key, node3) => {
              if (identity.isAlias(node3) || identity.hasAnchor(node3))
                nodes.push(node3);
            }
          });
          if (ctx)
            ctx.aliasResolveCache = nodes;
        }
        let found = void 0;
        for (const node3 of nodes) {
          if (node3 === this)
            break;
          if (node3.anchor === this.source)
            found = node3;
        }
        if (found && ctx) {
          const { anchors: anchors2, doc: doc2, maxAliasCount } = ctx;
          let data = anchors2.get(found);
          if (!data) {
            toJS.toJS(found, null, ctx);
            data = anchors2.get(found);
          }
          if (data?.res === void 0) {
            const msg = "This should not happen: Alias anchor was not resolved?";
            throw new ReferenceError(msg);
          }
          if (maxAliasCount >= 0) {
            data.count += 1;
            if (data.aliasCount === 0)
              data.aliasCount = getAliasCount(doc2, found, anchors2);
            if (data.count * data.aliasCount > maxAliasCount) {
              const msg = "Excessive alias count indicates a resource exhaustion attack";
              throw new ReferenceError(msg);
            }
          }
        }
        return found;
      }
      toJSON(_arg, ctx) {
        if (!ctx)
          return { source: this.source };
        const source = this.resolve(ctx.doc, ctx);
        if (!source) {
          const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
          throw new ReferenceError(msg);
        }
        return ctx.anchors.get(source).res;
      }
      toString(ctx, _onComment, _onChompKeep) {
        const src = `*${this.source}`;
        if (ctx) {
          anchors.anchorIsValid(this.source);
          if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
            const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
            throw new Error(msg);
          }
          if (ctx.implicitKey)
            return `${src} `;
        }
        return src;
      }
    };
    function getAliasCount(doc, node3, anchors2) {
      if (identity.isAlias(node3)) {
        const source = node3.resolve(doc);
        const anchor2 = anchors2 && source && anchors2.get(source);
        return anchor2 ? anchor2.count * anchor2.aliasCount : 0;
      } else if (identity.isCollection(node3)) {
        let count = 0;
        for (const item of node3.items) {
          const c = getAliasCount(doc, item, anchors2);
          if (c > count)
            count = c;
        }
        return count;
      } else if (identity.isPair(node3)) {
        const kc = getAliasCount(doc, node3.key, anchors2);
        const vc = getAliasCount(doc, node3.value, anchors2);
        return Math.max(kc, vc);
      }
      return 1;
    }
    exports.Alias = Alias;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Scalar.js
var require_Scalar = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";
    var Scalar = class extends Node.NodeBase {
      constructor(value) {
        super(identity.SCALAR);
        this.value = value;
      }
      toJSON(arg, ctx) {
        return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
      }
      toString() {
        return String(this.value);
      }
    };
    Scalar.BLOCK_FOLDED = "BLOCK_FOLDED";
    Scalar.BLOCK_LITERAL = "BLOCK_LITERAL";
    Scalar.PLAIN = "PLAIN";
    Scalar.QUOTE_DOUBLE = "QUOTE_DOUBLE";
    Scalar.QUOTE_SINGLE = "QUOTE_SINGLE";
    exports.Scalar = Scalar;
    exports.isScalarValue = isScalarValue;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/doc/createNode.js
var require_createNode = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/doc/createNode.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var defaultTagPrefix = "tag:yaml.org,2002:";
    function findTagObject(value, tagName, tags) {
      if (tagName) {
        const match = tags.filter((t) => t.tag === tagName);
        const tagObj = match.find((t) => !t.format) ?? match[0];
        if (!tagObj)
          throw new Error(`Tag ${tagName} not found`);
        return tagObj;
      }
      return tags.find((t) => t.identify?.(value) && !t.format);
    }
    function createNode(value, tagName, ctx) {
      if (identity.isDocument(value))
        value = value.contents;
      if (identity.isNode(value))
        return value;
      if (identity.isPair(value)) {
        const map = ctx.schema[identity.MAP].createNode?.(ctx.schema, null, ctx);
        map.items.push(value);
        return map;
      }
      if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) {
        value = value.valueOf();
      }
      const { aliasDuplicateObjects, onAnchor, onTagObj, schema, sourceObjects } = ctx;
      let ref = void 0;
      if (aliasDuplicateObjects && value && typeof value === "object") {
        ref = sourceObjects.get(value);
        if (ref) {
          ref.anchor ?? (ref.anchor = onAnchor(value));
          return new Alias.Alias(ref.anchor);
        } else {
          ref = { anchor: null, node: null };
          sourceObjects.set(value, ref);
        }
      }
      if (tagName?.startsWith("!!"))
        tagName = defaultTagPrefix + tagName.slice(2);
      let tagObj = findTagObject(value, tagName, schema.tags);
      if (!tagObj) {
        if (value && typeof value.toJSON === "function") {
          value = value.toJSON();
        }
        if (!value || typeof value !== "object") {
          const node4 = new Scalar.Scalar(value);
          if (ref)
            ref.node = node4;
          return node4;
        }
        tagObj = value instanceof Map ? schema[identity.MAP] : Symbol.iterator in Object(value) ? schema[identity.SEQ] : schema[identity.MAP];
      }
      if (onTagObj) {
        onTagObj(tagObj);
        delete ctx.onTagObj;
      }
      const node3 = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar.Scalar(value);
      if (tagName)
        node3.tag = tagName;
      else if (!tagObj.default)
        node3.tag = tagObj.tag;
      if (ref)
        ref.node = node3;
      return node3;
    }
    exports.createNode = createNode;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Collection.js
var require_Collection = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Collection.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var identity = require_identity();
    var Node = require_Node();
    function collectionFromPath(schema, path, value) {
      let v = value;
      for (let i = path.length - 1; i >= 0; --i) {
        const k = path[i];
        if (typeof k === "number" && Number.isInteger(k) && k >= 0) {
          const a = [];
          a[k] = v;
          v = a;
        } else {
          v = /* @__PURE__ */ new Map([[k, v]]);
        }
      }
      return createNode.createNode(v, void 0, {
        aliasDuplicateObjects: false,
        keepUndefined: false,
        onAnchor: () => {
          throw new Error("This should not happen, please report a bug.");
        },
        schema,
        sourceObjects: /* @__PURE__ */ new Map()
      });
    }
    var isEmptyPath = (path) => path == null || typeof path === "object" && !!path[Symbol.iterator]().next().done;
    var Collection = class extends Node.NodeBase {
      constructor(type, schema) {
        super(type);
        Object.defineProperty(this, "schema", {
          value: schema,
          configurable: true,
          enumerable: false,
          writable: true
        });
      }
      /**
       * Create a copy of this collection.
       *
       * @param schema - If defined, overwrites the original's schema
       */
      clone(schema) {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (schema)
          copy.schema = schema;
        copy.items = copy.items.map((it) => identity.isNode(it) || identity.isPair(it) ? it.clone(schema) : it);
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /**
       * Adds a value to the collection. For `!!map` and `!!omap` the value must
       * be a Pair instance or a `{ key, value }` object, which may not have a key
       * that already exists in the map.
       */
      addIn(path, value) {
        if (isEmptyPath(path))
          this.add(value);
        else {
          const [key, ...rest] = path;
          const node3 = this.get(key, true);
          if (identity.isCollection(node3))
            node3.addIn(rest, value);
          else if (node3 === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
      /**
       * Removes a value from the collection.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path) {
        const [key, ...rest] = path;
        if (rest.length === 0)
          return this.delete(key);
        const node3 = this.get(key, true);
        if (identity.isCollection(node3))
          return node3.deleteIn(rest);
        else
          throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path, keepScalar) {
        const [key, ...rest] = path;
        const node3 = this.get(key, true);
        if (rest.length === 0)
          return !keepScalar && identity.isScalar(node3) ? node3.value : node3;
        else
          return identity.isCollection(node3) ? node3.getIn(rest, keepScalar) : void 0;
      }
      hasAllNullValues(allowScalar) {
        return this.items.every((node3) => {
          if (!identity.isPair(node3))
            return false;
          const n3 = node3.value;
          return n3 == null || allowScalar && identity.isScalar(n3) && n3.value == null && !n3.commentBefore && !n3.comment && !n3.tag;
        });
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       */
      hasIn(path) {
        const [key, ...rest] = path;
        if (rest.length === 0)
          return this.has(key);
        const node3 = this.get(key, true);
        return identity.isCollection(node3) ? node3.hasIn(rest) : false;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path, value) {
        const [key, ...rest] = path;
        if (rest.length === 0) {
          this.set(key, value);
        } else {
          const node3 = this.get(key, true);
          if (identity.isCollection(node3))
            node3.setIn(rest, value);
          else if (node3 === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
    };
    exports.Collection = Collection;
    exports.collectionFromPath = collectionFromPath;
    exports.isEmptyPath = isEmptyPath;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyComment.js
var require_stringifyComment = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyComment.js"(exports) {
    "use strict";
    var stringifyComment = (str) => str.replace(/^(?!$)(?: $)?/gm, "#");
    function indentComment(comment, indent) {
      if (/^\n+$/.test(comment))
        return comment.substring(1);
      return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
    }
    var lineComment = (str, indent, comment) => str.endsWith("\n") ? indentComment(comment, indent) : comment.includes("\n") ? "\n" + indentComment(comment, indent) : (str.endsWith(" ") ? "" : " ") + comment;
    exports.indentComment = indentComment;
    exports.lineComment = lineComment;
    exports.stringifyComment = stringifyComment;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/foldFlowLines.js
var require_foldFlowLines = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/foldFlowLines.js"(exports) {
    "use strict";
    var FOLD_FLOW = "flow";
    var FOLD_BLOCK = "block";
    var FOLD_QUOTED = "quoted";
    function foldFlowLines(text2, indent, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
      if (!lineWidth || lineWidth < 0)
        return text2;
      if (lineWidth < minContentWidth)
        minContentWidth = 0;
      const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
      if (text2.length <= endStep)
        return text2;
      const folds = [];
      const escapedFolds = {};
      let end = lineWidth - indent.length;
      if (typeof indentAtStart === "number") {
        if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
          folds.push(0);
        else
          end = lineWidth - indentAtStart;
      }
      let split = void 0;
      let prev = void 0;
      let overflow = false;
      let i = -1;
      let escStart = -1;
      let escEnd = -1;
      if (mode === FOLD_BLOCK) {
        i = consumeMoreIndentedLines(text2, i, indent.length);
        if (i !== -1)
          end = i + endStep;
      }
      for (let ch; ch = text2[i += 1]; ) {
        if (mode === FOLD_QUOTED && ch === "\\") {
          escStart = i;
          switch (text2[i + 1]) {
            case "x":
              i += 3;
              break;
            case "u":
              i += 5;
              break;
            case "U":
              i += 9;
              break;
            default:
              i += 1;
          }
          escEnd = i;
        }
        if (ch === "\n") {
          if (mode === FOLD_BLOCK)
            i = consumeMoreIndentedLines(text2, i, indent.length);
          end = i + indent.length + endStep;
          split = void 0;
        } else {
          if (ch === " " && prev && prev !== " " && prev !== "\n" && prev !== "	") {
            const next = text2[i + 1];
            if (next && next !== " " && next !== "\n" && next !== "	")
              split = i;
          }
          if (i >= end) {
            if (split) {
              folds.push(split);
              end = split + endStep;
              split = void 0;
            } else if (mode === FOLD_QUOTED) {
              while (prev === " " || prev === "	") {
                prev = ch;
                ch = text2[i += 1];
                overflow = true;
              }
              const j = i > escEnd + 1 ? i - 2 : escStart - 1;
              if (escapedFolds[j])
                return text2;
              folds.push(j);
              escapedFolds[j] = true;
              end = j + endStep;
              split = void 0;
            } else {
              overflow = true;
            }
          }
        }
        prev = ch;
      }
      if (overflow && onOverflow)
        onOverflow();
      if (folds.length === 0)
        return text2;
      if (onFold)
        onFold();
      let res = text2.slice(0, folds[0]);
      for (let i2 = 0; i2 < folds.length; ++i2) {
        const fold = folds[i2];
        const end2 = folds[i2 + 1] || text2.length;
        if (fold === 0)
          res = `
${indent}${text2.slice(0, end2)}`;
        else {
          if (mode === FOLD_QUOTED && escapedFolds[fold])
            res += `${text2[fold]}\\`;
          res += `
${indent}${text2.slice(fold + 1, end2)}`;
        }
      }
      return res;
    }
    function consumeMoreIndentedLines(text2, i, indent) {
      let end = i;
      let start = i + 1;
      let ch = text2[start];
      while (ch === " " || ch === "	") {
        if (i < start + indent) {
          ch = text2[++i];
        } else {
          do {
            ch = text2[++i];
          } while (ch && ch !== "\n");
          end = i;
          start = i + 1;
          ch = text2[start];
        }
      }
      return end;
    }
    exports.FOLD_BLOCK = FOLD_BLOCK;
    exports.FOLD_FLOW = FOLD_FLOW;
    exports.FOLD_QUOTED = FOLD_QUOTED;
    exports.foldFlowLines = foldFlowLines;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyString.js
var require_stringifyString = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyString.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var foldFlowLines = require_foldFlowLines();
    var getFoldOptions = (ctx, isBlock) => ({
      indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
      lineWidth: ctx.options.lineWidth,
      minContentWidth: ctx.options.minContentWidth
    });
    var containsDocumentMarker = (str) => /^(%|---|\.\.\.)/m.test(str);
    function lineLengthOverLimit(str, lineWidth, indentLength) {
      if (!lineWidth || lineWidth < 0)
        return false;
      const limit = lineWidth - indentLength;
      const strLen = str.length;
      if (strLen <= limit)
        return false;
      for (let i = 0, start = 0; i < strLen; ++i) {
        if (str[i] === "\n") {
          if (i - start > limit)
            return true;
          start = i + 1;
          if (strLen - start <= limit)
            return false;
        }
      }
      return true;
    }
    function doubleQuotedString(value, ctx) {
      const json = JSON.stringify(value);
      if (ctx.options.doubleQuotedAsJSON)
        return json;
      const { implicitKey } = ctx;
      const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      let str = "";
      let start = 0;
      for (let i = 0, ch = json[i]; ch; ch = json[++i]) {
        if (ch === " " && json[i + 1] === "\\" && json[i + 2] === "n") {
          str += json.slice(start, i) + "\\ ";
          i += 1;
          start = i;
          ch = "\\";
        }
        if (ch === "\\")
          switch (json[i + 1]) {
            case "u":
              {
                str += json.slice(start, i);
                const code = json.substr(i + 2, 4);
                switch (code) {
                  case "0000":
                    str += "\\0";
                    break;
                  case "0007":
                    str += "\\a";
                    break;
                  case "000b":
                    str += "\\v";
                    break;
                  case "001b":
                    str += "\\e";
                    break;
                  case "0085":
                    str += "\\N";
                    break;
                  case "00a0":
                    str += "\\_";
                    break;
                  case "2028":
                    str += "\\L";
                    break;
                  case "2029":
                    str += "\\P";
                    break;
                  default:
                    if (code.substr(0, 2) === "00")
                      str += "\\x" + code.substr(2);
                    else
                      str += json.substr(i, 6);
                }
                i += 5;
                start = i + 1;
              }
              break;
            case "n":
              if (implicitKey || json[i + 2] === '"' || json.length < minMultiLineLength) {
                i += 1;
              } else {
                str += json.slice(start, i) + "\n\n";
                while (json[i + 2] === "\\" && json[i + 3] === "n" && json[i + 4] !== '"') {
                  str += "\n";
                  i += 2;
                }
                str += indent;
                if (json[i + 2] === " ")
                  str += "\\";
                i += 1;
                start = i + 1;
              }
              break;
            default:
              i += 1;
          }
      }
      str = start ? str + json.slice(start) : json;
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, false));
    }
    function singleQuotedString(value, ctx) {
      if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes("\n") || /[ \t]\n|\n[ \t]/.test(value))
        return doubleQuotedString(value, ctx);
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&
${indent}`) + "'";
      return ctx.implicitKey ? res : foldFlowLines.foldFlowLines(res, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function quotedString(value, ctx) {
      const { singleQuote } = ctx.options;
      let qs;
      if (singleQuote === false)
        qs = doubleQuotedString;
      else {
        const hasDouble = value.includes('"');
        const hasSingle = value.includes("'");
        if (hasDouble && !hasSingle)
          qs = singleQuotedString;
        else if (hasSingle && !hasDouble)
          qs = doubleQuotedString;
        else
          qs = singleQuote ? singleQuotedString : doubleQuotedString;
      }
      return qs(value, ctx);
    }
    var blockEndNewlines;
    try {
      blockEndNewlines = new RegExp("(^|(?<!\n))\n+(?!\n|$)", "g");
    } catch {
      blockEndNewlines = /\n+(?!\n|$)/g;
    }
    function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
      const { blockQuote, commentString, lineWidth } = ctx.options;
      if (!blockQuote || /\n[\t ]+$/.test(value)) {
        return quotedString(value, ctx);
      }
      const indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
      const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar.Scalar.BLOCK_FOLDED ? false : type === Scalar.Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent.length);
      if (!value)
        return literal ? "|\n" : ">\n";
      let chomp;
      let endStart;
      for (endStart = value.length; endStart > 0; --endStart) {
        const ch = value[endStart - 1];
        if (ch !== "\n" && ch !== "	" && ch !== " ")
          break;
      }
      let end = value.substring(endStart);
      const endNlPos = end.indexOf("\n");
      if (endNlPos === -1) {
        chomp = "-";
      } else if (value === end || endNlPos !== end.length - 1) {
        chomp = "+";
        if (onChompKeep)
          onChompKeep();
      } else {
        chomp = "";
      }
      if (end) {
        value = value.slice(0, -end.length);
        if (end[end.length - 1] === "\n")
          end = end.slice(0, -1);
        end = end.replace(blockEndNewlines, `$&${indent}`);
      }
      let startWithSpace = false;
      let startEnd;
      let startNlPos = -1;
      for (startEnd = 0; startEnd < value.length; ++startEnd) {
        const ch = value[startEnd];
        if (ch === " ")
          startWithSpace = true;
        else if (ch === "\n")
          startNlPos = startEnd;
        else
          break;
      }
      let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
      if (start) {
        value = value.substring(start.length);
        start = start.replace(/\n+/g, `$&${indent}`);
      }
      const indentSize = indent ? "2" : "1";
      let header = (startWithSpace ? indentSize : "") + chomp;
      if (comment) {
        header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
        if (onComment)
          onComment();
      }
      if (!literal) {
        const foldedValue = value.replace(/\n+/g, "\n$&").replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent}`);
        let literalFallback = false;
        const foldOptions = getFoldOptions(ctx, true);
        if (blockQuote !== "folded" && type !== Scalar.Scalar.BLOCK_FOLDED) {
          foldOptions.onOverflow = () => {
            literalFallback = true;
          };
        }
        const body = foldFlowLines.foldFlowLines(`${start}${foldedValue}${end}`, indent, foldFlowLines.FOLD_BLOCK, foldOptions);
        if (!literalFallback)
          return `>${header}
${indent}${body}`;
      }
      value = value.replace(/\n+/g, `$&${indent}`);
      return `|${header}
${indent}${start}${value}${end}`;
    }
    function plainString(item, ctx, onComment, onChompKeep) {
      const { type, value } = item;
      const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
      if (implicitKey && value.includes("\n") || inFlow && /[[\]{},]/.test(value)) {
        return quotedString(value, ctx);
      }
      if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
        return implicitKey || inFlow || !value.includes("\n") ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
      }
      if (!implicitKey && !inFlow && type !== Scalar.Scalar.PLAIN && value.includes("\n")) {
        return blockString(item, ctx, onComment, onChompKeep);
      }
      if (containsDocumentMarker(value)) {
        if (indent === "") {
          ctx.forceBlockIndent = true;
          return blockString(item, ctx, onComment, onChompKeep);
        } else if (implicitKey && indent === indentStep) {
          return quotedString(value, ctx);
        }
      }
      const str = value.replace(/\n+/g, `$&
${indent}`);
      if (actualString) {
        const test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str);
        const { compat, tags } = ctx.doc.schema;
        if (tags.some(test) || compat?.some(test))
          return quotedString(value, ctx);
      }
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function stringifyString(item, ctx, onComment, onChompKeep) {
      const { implicitKey, inFlow } = ctx;
      const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
      let { type } = item;
      if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
        if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
          type = Scalar.Scalar.QUOTE_DOUBLE;
      }
      const _stringify = (_type) => {
        switch (_type) {
          case Scalar.Scalar.BLOCK_FOLDED:
          case Scalar.Scalar.BLOCK_LITERAL:
            return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
          case Scalar.Scalar.QUOTE_DOUBLE:
            return doubleQuotedString(ss.value, ctx);
          case Scalar.Scalar.QUOTE_SINGLE:
            return singleQuotedString(ss.value, ctx);
          case Scalar.Scalar.PLAIN:
            return plainString(ss, ctx, onComment, onChompKeep);
          default:
            return null;
        }
      };
      let res = _stringify(type);
      if (res === null) {
        const { defaultKeyType, defaultStringType } = ctx.options;
        const t = implicitKey && defaultKeyType || defaultStringType;
        res = _stringify(t);
        if (res === null)
          throw new Error(`Unsupported default string type ${t}`);
      }
      return res;
    }
    exports.stringifyString = stringifyString;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringify.js
var require_stringify = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringify.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var identity = require_identity();
    var stringifyComment = require_stringifyComment();
    var stringifyString = require_stringifyString();
    function createStringifyContext(doc, options) {
      const opt = Object.assign({
        blockQuote: true,
        commentString: stringifyComment.stringifyComment,
        defaultKeyType: null,
        defaultStringType: "PLAIN",
        directives: null,
        doubleQuotedAsJSON: false,
        doubleQuotedMinMultiLineLength: 40,
        falseStr: "false",
        flowCollectionPadding: true,
        indentSeq: true,
        lineWidth: 80,
        minContentWidth: 20,
        nullStr: "null",
        simpleKeys: false,
        singleQuote: null,
        trailingComma: false,
        trueStr: "true",
        verifyAliasOrder: true
      }, doc.schema.toStringOptions, options);
      let inFlow;
      switch (opt.collectionStyle) {
        case "block":
          inFlow = false;
          break;
        case "flow":
          inFlow = true;
          break;
        default:
          inFlow = null;
      }
      return {
        anchors: /* @__PURE__ */ new Set(),
        doc,
        flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
        indent: "",
        indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
        inFlow,
        options: opt
      };
    }
    function getTagObject(tags, item) {
      if (item.tag) {
        const match = tags.filter((t) => t.tag === item.tag);
        if (match.length > 0)
          return match.find((t) => t.format === item.format) ?? match[0];
      }
      let tagObj = void 0;
      let obj;
      if (identity.isScalar(item)) {
        obj = item.value;
        let match = tags.filter((t) => t.identify?.(obj));
        if (match.length > 1) {
          const testMatch = match.filter((t) => t.test);
          if (testMatch.length > 0)
            match = testMatch;
        }
        tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
      } else {
        obj = item;
        tagObj = tags.find((t) => t.nodeClass && obj instanceof t.nodeClass);
      }
      if (!tagObj) {
        const name = obj?.constructor?.name ?? (obj === null ? "null" : typeof obj);
        throw new Error(`Tag not resolved for ${name} value`);
      }
      return tagObj;
    }
    function stringifyProps(node3, tagObj, { anchors: anchors$1, doc }) {
      if (!doc.directives)
        return "";
      const props = [];
      const anchor2 = (identity.isScalar(node3) || identity.isCollection(node3)) && node3.anchor;
      if (anchor2 && anchors.anchorIsValid(anchor2)) {
        anchors$1.add(anchor2);
        props.push(`&${anchor2}`);
      }
      const tag = node3.tag ?? (tagObj.default ? null : tagObj.tag);
      if (tag)
        props.push(doc.directives.tagString(tag));
      return props.join(" ");
    }
    function stringify2(item, ctx, onComment, onChompKeep) {
      if (identity.isPair(item))
        return item.toString(ctx, onComment, onChompKeep);
      if (identity.isAlias(item)) {
        if (ctx.doc.directives)
          return item.toString(ctx);
        if (ctx.resolvedAliases?.has(item)) {
          throw new TypeError(`Cannot stringify circular structure without alias nodes`);
        } else {
          if (ctx.resolvedAliases)
            ctx.resolvedAliases.add(item);
          else
            ctx.resolvedAliases = /* @__PURE__ */ new Set([item]);
          item = item.resolve(ctx.doc);
        }
      }
      let tagObj = void 0;
      const node3 = identity.isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
      tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node3));
      const props = stringifyProps(node3, tagObj, ctx);
      if (props.length > 0)
        ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
      const str = typeof tagObj.stringify === "function" ? tagObj.stringify(node3, ctx, onComment, onChompKeep) : identity.isScalar(node3) ? stringifyString.stringifyString(node3, ctx, onComment, onChompKeep) : node3.toString(ctx, onComment, onChompKeep);
      if (!props)
        return str;
      return identity.isScalar(node3) || str[0] === "{" || str[0] === "[" ? `${props} ${str}` : `${props}
${ctx.indent}${str}`;
    }
    exports.createStringifyContext = createStringifyContext;
    exports.stringify = stringify2;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyPair.js
var require_stringifyPair = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyPair.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var stringify2 = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyPair({ key, value }, ctx, onComment, onChompKeep) {
      const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
      let keyComment = identity.isNode(key) && key.comment || null;
      if (simpleKeys) {
        if (keyComment) {
          throw new Error("With simple keys, key nodes cannot have comments");
        }
        if (identity.isCollection(key) || !identity.isNode(key) && typeof key === "object") {
          const msg = "With simple keys, collection cannot be used as a key value";
          throw new Error(msg);
        }
      }
      let explicitKey = !simpleKeys && (!key || keyComment && value == null && !ctx.inFlow || identity.isCollection(key) || (identity.isScalar(key) ? key.type === Scalar.Scalar.BLOCK_FOLDED || key.type === Scalar.Scalar.BLOCK_LITERAL : typeof key === "object"));
      ctx = Object.assign({}, ctx, {
        allNullValues: false,
        implicitKey: !explicitKey && (simpleKeys || !allNullValues),
        indent: indent + indentStep
      });
      let keyCommentDone = false;
      let chompKeep = false;
      let str = stringify2.stringify(key, ctx, () => keyCommentDone = true, () => chompKeep = true);
      if (!explicitKey && !ctx.inFlow && str.length > 1024) {
        if (simpleKeys)
          throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
        explicitKey = true;
      }
      if (ctx.inFlow) {
        if (allNullValues || value == null) {
          if (keyCommentDone && onComment)
            onComment();
          return str === "" ? "?" : explicitKey ? `? ${str}` : str;
        }
      } else if (allNullValues && !simpleKeys || value == null && explicitKey) {
        str = `? ${str}`;
        if (keyComment && !keyCommentDone) {
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        } else if (chompKeep && onChompKeep)
          onChompKeep();
        return str;
      }
      if (keyCommentDone)
        keyComment = null;
      if (explicitKey) {
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        str = `? ${str}
${indent}:`;
      } else {
        str = `${str}:`;
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
      }
      let vsb, vcb, valueComment;
      if (identity.isNode(value)) {
        vsb = !!value.spaceBefore;
        vcb = value.commentBefore;
        valueComment = value.comment;
      } else {
        vsb = false;
        vcb = null;
        valueComment = null;
        if (value && typeof value === "object")
          value = doc.createNode(value);
      }
      ctx.implicitKey = false;
      if (!explicitKey && !keyComment && identity.isScalar(value))
        ctx.indentAtStart = str.length + 1;
      chompKeep = false;
      if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && identity.isSeq(value) && !value.flow && !value.tag && !value.anchor) {
        ctx.indent = ctx.indent.substring(2);
      }
      let valueCommentDone = false;
      const valueStr = stringify2.stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
      let ws = " ";
      if (keyComment || vsb || vcb) {
        ws = vsb ? "\n" : "";
        if (vcb) {
          const cs = commentString(vcb);
          ws += `
${stringifyComment.indentComment(cs, ctx.indent)}`;
        }
        if (valueStr === "" && !ctx.inFlow) {
          if (ws === "\n" && valueComment)
            ws = "\n\n";
        } else {
          ws += `
${ctx.indent}`;
        }
      } else if (!explicitKey && identity.isCollection(value)) {
        const vs0 = valueStr[0];
        const nl0 = valueStr.indexOf("\n");
        const hasNewline = nl0 !== -1;
        const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
        if (hasNewline || !flow) {
          let hasPropsLine = false;
          if (hasNewline && (vs0 === "&" || vs0 === "!")) {
            let sp0 = valueStr.indexOf(" ");
            if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") {
              sp0 = valueStr.indexOf(" ", sp0 + 1);
            }
            if (sp0 === -1 || nl0 < sp0)
              hasPropsLine = true;
          }
          if (!hasPropsLine)
            ws = `
${ctx.indent}`;
        }
      } else if (valueStr === "" || valueStr[0] === "\n") {
        ws = "";
      }
      str += ws + valueStr;
      if (ctx.inFlow) {
        if (valueCommentDone && onComment)
          onComment();
      } else if (valueComment && !valueCommentDone) {
        str += stringifyComment.lineComment(str, ctx.indent, commentString(valueComment));
      } else if (chompKeep && onChompKeep) {
        onChompKeep();
      }
      return str;
    }
    exports.stringifyPair = stringifyPair;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/log.js
var require_log = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/log.js"(exports) {
    "use strict";
    var node_process = __require("process");
    function debug(logLevel, ...messages) {
      if (logLevel === "debug")
        console.log(...messages);
    }
    function warn(logLevel, warning) {
      if (logLevel === "debug" || logLevel === "warn") {
        if (typeof node_process.emitWarning === "function")
          node_process.emitWarning(warning);
        else
          console.warn(warning);
      }
    }
    exports.debug = debug;
    exports.warn = warn;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/merge.js
var require_merge = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/merge.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var MERGE_KEY = "<<";
    var merge = {
      identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
      default: "key",
      tag: "tag:yaml.org,2002:merge",
      test: /^<<$/,
      resolve: () => Object.assign(new Scalar.Scalar(Symbol(MERGE_KEY)), {
        addToJSMap: addMergeToJSMap
      }),
      stringify: () => MERGE_KEY
    };
    var isMergeKey = (ctx, key) => (merge.identify(key) || identity.isScalar(key) && (!key.type || key.type === Scalar.Scalar.PLAIN) && merge.identify(key.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
    function addMergeToJSMap(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (identity.isSeq(source))
        for (const it of source.items)
          mergeValue(ctx, map, it);
      else if (Array.isArray(source))
        for (const it of source)
          mergeValue(ctx, map, it);
      else
        mergeValue(ctx, map, source);
    }
    function mergeValue(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (!identity.isMap(source))
        throw new Error("Merge sources must be maps or map aliases");
      const srcMap = source.toJSON(null, ctx, Map);
      for (const [key, value2] of srcMap) {
        if (map instanceof Map) {
          if (!map.has(key))
            map.set(key, value2);
        } else if (map instanceof Set) {
          map.add(key);
        } else if (!Object.prototype.hasOwnProperty.call(map, key)) {
          Object.defineProperty(map, key, {
            value: value2,
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      }
      return map;
    }
    function resolveAliasValue(ctx, value) {
      return ctx && identity.isAlias(value) ? value.resolve(ctx.doc, ctx) : value;
    }
    exports.addMergeToJSMap = addMergeToJSMap;
    exports.isMergeKey = isMergeKey;
    exports.merge = merge;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/addPairToJSMap.js
var require_addPairToJSMap = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/addPairToJSMap.js"(exports) {
    "use strict";
    var log = require_log();
    var merge = require_merge();
    var stringify2 = require_stringify();
    var identity = require_identity();
    var toJS = require_toJS();
    function addPairToJSMap(ctx, map, { key, value }) {
      if (identity.isNode(key) && key.addToJSMap)
        key.addToJSMap(ctx, map, value);
      else if (merge.isMergeKey(ctx, key))
        merge.addMergeToJSMap(ctx, map, value);
      else {
        const jsKey = toJS.toJS(key, "", ctx);
        if (map instanceof Map) {
          map.set(jsKey, toJS.toJS(value, jsKey, ctx));
        } else if (map instanceof Set) {
          map.add(jsKey);
        } else {
          const stringKey = stringifyKey(key, jsKey, ctx);
          const jsValue = toJS.toJS(value, stringKey, ctx);
          if (stringKey in map)
            Object.defineProperty(map, stringKey, {
              value: jsValue,
              writable: true,
              enumerable: true,
              configurable: true
            });
          else
            map[stringKey] = jsValue;
        }
      }
      return map;
    }
    function stringifyKey(key, jsKey, ctx) {
      if (jsKey === null)
        return "";
      if (typeof jsKey !== "object")
        return String(jsKey);
      if (identity.isNode(key) && ctx?.doc) {
        const strCtx = stringify2.createStringifyContext(ctx.doc, {});
        strCtx.anchors = /* @__PURE__ */ new Set();
        for (const node3 of ctx.anchors.keys())
          strCtx.anchors.add(node3.anchor);
        strCtx.inFlow = true;
        strCtx.inStringifyKey = true;
        const strKey = key.toString(strCtx);
        if (!ctx.mapKeyWarned) {
          let jsonStr = JSON.stringify(strKey);
          if (jsonStr.length > 40)
            jsonStr = jsonStr.substring(0, 36) + '..."';
          log.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
          ctx.mapKeyWarned = true;
        }
        return strKey;
      }
      return JSON.stringify(jsKey);
    }
    exports.addPairToJSMap = addPairToJSMap;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Pair.js
var require_Pair = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Pair.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyPair = require_stringifyPair();
    var addPairToJSMap = require_addPairToJSMap();
    var identity = require_identity();
    function createPair(key, value, ctx) {
      const k = createNode.createNode(key, void 0, ctx);
      const v = createNode.createNode(value, void 0, ctx);
      return new Pair(k, v);
    }
    var Pair = class _Pair {
      constructor(key, value = null) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.PAIR });
        this.key = key;
        this.value = value;
      }
      clone(schema) {
        let { key, value } = this;
        if (identity.isNode(key))
          key = key.clone(schema);
        if (identity.isNode(value))
          value = value.clone(schema);
        return new _Pair(key, value);
      }
      toJSON(_, ctx) {
        const pair = ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        return addPairToJSMap.addPairToJSMap(ctx, pair, this);
      }
      toString(ctx, onComment, onChompKeep) {
        return ctx?.doc ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
      }
    };
    exports.Pair = Pair;
    exports.createPair = createPair;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyCollection.js
var require_stringifyCollection = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyCollection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify2 = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyCollection(collection, ctx, options) {
      const flow = ctx.inFlow ?? collection.flow;
      const stringify3 = flow ? stringifyFlowCollection : stringifyBlockCollection;
      return stringify3(collection, ctx, options);
    }
    function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
      const { indent, options: { commentString } } = ctx;
      const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
      let chompKeep = false;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment2 = null;
        if (identity.isNode(item)) {
          if (!chompKeep && item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
          if (item.comment)
            comment2 = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (!chompKeep && ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
          }
        }
        chompKeep = false;
        let str2 = stringify2.stringify(item, itemCtx, () => comment2 = null, () => chompKeep = true);
        if (comment2)
          str2 += stringifyComment.lineComment(str2, itemIndent, commentString(comment2));
        if (chompKeep && comment2)
          chompKeep = false;
        lines.push(blockItemPrefix + str2);
      }
      let str;
      if (lines.length === 0) {
        str = flowChars.start + flowChars.end;
      } else {
        str = lines[0];
        for (let i = 1; i < lines.length; ++i) {
          const line = lines[i];
          str += line ? `
${indent}${line}` : "\n";
        }
      }
      if (comment) {
        str += "\n" + stringifyComment.indentComment(commentString(comment), indent);
        if (onComment)
          onComment();
      } else if (chompKeep && onChompKeep)
        onChompKeep();
      return str;
    }
    function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
      const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
      itemIndent += indentStep;
      const itemCtx = Object.assign({}, ctx, {
        indent: itemIndent,
        inFlow: true,
        type: null
      });
      let reqNewline = false;
      let linesAtValue = 0;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment = null;
        if (identity.isNode(item)) {
          if (item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, false);
          if (item.comment)
            comment = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, false);
            if (ik.comment)
              reqNewline = true;
          }
          const iv = identity.isNode(item.value) ? item.value : null;
          if (iv) {
            if (iv.comment)
              comment = iv.comment;
            if (iv.commentBefore)
              reqNewline = true;
          } else if (item.value == null && ik?.comment) {
            comment = ik.comment;
          }
        }
        if (comment)
          reqNewline = true;
        let str = stringify2.stringify(item, itemCtx, () => comment = null);
        reqNewline || (reqNewline = lines.length > linesAtValue || str.includes("\n"));
        if (i < items.length - 1) {
          str += ",";
        } else if (ctx.options.trailingComma) {
          if (ctx.options.lineWidth > 0) {
            reqNewline || (reqNewline = lines.reduce((sum, line) => sum + line.length + 2, 2) + (str.length + 2) > ctx.options.lineWidth);
          }
          if (reqNewline) {
            str += ",";
          }
        }
        if (comment)
          str += stringifyComment.lineComment(str, itemIndent, commentString(comment));
        lines.push(str);
        linesAtValue = lines.length;
      }
      const { start, end } = flowChars;
      if (lines.length === 0) {
        return start + end;
      } else {
        if (!reqNewline) {
          const len = lines.reduce((sum, line) => sum + line.length + 2, 2);
          reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
        }
        if (reqNewline) {
          let str = start;
          for (const line of lines)
            str += line ? `
${indentStep}${indent}${line}` : "\n";
          return `${str}
${indent}${end}`;
        } else {
          return `${start}${fcPadding}${lines.join(" ")}${fcPadding}${end}`;
        }
      }
    }
    function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
      if (comment && chompKeep)
        comment = comment.replace(/^\n+/, "");
      if (comment) {
        const ic = stringifyComment.indentComment(commentString(comment), indent);
        lines.push(ic.trimStart());
      }
    }
    exports.stringifyCollection = stringifyCollection;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/YAMLMap.js
var require_YAMLMap = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/YAMLMap.js"(exports) {
    "use strict";
    var stringifyCollection = require_stringifyCollection();
    var addPairToJSMap = require_addPairToJSMap();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    function findPair(items, key) {
      const k = identity.isScalar(key) ? key.value : key;
      for (const it of items) {
        if (identity.isPair(it)) {
          if (it.key === key || it.key === k)
            return it;
          if (identity.isScalar(it.key) && it.key.value === k)
            return it;
        }
      }
      return void 0;
    }
    var YAMLMap = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:map";
      }
      constructor(schema) {
        super(identity.MAP, schema);
        this.items = [];
      }
      /**
       * A generic collection parsing method that can be extended
       * to other node classes that inherit from YAMLMap
       */
      static from(schema, obj, ctx) {
        const { keepUndefined, replacer } = ctx;
        const map = new this(schema);
        const add = (key, value) => {
          if (typeof replacer === "function")
            value = replacer.call(obj, key, value);
          else if (Array.isArray(replacer) && !replacer.includes(key))
            return;
          if (value !== void 0 || keepUndefined)
            map.items.push(Pair.createPair(key, value, ctx));
        };
        if (obj instanceof Map) {
          for (const [key, value] of obj)
            add(key, value);
        } else if (obj && typeof obj === "object") {
          for (const key of Object.keys(obj))
            add(key, obj[key]);
        }
        if (typeof schema.sortMapEntries === "function") {
          map.items.sort(schema.sortMapEntries);
        }
        return map;
      }
      /**
       * Adds a value to the collection.
       *
       * @param overwrite - If not set `true`, using a key that is already in the
       *   collection will throw. Otherwise, overwrites the previous value.
       */
      add(pair, overwrite) {
        let _pair;
        if (identity.isPair(pair))
          _pair = pair;
        else if (!pair || typeof pair !== "object" || !("key" in pair)) {
          _pair = new Pair.Pair(pair, pair?.value);
        } else
          _pair = new Pair.Pair(pair.key, pair.value);
        const prev = findPair(this.items, _pair.key);
        const sortEntries = this.schema?.sortMapEntries;
        if (prev) {
          if (!overwrite)
            throw new Error(`Key ${_pair.key} already set`);
          if (identity.isScalar(prev.value) && Scalar.isScalarValue(_pair.value))
            prev.value.value = _pair.value;
          else
            prev.value = _pair.value;
        } else if (sortEntries) {
          const i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
          if (i === -1)
            this.items.push(_pair);
          else
            this.items.splice(i, 0, _pair);
        } else {
          this.items.push(_pair);
        }
      }
      delete(key) {
        const it = findPair(this.items, key);
        if (!it)
          return false;
        const del = this.items.splice(this.items.indexOf(it), 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const it = findPair(this.items, key);
        const node3 = it?.value;
        return (!keepScalar && identity.isScalar(node3) ? node3.value : node3) ?? void 0;
      }
      has(key) {
        return !!findPair(this.items, key);
      }
      set(key, value) {
        this.add(new Pair.Pair(key, value), true);
      }
      /**
       * @param ctx - Conversion context, originally set in Document#toJS()
       * @param {Class} Type - If set, forces the returned collection type
       * @returns Instance of Type, Map, or Object
       */
      toJSON(_, ctx, Type) {
        const map = Type ? new Type() : ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const item of this.items)
          addPairToJSMap.addPairToJSMap(ctx, map, item);
        return map;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        for (const item of this.items) {
          if (!identity.isPair(item))
            throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
        }
        if (!ctx.allNullValues && this.hasAllNullValues(false))
          ctx = Object.assign({}, ctx, { allNullValues: true });
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "",
          flowChars: { start: "{", end: "}" },
          itemIndent: ctx.indent || "",
          onChompKeep,
          onComment
        });
      }
    };
    exports.YAMLMap = YAMLMap;
    exports.findPair = findPair;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/common/map.js
var require_map = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/common/map.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLMap = require_YAMLMap();
    var map = {
      collection: "map",
      default: true,
      nodeClass: YAMLMap.YAMLMap,
      tag: "tag:yaml.org,2002:map",
      resolve(map2, onError) {
        if (!identity.isMap(map2))
          onError("Expected a mapping for this tag");
        return map2;
      },
      createNode: (schema, obj, ctx) => YAMLMap.YAMLMap.from(schema, obj, ctx)
    };
    exports.map = map;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/YAMLSeq.js
var require_YAMLSeq = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/YAMLSeq.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyCollection = require_stringifyCollection();
    var Collection = require_Collection();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var toJS = require_toJS();
    var YAMLSeq = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:seq";
      }
      constructor(schema) {
        super(identity.SEQ, schema);
        this.items = [];
      }
      add(value) {
        this.items.push(value);
      }
      /**
       * Removes a value from the collection.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       *
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return false;
        const del = this.items.splice(idx, 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return void 0;
        const it = this.items[idx];
        return !keepScalar && identity.isScalar(it) ? it.value : it;
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       */
      has(key) {
        const idx = asItemIndex(key);
        return typeof idx === "number" && idx < this.items.length;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       *
       * If `key` does not contain a representation of an integer, this will throw.
       * It may be wrapped in a `Scalar`.
       */
      set(key, value) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          throw new Error(`Expected a valid index, not ${key}.`);
        const prev = this.items[idx];
        if (identity.isScalar(prev) && Scalar.isScalarValue(value))
          prev.value = value;
        else
          this.items[idx] = value;
      }
      toJSON(_, ctx) {
        const seq = [];
        if (ctx?.onCreate)
          ctx.onCreate(seq);
        let i = 0;
        for (const item of this.items)
          seq.push(toJS.toJS(item, String(i++), ctx));
        return seq;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "- ",
          flowChars: { start: "[", end: "]" },
          itemIndent: (ctx.indent || "") + "  ",
          onChompKeep,
          onComment
        });
      }
      static from(schema, obj, ctx) {
        const { replacer } = ctx;
        const seq = new this(schema);
        if (obj && Symbol.iterator in Object(obj)) {
          let i = 0;
          for (let it of obj) {
            if (typeof replacer === "function") {
              const key = obj instanceof Set ? it : String(i++);
              it = replacer.call(obj, key, it);
            }
            seq.items.push(createNode.createNode(it, void 0, ctx));
          }
        }
        return seq;
      }
    };
    function asItemIndex(key) {
      let idx = identity.isScalar(key) ? key.value : key;
      if (idx && typeof idx === "string")
        idx = Number(idx);
      return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
    }
    exports.YAMLSeq = YAMLSeq;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/common/seq.js
var require_seq = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/common/seq.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLSeq = require_YAMLSeq();
    var seq = {
      collection: "seq",
      default: true,
      nodeClass: YAMLSeq.YAMLSeq,
      tag: "tag:yaml.org,2002:seq",
      resolve(seq2, onError) {
        if (!identity.isSeq(seq2))
          onError("Expected a sequence for this tag");
        return seq2;
      },
      createNode: (schema, obj, ctx) => YAMLSeq.YAMLSeq.from(schema, obj, ctx)
    };
    exports.seq = seq;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/common/string.js
var require_string = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/common/string.js"(exports) {
    "use strict";
    var stringifyString = require_stringifyString();
    var string = {
      identify: (value) => typeof value === "string",
      default: true,
      tag: "tag:yaml.org,2002:str",
      resolve: (str) => str,
      stringify(item, ctx, onComment, onChompKeep) {
        ctx = Object.assign({ actualString: true }, ctx);
        return stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
      }
    };
    exports.string = string;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/common/null.js
var require_null = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/common/null.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var nullTag = {
      identify: (value) => value == null,
      createNode: () => new Scalar.Scalar(null),
      default: true,
      tag: "tag:yaml.org,2002:null",
      test: /^(?:~|[Nn]ull|NULL)?$/,
      resolve: () => new Scalar.Scalar(null),
      stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
    };
    exports.nullTag = nullTag;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/core/bool.js
var require_bool = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/core/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var boolTag = {
      identify: (value) => typeof value === "boolean",
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
      resolve: (str) => new Scalar.Scalar(str[0] === "t" || str[0] === "T"),
      stringify({ source, value }, ctx) {
        if (source && boolTag.test.test(source)) {
          const sv = source[0] === "t" || source[0] === "T";
          if (value === sv)
            return source;
        }
        return value ? ctx.options.trueStr : ctx.options.falseStr;
      }
    };
    exports.boolTag = boolTag;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyNumber.js
var require_stringifyNumber = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyNumber.js"(exports) {
    "use strict";
    function stringifyNumber({ format, minFractionDigits, tag, value }) {
      if (typeof value === "bigint")
        return String(value);
      const num = typeof value === "number" ? value : Number(value);
      if (!isFinite(num))
        return isNaN(num) ? ".nan" : num < 0 ? "-.inf" : ".inf";
      let n3 = Object.is(value, -0) ? "-0" : JSON.stringify(value);
      if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^-?\d/.test(n3) && !n3.includes("e")) {
        let i = n3.indexOf(".");
        if (i < 0) {
          i = n3.length;
          n3 += ".";
        }
        let d = minFractionDigits - (n3.length - i - 1);
        while (d-- > 0)
          n3 += "0";
      }
      return n3;
    }
    exports.stringifyNumber = stringifyNumber;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/core/float.js
var require_float = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/core/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str),
      stringify(node3) {
        const num = Number(node3.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node3);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
      resolve(str) {
        const node3 = new Scalar.Scalar(parseFloat(str));
        const dot = str.indexOf(".");
        if (dot !== -1 && str[str.length - 1] === "0")
          node3.minFractionDigits = str.length - dot - 1;
        return node3;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/core/int.js
var require_int = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/core/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    var intResolve = (str, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str.substring(offset), radix);
    function intStringify(node3, radix, prefix) {
      const { value } = node3;
      if (intIdentify(value) && value >= 0)
        return prefix + value.toString(radix);
      return stringifyNumber.stringifyNumber(node3);
    }
    var intOct = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^0o[0-7]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 8, opt),
      stringify: (node3) => intStringify(node3, 8, "0o")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^0x[0-9a-fA-F]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node3) => intStringify(node3, 16, "0x")
    };
    exports.int = int;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/core/schema.js
var require_schema = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/core/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.boolTag,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float
    ];
    exports.schema = schema;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/json/schema.js
var require_schema2 = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/json/schema.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var map = require_map();
    var seq = require_seq();
    function intIdentify(value) {
      return typeof value === "bigint" || Number.isInteger(value);
    }
    var stringifyJSON = ({ value }) => JSON.stringify(value);
    var jsonScalars = [
      {
        identify: (value) => typeof value === "string",
        default: true,
        tag: "tag:yaml.org,2002:str",
        resolve: (str) => str,
        stringify: stringifyJSON
      },
      {
        identify: (value) => value == null,
        createNode: () => new Scalar.Scalar(null),
        default: true,
        tag: "tag:yaml.org,2002:null",
        test: /^null$/,
        resolve: () => null,
        stringify: stringifyJSON
      },
      {
        identify: (value) => typeof value === "boolean",
        default: true,
        tag: "tag:yaml.org,2002:bool",
        test: /^true$|^false$/,
        resolve: (str) => str === "true",
        stringify: stringifyJSON
      },
      {
        identify: intIdentify,
        default: true,
        tag: "tag:yaml.org,2002:int",
        test: /^-?(?:0|[1-9][0-9]*)$/,
        resolve: (str, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str, 10),
        stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
      },
      {
        identify: (value) => typeof value === "number",
        default: true,
        tag: "tag:yaml.org,2002:float",
        test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
        resolve: (str) => parseFloat(str),
        stringify: stringifyJSON
      }
    ];
    var jsonError = {
      default: true,
      tag: "",
      test: /^/,
      resolve(str, onError) {
        onError(`Unresolved plain scalar ${JSON.stringify(str)}`);
        return str;
      }
    };
    var schema = [map.map, seq.seq].concat(jsonScalars, jsonError);
    exports.schema = schema;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/binary.js
var require_binary = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/binary.js"(exports) {
    "use strict";
    var node_buffer = __require("buffer");
    var Scalar = require_Scalar();
    var stringifyString = require_stringifyString();
    var binary = {
      identify: (value) => value instanceof Uint8Array,
      // Buffer inherits from Uint8Array
      default: false,
      tag: "tag:yaml.org,2002:binary",
      /**
       * Returns a Buffer in node and an Uint8Array in browsers
       *
       * To use the resulting buffer as an image, you'll want to do something like:
       *
       *   const blob = new Blob([buffer], { type: 'image/jpeg' })
       *   document.querySelector('#photo').src = URL.createObjectURL(blob)
       */
      resolve(src, onError) {
        if (typeof node_buffer.Buffer === "function") {
          return node_buffer.Buffer.from(src, "base64");
        } else if (typeof atob === "function") {
          const str = atob(src.replace(/[\n\r]/g, ""));
          const buffer = new Uint8Array(str.length);
          for (let i = 0; i < str.length; ++i)
            buffer[i] = str.charCodeAt(i);
          return buffer;
        } else {
          onError("This environment does not support reading binary tags; either Buffer or atob is required");
          return src;
        }
      },
      stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
        if (!value)
          return "";
        const buf = value;
        let str;
        if (typeof node_buffer.Buffer === "function") {
          str = buf instanceof node_buffer.Buffer ? buf.toString("base64") : node_buffer.Buffer.from(buf.buffer).toString("base64");
        } else if (typeof btoa === "function") {
          let s = "";
          for (let i = 0; i < buf.length; ++i)
            s += String.fromCharCode(buf[i]);
          str = btoa(s);
        } else {
          throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
        }
        type ?? (type = Scalar.Scalar.BLOCK_LITERAL);
        if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
          const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
          const n3 = Math.ceil(str.length / lineWidth);
          const lines = new Array(n3);
          for (let i = 0, o = 0; i < n3; ++i, o += lineWidth) {
            lines[i] = str.substr(o, lineWidth);
          }
          str = lines.join(type === Scalar.Scalar.BLOCK_LITERAL ? "\n" : " ");
        }
        return stringifyString.stringifyString({ comment, type, value: str }, ctx, onComment, onChompKeep);
      }
    };
    exports.binary = binary;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/pairs.js
var require_pairs = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/pairs.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLSeq = require_YAMLSeq();
    function resolvePairs(seq, onError) {
      if (identity.isSeq(seq)) {
        for (let i = 0; i < seq.items.length; ++i) {
          let item = seq.items[i];
          if (identity.isPair(item))
            continue;
          else if (identity.isMap(item)) {
            if (item.items.length > 1)
              onError("Each pair must have its own sequence indicator");
            const pair = item.items[0] || new Pair.Pair(new Scalar.Scalar(null));
            if (item.commentBefore)
              pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}
${pair.key.commentBefore}` : item.commentBefore;
            if (item.comment) {
              const cn = pair.value ?? pair.key;
              cn.comment = cn.comment ? `${item.comment}
${cn.comment}` : item.comment;
            }
            item = pair;
          }
          seq.items[i] = identity.isPair(item) ? item : new Pair.Pair(item);
        }
      } else
        onError("Expected a sequence for this tag");
      return seq;
    }
    function createPairs(schema, iterable, ctx) {
      const { replacer } = ctx;
      const pairs2 = new YAMLSeq.YAMLSeq(schema);
      pairs2.tag = "tag:yaml.org,2002:pairs";
      let i = 0;
      if (iterable && Symbol.iterator in Object(iterable))
        for (let it of iterable) {
          if (typeof replacer === "function")
            it = replacer.call(iterable, String(i++), it);
          let key, value;
          if (Array.isArray(it)) {
            if (it.length === 2) {
              key = it[0];
              value = it[1];
            } else
              throw new TypeError(`Expected [key, value] tuple: ${it}`);
          } else if (it && it instanceof Object) {
            const keys = Object.keys(it);
            if (keys.length === 1) {
              key = keys[0];
              value = it[key];
            } else {
              throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
            }
          } else {
            key = it;
          }
          pairs2.items.push(Pair.createPair(key, value, ctx));
        }
      return pairs2;
    }
    var pairs = {
      collection: "seq",
      default: false,
      tag: "tag:yaml.org,2002:pairs",
      resolve: resolvePairs,
      createNode: createPairs
    };
    exports.createPairs = createPairs;
    exports.pairs = pairs;
    exports.resolvePairs = resolvePairs;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/omap.js
var require_omap = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/omap.js"(exports) {
    "use strict";
    var identity = require_identity();
    var toJS = require_toJS();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var pairs = require_pairs();
    var YAMLOMap = class _YAMLOMap extends YAMLSeq.YAMLSeq {
      constructor() {
        super();
        this.add = YAMLMap.YAMLMap.prototype.add.bind(this);
        this.delete = YAMLMap.YAMLMap.prototype.delete.bind(this);
        this.get = YAMLMap.YAMLMap.prototype.get.bind(this);
        this.has = YAMLMap.YAMLMap.prototype.has.bind(this);
        this.set = YAMLMap.YAMLMap.prototype.set.bind(this);
        this.tag = _YAMLOMap.tag;
      }
      /**
       * If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
       * but TypeScript won't allow widening the signature of a child method.
       */
      toJSON(_, ctx) {
        if (!ctx)
          return super.toJSON(_);
        const map = /* @__PURE__ */ new Map();
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const pair of this.items) {
          let key, value;
          if (identity.isPair(pair)) {
            key = toJS.toJS(pair.key, "", ctx);
            value = toJS.toJS(pair.value, key, ctx);
          } else {
            key = toJS.toJS(pair, "", ctx);
          }
          if (map.has(key))
            throw new Error("Ordered maps must not include duplicate keys");
          map.set(key, value);
        }
        return map;
      }
      static from(schema, iterable, ctx) {
        const pairs$1 = pairs.createPairs(schema, iterable, ctx);
        const omap2 = new this();
        omap2.items = pairs$1.items;
        return omap2;
      }
    };
    YAMLOMap.tag = "tag:yaml.org,2002:omap";
    var omap = {
      collection: "seq",
      identify: (value) => value instanceof Map,
      nodeClass: YAMLOMap,
      default: false,
      tag: "tag:yaml.org,2002:omap",
      resolve(seq, onError) {
        const pairs$1 = pairs.resolvePairs(seq, onError);
        const seenKeys = [];
        for (const { key } of pairs$1.items) {
          if (identity.isScalar(key)) {
            if (seenKeys.includes(key.value)) {
              onError(`Ordered maps must not include duplicate keys: ${key.value}`);
            } else {
              seenKeys.push(key.value);
            }
          }
        }
        return Object.assign(new YAMLOMap(), pairs$1);
      },
      createNode: (schema, iterable, ctx) => YAMLOMap.from(schema, iterable, ctx)
    };
    exports.YAMLOMap = YAMLOMap;
    exports.omap = omap;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/bool.js
var require_bool2 = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function boolStringify({ value, source }, ctx) {
      const boolObj = value ? trueTag : falseTag;
      if (source && boolObj.test.test(source))
        return source;
      return value ? ctx.options.trueStr : ctx.options.falseStr;
    }
    var trueTag = {
      identify: (value) => value === true,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
      resolve: () => new Scalar.Scalar(true),
      stringify: boolStringify
    };
    var falseTag = {
      identify: (value) => value === false,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
      resolve: () => new Scalar.Scalar(false),
      stringify: boolStringify
    };
    exports.falseTag = falseTag;
    exports.trueTag = trueTag;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/float.js
var require_float2 = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str.replace(/_/g, "")),
      stringify(node3) {
        const num = Number(node3.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node3);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
      resolve(str) {
        const node3 = new Scalar.Scalar(parseFloat(str.replace(/_/g, "")));
        const dot = str.indexOf(".");
        if (dot !== -1) {
          const f = str.substring(dot + 1).replace(/_/g, "");
          if (f[f.length - 1] === "0")
            node3.minFractionDigits = f.length;
        }
        return node3;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/int.js
var require_int2 = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    function intResolve(str, offset, radix, { intAsBigInt }) {
      const sign = str[0];
      if (sign === "-" || sign === "+")
        offset += 1;
      str = str.substring(offset).replace(/_/g, "");
      if (intAsBigInt) {
        switch (radix) {
          case 2:
            str = `0b${str}`;
            break;
          case 8:
            str = `0o${str}`;
            break;
          case 16:
            str = `0x${str}`;
            break;
        }
        const n4 = BigInt(str);
        return sign === "-" ? BigInt(-1) * n4 : n4;
      }
      const n3 = parseInt(str, radix);
      return sign === "-" ? -1 * n3 : n3;
    }
    function intStringify(node3, radix, prefix) {
      const { value } = node3;
      if (intIdentify(value)) {
        const str = value.toString(radix);
        return value < 0 ? "-" + prefix + str.substr(1) : prefix + str;
      }
      return stringifyNumber.stringifyNumber(node3);
    }
    var intBin = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "BIN",
      test: /^[-+]?0b[0-1_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 2, opt),
      stringify: (node3) => intStringify(node3, 2, "0b")
    };
    var intOct = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^[-+]?0[0-7_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 1, 8, opt),
      stringify: (node3) => intStringify(node3, 8, "0")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9][0-9_]*$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^[-+]?0x[0-9a-fA-F_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node3) => intStringify(node3, 16, "0x")
    };
    exports.int = int;
    exports.intBin = intBin;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/set.js
var require_set = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/set.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSet = class _YAMLSet extends YAMLMap.YAMLMap {
      constructor(schema) {
        super(schema);
        this.tag = _YAMLSet.tag;
      }
      add(key) {
        let pair;
        if (identity.isPair(key))
          pair = key;
        else if (key && typeof key === "object" && "key" in key && "value" in key && key.value === null)
          pair = new Pair.Pair(key.key, null);
        else
          pair = new Pair.Pair(key, null);
        const prev = YAMLMap.findPair(this.items, pair.key);
        if (!prev)
          this.items.push(pair);
      }
      /**
       * If `keepPair` is `true`, returns the Pair matching `key`.
       * Otherwise, returns the value of that Pair's key.
       */
      get(key, keepPair) {
        const pair = YAMLMap.findPair(this.items, key);
        return !keepPair && identity.isPair(pair) ? identity.isScalar(pair.key) ? pair.key.value : pair.key : pair;
      }
      set(key, value) {
        if (typeof value !== "boolean")
          throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
        const prev = YAMLMap.findPair(this.items, key);
        if (prev && !value) {
          this.items.splice(this.items.indexOf(prev), 1);
        } else if (!prev && value) {
          this.items.push(new Pair.Pair(key));
        }
      }
      toJSON(_, ctx) {
        return super.toJSON(_, ctx, Set);
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        if (this.hasAllNullValues(true))
          return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
        else
          throw new Error("Set items must all have null values");
      }
      static from(schema, iterable, ctx) {
        const { replacer } = ctx;
        const set2 = new this(schema);
        if (iterable && Symbol.iterator in Object(iterable))
          for (let value of iterable) {
            if (typeof replacer === "function")
              value = replacer.call(iterable, value, value);
            set2.items.push(Pair.createPair(value, null, ctx));
          }
        return set2;
      }
    };
    YAMLSet.tag = "tag:yaml.org,2002:set";
    var set = {
      collection: "map",
      identify: (value) => value instanceof Set,
      nodeClass: YAMLSet,
      default: false,
      tag: "tag:yaml.org,2002:set",
      createNode: (schema, iterable, ctx) => YAMLSet.from(schema, iterable, ctx),
      resolve(map, onError) {
        if (identity.isMap(map)) {
          if (map.hasAllNullValues(true))
            return Object.assign(new YAMLSet(), map);
          else
            onError("Set items must all have null values");
        } else
          onError("Expected a mapping for this tag");
        return map;
      }
    };
    exports.YAMLSet = YAMLSet;
    exports.set = set;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/timestamp.js
var require_timestamp = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/timestamp.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    function parseSexagesimal(str, asBigInt) {
      const sign = str[0];
      const parts = sign === "-" || sign === "+" ? str.substring(1) : str;
      const num = (n3) => asBigInt ? BigInt(n3) : Number(n3);
      const res = parts.replace(/_/g, "").split(":").reduce((res2, p) => res2 * num(60) + num(p), num(0));
      return sign === "-" ? num(-1) * res : res;
    }
    function stringifySexagesimal(node3) {
      let { value } = node3;
      let num = (n3) => n3;
      if (typeof value === "bigint")
        num = (n3) => BigInt(n3);
      else if (isNaN(value) || !isFinite(value))
        return stringifyNumber.stringifyNumber(node3);
      let sign = "";
      if (value < 0) {
        sign = "-";
        value *= num(-1);
      }
      const _60 = num(60);
      const parts = [value % _60];
      if (value < 60) {
        parts.unshift(0);
      } else {
        value = (value - parts[0]) / _60;
        parts.unshift(value % _60);
        if (value >= 60) {
          value = (value - parts[0]) / _60;
          parts.unshift(value);
        }
      }
      return sign + parts.map((n3) => String(n3).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
    }
    var intTime = {
      identify: (value) => typeof value === "bigint" || Number.isInteger(value),
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
      resolve: (str, _onError, { intAsBigInt }) => parseSexagesimal(str, intAsBigInt),
      stringify: stringifySexagesimal
    };
    var floatTime = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
      resolve: (str) => parseSexagesimal(str, false),
      stringify: stringifySexagesimal
    };
    var timestamp = {
      identify: (value) => value instanceof Date,
      default: true,
      tag: "tag:yaml.org,2002:timestamp",
      // If the time zone is omitted, the timestamp is assumed to be specified in UTC. The time part
      // may be omitted altogether, resulting in a date format. In such a case, the time part is
      // assumed to be 00:00:00Z (start of day, UTC).
      test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$"),
      resolve(str) {
        const match = str.match(timestamp.test);
        if (!match)
          throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
        const [, year, month, day, hour, minute, second] = match.map(Number);
        const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
        let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
        const tz = match[8];
        if (tz && tz !== "Z") {
          let d = parseSexagesimal(tz, false);
          if (Math.abs(d) < 30)
            d *= 60;
          date -= 6e4 * d;
        }
        return new Date(date);
      },
      stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
    };
    exports.floatTime = floatTime;
    exports.intTime = intTime;
    exports.timestamp = timestamp;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/schema.js
var require_schema3 = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/yaml-1.1/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var binary = require_binary();
    var bool = require_bool2();
    var float = require_float2();
    var int = require_int2();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var set = require_set();
    var timestamp = require_timestamp();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.trueTag,
      bool.falseTag,
      int.intBin,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float,
      binary.binary,
      merge.merge,
      omap.omap,
      pairs.pairs,
      set.set,
      timestamp.intTime,
      timestamp.floatTime,
      timestamp.timestamp
    ];
    exports.schema = schema;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/tags.js
var require_tags = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/tags.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = require_schema();
    var schema$1 = require_schema2();
    var binary = require_binary();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var schema$2 = require_schema3();
    var set = require_set();
    var timestamp = require_timestamp();
    var schemas = /* @__PURE__ */ new Map([
      ["core", schema.schema],
      ["failsafe", [map.map, seq.seq, string.string]],
      ["json", schema$1.schema],
      ["yaml11", schema$2.schema],
      ["yaml-1.1", schema$2.schema]
    ]);
    var tagsByName = {
      binary: binary.binary,
      bool: bool.boolTag,
      float: float.float,
      floatExp: float.floatExp,
      floatNaN: float.floatNaN,
      floatTime: timestamp.floatTime,
      int: int.int,
      intHex: int.intHex,
      intOct: int.intOct,
      intTime: timestamp.intTime,
      map: map.map,
      merge: merge.merge,
      null: _null.nullTag,
      omap: omap.omap,
      pairs: pairs.pairs,
      seq: seq.seq,
      set: set.set,
      timestamp: timestamp.timestamp
    };
    var coreKnownTags = {
      "tag:yaml.org,2002:binary": binary.binary,
      "tag:yaml.org,2002:merge": merge.merge,
      "tag:yaml.org,2002:omap": omap.omap,
      "tag:yaml.org,2002:pairs": pairs.pairs,
      "tag:yaml.org,2002:set": set.set,
      "tag:yaml.org,2002:timestamp": timestamp.timestamp
    };
    function getTags(customTags, schemaName, addMergeTag) {
      const schemaTags = schemas.get(schemaName);
      if (schemaTags && !customTags) {
        return addMergeTag && !schemaTags.includes(merge.merge) ? schemaTags.concat(merge.merge) : schemaTags.slice();
      }
      let tags = schemaTags;
      if (!tags) {
        if (Array.isArray(customTags))
          tags = [];
        else {
          const keys = Array.from(schemas.keys()).filter((key) => key !== "yaml11").map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
        }
      }
      if (Array.isArray(customTags)) {
        for (const tag of customTags)
          tags = tags.concat(tag);
      } else if (typeof customTags === "function") {
        tags = customTags(tags.slice());
      }
      if (addMergeTag)
        tags = tags.concat(merge.merge);
      return tags.reduce((tags2, tag) => {
        const tagObj = typeof tag === "string" ? tagsByName[tag] : tag;
        if (!tagObj) {
          const tagName = JSON.stringify(tag);
          const keys = Object.keys(tagsByName).map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
        }
        if (!tags2.includes(tagObj))
          tags2.push(tagObj);
        return tags2;
      }, []);
    }
    exports.coreKnownTags = coreKnownTags;
    exports.getTags = getTags;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/Schema.js
var require_Schema = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/schema/Schema.js"(exports) {
    "use strict";
    var identity = require_identity();
    var map = require_map();
    var seq = require_seq();
    var string = require_string();
    var tags = require_tags();
    var sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    var Schema = class _Schema {
      constructor({ compat, customTags, merge, resolveKnownTags, schema, sortMapEntries, toStringDefaults }) {
        this.compat = Array.isArray(compat) ? tags.getTags(compat, "compat") : compat ? tags.getTags(null, compat) : null;
        this.name = typeof schema === "string" && schema || "core";
        this.knownTags = resolveKnownTags ? tags.coreKnownTags : {};
        this.tags = tags.getTags(customTags, this.name, merge);
        this.toStringOptions = toStringDefaults ?? null;
        Object.defineProperty(this, identity.MAP, { value: map.map });
        Object.defineProperty(this, identity.SCALAR, { value: string.string });
        Object.defineProperty(this, identity.SEQ, { value: seq.seq });
        this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
      }
      clone() {
        const copy = Object.create(_Schema.prototype, Object.getOwnPropertyDescriptors(this));
        copy.tags = this.tags.slice();
        return copy;
      }
    };
    exports.Schema = Schema;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyDocument.js
var require_stringifyDocument = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/stringify/stringifyDocument.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify2 = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyDocument(doc, options) {
      const lines = [];
      let hasDirectives = options.directives === true;
      if (options.directives !== false && doc.directives) {
        const dir = doc.directives.toString(doc);
        if (dir) {
          lines.push(dir);
          hasDirectives = true;
        } else if (doc.directives.docStart)
          hasDirectives = true;
      }
      if (hasDirectives)
        lines.push("---");
      const ctx = stringify2.createStringifyContext(doc, options);
      const { commentString } = ctx.options;
      if (doc.commentBefore) {
        if (lines.length !== 1)
          lines.unshift("");
        const cs = commentString(doc.commentBefore);
        lines.unshift(stringifyComment.indentComment(cs, ""));
      }
      let chompKeep = false;
      let contentComment = null;
      if (doc.contents) {
        if (identity.isNode(doc.contents)) {
          if (doc.contents.spaceBefore && hasDirectives)
            lines.push("");
          if (doc.contents.commentBefore) {
            const cs = commentString(doc.contents.commentBefore);
            lines.push(stringifyComment.indentComment(cs, ""));
          }
          ctx.forceBlockIndent = !!doc.comment;
          contentComment = doc.contents.comment;
        }
        const onChompKeep = contentComment ? void 0 : () => chompKeep = true;
        let body = stringify2.stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
        if (contentComment)
          body += stringifyComment.lineComment(body, "", commentString(contentComment));
        if ((body[0] === "|" || body[0] === ">") && lines[lines.length - 1] === "---") {
          lines[lines.length - 1] = `--- ${body}`;
        } else
          lines.push(body);
      } else {
        lines.push(stringify2.stringify(doc.contents, ctx));
      }
      if (doc.directives?.docEnd) {
        if (doc.comment) {
          const cs = commentString(doc.comment);
          if (cs.includes("\n")) {
            lines.push("...");
            lines.push(stringifyComment.indentComment(cs, ""));
          } else {
            lines.push(`... ${cs}`);
          }
        } else {
          lines.push("...");
        }
      } else {
        let dc = doc.comment;
        if (dc && chompKeep)
          dc = dc.replace(/^\n+/, "");
        if (dc) {
          if ((!chompKeep || contentComment) && lines[lines.length - 1] !== "")
            lines.push("");
          lines.push(stringifyComment.indentComment(commentString(dc), ""));
        }
      }
      return lines.join("\n") + "\n";
    }
    exports.stringifyDocument = stringifyDocument;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/doc/Document.js
var require_Document = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/doc/Document.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var toJS = require_toJS();
    var Schema = require_Schema();
    var stringifyDocument = require_stringifyDocument();
    var anchors = require_anchors();
    var applyReviver = require_applyReviver();
    var createNode = require_createNode();
    var directives = require_directives();
    var Document = class _Document {
      constructor(value, replacer, options) {
        this.commentBefore = null;
        this.comment = null;
        this.errors = [];
        this.warnings = [];
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.DOC });
        let _replacer = null;
        if (typeof replacer === "function" || Array.isArray(replacer)) {
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const opt = Object.assign({
          intAsBigInt: false,
          keepSourceTokens: false,
          logLevel: "warn",
          prettyErrors: true,
          strict: true,
          stringKeys: false,
          uniqueKeys: true,
          version: "1.2"
        }, options);
        this.options = opt;
        let { version } = opt;
        if (options?._directives) {
          this.directives = options._directives.atDocument();
          if (this.directives.yaml.explicit)
            version = this.directives.yaml.version;
        } else
          this.directives = new directives.Directives({ version });
        this.setSchema(version, options);
        this.contents = value === void 0 ? null : this.createNode(value, _replacer, options);
      }
      /**
       * Create a deep copy of this Document and its contents.
       *
       * Custom Node values that inherit from `Object` still refer to their original instances.
       */
      clone() {
        const copy = Object.create(_Document.prototype, {
          [identity.NODE_TYPE]: { value: identity.DOC }
        });
        copy.commentBefore = this.commentBefore;
        copy.comment = this.comment;
        copy.errors = this.errors.slice();
        copy.warnings = this.warnings.slice();
        copy.options = Object.assign({}, this.options);
        if (this.directives)
          copy.directives = this.directives.clone();
        copy.schema = this.schema.clone();
        copy.contents = identity.isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** Adds a value to the document. */
      add(value) {
        if (assertCollection(this.contents))
          this.contents.add(value);
      }
      /** Adds a value to the document. */
      addIn(path, value) {
        if (assertCollection(this.contents))
          this.contents.addIn(path, value);
      }
      /**
       * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
       *
       * If `node` already has an anchor, `name` is ignored.
       * Otherwise, the `node.anchor` value will be set to `name`,
       * or if an anchor with that name is already present in the document,
       * `name` will be used as a prefix for a new unique anchor.
       * If `name` is undefined, the generated anchor will use 'a' as a prefix.
       */
      createAlias(node3, name) {
        if (!node3.anchor) {
          const prev = anchors.anchorNames(this);
          node3.anchor = // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          !name || prev.has(name) ? anchors.findNewAnchor(name || "a", prev) : name;
        }
        return new Alias.Alias(node3.anchor);
      }
      createNode(value, replacer, options) {
        let _replacer = void 0;
        if (typeof replacer === "function") {
          value = replacer.call({ "": value }, "", value);
          _replacer = replacer;
        } else if (Array.isArray(replacer)) {
          const keyToStr = (v) => typeof v === "number" || v instanceof String || v instanceof Number;
          const asStr = replacer.filter(keyToStr).map(String);
          if (asStr.length > 0)
            replacer = replacer.concat(asStr);
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
        const { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(
          this,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          anchorPrefix || "a"
        );
        const ctx = {
          aliasDuplicateObjects: aliasDuplicateObjects ?? true,
          keepUndefined: keepUndefined ?? false,
          onAnchor,
          onTagObj,
          replacer: _replacer,
          schema: this.schema,
          sourceObjects
        };
        const node3 = createNode.createNode(value, tag, ctx);
        if (flow && identity.isCollection(node3))
          node3.flow = true;
        setAnchors();
        return node3;
      }
      /**
       * Convert a key and a value into a `Pair` using the current schema,
       * recursively wrapping all values as `Scalar` or `Collection` nodes.
       */
      createPair(key, value, options = {}) {
        const k = this.createNode(key, null, options);
        const v = this.createNode(value, null, options);
        return new Pair.Pair(k, v);
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        return assertCollection(this.contents) ? this.contents.delete(key) : false;
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path) {
        if (Collection.isEmptyPath(path)) {
          if (this.contents == null)
            return false;
          this.contents = null;
          return true;
        }
        return assertCollection(this.contents) ? this.contents.deleteIn(path) : false;
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      get(key, keepScalar) {
        return identity.isCollection(this.contents) ? this.contents.get(key, keepScalar) : void 0;
      }
      /**
       * Returns item at `path`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path, keepScalar) {
        if (Collection.isEmptyPath(path))
          return !keepScalar && identity.isScalar(this.contents) ? this.contents.value : this.contents;
        return identity.isCollection(this.contents) ? this.contents.getIn(path, keepScalar) : void 0;
      }
      /**
       * Checks if the document includes a value with the key `key`.
       */
      has(key) {
        return identity.isCollection(this.contents) ? this.contents.has(key) : false;
      }
      /**
       * Checks if the document includes a value at `path`.
       */
      hasIn(path) {
        if (Collection.isEmptyPath(path))
          return this.contents !== void 0;
        return identity.isCollection(this.contents) ? this.contents.hasIn(path) : false;
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      set(key, value) {
        if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, [key], value);
        } else if (assertCollection(this.contents)) {
          this.contents.set(key, value);
        }
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path, value) {
        if (Collection.isEmptyPath(path)) {
          this.contents = value;
        } else if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, Array.from(path), value);
        } else if (assertCollection(this.contents)) {
          this.contents.setIn(path, value);
        }
      }
      /**
       * Change the YAML version and schema used by the document.
       * A `null` version disables support for directives, explicit tags, anchors, and aliases.
       * It also requires the `schema` option to be given as a `Schema` instance value.
       *
       * Overrides all previously set schema options.
       */
      setSchema(version, options = {}) {
        if (typeof version === "number")
          version = String(version);
        let opt;
        switch (version) {
          case "1.1":
            if (this.directives)
              this.directives.yaml.version = "1.1";
            else
              this.directives = new directives.Directives({ version: "1.1" });
            opt = { resolveKnownTags: false, schema: "yaml-1.1" };
            break;
          case "1.2":
          case "next":
            if (this.directives)
              this.directives.yaml.version = version;
            else
              this.directives = new directives.Directives({ version });
            opt = { resolveKnownTags: true, schema: "core" };
            break;
          case null:
            if (this.directives)
              delete this.directives;
            opt = null;
            break;
          default: {
            const sv = JSON.stringify(version);
            throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
          }
        }
        if (options.schema instanceof Object)
          this.schema = options.schema;
        else if (opt)
          this.schema = new Schema.Schema(Object.assign(opt, options));
        else
          throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
      }
      // json & jsonArg are only used from toJSON()
      toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc: this,
          keep: !json,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this.contents, jsonArg ?? "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
      /**
       * A JSON representation of the document `contents`.
       *
       * @param jsonArg Used by `JSON.stringify` to indicate the array index or
       *   property name.
       */
      toJSON(jsonArg, onAnchor) {
        return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
      }
      /** A YAML representation of the document. */
      toString(options = {}) {
        if (this.errors.length > 0)
          throw new Error("Document with errors cannot be stringified");
        if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
          const s = JSON.stringify(options.indent);
          throw new Error(`"indent" option must be a positive integer, not ${s}`);
        }
        return stringifyDocument.stringifyDocument(this, options);
      }
    };
    function assertCollection(contents) {
      if (identity.isCollection(contents))
        return true;
      throw new Error("Expected a YAML collection as document contents");
    }
    exports.Document = Document;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/errors.js
var require_errors = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/errors.js"(exports) {
    "use strict";
    var YAMLError = class extends Error {
      constructor(name, pos, code, message) {
        super();
        this.name = name;
        this.code = code;
        this.message = message;
        this.pos = pos;
      }
    };
    var YAMLParseError = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLParseError", pos, code, message);
      }
    };
    var YAMLWarning = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLWarning", pos, code, message);
      }
    };
    var prettifyError = (src, lc) => (error) => {
      if (error.pos[0] === -1)
        return;
      error.linePos = error.pos.map((pos) => lc.linePos(pos));
      const { line, col } = error.linePos[0];
      error.message += ` at line ${line}, column ${col}`;
      let ci = col - 1;
      let lineStr = src.substring(lc.lineStarts[line - 1], lc.lineStarts[line]).replace(/[\n\r]+$/, "");
      if (ci >= 60 && lineStr.length > 80) {
        const trimStart = Math.min(ci - 39, lineStr.length - 79);
        lineStr = "\u2026" + lineStr.substring(trimStart);
        ci -= trimStart - 1;
      }
      if (lineStr.length > 80)
        lineStr = lineStr.substring(0, 79) + "\u2026";
      if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
        let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
        if (prev.length > 80)
          prev = prev.substring(0, 79) + "\u2026\n";
        lineStr = prev + lineStr;
      }
      if (/[^ ]/.test(lineStr)) {
        let count = 1;
        const end = error.linePos[1];
        if (end?.line === line && end.col > col) {
          count = Math.max(1, Math.min(end.col - col, 80 - ci));
        }
        const pointer = " ".repeat(ci) + "^".repeat(count);
        error.message += `:

${lineStr}
${pointer}
`;
      }
    };
    exports.YAMLError = YAMLError;
    exports.YAMLParseError = YAMLParseError;
    exports.YAMLWarning = YAMLWarning;
    exports.prettifyError = prettifyError;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-props.js
var require_resolve_props = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-props.js"(exports) {
    "use strict";
    function resolveProps(tokens2, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
      let spaceBefore = false;
      let atNewline = startOnNewline;
      let hasSpace = startOnNewline;
      let comment = "";
      let commentSep = "";
      let hasNewline = false;
      let reqSpace = false;
      let tab = null;
      let anchor2 = null;
      let tag = null;
      let newlineAfterProp = null;
      let comma = null;
      let found = null;
      let start = null;
      for (const token of tokens2) {
        if (reqSpace) {
          if (token.type !== "space" && token.type !== "newline" && token.type !== "comma")
            onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
          reqSpace = false;
        }
        if (tab) {
          if (atNewline && token.type !== "comment" && token.type !== "newline") {
            onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
          }
          tab = null;
        }
        switch (token.type) {
          case "space":
            if (!flow && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("	")) {
              tab = token;
            }
            hasSpace = true;
            break;
          case "comment": {
            if (!hasSpace)
              onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
            const cb = token.source.substring(1) || " ";
            if (!comment)
              comment = cb;
            else
              comment += commentSep + cb;
            commentSep = "";
            atNewline = false;
            break;
          }
          case "newline":
            if (atNewline) {
              if (comment)
                comment += token.source;
              else if (!found || indicator !== "seq-item-ind")
                spaceBefore = true;
            } else
              commentSep += token.source;
            atNewline = true;
            hasNewline = true;
            if (anchor2 || tag)
              newlineAfterProp = token;
            hasSpace = true;
            break;
          case "anchor":
            if (anchor2)
              onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
            if (token.source.endsWith(":"))
              onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
            anchor2 = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          case "tag": {
            if (tag)
              onError(token, "MULTIPLE_TAGS", "A node can have at most one tag");
            tag = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          }
          case indicator:
            if (anchor2 || tag)
              onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
            if (found)
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow ?? "collection"}`);
            found = token;
            atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
            hasSpace = false;
            break;
          case "comma":
            if (flow) {
              if (comma)
                onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow}`);
              comma = token;
              atNewline = false;
              hasSpace = false;
              break;
            }
          // else fallthrough
          default:
            onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
            atNewline = false;
            hasSpace = false;
        }
      }
      const last = tokens2[tokens2.length - 1];
      const end = last ? last.offset + last.source.length : offset;
      if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) {
        onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
      }
      if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq"))
        onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
      return {
        comma,
        found,
        spaceBefore,
        comment,
        hasNewline,
        anchor: anchor2,
        tag,
        newlineAfterProp,
        end,
        start: start ?? end
      };
    }
    exports.resolveProps = resolveProps;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/util-contains-newline.js
var require_util_contains_newline = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/util-contains-newline.js"(exports) {
    "use strict";
    function containsNewline(key) {
      if (!key)
        return null;
      switch (key.type) {
        case "alias":
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          if (key.source.includes("\n"))
            return true;
          if (key.end) {
            for (const st of key.end)
              if (st.type === "newline")
                return true;
          }
          return false;
        case "flow-collection":
          for (const it of key.items) {
            for (const st of it.start)
              if (st.type === "newline")
                return true;
            if (it.sep) {
              for (const st of it.sep)
                if (st.type === "newline")
                  return true;
            }
            if (containsNewline(it.key) || containsNewline(it.value))
              return true;
          }
          return false;
        default:
          return true;
      }
    }
    exports.containsNewline = containsNewline;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/util-flow-indent-check.js
var require_util_flow_indent_check = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/util-flow-indent-check.js"(exports) {
    "use strict";
    var utilContainsNewline = require_util_contains_newline();
    function flowIndentCheck(indent, fc, onError) {
      if (fc?.type === "flow-collection") {
        const end = fc.end[0];
        if (end.indent === indent && (end.source === "]" || end.source === "}") && utilContainsNewline.containsNewline(fc)) {
          const msg = "Flow end indicator should be more indented than parent";
          onError(end, "BAD_INDENT", msg, true);
        }
      }
    }
    exports.flowIndentCheck = flowIndentCheck;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/util-map-includes.js
var require_util_map_includes = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/util-map-includes.js"(exports) {
    "use strict";
    var identity = require_identity();
    function mapIncludes(ctx, items, search) {
      const { uniqueKeys } = ctx.options;
      if (uniqueKeys === false)
        return false;
      const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b) => a === b || identity.isScalar(a) && identity.isScalar(b) && a.value === b.value;
      return items.some((pair) => isEqual(pair.key, search));
    }
    exports.mapIncludes = mapIncludes;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-block-map.js
var require_resolve_block_map = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-block-map.js"(exports) {
    "use strict";
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    var utilMapIncludes = require_util_map_includes();
    var startColMsg = "All mapping items must start at the same column";
    function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLMap.YAMLMap;
      const map = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      let offset = bm.offset;
      let commentEnd = null;
      for (const collItem of bm.items) {
        const { start, key, sep, value } = collItem;
        const keyProps = resolveProps.resolveProps(start, {
          indicator: "explicit-key-ind",
          next: key ?? sep?.[0],
          offset,
          onError,
          parentIndent: bm.indent,
          startOnNewline: true
        });
        const implicitKey = !keyProps.found;
        if (implicitKey) {
          if (key) {
            if (key.type === "block-seq")
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
            else if ("indent" in key && key.indent !== bm.indent)
              onError(offset, "BAD_INDENT", startColMsg);
          }
          if (!keyProps.anchor && !keyProps.tag && !sep) {
            commentEnd = keyProps.end;
            if (keyProps.comment) {
              if (map.comment)
                map.comment += "\n" + keyProps.comment;
              else
                map.comment = keyProps.comment;
            }
            continue;
          }
          if (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key)) {
            onError(key ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
          }
        } else if (keyProps.found?.indent !== bm.indent) {
          onError(offset, "BAD_INDENT", startColMsg);
        }
        ctx.atKey = true;
        const keyStart = keyProps.end;
        const keyNode = key ? composeNode(ctx, key, keyProps, onError) : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bm.indent, key, onError);
        ctx.atKey = false;
        if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
          onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
        const valueProps = resolveProps.resolveProps(sep ?? [], {
          indicator: "map-value-ind",
          next: value,
          offset: keyNode.range[2],
          onError,
          parentIndent: bm.indent,
          startOnNewline: !key || key.type === "block-scalar"
        });
        offset = valueProps.end;
        if (valueProps.found) {
          if (implicitKey) {
            if (value?.type === "block-map" && !valueProps.hasNewline)
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
            if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024)
              onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : composeEmptyNode(ctx, offset, sep, null, valueProps, onError);
          if (ctx.schema.compat)
            utilFlowIndentCheck.flowIndentCheck(bm.indent, value, onError);
          offset = valueNode.range[2];
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        } else {
          if (implicitKey)
            onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
          if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        }
      }
      if (commentEnd && commentEnd < offset)
        onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
      map.range = [bm.offset, offset, commentEnd ?? offset];
      return map;
    }
    exports.resolveBlockMap = resolveBlockMap;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-block-seq.js
var require_resolve_block_seq = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-block-seq.js"(exports) {
    "use strict";
    var YAMLSeq = require_YAMLSeq();
    var resolveProps = require_resolve_props();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLSeq.YAMLSeq;
      const seq = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = bs.offset;
      let commentEnd = null;
      for (const { start, value } of bs.items) {
        const props = resolveProps.resolveProps(start, {
          indicator: "seq-item-ind",
          next: value,
          offset,
          onError,
          parentIndent: bs.indent,
          startOnNewline: true
        });
        if (!props.found) {
          if (props.anchor || props.tag || value) {
            if (value?.type === "block-seq")
              onError(props.end, "BAD_INDENT", "All sequence items must start at the same column");
            else
              onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
          } else {
            commentEnd = props.end;
            if (props.comment)
              seq.comment = props.comment;
            continue;
          }
        }
        const node3 = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bs.indent, value, onError);
        offset = node3.range[2];
        seq.items.push(node3);
      }
      seq.range = [bs.offset, offset, commentEnd ?? offset];
      return seq;
    }
    exports.resolveBlockSeq = resolveBlockSeq;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-end.js
var require_resolve_end = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-end.js"(exports) {
    "use strict";
    function resolveEnd(end, offset, reqSpace, onError) {
      let comment = "";
      if (end) {
        let hasSpace = false;
        let sep = "";
        for (const token of end) {
          const { source, type } = token;
          switch (type) {
            case "space":
              hasSpace = true;
              break;
            case "comment": {
              if (reqSpace && !hasSpace)
                onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
              const cb = source.substring(1) || " ";
              if (!comment)
                comment = cb;
              else
                comment += sep + cb;
              sep = "";
              break;
            }
            case "newline":
              if (comment)
                sep += source;
              hasSpace = true;
              break;
            default:
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
          }
          offset += source.length;
        }
      }
      return { comment, offset };
    }
    exports.resolveEnd = resolveEnd;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-flow-collection.js
var require_resolve_flow_collection = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-flow-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilMapIncludes = require_util_map_includes();
    var blockMsg = "Block collections are not allowed within flow collections";
    var isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
    function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError, tag) {
      const isMap = fc.start.source === "{";
      const fcName = isMap ? "flow map" : "flow sequence";
      const NodeClass = tag?.nodeClass ?? (isMap ? YAMLMap.YAMLMap : YAMLSeq.YAMLSeq);
      const coll = new NodeClass(ctx.schema);
      coll.flow = true;
      const atRoot = ctx.atRoot;
      if (atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = fc.offset + fc.start.source.length;
      for (let i = 0; i < fc.items.length; ++i) {
        const collItem = fc.items[i];
        const { start, key, sep, value } = collItem;
        const props = resolveProps.resolveProps(start, {
          flow: fcName,
          indicator: "explicit-key-ind",
          next: key ?? sep?.[0],
          offset,
          onError,
          parentIndent: fc.indent,
          startOnNewline: false
        });
        if (!props.found) {
          if (!props.anchor && !props.tag && !sep && !value) {
            if (i === 0 && props.comma)
              onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
            else if (i < fc.items.length - 1)
              onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
            if (props.comment) {
              if (coll.comment)
                coll.comment += "\n" + props.comment;
              else
                coll.comment = props.comment;
            }
            offset = props.end;
            continue;
          }
          if (!isMap && ctx.options.strict && utilContainsNewline.containsNewline(key))
            onError(
              key,
              // checked by containsNewline()
              "MULTILINE_IMPLICIT_KEY",
              "Implicit keys of flow sequence pairs need to be on a single line"
            );
        }
        if (i === 0) {
          if (props.comma)
            onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
        } else {
          if (!props.comma)
            onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
          if (props.comment) {
            let prevItemComment = "";
            loop: for (const st of start) {
              switch (st.type) {
                case "comma":
                case "space":
                  break;
                case "comment":
                  prevItemComment = st.source.substring(1);
                  break loop;
                default:
                  break loop;
              }
            }
            if (prevItemComment) {
              let prev = coll.items[coll.items.length - 1];
              if (identity.isPair(prev))
                prev = prev.value ?? prev.key;
              if (prev.comment)
                prev.comment += "\n" + prevItemComment;
              else
                prev.comment = prevItemComment;
              props.comment = props.comment.substring(prevItemComment.length + 1);
            }
          }
        }
        if (!isMap && !sep && !props.found) {
          const valueNode = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, sep, null, props, onError);
          coll.items.push(valueNode);
          offset = valueNode.range[2];
          if (isBlock(value))
            onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
        } else {
          ctx.atKey = true;
          const keyStart = props.end;
          const keyNode = key ? composeNode(ctx, key, props, onError) : composeEmptyNode(ctx, keyStart, start, null, props, onError);
          if (isBlock(key))
            onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
          ctx.atKey = false;
          const valueProps = resolveProps.resolveProps(sep ?? [], {
            flow: fcName,
            indicator: "map-value-ind",
            next: value,
            offset: keyNode.range[2],
            onError,
            parentIndent: fc.indent,
            startOnNewline: false
          });
          if (valueProps.found) {
            if (!isMap && !props.found && ctx.options.strict) {
              if (sep)
                for (const st of sep) {
                  if (st === valueProps.found)
                    break;
                  if (st.type === "newline") {
                    onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
                    break;
                  }
                }
              if (props.start < valueProps.found.offset - 1024)
                onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
            }
          } else if (value) {
            if ("source" in value && value.source?.[0] === ":")
              onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
            else
              onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode(ctx, valueProps.end, sep, null, valueProps, onError) : null;
          if (valueNode) {
            if (isBlock(value))
              onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
          } else if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          if (isMap) {
            const map = coll;
            if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
              onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
            map.items.push(pair);
          } else {
            const map = new YAMLMap.YAMLMap(ctx.schema);
            map.flow = true;
            map.items.push(pair);
            const endRange = (valueNode ?? keyNode).range;
            map.range = [keyNode.range[0], endRange[1], endRange[2]];
            coll.items.push(map);
          }
          offset = valueNode ? valueNode.range[2] : valueProps.end;
        }
      }
      const expectedEnd = isMap ? "}" : "]";
      const [ce, ...ee] = fc.end;
      let cePos = offset;
      if (ce?.source === expectedEnd)
        cePos = ce.offset + ce.source.length;
      else {
        const name = fcName[0].toUpperCase() + fcName.substring(1);
        const msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
        onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
        if (ce && ce.source.length !== 1)
          ee.unshift(ce);
      }
      if (ee.length > 0) {
        const end = resolveEnd.resolveEnd(ee, cePos, ctx.options.strict, onError);
        if (end.comment) {
          if (coll.comment)
            coll.comment += "\n" + end.comment;
          else
            coll.comment = end.comment;
        }
        coll.range = [fc.offset, cePos, end.offset];
      } else {
        coll.range = [fc.offset, cePos, cePos];
      }
      return coll;
    }
    exports.resolveFlowCollection = resolveFlowCollection;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/compose-collection.js
var require_compose_collection = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/compose-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveBlockMap = require_resolve_block_map();
    var resolveBlockSeq = require_resolve_block_seq();
    var resolveFlowCollection = require_resolve_flow_collection();
    function resolveCollection(CN, ctx, token, onError, tagName, tag) {
      const coll = token.type === "block-map" ? resolveBlockMap.resolveBlockMap(CN, ctx, token, onError, tag) : token.type === "block-seq" ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token, onError, tag) : resolveFlowCollection.resolveFlowCollection(CN, ctx, token, onError, tag);
      const Coll = coll.constructor;
      if (tagName === "!" || tagName === Coll.tagName) {
        coll.tag = Coll.tagName;
        return coll;
      }
      if (tagName)
        coll.tag = tagName;
      return coll;
    }
    function composeCollection(CN, ctx, token, props, onError) {
      const tagToken = props.tag;
      const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg));
      if (token.type === "block-seq") {
        const { anchor: anchor2, newlineAfterProp: nl } = props;
        const lastProp = anchor2 && tagToken ? anchor2.offset > tagToken.offset ? anchor2 : tagToken : anchor2 ?? tagToken;
        if (lastProp && (!nl || nl.offset < lastProp.offset)) {
          const message = "Missing newline after block sequence props";
          onError(lastProp, "MISSING_CHAR", message);
        }
      }
      const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
      if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap.YAMLMap.tagName && expType === "map" || tagName === YAMLSeq.YAMLSeq.tagName && expType === "seq") {
        return resolveCollection(CN, ctx, token, onError, tagName);
      }
      let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
      if (!tag) {
        const kt = ctx.schema.knownTags[tagName];
        if (kt?.collection === expType) {
          ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
          tag = kt;
        } else {
          if (kt) {
            onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, true);
          } else {
            onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
          }
          return resolveCollection(CN, ctx, token, onError, tagName);
        }
      }
      const coll = resolveCollection(CN, ctx, token, onError, tagName, tag);
      const res = tag.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
      const node3 = identity.isNode(res) ? res : new Scalar.Scalar(res);
      node3.range = coll.range;
      node3.tag = tagName;
      if (tag?.format)
        node3.format = tag.format;
      return node3;
    }
    exports.composeCollection = composeCollection;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-block-scalar.js
var require_resolve_block_scalar = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-block-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function resolveBlockScalar(ctx, scalar, onError) {
      const start = scalar.offset;
      const header = parseBlockScalarHeader(scalar, ctx.options.strict, onError);
      if (!header)
        return { value: "", type: null, comment: "", range: [start, start, start] };
      const type = header.mode === ">" ? Scalar.Scalar.BLOCK_FOLDED : Scalar.Scalar.BLOCK_LITERAL;
      const lines = scalar.source ? splitLines(scalar.source) : [];
      let chompStart = lines.length;
      for (let i = lines.length - 1; i >= 0; --i) {
        const content = lines[i][1];
        if (content === "" || content === "\r")
          chompStart = i;
        else
          break;
      }
      if (chompStart === 0) {
        const value2 = header.chomp === "+" && lines.length > 0 ? "\n".repeat(Math.max(1, lines.length - 1)) : "";
        let end2 = start + header.length;
        if (scalar.source)
          end2 += scalar.source.length;
        return { value: value2, type, comment: header.comment, range: [start, end2, end2] };
      }
      let trimIndent = scalar.indent + header.indent;
      let offset = scalar.offset + header.length;
      let contentStart = 0;
      for (let i = 0; i < chompStart; ++i) {
        const [indent, content] = lines[i];
        if (content === "" || content === "\r") {
          if (header.indent === 0 && indent.length > trimIndent)
            trimIndent = indent.length;
        } else {
          if (indent.length < trimIndent) {
            const message = "Block scalars with more-indented leading empty lines must use an explicit indentation indicator";
            onError(offset + indent.length, "MISSING_CHAR", message);
          }
          if (header.indent === 0)
            trimIndent = indent.length;
          contentStart = i;
          if (trimIndent === 0 && !ctx.atRoot) {
            const message = "Block scalar values in collections must be indented";
            onError(offset, "BAD_INDENT", message);
          }
          break;
        }
        offset += indent.length + content.length + 1;
      }
      for (let i = lines.length - 1; i >= chompStart; --i) {
        if (lines[i][0].length > trimIndent)
          chompStart = i + 1;
      }
      let value = "";
      let sep = "";
      let prevMoreIndented = false;
      for (let i = 0; i < contentStart; ++i)
        value += lines[i][0].slice(trimIndent) + "\n";
      for (let i = contentStart; i < chompStart; ++i) {
        let [indent, content] = lines[i];
        offset += indent.length + content.length + 1;
        const crlf = content[content.length - 1] === "\r";
        if (crlf)
          content = content.slice(0, -1);
        if (content && indent.length < trimIndent) {
          const src = header.indent ? "explicit indentation indicator" : "first line";
          const message = `Block scalar lines must not be less indented than their ${src}`;
          onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message);
          indent = "";
        }
        if (type === Scalar.Scalar.BLOCK_LITERAL) {
          value += sep + indent.slice(trimIndent) + content;
          sep = "\n";
        } else if (indent.length > trimIndent || content[0] === "	") {
          if (sep === " ")
            sep = "\n";
          else if (!prevMoreIndented && sep === "\n")
            sep = "\n\n";
          value += sep + indent.slice(trimIndent) + content;
          sep = "\n";
          prevMoreIndented = true;
        } else if (content === "") {
          if (sep === "\n")
            value += "\n";
          else
            sep = "\n";
        } else {
          value += sep + content;
          sep = " ";
          prevMoreIndented = false;
        }
      }
      switch (header.chomp) {
        case "-":
          break;
        case "+":
          for (let i = chompStart; i < lines.length; ++i)
            value += "\n" + lines[i][0].slice(trimIndent);
          if (value[value.length - 1] !== "\n")
            value += "\n";
          break;
        default:
          value += "\n";
      }
      const end = start + header.length + scalar.source.length;
      return { value, type, comment: header.comment, range: [start, end, end] };
    }
    function parseBlockScalarHeader({ offset, props }, strict, onError) {
      if (props[0].type !== "block-scalar-header") {
        onError(props[0], "IMPOSSIBLE", "Block scalar header not found");
        return null;
      }
      const { source } = props[0];
      const mode = source[0];
      let indent = 0;
      let chomp = "";
      let error = -1;
      for (let i = 1; i < source.length; ++i) {
        const ch = source[i];
        if (!chomp && (ch === "-" || ch === "+"))
          chomp = ch;
        else {
          const n3 = Number(ch);
          if (!indent && n3)
            indent = n3;
          else if (error === -1)
            error = offset + i;
        }
      }
      if (error !== -1)
        onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
      let hasSpace = false;
      let comment = "";
      let length2 = source.length;
      for (let i = 1; i < props.length; ++i) {
        const token = props[i];
        switch (token.type) {
          case "space":
            hasSpace = true;
          // fallthrough
          case "newline":
            length2 += token.source.length;
            break;
          case "comment":
            if (strict && !hasSpace) {
              const message = "Comments must be separated from other tokens by white space characters";
              onError(token, "MISSING_CHAR", message);
            }
            length2 += token.source.length;
            comment = token.source.substring(1);
            break;
          case "error":
            onError(token, "UNEXPECTED_TOKEN", token.message);
            length2 += token.source.length;
            break;
          /* istanbul ignore next should not happen */
          default: {
            const message = `Unexpected token in block scalar header: ${token.type}`;
            onError(token, "UNEXPECTED_TOKEN", message);
            const ts = token.source;
            if (ts && typeof ts === "string")
              length2 += ts.length;
          }
        }
      }
      return { mode, indent, chomp, comment, length: length2 };
    }
    function splitLines(source) {
      const split = source.split(/\n( *)/);
      const first = split[0];
      const m = first.match(/^( *)/);
      const line0 = m?.[1] ? [m[1], first.slice(m[1].length)] : ["", first];
      const lines = [line0];
      for (let i = 1; i < split.length; i += 2)
        lines.push([split[i], split[i + 1]]);
      return lines;
    }
    exports.resolveBlockScalar = resolveBlockScalar;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-flow-scalar.js
var require_resolve_flow_scalar = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/resolve-flow-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var resolveEnd = require_resolve_end();
    function resolveFlowScalar(scalar, strict, onError) {
      const { offset, type, source, end } = scalar;
      let _type;
      let value;
      const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
      switch (type) {
        case "scalar":
          _type = Scalar.Scalar.PLAIN;
          value = plainValue(source, _onError);
          break;
        case "single-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_SINGLE;
          value = singleQuotedValue(source, _onError);
          break;
        case "double-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_DOUBLE;
          value = doubleQuotedValue(source, _onError);
          break;
        /* istanbul ignore next should not happen */
        default:
          onError(scalar, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
          return {
            value: "",
            type: null,
            comment: "",
            range: [offset, offset + source.length, offset + source.length]
          };
      }
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, strict, onError);
      return {
        value,
        type: _type,
        comment: re.comment,
        range: [offset, valueEnd, re.offset]
      };
    }
    function plainValue(source, onError) {
      let badChar = "";
      switch (source[0]) {
        /* istanbul ignore next should not happen */
        case "	":
          badChar = "a tab character";
          break;
        case ",":
          badChar = "flow indicator character ,";
          break;
        case "%":
          badChar = "directive indicator character %";
          break;
        case "|":
        case ">": {
          badChar = `block scalar indicator ${source[0]}`;
          break;
        }
        case "@":
        case "`": {
          badChar = `reserved character ${source[0]}`;
          break;
        }
      }
      if (badChar)
        onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
      return unfoldLines(source);
    }
    function singleQuotedValue(source, onError) {
      if (source[source.length - 1] !== "'" || source.length === 1)
        onError(source.length, "MISSING_CHAR", "Missing closing 'quote");
      return unfoldLines(source.slice(1, -1)).replace(/''/g, "'");
    }
    function unfoldLines(source) {
      const line = /(.*?)\r?\n/sy;
      let match = line.exec(source);
      if (!match)
        return source;
      let trimEnd, trimBoth;
      try {
        trimEnd = new RegExp("(?<![ 	])[ 	]+$");
        trimBoth = new RegExp("^[ 	]+|(?<![ 	])[ 	]+$", "g");
      } catch {
        trimEnd = /[ \t]+$/;
        trimBoth = /^[ \t]+|[ \t]+$/g;
      }
      let res = match[1].replace(trimEnd, "");
      let sep = " ";
      let pos = line.lastIndex;
      while (match = line.exec(source)) {
        const lm = match[1].replace(trimBoth, "");
        if (lm === "") {
          if (sep === "\n")
            res += sep;
          else
            sep = "\n";
        } else {
          res += sep + lm;
          sep = " ";
        }
        pos = line.lastIndex;
      }
      const last = /[ \t]*(.*)/sy;
      last.lastIndex = pos;
      match = last.exec(source);
      return res + sep + (match?.[1] ?? "");
    }
    function doubleQuotedValue(source, onError) {
      let res = "";
      for (let i = 1; i < source.length - 1; ++i) {
        const ch = source[i];
        if (ch === "\r" && source[i + 1] === "\n")
          continue;
        if (ch === "\n") {
          const { fold, offset } = foldNewline(source, i);
          res += fold;
          i = offset;
        } else if (ch === "\\") {
          let next = source[++i];
          const cc = escapeCodes[next];
          if (cc)
            res += cc;
          else if (next === "\n") {
            next = source[i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "\r" && source[i + 1] === "\n") {
            next = source[++i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "x" || next === "u" || next === "U") {
            const length2 = next === "x" ? 2 : next === "u" ? 4 : 8;
            res += parseCharCode(source, i + 1, length2, onError);
            i += length2;
          } else {
            const raw = source.substr(i - 1, 2);
            onError(i - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
            res += raw;
          }
        } else if (ch === " " || ch === "	") {
          const wsStart = i;
          let next = source[i + 1];
          while (next === " " || next === "	")
            next = source[++i + 1];
          if (next !== "\n" && !(next === "\r" && source[i + 2] === "\n"))
            res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
        } else {
          res += ch;
        }
      }
      if (source[source.length - 1] !== '"' || source.length === 1)
        onError(source.length, "MISSING_CHAR", 'Missing closing "quote');
      return res;
    }
    function foldNewline(source, offset) {
      let fold = "";
      let ch = source[offset + 1];
      while (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
        if (ch === "\r" && source[offset + 2] !== "\n")
          break;
        if (ch === "\n")
          fold += "\n";
        offset += 1;
        ch = source[offset + 1];
      }
      if (!fold)
        fold = " ";
      return { fold, offset };
    }
    var escapeCodes = {
      "0": "\0",
      // null character
      a: "\x07",
      // bell character
      b: "\b",
      // backspace
      e: "\x1B",
      // escape character
      f: "\f",
      // form feed
      n: "\n",
      // line feed
      r: "\r",
      // carriage return
      t: "	",
      // horizontal tab
      v: "\v",
      // vertical tab
      N: "\x85",
      // Unicode next line
      _: "\xA0",
      // Unicode non-breaking space
      L: "\u2028",
      // Unicode line separator
      P: "\u2029",
      // Unicode paragraph separator
      " ": " ",
      '"': '"',
      "/": "/",
      "\\": "\\",
      "	": "	"
    };
    function parseCharCode(source, offset, length2, onError) {
      const cc = source.substr(offset, length2);
      const ok = cc.length === length2 && /^[0-9a-fA-F]+$/.test(cc);
      const code = ok ? parseInt(cc, 16) : NaN;
      try {
        return String.fromCodePoint(code);
      } catch {
        const raw = source.substr(offset - 2, length2 + 2);
        onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
        return raw;
      }
    }
    exports.resolveFlowScalar = resolveFlowScalar;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/compose-scalar.js
var require_compose_scalar = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/compose-scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    function composeScalar(ctx, token, tagToken, onError) {
      const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar.resolveBlockScalar(ctx, token, onError) : resolveFlowScalar.resolveFlowScalar(token, ctx.options.strict, onError);
      const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
      let tag;
      if (ctx.options.stringKeys && ctx.atKey) {
        tag = ctx.schema[identity.SCALAR];
      } else if (tagName)
        tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
      else if (token.type === "scalar")
        tag = findScalarTagByTest(ctx, value, token, onError);
      else
        tag = ctx.schema[identity.SCALAR];
      let scalar;
      try {
        const res = tag.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
        scalar = identity.isScalar(res) ? res : new Scalar.Scalar(res);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
        scalar = new Scalar.Scalar(value);
      }
      scalar.range = range;
      scalar.source = value;
      if (type)
        scalar.type = type;
      if (tagName)
        scalar.tag = tagName;
      if (tag.format)
        scalar.format = tag.format;
      if (comment)
        scalar.comment = comment;
      return scalar;
    }
    function findScalarTagByName(schema, value, tagName, tagToken, onError) {
      if (tagName === "!")
        return schema[identity.SCALAR];
      const matchWithTest = [];
      for (const tag of schema.tags) {
        if (!tag.collection && tag.tag === tagName) {
          if (tag.default && tag.test)
            matchWithTest.push(tag);
          else
            return tag;
        }
      }
      for (const tag of matchWithTest)
        if (tag.test?.test(value))
          return tag;
      const kt = schema.knownTags[tagName];
      if (kt && !kt.collection) {
        schema.tags.push(Object.assign({}, kt, { default: false, test: void 0 }));
        return kt;
      }
      onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
      return schema[identity.SCALAR];
    }
    function findScalarTagByTest({ atKey, directives, schema }, value, token, onError) {
      const tag = schema.tags.find((tag2) => (tag2.default === true || atKey && tag2.default === "key") && tag2.test?.test(value)) || schema[identity.SCALAR];
      if (schema.compat) {
        const compat = schema.compat.find((tag2) => tag2.default && tag2.test?.test(value)) ?? schema[identity.SCALAR];
        if (tag.tag !== compat.tag) {
          const ts = directives.tagString(tag.tag);
          const cs = directives.tagString(compat.tag);
          const msg = `Value may be parsed as either ${ts} or ${cs}`;
          onError(token, "TAG_RESOLVE_FAILED", msg, true);
        }
      }
      return tag;
    }
    exports.composeScalar = composeScalar;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/util-empty-scalar-position.js
var require_util_empty_scalar_position = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/util-empty-scalar-position.js"(exports) {
    "use strict";
    function emptyScalarPosition(offset, before, pos) {
      if (before) {
        pos ?? (pos = before.length);
        for (let i = pos - 1; i >= 0; --i) {
          let st = before[i];
          switch (st.type) {
            case "space":
            case "comment":
            case "newline":
              offset -= st.source.length;
              continue;
          }
          st = before[++i];
          while (st?.type === "space") {
            offset += st.source.length;
            st = before[++i];
          }
          break;
        }
      }
      return offset;
    }
    exports.emptyScalarPosition = emptyScalarPosition;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/compose-node.js
var require_compose_node = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/compose-node.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var composeCollection = require_compose_collection();
    var composeScalar = require_compose_scalar();
    var resolveEnd = require_resolve_end();
    var utilEmptyScalarPosition = require_util_empty_scalar_position();
    var CN = { composeNode, composeEmptyNode };
    function composeNode(ctx, token, props, onError) {
      const atKey = ctx.atKey;
      const { spaceBefore, comment, anchor: anchor2, tag } = props;
      let node3;
      let isSrcToken = true;
      switch (token.type) {
        case "alias":
          node3 = composeAlias(ctx, token, onError);
          if (anchor2 || tag)
            onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
          break;
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "block-scalar":
          node3 = composeScalar.composeScalar(ctx, token, tag, onError);
          if (anchor2)
            node3.anchor = anchor2.source.substring(1);
          break;
        case "block-map":
        case "block-seq":
        case "flow-collection":
          try {
            node3 = composeCollection.composeCollection(CN, ctx, token, props, onError);
            if (anchor2)
              node3.anchor = anchor2.source.substring(1);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            onError(token, "RESOURCE_EXHAUSTION", message);
          }
          break;
        default: {
          const message = token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`;
          onError(token, "UNEXPECTED_TOKEN", message);
          isSrcToken = false;
        }
      }
      node3 ?? (node3 = composeEmptyNode(ctx, token.offset, void 0, null, props, onError));
      if (anchor2 && node3.anchor === "")
        onError(anchor2, "BAD_ALIAS", "Anchor cannot be an empty string");
      if (atKey && ctx.options.stringKeys && (!identity.isScalar(node3) || typeof node3.value !== "string" || node3.tag && node3.tag !== "tag:yaml.org,2002:str")) {
        const msg = "With stringKeys, all keys must be strings";
        onError(tag ?? token, "NON_STRING_KEY", msg);
      }
      if (spaceBefore)
        node3.spaceBefore = true;
      if (comment) {
        if (token.type === "scalar" && token.source === "")
          node3.comment = comment;
        else
          node3.commentBefore = comment;
      }
      if (ctx.options.keepSourceTokens && isSrcToken)
        node3.srcToken = token;
      return node3;
    }
    function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor: anchor2, tag, end }, onError) {
      const token = {
        type: "scalar",
        offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
        indent: -1,
        source: ""
      };
      const node3 = composeScalar.composeScalar(ctx, token, tag, onError);
      if (anchor2) {
        node3.anchor = anchor2.source.substring(1);
        if (node3.anchor === "")
          onError(anchor2, "BAD_ALIAS", "Anchor cannot be an empty string");
      }
      if (spaceBefore)
        node3.spaceBefore = true;
      if (comment) {
        node3.comment = comment;
        node3.range[2] = end;
      }
      return node3;
    }
    function composeAlias({ options }, { offset, source, end }, onError) {
      const alias = new Alias.Alias(source.substring(1));
      if (alias.source === "")
        onError(offset, "BAD_ALIAS", "Alias cannot be an empty string");
      if (alias.source.endsWith(":"))
        onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, options.strict, onError);
      alias.range = [offset, valueEnd, re.offset];
      if (re.comment)
        alias.comment = re.comment;
      return alias;
    }
    exports.composeEmptyNode = composeEmptyNode;
    exports.composeNode = composeNode;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/compose-doc.js
var require_compose_doc = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/compose-doc.js"(exports) {
    "use strict";
    var Document = require_Document();
    var composeNode = require_compose_node();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    function composeDoc(options, directives, { offset, start, value, end }, onError) {
      const opts = Object.assign({ _directives: directives }, options);
      const doc = new Document.Document(void 0, opts);
      const ctx = {
        atKey: false,
        atRoot: true,
        directives: doc.directives,
        options: doc.options,
        schema: doc.schema
      };
      const props = resolveProps.resolveProps(start, {
        indicator: "doc-start",
        next: value ?? end?.[0],
        offset,
        onError,
        parentIndent: 0,
        startOnNewline: true
      });
      if (props.found) {
        doc.directives.docStart = true;
        if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline)
          onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
      }
      doc.contents = value ? composeNode.composeNode(ctx, value, props, onError) : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError);
      const contentEnd = doc.contents.range[2];
      const re = resolveEnd.resolveEnd(end, contentEnd, false, onError);
      if (re.comment)
        doc.comment = re.comment;
      doc.range = [offset, contentEnd, re.offset];
      return doc;
    }
    exports.composeDoc = composeDoc;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/composer.js
var require_composer = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/compose/composer.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var directives = require_directives();
    var Document = require_Document();
    var errors = require_errors();
    var identity = require_identity();
    var composeDoc = require_compose_doc();
    var resolveEnd = require_resolve_end();
    function getErrorPos(src) {
      if (typeof src === "number")
        return [src, src + 1];
      if (Array.isArray(src))
        return src.length === 2 ? src : [src[0], src[1]];
      const { offset, source } = src;
      return [offset, offset + (typeof source === "string" ? source.length : 1)];
    }
    function parsePrelude(prelude) {
      let comment = "";
      let atComment = false;
      let afterEmptyLine = false;
      for (let i = 0; i < prelude.length; ++i) {
        const source = prelude[i];
        switch (source[0]) {
          case "#":
            comment += (comment === "" ? "" : afterEmptyLine ? "\n\n" : "\n") + (source.substring(1) || " ");
            atComment = true;
            afterEmptyLine = false;
            break;
          case "%":
            if (prelude[i + 1]?.[0] !== "#")
              i += 1;
            atComment = false;
            break;
          default:
            if (!atComment)
              afterEmptyLine = true;
            atComment = false;
        }
      }
      return { comment, afterEmptyLine };
    }
    var Composer = class {
      constructor(options = {}) {
        this.doc = null;
        this.atDirectives = false;
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
        this.onError = (source, code, message, warning) => {
          const pos = getErrorPos(source);
          if (warning)
            this.warnings.push(new errors.YAMLWarning(pos, code, message));
          else
            this.errors.push(new errors.YAMLParseError(pos, code, message));
        };
        this.directives = new directives.Directives({ version: options.version || "1.2" });
        this.options = options;
      }
      decorate(doc, afterDoc) {
        const { comment, afterEmptyLine } = parsePrelude(this.prelude);
        if (comment) {
          const dc = doc.contents;
          if (afterDoc) {
            doc.comment = doc.comment ? `${doc.comment}
${comment}` : comment;
          } else if (afterEmptyLine || doc.directives.docStart || !dc) {
            doc.commentBefore = comment;
          } else if (identity.isCollection(dc) && !dc.flow && dc.items.length > 0) {
            let it = dc.items[0];
            if (identity.isPair(it))
              it = it.key;
            const cb = it.commentBefore;
            it.commentBefore = cb ? `${comment}
${cb}` : comment;
          } else {
            const cb = dc.commentBefore;
            dc.commentBefore = cb ? `${comment}
${cb}` : comment;
          }
        }
        if (afterDoc) {
          for (let i = 0; i < this.errors.length; ++i)
            doc.errors.push(this.errors[i]);
          for (let i = 0; i < this.warnings.length; ++i)
            doc.warnings.push(this.warnings[i]);
        } else {
          doc.errors = this.errors;
          doc.warnings = this.warnings;
        }
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
      }
      /**
       * Current stream status information.
       *
       * Mostly useful at the end of input for an empty stream.
       */
      streamInfo() {
        return {
          comment: parsePrelude(this.prelude).comment,
          directives: this.directives,
          errors: this.errors,
          warnings: this.warnings
        };
      }
      /**
       * Compose tokens into documents.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *compose(tokens2, forceDoc = false, endOffset = -1) {
        for (const token of tokens2)
          yield* this.next(token);
        yield* this.end(forceDoc, endOffset);
      }
      /** Advance the composer by one CST token. */
      *next(token) {
        if (node_process.env.LOG_STREAM)
          console.dir(token, { depth: null });
        switch (token.type) {
          case "directive":
            this.directives.add(token.source, (offset, message, warning) => {
              const pos = getErrorPos(token);
              pos[0] += offset;
              this.onError(pos, "BAD_DIRECTIVE", message, warning);
            });
            this.prelude.push(token.source);
            this.atDirectives = true;
            break;
          case "document": {
            const doc = composeDoc.composeDoc(this.options, this.directives, token, this.onError);
            if (this.atDirectives && !doc.directives.docStart)
              this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
            this.decorate(doc, false);
            if (this.doc)
              yield this.doc;
            this.doc = doc;
            this.atDirectives = false;
            break;
          }
          case "byte-order-mark":
          case "space":
            break;
          case "comment":
          case "newline":
            this.prelude.push(token.source);
            break;
          case "error": {
            const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
            const error = new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
            if (this.atDirectives || !this.doc)
              this.errors.push(error);
            else
              this.doc.errors.push(error);
            break;
          }
          case "doc-end": {
            if (!this.doc) {
              const msg = "Unexpected doc-end without preceding document";
              this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg));
              break;
            }
            this.doc.directives.docEnd = true;
            const end = resolveEnd.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
            this.decorate(this.doc, true);
            if (end.comment) {
              const dc = this.doc.comment;
              this.doc.comment = dc ? `${dc}
${end.comment}` : end.comment;
            }
            this.doc.range[2] = end.offset;
            break;
          }
          default:
            this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
        }
      }
      /**
       * Call at end of input to yield any remaining document.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *end(forceDoc = false, endOffset = -1) {
        if (this.doc) {
          this.decorate(this.doc, true);
          yield this.doc;
          this.doc = null;
        } else if (forceDoc) {
          const opts = Object.assign({ _directives: this.directives }, this.options);
          const doc = new Document.Document(void 0, opts);
          if (this.atDirectives)
            this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
          doc.range = [0, endOffset, endOffset];
          this.decorate(doc, false);
          yield doc;
        }
      }
    };
    exports.Composer = Composer;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/cst-scalar.js
var require_cst_scalar = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/cst-scalar.js"(exports) {
    "use strict";
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    var errors = require_errors();
    var stringifyString = require_stringifyString();
    function resolveAsScalar(token, strict = true, onError) {
      if (token) {
        const _onError = (pos, code, message) => {
          const offset = typeof pos === "number" ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
          if (onError)
            onError(offset, code, message);
          else
            throw new errors.YAMLParseError([offset, offset + 1], code, message);
        };
        switch (token.type) {
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return resolveFlowScalar.resolveFlowScalar(token, strict, _onError);
          case "block-scalar":
            return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token, _onError);
        }
      }
      return null;
    }
    function createScalarToken(value, context) {
      const { implicitKey = false, indent, inFlow = false, offset = -1, type = "PLAIN" } = context;
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey,
        indent: indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      const end = context.end ?? [
        { type: "newline", offset: -1, indent, source: "\n" }
      ];
      switch (source[0]) {
        case "|":
        case ">": {
          const he = source.indexOf("\n");
          const head = source.substring(0, he);
          const body = source.substring(he + 1) + "\n";
          const props = [
            { type: "block-scalar-header", offset, indent, source: head }
          ];
          if (!addEndtoBlockProps(props, end))
            props.push({ type: "newline", offset: -1, indent, source: "\n" });
          return { type: "block-scalar", offset, indent, props, source: body };
        }
        case '"':
          return { type: "double-quoted-scalar", offset, indent, source, end };
        case "'":
          return { type: "single-quoted-scalar", offset, indent, source, end };
        default:
          return { type: "scalar", offset, indent, source, end };
      }
    }
    function setScalarValue(token, value, context = {}) {
      let { afterKey = false, implicitKey = false, inFlow = false, type } = context;
      let indent = "indent" in token ? token.indent : null;
      if (afterKey && typeof indent === "number")
        indent += 2;
      if (!type)
        switch (token.type) {
          case "single-quoted-scalar":
            type = "QUOTE_SINGLE";
            break;
          case "double-quoted-scalar":
            type = "QUOTE_DOUBLE";
            break;
          case "block-scalar": {
            const header = token.props[0];
            if (header.type !== "block-scalar-header")
              throw new Error("Invalid block scalar header");
            type = header.source[0] === ">" ? "BLOCK_FOLDED" : "BLOCK_LITERAL";
            break;
          }
          default:
            type = "PLAIN";
        }
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey: implicitKey || indent === null,
        indent: indent !== null && indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      switch (source[0]) {
        case "|":
        case ">":
          setBlockScalarValue(token, source);
          break;
        case '"':
          setFlowScalarValue(token, source, "double-quoted-scalar");
          break;
        case "'":
          setFlowScalarValue(token, source, "single-quoted-scalar");
          break;
        default:
          setFlowScalarValue(token, source, "scalar");
      }
    }
    function setBlockScalarValue(token, source) {
      const he = source.indexOf("\n");
      const head = source.substring(0, he);
      const body = source.substring(he + 1) + "\n";
      if (token.type === "block-scalar") {
        const header = token.props[0];
        if (header.type !== "block-scalar-header")
          throw new Error("Invalid block scalar header");
        header.source = head;
        token.source = body;
      } else {
        const { offset } = token;
        const indent = "indent" in token ? token.indent : -1;
        const props = [
          { type: "block-scalar-header", offset, indent, source: head }
        ];
        if (!addEndtoBlockProps(props, "end" in token ? token.end : void 0))
          props.push({ type: "newline", offset: -1, indent, source: "\n" });
        for (const key of Object.keys(token))
          if (key !== "type" && key !== "offset")
            delete token[key];
        Object.assign(token, { type: "block-scalar", indent, props, source: body });
      }
    }
    function addEndtoBlockProps(props, end) {
      if (end)
        for (const st of end)
          switch (st.type) {
            case "space":
            case "comment":
              props.push(st);
              break;
            case "newline":
              props.push(st);
              return true;
          }
      return false;
    }
    function setFlowScalarValue(token, source, type) {
      switch (token.type) {
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          token.type = type;
          token.source = source;
          break;
        case "block-scalar": {
          const end = token.props.slice(1);
          let oa = source.length;
          if (token.props[0].type === "block-scalar-header")
            oa -= token.props[0].source.length;
          for (const tok of end)
            tok.offset += oa;
          delete token.props;
          Object.assign(token, { type, source, end });
          break;
        }
        case "block-map":
        case "block-seq": {
          const offset = token.offset + source.length;
          const nl = { type: "newline", offset, indent: token.indent, source: "\n" };
          delete token.items;
          Object.assign(token, { type, source, end: [nl] });
          break;
        }
        default: {
          const indent = "indent" in token ? token.indent : -1;
          const end = "end" in token && Array.isArray(token.end) ? token.end.filter((st) => st.type === "space" || st.type === "comment" || st.type === "newline") : [];
          for (const key of Object.keys(token))
            if (key !== "type" && key !== "offset")
              delete token[key];
          Object.assign(token, { type, indent, source, end });
        }
      }
    }
    exports.createScalarToken = createScalarToken;
    exports.resolveAsScalar = resolveAsScalar;
    exports.setScalarValue = setScalarValue;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/cst-stringify.js
var require_cst_stringify = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/cst-stringify.js"(exports) {
    "use strict";
    var stringify2 = (cst) => "type" in cst ? stringifyToken(cst) : stringifyItem(cst);
    function stringifyToken(token) {
      switch (token.type) {
        case "block-scalar": {
          let res = "";
          for (const tok of token.props)
            res += stringifyToken(tok);
          return res + token.source;
        }
        case "block-map":
        case "block-seq": {
          let res = "";
          for (const item of token.items)
            res += stringifyItem(item);
          return res;
        }
        case "flow-collection": {
          let res = token.start.source;
          for (const item of token.items)
            res += stringifyItem(item);
          for (const st of token.end)
            res += st.source;
          return res;
        }
        case "document": {
          let res = stringifyItem(token);
          if (token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
        default: {
          let res = token.source;
          if ("end" in token && token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
      }
    }
    function stringifyItem({ start, key, sep, value }) {
      let res = "";
      for (const st of start)
        res += st.source;
      if (key)
        res += stringifyToken(key);
      if (sep)
        for (const st of sep)
          res += st.source;
      if (value)
        res += stringifyToken(value);
      return res;
    }
    exports.stringify = stringify2;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/cst-visit.js
var require_cst_visit = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/cst-visit.js"(exports) {
    "use strict";
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove item");
    function visit(cst, visitor) {
      if ("type" in cst && cst.type === "document")
        cst = { start: cst.start, value: cst.value };
      _visit(Object.freeze([]), cst, visitor);
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    visit.itemAtPath = (cst, path) => {
      let item = cst;
      for (const [field, index2] of path) {
        const tok = item?.[field];
        if (tok && "items" in tok) {
          item = tok.items[index2];
        } else
          return void 0;
      }
      return item;
    };
    visit.parentCollection = (cst, path) => {
      const parent = visit.itemAtPath(cst, path.slice(0, -1));
      const field = path[path.length - 1][0];
      const coll = parent?.[field];
      if (coll && "items" in coll)
        return coll;
      throw new Error("Parent collection not found");
    };
    function _visit(path, item, visitor) {
      let ctrl = visitor(item, path);
      if (typeof ctrl === "symbol")
        return ctrl;
      for (const field of ["key", "value"]) {
        const token = item[field];
        if (token && "items" in token) {
          for (let i = 0; i < token.items.length; ++i) {
            const ci = _visit(Object.freeze(path.concat([[field, i]])), token.items[i], visitor);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              token.items.splice(i, 1);
              i -= 1;
            }
          }
          if (typeof ctrl === "function" && field === "key")
            ctrl = ctrl(item, path);
        }
      }
      return typeof ctrl === "function" ? ctrl(item, path) : ctrl;
    }
    exports.visit = visit;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/cst.js
var require_cst = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/cst.js"(exports) {
    "use strict";
    var cstScalar = require_cst_scalar();
    var cstStringify = require_cst_stringify();
    var cstVisit = require_cst_visit();
    var BOM = "\uFEFF";
    var DOCUMENT = "";
    var FLOW_END = "";
    var SCALAR = "";
    var isCollection = (token) => !!token && "items" in token;
    var isScalar = (token) => !!token && (token.type === "scalar" || token.type === "single-quoted-scalar" || token.type === "double-quoted-scalar" || token.type === "block-scalar");
    function prettyToken(token) {
      switch (token) {
        case BOM:
          return "<BOM>";
        case DOCUMENT:
          return "<DOC>";
        case FLOW_END:
          return "<FLOW_END>";
        case SCALAR:
          return "<SCALAR>";
        default:
          return JSON.stringify(token);
      }
    }
    function tokenType(source) {
      switch (source) {
        case BOM:
          return "byte-order-mark";
        case DOCUMENT:
          return "doc-mode";
        case FLOW_END:
          return "flow-error-end";
        case SCALAR:
          return "scalar";
        case "---":
          return "doc-start";
        case "...":
          return "doc-end";
        case "":
        case "\n":
        case "\r\n":
          return "newline";
        case "-":
          return "seq-item-ind";
        case "?":
          return "explicit-key-ind";
        case ":":
          return "map-value-ind";
        case "{":
          return "flow-map-start";
        case "}":
          return "flow-map-end";
        case "[":
          return "flow-seq-start";
        case "]":
          return "flow-seq-end";
        case ",":
          return "comma";
      }
      switch (source[0]) {
        case " ":
        case "	":
          return "space";
        case "#":
          return "comment";
        case "%":
          return "directive-line";
        case "*":
          return "alias";
        case "&":
          return "anchor";
        case "!":
          return "tag";
        case "'":
          return "single-quoted-scalar";
        case '"':
          return "double-quoted-scalar";
        case "|":
        case ">":
          return "block-scalar-header";
      }
      return null;
    }
    exports.createScalarToken = cstScalar.createScalarToken;
    exports.resolveAsScalar = cstScalar.resolveAsScalar;
    exports.setScalarValue = cstScalar.setScalarValue;
    exports.stringify = cstStringify.stringify;
    exports.visit = cstVisit.visit;
    exports.BOM = BOM;
    exports.DOCUMENT = DOCUMENT;
    exports.FLOW_END = FLOW_END;
    exports.SCALAR = SCALAR;
    exports.isCollection = isCollection;
    exports.isScalar = isScalar;
    exports.prettyToken = prettyToken;
    exports.tokenType = tokenType;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/lexer.js
var require_lexer = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/lexer.js"(exports) {
    "use strict";
    var cst = require_cst();
    function isEmpty(ch) {
      switch (ch) {
        case void 0:
        case " ":
        case "\n":
        case "\r":
        case "	":
          return true;
        default:
          return false;
      }
    }
    var hexDigits = new Set("0123456789ABCDEFabcdef");
    var tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
    var flowIndicatorChars = new Set(",[]{}");
    var invalidAnchorChars = new Set(" ,[]{}\n\r	");
    var isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
    var Lexer = class {
      constructor() {
        this.atEnd = false;
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        this.buffer = "";
        this.flowKey = false;
        this.flowLevel = 0;
        this.indentNext = 0;
        this.indentValue = 0;
        this.lineEndPos = null;
        this.next = null;
        this.pos = 0;
      }
      /**
       * Generate YAML tokens from the `source` string. If `incomplete`,
       * a part of the last line may be left as a buffer for the next call.
       *
       * @returns A generator of lexical tokens
       */
      *lex(source, incomplete = false) {
        if (source) {
          if (typeof source !== "string")
            throw TypeError("source is not a string");
          this.buffer = this.buffer ? this.buffer + source : source;
          this.lineEndPos = null;
        }
        this.atEnd = !incomplete;
        let next = this.next ?? "stream";
        while (next && (incomplete || this.hasChars(1)))
          next = yield* this.parseNext(next);
      }
      atLineEnd() {
        let i = this.pos;
        let ch = this.buffer[i];
        while (ch === " " || ch === "	")
          ch = this.buffer[++i];
        if (!ch || ch === "#" || ch === "\n")
          return true;
        if (ch === "\r")
          return this.buffer[i + 1] === "\n";
        return false;
      }
      charAt(n3) {
        return this.buffer[this.pos + n3];
      }
      continueScalar(offset) {
        let ch = this.buffer[offset];
        if (this.indentNext > 0) {
          let indent = 0;
          while (ch === " ")
            ch = this.buffer[++indent + offset];
          if (ch === "\r") {
            const next = this.buffer[indent + offset + 1];
            if (next === "\n" || !next && !this.atEnd)
              return offset + indent + 1;
          }
          return ch === "\n" || indent >= this.indentNext || !ch && !this.atEnd ? offset + indent : -1;
        }
        if (ch === "-" || ch === ".") {
          const dt = this.buffer.substr(offset, 3);
          if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3]))
            return -1;
        }
        return offset;
      }
      getLine() {
        let end = this.lineEndPos;
        if (typeof end !== "number" || end !== -1 && end < this.pos) {
          end = this.buffer.indexOf("\n", this.pos);
          this.lineEndPos = end;
        }
        if (end === -1)
          return this.atEnd ? this.buffer.substring(this.pos) : null;
        if (this.buffer[end - 1] === "\r")
          end -= 1;
        return this.buffer.substring(this.pos, end);
      }
      hasChars(n3) {
        return this.pos + n3 <= this.buffer.length;
      }
      setNext(state) {
        this.buffer = this.buffer.substring(this.pos);
        this.pos = 0;
        this.lineEndPos = null;
        this.next = state;
        return null;
      }
      peek(n3) {
        return this.buffer.substr(this.pos, n3);
      }
      *parseNext(next) {
        switch (next) {
          case "stream":
            return yield* this.parseStream();
          case "line-start":
            return yield* this.parseLineStart();
          case "block-start":
            return yield* this.parseBlockStart();
          case "doc":
            return yield* this.parseDocument();
          case "flow":
            return yield* this.parseFlowCollection();
          case "quoted-scalar":
            return yield* this.parseQuotedScalar();
          case "block-scalar":
            return yield* this.parseBlockScalar();
          case "plain-scalar":
            return yield* this.parsePlainScalar();
        }
      }
      *parseStream() {
        let line = this.getLine();
        if (line === null)
          return this.setNext("stream");
        if (line[0] === cst.BOM) {
          yield* this.pushCount(1);
          line = line.substring(1);
        }
        if (line[0] === "%") {
          let dirEnd = line.length;
          let cs = line.indexOf("#");
          while (cs !== -1) {
            const ch = line[cs - 1];
            if (ch === " " || ch === "	") {
              dirEnd = cs - 1;
              break;
            } else {
              cs = line.indexOf("#", cs + 1);
            }
          }
          while (true) {
            const ch = line[dirEnd - 1];
            if (ch === " " || ch === "	")
              dirEnd -= 1;
            else
              break;
          }
          const n3 = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
          yield* this.pushCount(line.length - n3);
          this.pushNewline();
          return "stream";
        }
        if (this.atLineEnd()) {
          const sp = yield* this.pushSpaces(true);
          yield* this.pushCount(line.length - sp);
          yield* this.pushNewline();
          return "stream";
        }
        yield cst.DOCUMENT;
        return yield* this.parseLineStart();
      }
      *parseLineStart() {
        const ch = this.charAt(0);
        if (!ch && !this.atEnd)
          return this.setNext("line-start");
        if (ch === "-" || ch === ".") {
          if (!this.atEnd && !this.hasChars(4))
            return this.setNext("line-start");
          const s = this.peek(3);
          if ((s === "---" || s === "...") && isEmpty(this.charAt(3))) {
            yield* this.pushCount(3);
            this.indentValue = 0;
            this.indentNext = 0;
            return s === "---" ? "doc" : "stream";
          }
        }
        this.indentValue = yield* this.pushSpaces(false);
        if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
          this.indentNext = this.indentValue;
        return yield* this.parseBlockStart();
      }
      *parseBlockStart() {
        const [ch0, ch1] = this.peek(2);
        if (!ch1 && !this.atEnd)
          return this.setNext("block-start");
        if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
          const n3 = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
          this.indentNext = this.indentValue + 1;
          this.indentValue += n3;
          return "block-start";
        }
        return "doc";
      }
      *parseDocument() {
        yield* this.pushSpaces(true);
        const line = this.getLine();
        if (line === null)
          return this.setNext("doc");
        let n3 = yield* this.pushIndicators();
        switch (line[n3]) {
          case "#":
            yield* this.pushCount(line.length - n3);
          // fallthrough
          case void 0:
            yield* this.pushNewline();
            return yield* this.parseLineStart();
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel = 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            return "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "doc";
          case '"':
          case "'":
            return yield* this.parseQuotedScalar();
          case "|":
          case ">":
            n3 += yield* this.parseBlockScalarHeader();
            n3 += yield* this.pushSpaces(true);
            yield* this.pushCount(line.length - n3);
            yield* this.pushNewline();
            return yield* this.parseBlockScalar();
          default:
            return yield* this.parsePlainScalar();
        }
      }
      *parseFlowCollection() {
        let nl, sp;
        let indent = -1;
        do {
          nl = yield* this.pushNewline();
          if (nl > 0) {
            sp = yield* this.pushSpaces(false);
            this.indentValue = indent = sp;
          } else {
            sp = 0;
          }
          sp += yield* this.pushSpaces(true);
        } while (nl + sp > 0);
        const line = this.getLine();
        if (line === null)
          return this.setNext("flow");
        if (indent !== -1 && indent < this.indentNext && line[0] !== "#" || indent === 0 && (line.startsWith("---") || line.startsWith("...")) && isEmpty(line[3])) {
          const atFlowEndMarker = indent === this.indentNext - 1 && this.flowLevel === 1 && (line[0] === "]" || line[0] === "}");
          if (!atFlowEndMarker) {
            this.flowLevel = 0;
            yield cst.FLOW_END;
            return yield* this.parseLineStart();
          }
        }
        let n3 = 0;
        while (line[n3] === ",") {
          n3 += yield* this.pushCount(1);
          n3 += yield* this.pushSpaces(true);
          this.flowKey = false;
        }
        n3 += yield* this.pushIndicators();
        switch (line[n3]) {
          case void 0:
            return "flow";
          case "#":
            yield* this.pushCount(line.length - n3);
            return "flow";
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel += 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            this.flowKey = true;
            this.flowLevel -= 1;
            return this.flowLevel ? "flow" : "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "flow";
          case '"':
          case "'":
            this.flowKey = true;
            return yield* this.parseQuotedScalar();
          case ":": {
            const next = this.charAt(1);
            if (this.flowKey || isEmpty(next) || next === ",") {
              this.flowKey = false;
              yield* this.pushCount(1);
              yield* this.pushSpaces(true);
              return "flow";
            }
          }
          // fallthrough
          default:
            this.flowKey = false;
            return yield* this.parsePlainScalar();
        }
      }
      *parseQuotedScalar() {
        const quote = this.charAt(0);
        let end = this.buffer.indexOf(quote, this.pos + 1);
        if (quote === "'") {
          while (end !== -1 && this.buffer[end + 1] === "'")
            end = this.buffer.indexOf("'", end + 2);
        } else {
          while (end !== -1) {
            let n3 = 0;
            while (this.buffer[end - 1 - n3] === "\\")
              n3 += 1;
            if (n3 % 2 === 0)
              break;
            end = this.buffer.indexOf('"', end + 1);
          }
        }
        const qb = this.buffer.substring(0, end);
        let nl = qb.indexOf("\n", this.pos);
        if (nl !== -1) {
          while (nl !== -1) {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = qb.indexOf("\n", cs);
          }
          if (nl !== -1) {
            end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
          }
        }
        if (end === -1) {
          if (!this.atEnd)
            return this.setNext("quoted-scalar");
          end = this.buffer.length;
        }
        yield* this.pushToIndex(end + 1, false);
        return this.flowLevel ? "flow" : "doc";
      }
      *parseBlockScalarHeader() {
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        let i = this.pos;
        while (true) {
          const ch = this.buffer[++i];
          if (ch === "+")
            this.blockScalarKeep = true;
          else if (ch > "0" && ch <= "9")
            this.blockScalarIndent = Number(ch) - 1;
          else if (ch !== "-")
            break;
        }
        return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
      }
      *parseBlockScalar() {
        let nl = this.pos - 1;
        let indent = 0;
        let ch;
        loop: for (let i2 = this.pos; ch = this.buffer[i2]; ++i2) {
          switch (ch) {
            case " ":
              indent += 1;
              break;
            case "\n":
              nl = i2;
              indent = 0;
              break;
            case "\r": {
              const next = this.buffer[i2 + 1];
              if (!next && !this.atEnd)
                return this.setNext("block-scalar");
              if (next === "\n")
                break;
            }
            // fallthrough
            default:
              break loop;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("block-scalar");
        if (indent >= this.indentNext) {
          if (this.blockScalarIndent === -1)
            this.indentNext = indent;
          else {
            this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
          }
          do {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = this.buffer.indexOf("\n", cs);
          } while (nl !== -1);
          if (nl === -1) {
            if (!this.atEnd)
              return this.setNext("block-scalar");
            nl = this.buffer.length;
          }
        }
        let i = nl + 1;
        ch = this.buffer[i];
        while (ch === " ")
          ch = this.buffer[++i];
        if (ch === "	") {
          while (ch === "	" || ch === " " || ch === "\r" || ch === "\n")
            ch = this.buffer[++i];
          nl = i - 1;
        } else if (!this.blockScalarKeep) {
          do {
            let i2 = nl - 1;
            let ch2 = this.buffer[i2];
            if (ch2 === "\r")
              ch2 = this.buffer[--i2];
            const lastChar = i2;
            while (ch2 === " ")
              ch2 = this.buffer[--i2];
            if (ch2 === "\n" && i2 >= this.pos && i2 + 1 + indent > lastChar)
              nl = i2;
            else
              break;
          } while (true);
        }
        yield cst.SCALAR;
        yield* this.pushToIndex(nl + 1, true);
        return yield* this.parseLineStart();
      }
      *parsePlainScalar() {
        const inFlow = this.flowLevel > 0;
        let end = this.pos - 1;
        let i = this.pos - 1;
        let ch;
        while (ch = this.buffer[++i]) {
          if (ch === ":") {
            const next = this.buffer[i + 1];
            if (isEmpty(next) || inFlow && flowIndicatorChars.has(next))
              break;
            end = i;
          } else if (isEmpty(ch)) {
            let next = this.buffer[i + 1];
            if (ch === "\r") {
              if (next === "\n") {
                i += 1;
                ch = "\n";
                next = this.buffer[i + 1];
              } else
                end = i;
            }
            if (next === "#" || inFlow && flowIndicatorChars.has(next))
              break;
            if (ch === "\n") {
              const cs = this.continueScalar(i + 1);
              if (cs === -1)
                break;
              i = Math.max(i, cs - 2);
            }
          } else {
            if (inFlow && flowIndicatorChars.has(ch))
              break;
            end = i;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("plain-scalar");
        yield cst.SCALAR;
        yield* this.pushToIndex(end + 1, true);
        return inFlow ? "flow" : "doc";
      }
      *pushCount(n3) {
        if (n3 > 0) {
          yield this.buffer.substr(this.pos, n3);
          this.pos += n3;
          return n3;
        }
        return 0;
      }
      *pushToIndex(i, allowEmpty) {
        const s = this.buffer.slice(this.pos, i);
        if (s) {
          yield s;
          this.pos += s.length;
          return s.length;
        } else if (allowEmpty)
          yield "";
        return 0;
      }
      *pushIndicators() {
        let n3 = 0;
        loop: while (true) {
          switch (this.charAt(0)) {
            case "!":
              n3 += yield* this.pushTag();
              n3 += yield* this.pushSpaces(true);
              continue loop;
            case "&":
              n3 += yield* this.pushUntil(isNotAnchorChar);
              n3 += yield* this.pushSpaces(true);
              continue loop;
            case "-":
            // this is an error
            case "?":
            // this is an error outside flow collections
            case ":": {
              const inFlow = this.flowLevel > 0;
              const ch1 = this.charAt(1);
              if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
                if (!inFlow)
                  this.indentNext = this.indentValue + 1;
                else if (this.flowKey)
                  this.flowKey = false;
                n3 += yield* this.pushCount(1);
                n3 += yield* this.pushSpaces(true);
                continue loop;
              }
            }
          }
          break loop;
        }
        return n3;
      }
      *pushTag() {
        if (this.charAt(1) === "<") {
          let i = this.pos + 2;
          let ch = this.buffer[i];
          while (!isEmpty(ch) && ch !== ">")
            ch = this.buffer[++i];
          return yield* this.pushToIndex(ch === ">" ? i + 1 : i, false);
        } else {
          let i = this.pos + 1;
          let ch = this.buffer[i];
          while (ch) {
            if (tagChars.has(ch))
              ch = this.buffer[++i];
            else if (ch === "%" && hexDigits.has(this.buffer[i + 1]) && hexDigits.has(this.buffer[i + 2])) {
              ch = this.buffer[i += 3];
            } else
              break;
          }
          return yield* this.pushToIndex(i, false);
        }
      }
      *pushNewline() {
        const ch = this.buffer[this.pos];
        if (ch === "\n")
          return yield* this.pushCount(1);
        else if (ch === "\r" && this.charAt(1) === "\n")
          return yield* this.pushCount(2);
        else
          return 0;
      }
      *pushSpaces(allowTabs) {
        let i = this.pos - 1;
        let ch;
        do {
          ch = this.buffer[++i];
        } while (ch === " " || allowTabs && ch === "	");
        const n3 = i - this.pos;
        if (n3 > 0) {
          yield this.buffer.substr(this.pos, n3);
          this.pos = i;
        }
        return n3;
      }
      *pushUntil(test) {
        let i = this.pos;
        let ch = this.buffer[i];
        while (!test(ch))
          ch = this.buffer[++i];
        return yield* this.pushToIndex(i, false);
      }
    };
    exports.Lexer = Lexer;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/line-counter.js
var require_line_counter = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/line-counter.js"(exports) {
    "use strict";
    var LineCounter = class {
      constructor() {
        this.lineStarts = [];
        this.addNewLine = (offset) => this.lineStarts.push(offset);
        this.linePos = (offset) => {
          let low = 0;
          let high = this.lineStarts.length;
          while (low < high) {
            const mid = low + high >> 1;
            if (this.lineStarts[mid] < offset)
              low = mid + 1;
            else
              high = mid;
          }
          if (this.lineStarts[low] === offset)
            return { line: low + 1, col: 1 };
          if (low === 0)
            return { line: 0, col: offset };
          const start = this.lineStarts[low - 1];
          return { line: low, col: offset - start + 1 };
        };
      }
    };
    exports.LineCounter = LineCounter;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/parser.js
var require_parser = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/parse/parser.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var cst = require_cst();
    var lexer = require_lexer();
    function includesToken(list, type) {
      for (let i = 0; i < list.length; ++i)
        if (list[i].type === type)
          return true;
      return false;
    }
    function findNonEmptyIndex(list) {
      for (let i = 0; i < list.length; ++i) {
        switch (list[i].type) {
          case "space":
          case "comment":
          case "newline":
            break;
          default:
            return i;
        }
      }
      return -1;
    }
    function isFlowToken(token) {
      switch (token?.type) {
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "flow-collection":
          return true;
        default:
          return false;
      }
    }
    function getPrevProps(parent) {
      switch (parent.type) {
        case "document":
          return parent.start;
        case "block-map": {
          const it = parent.items[parent.items.length - 1];
          return it.sep ?? it.start;
        }
        case "block-seq":
          return parent.items[parent.items.length - 1].start;
        /* istanbul ignore next should not happen */
        default:
          return [];
      }
    }
    function getFirstKeyStartProps(prev) {
      if (prev.length === 0)
        return [];
      let i = prev.length;
      loop: while (--i >= 0) {
        switch (prev[i].type) {
          case "doc-start":
          case "explicit-key-ind":
          case "map-value-ind":
          case "seq-item-ind":
          case "newline":
            break loop;
        }
      }
      while (prev[++i]?.type === "space") {
      }
      return prev.splice(i, prev.length);
    }
    function arrayPushArray(target, source) {
      if (source.length < 1e5)
        Array.prototype.push.apply(target, source);
      else
        for (let i = 0; i < source.length; ++i)
          target.push(source[i]);
    }
    function fixFlowSeqItems(fc) {
      if (fc.start.type === "flow-seq-start") {
        for (const it of fc.items) {
          if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
            if (it.key)
              it.value = it.key;
            delete it.key;
            if (isFlowToken(it.value)) {
              if (it.value.end)
                arrayPushArray(it.value.end, it.sep);
              else
                it.value.end = it.sep;
            } else
              arrayPushArray(it.start, it.sep);
            delete it.sep;
          }
        }
      }
    }
    var Parser = class {
      /**
       * @param onNewLine - If defined, called separately with the start position of
       *   each new line (in `parse()`, including the start of input).
       */
      constructor(onNewLine) {
        this.atNewLine = true;
        this.atScalar = false;
        this.indent = 0;
        this.offset = 0;
        this.onKeyLine = false;
        this.stack = [];
        this.source = "";
        this.type = "";
        this.lexer = new lexer.Lexer();
        this.onNewLine = onNewLine;
      }
      /**
       * Parse `source` as a YAML stream.
       * If `incomplete`, a part of the last line may be left as a buffer for the next call.
       *
       * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
       *
       * @returns A generator of tokens representing each directive, document, and other structure.
       */
      *parse(source, incomplete = false) {
        if (this.onNewLine && this.offset === 0)
          this.onNewLine(0);
        for (const lexeme of this.lexer.lex(source, incomplete))
          yield* this.next(lexeme);
        if (!incomplete)
          yield* this.end();
      }
      /**
       * Advance the parser by the `source` of one lexical token.
       */
      *next(source) {
        this.source = source;
        if (node_process.env.LOG_TOKENS)
          console.log("|", cst.prettyToken(source));
        if (this.atScalar) {
          this.atScalar = false;
          yield* this.step();
          this.offset += source.length;
          return;
        }
        const type = cst.tokenType(source);
        if (!type) {
          const message = `Not a YAML token: ${source}`;
          yield* this.pop({ type: "error", offset: this.offset, message, source });
          this.offset += source.length;
        } else if (type === "scalar") {
          this.atNewLine = false;
          this.atScalar = true;
          this.type = "scalar";
        } else {
          this.type = type;
          yield* this.step();
          switch (type) {
            case "newline":
              this.atNewLine = true;
              this.indent = 0;
              if (this.onNewLine)
                this.onNewLine(this.offset + source.length);
              break;
            case "space":
              if (this.atNewLine && source[0] === " ")
                this.indent += source.length;
              break;
            case "explicit-key-ind":
            case "map-value-ind":
            case "seq-item-ind":
              if (this.atNewLine)
                this.indent += source.length;
              break;
            case "doc-mode":
            case "flow-error-end":
              return;
            default:
              this.atNewLine = false;
          }
          this.offset += source.length;
        }
      }
      /** Call at end of input to push out any remaining constructions */
      *end() {
        while (this.stack.length > 0)
          yield* this.pop();
      }
      get sourceToken() {
        const st = {
          type: this.type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
        return st;
      }
      *step() {
        const top = this.peek(1);
        if (this.type === "doc-end" && top?.type !== "doc-end") {
          while (this.stack.length > 0)
            yield* this.pop();
          this.stack.push({
            type: "doc-end",
            offset: this.offset,
            source: this.source
          });
          return;
        }
        if (!top)
          return yield* this.stream();
        switch (top.type) {
          case "document":
            return yield* this.document(top);
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return yield* this.scalar(top);
          case "block-scalar":
            return yield* this.blockScalar(top);
          case "block-map":
            return yield* this.blockMap(top);
          case "block-seq":
            return yield* this.blockSequence(top);
          case "flow-collection":
            return yield* this.flowCollection(top);
          case "doc-end":
            return yield* this.documentEnd(top);
        }
        yield* this.pop();
      }
      peek(n3) {
        return this.stack[this.stack.length - n3];
      }
      *pop(error) {
        const token = error ?? this.stack.pop();
        if (!token) {
          const message = "Tried to pop an empty stack";
          yield { type: "error", offset: this.offset, source: "", message };
        } else if (this.stack.length === 0) {
          yield token;
        } else {
          const top = this.peek(1);
          if (token.type === "block-scalar") {
            token.indent = "indent" in top ? top.indent : 0;
          } else if (token.type === "flow-collection" && top.type === "document") {
            token.indent = 0;
          }
          if (token.type === "flow-collection")
            fixFlowSeqItems(token);
          switch (top.type) {
            case "document":
              top.value = token;
              break;
            case "block-scalar":
              top.props.push(token);
              break;
            case "block-map": {
              const it = top.items[top.items.length - 1];
              if (it.value) {
                top.items.push({ start: [], key: token, sep: [] });
                this.onKeyLine = true;
                return;
              } else if (it.sep) {
                it.value = token;
              } else {
                Object.assign(it, { key: token, sep: [] });
                this.onKeyLine = !it.explicitKey;
                return;
              }
              break;
            }
            case "block-seq": {
              const it = top.items[top.items.length - 1];
              if (it.value)
                top.items.push({ start: [], value: token });
              else
                it.value = token;
              break;
            }
            case "flow-collection": {
              const it = top.items[top.items.length - 1];
              if (!it || it.value)
                top.items.push({ start: [], key: token, sep: [] });
              else if (it.sep)
                it.value = token;
              else
                Object.assign(it, { key: token, sep: [] });
              return;
            }
            /* istanbul ignore next should not happen */
            default:
              yield* this.pop();
              yield* this.pop(token);
          }
          if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
            const last = token.items[token.items.length - 1];
            if (last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
              if (top.type === "document")
                top.end = last.start;
              else
                top.items.push({ start: last.start });
              token.items.splice(-1, 1);
            }
          }
        }
      }
      *stream() {
        switch (this.type) {
          case "directive-line":
            yield { type: "directive", offset: this.offset, source: this.source };
            return;
          case "byte-order-mark":
          case "space":
          case "comment":
          case "newline":
            yield this.sourceToken;
            return;
          case "doc-mode":
          case "doc-start": {
            const doc = {
              type: "document",
              offset: this.offset,
              start: []
            };
            if (this.type === "doc-start")
              doc.start.push(this.sourceToken);
            this.stack.push(doc);
            return;
          }
        }
        yield {
          type: "error",
          offset: this.offset,
          message: `Unexpected ${this.type} token in YAML stream`,
          source: this.source
        };
      }
      *document(doc) {
        if (doc.value)
          return yield* this.lineEnd(doc);
        switch (this.type) {
          case "doc-start": {
            if (findNonEmptyIndex(doc.start) !== -1) {
              yield* this.pop();
              yield* this.step();
            } else
              doc.start.push(this.sourceToken);
            return;
          }
          case "anchor":
          case "tag":
          case "space":
          case "comment":
          case "newline":
            doc.start.push(this.sourceToken);
            return;
        }
        const bv = this.startBlockValue(doc);
        if (bv)
          this.stack.push(bv);
        else {
          yield {
            type: "error",
            offset: this.offset,
            message: `Unexpected ${this.type} token in YAML document`,
            source: this.source
          };
        }
      }
      *scalar(scalar) {
        if (this.type === "map-value-ind") {
          const prev = getPrevProps(this.peek(2));
          const start = getFirstKeyStartProps(prev);
          let sep;
          if (scalar.end) {
            sep = scalar.end;
            sep.push(this.sourceToken);
            delete scalar.end;
          } else
            sep = [this.sourceToken];
          const map = {
            type: "block-map",
            offset: scalar.offset,
            indent: scalar.indent,
            items: [{ start, key: scalar, sep }]
          };
          this.onKeyLine = true;
          this.stack[this.stack.length - 1] = map;
        } else
          yield* this.lineEnd(scalar);
      }
      *blockScalar(scalar) {
        switch (this.type) {
          case "space":
          case "comment":
          case "newline":
            scalar.props.push(this.sourceToken);
            return;
          case "scalar":
            scalar.source = this.source;
            this.atNewLine = true;
            this.indent = 0;
            if (this.onNewLine) {
              let nl = this.source.indexOf("\n") + 1;
              while (nl !== 0) {
                this.onNewLine(this.offset + nl);
                nl = this.source.indexOf("\n", nl) + 1;
              }
            }
            yield* this.pop();
            break;
          /* istanbul ignore next should not happen */
          default:
            yield* this.pop();
            yield* this.step();
        }
      }
      *blockMap(map) {
        const it = map.items[map.items.length - 1];
        switch (this.type) {
          case "newline":
            this.onKeyLine = false;
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              it.start.push(this.sourceToken);
            }
            return;
          case "space":
          case "comment":
            if (it.value) {
              map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              if (this.atIndentedComment(it.start, map.indent)) {
                const prev = map.items[map.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  map.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
        }
        if (this.indent >= map.indent) {
          const atMapIndent = !this.onKeyLine && this.indent === map.indent;
          const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
          let start = [];
          if (atNextItem && it.sep && !it.value) {
            const nl = [];
            for (let i = 0; i < it.sep.length; ++i) {
              const st = it.sep[i];
              switch (st.type) {
                case "newline":
                  nl.push(i);
                  break;
                case "space":
                  break;
                case "comment":
                  if (st.indent > map.indent)
                    nl.length = 0;
                  break;
                default:
                  nl.length = 0;
              }
            }
            if (nl.length >= 2)
              start = it.sep.splice(nl[1]);
          }
          switch (this.type) {
            case "anchor":
            case "tag":
              if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start });
                this.onKeyLine = true;
              } else if (it.sep) {
                it.sep.push(this.sourceToken);
              } else {
                it.start.push(this.sourceToken);
              }
              return;
            case "explicit-key-ind":
              if (!it.sep && !it.explicitKey) {
                it.start.push(this.sourceToken);
                it.explicitKey = true;
              } else if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start, explicitKey: true });
              } else {
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: [this.sourceToken], explicitKey: true }]
                });
              }
              this.onKeyLine = true;
              return;
            case "map-value-ind":
              if (it.explicitKey) {
                if (!it.sep) {
                  if (includesToken(it.start, "newline")) {
                    Object.assign(it, { key: null, sep: [this.sourceToken] });
                  } else {
                    const start2 = getFirstKeyStartProps(it.start);
                    this.stack.push({
                      type: "block-map",
                      offset: this.offset,
                      indent: this.indent,
                      items: [{ start: start2, key: null, sep: [this.sourceToken] }]
                    });
                  }
                } else if (it.value) {
                  map.items.push({ start: [], key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start, key: null, sep: [this.sourceToken] }]
                  });
                } else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
                  const start2 = getFirstKeyStartProps(it.start);
                  const key = it.key;
                  const sep = it.sep;
                  sep.push(this.sourceToken);
                  delete it.key;
                  delete it.sep;
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: start2, key, sep }]
                  });
                } else if (start.length > 0) {
                  it.sep = it.sep.concat(start, this.sourceToken);
                } else {
                  it.sep.push(this.sourceToken);
                }
              } else {
                if (!it.sep) {
                  Object.assign(it, { key: null, sep: [this.sourceToken] });
                } else if (it.value || atNextItem) {
                  map.items.push({ start, key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: [], key: null, sep: [this.sourceToken] }]
                  });
                } else {
                  it.sep.push(this.sourceToken);
                }
              }
              this.onKeyLine = true;
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (atNextItem || it.value) {
                map.items.push({ start, key: fs, sep: [] });
                this.onKeyLine = true;
              } else if (it.sep) {
                this.stack.push(fs);
              } else {
                Object.assign(it, { key: fs, sep: [] });
                this.onKeyLine = true;
              }
              return;
            }
            default: {
              const bv = this.startBlockValue(map);
              if (bv) {
                if (bv.type === "block-seq") {
                  if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
                    yield* this.pop({
                      type: "error",
                      offset: this.offset,
                      message: "Unexpected block-seq-ind on same line with key",
                      source: this.source
                    });
                    return;
                  }
                } else if (atMapIndent) {
                  map.items.push({ start });
                }
                this.stack.push(bv);
                return;
              }
            }
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *blockSequence(seq) {
        const it = seq.items[seq.items.length - 1];
        switch (this.type) {
          case "newline":
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                seq.items.push({ start: [this.sourceToken] });
            } else
              it.start.push(this.sourceToken);
            return;
          case "space":
          case "comment":
            if (it.value)
              seq.items.push({ start: [this.sourceToken] });
            else {
              if (this.atIndentedComment(it.start, seq.indent)) {
                const prev = seq.items[seq.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  seq.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
          case "anchor":
          case "tag":
            if (it.value || this.indent <= seq.indent)
              break;
            it.start.push(this.sourceToken);
            return;
          case "seq-item-ind":
            if (this.indent !== seq.indent)
              break;
            if (it.value || includesToken(it.start, "seq-item-ind"))
              seq.items.push({ start: [this.sourceToken] });
            else
              it.start.push(this.sourceToken);
            return;
        }
        if (this.indent > seq.indent) {
          const bv = this.startBlockValue(seq);
          if (bv) {
            this.stack.push(bv);
            return;
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *flowCollection(fc) {
        const it = fc.items[fc.items.length - 1];
        if (this.type === "flow-error-end") {
          let top;
          do {
            yield* this.pop();
            top = this.peek(1);
          } while (top?.type === "flow-collection");
        } else if (fc.end.length === 0) {
          switch (this.type) {
            case "comma":
            case "explicit-key-ind":
              if (!it || it.sep)
                fc.items.push({ start: [this.sourceToken] });
              else
                it.start.push(this.sourceToken);
              return;
            case "map-value-ind":
              if (!it || it.value)
                fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                Object.assign(it, { key: null, sep: [this.sourceToken] });
              return;
            case "space":
            case "comment":
            case "newline":
            case "anchor":
            case "tag":
              if (!it || it.value)
                fc.items.push({ start: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                it.start.push(this.sourceToken);
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (!it || it.value)
                fc.items.push({ start: [], key: fs, sep: [] });
              else if (it.sep)
                this.stack.push(fs);
              else
                Object.assign(it, { key: fs, sep: [] });
              return;
            }
            case "flow-map-end":
            case "flow-seq-end":
              fc.end.push(this.sourceToken);
              return;
          }
          const bv = this.startBlockValue(fc);
          if (bv)
            this.stack.push(bv);
          else {
            yield* this.pop();
            yield* this.step();
          }
        } else {
          const parent = this.peek(2);
          if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
            yield* this.pop();
            yield* this.step();
          } else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            fixFlowSeqItems(fc);
            const sep = fc.end.splice(1, fc.end.length);
            sep.push(this.sourceToken);
            const map = {
              type: "block-map",
              offset: fc.offset,
              indent: fc.indent,
              items: [{ start, key: fc, sep }]
            };
            this.onKeyLine = true;
            this.stack[this.stack.length - 1] = map;
          } else {
            yield* this.lineEnd(fc);
          }
        }
      }
      flowScalar(type) {
        if (this.onNewLine) {
          let nl = this.source.indexOf("\n") + 1;
          while (nl !== 0) {
            this.onNewLine(this.offset + nl);
            nl = this.source.indexOf("\n", nl) + 1;
          }
        }
        return {
          type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
      }
      startBlockValue(parent) {
        switch (this.type) {
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return this.flowScalar(this.type);
          case "block-scalar-header":
            return {
              type: "block-scalar",
              offset: this.offset,
              indent: this.indent,
              props: [this.sourceToken],
              source: ""
            };
          case "flow-map-start":
          case "flow-seq-start":
            return {
              type: "flow-collection",
              offset: this.offset,
              indent: this.indent,
              start: this.sourceToken,
              items: [],
              end: []
            };
          case "seq-item-ind":
            return {
              type: "block-seq",
              offset: this.offset,
              indent: this.indent,
              items: [{ start: [this.sourceToken] }]
            };
          case "explicit-key-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            start.push(this.sourceToken);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, explicitKey: true }]
            };
          }
          case "map-value-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, key: null, sep: [this.sourceToken] }]
            };
          }
        }
        return null;
      }
      atIndentedComment(start, indent) {
        if (this.type !== "comment")
          return false;
        if (this.indent <= indent)
          return false;
        return start.every((st) => st.type === "newline" || st.type === "space");
      }
      *documentEnd(docEnd) {
        if (this.type !== "doc-mode") {
          if (docEnd.end)
            docEnd.end.push(this.sourceToken);
          else
            docEnd.end = [this.sourceToken];
          if (this.type === "newline")
            yield* this.pop();
        }
      }
      *lineEnd(token) {
        switch (this.type) {
          case "comma":
          case "doc-start":
          case "doc-end":
          case "flow-seq-end":
          case "flow-map-end":
          case "map-value-ind":
            yield* this.pop();
            yield* this.step();
            break;
          case "newline":
            this.onKeyLine = false;
          // fallthrough
          case "space":
          case "comment":
          default:
            if (token.end)
              token.end.push(this.sourceToken);
            else
              token.end = [this.sourceToken];
            if (this.type === "newline")
              yield* this.pop();
        }
      }
    };
    exports.Parser = Parser;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/public-api.js
var require_public_api = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/public-api.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var errors = require_errors();
    var log = require_log();
    var identity = require_identity();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    function parseOptions(options) {
      const prettyErrors = options.prettyErrors !== false;
      const lineCounter$1 = options.lineCounter || prettyErrors && new lineCounter.LineCounter() || null;
      return { lineCounter: lineCounter$1, prettyErrors };
    }
    function parseAllDocuments(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      const docs = Array.from(composer$1.compose(parser$1.parse(source)));
      if (prettyErrors && lineCounter2)
        for (const doc of docs) {
          doc.errors.forEach(errors.prettifyError(source, lineCounter2));
          doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
        }
      if (docs.length > 0)
        return docs;
      return Object.assign([], { empty: true }, composer$1.streamInfo());
    }
    function parseDocument(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      let doc = null;
      for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) {
        if (!doc)
          doc = _doc;
        else if (doc.options.logLevel !== "silent") {
          doc.errors.push(new errors.YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
          break;
        }
      }
      if (prettyErrors && lineCounter2) {
        doc.errors.forEach(errors.prettifyError(source, lineCounter2));
        doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
      }
      return doc;
    }
    function parse(src, reviver, options) {
      let _reviver = void 0;
      if (typeof reviver === "function") {
        _reviver = reviver;
      } else if (options === void 0 && reviver && typeof reviver === "object") {
        options = reviver;
      }
      const doc = parseDocument(src, options);
      if (!doc)
        return null;
      doc.warnings.forEach((warning) => log.warn(doc.options.logLevel, warning));
      if (doc.errors.length > 0) {
        if (doc.options.logLevel !== "silent")
          throw doc.errors[0];
        else
          doc.errors = [];
      }
      return doc.toJS(Object.assign({ reviver: _reviver }, options));
    }
    function stringify2(value, replacer, options) {
      let _replacer = null;
      if (typeof replacer === "function" || Array.isArray(replacer)) {
        _replacer = replacer;
      } else if (options === void 0 && replacer) {
        options = replacer;
      }
      if (typeof options === "string")
        options = options.length;
      if (typeof options === "number") {
        const indent = Math.round(options);
        options = indent < 1 ? void 0 : indent > 8 ? { indent: 8 } : { indent };
      }
      if (value === void 0) {
        const { keepUndefined } = options ?? replacer ?? {};
        if (!keepUndefined)
          return void 0;
      }
      if (identity.isDocument(value) && !_replacer)
        return value.toString(options);
      return new Document.Document(value, _replacer, options).toString(options);
    }
    exports.parse = parse;
    exports.parseAllDocuments = parseAllDocuments;
    exports.parseDocument = parseDocument;
    exports.stringify = stringify2;
  }
});

// node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/index.js
var require_dist = __commonJS({
  "node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/index.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var Schema = require_Schema();
    var errors = require_errors();
    var Alias = require_Alias();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var cst = require_cst();
    var lexer = require_lexer();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    var publicApi = require_public_api();
    var visit = require_visit();
    exports.Composer = composer.Composer;
    exports.Document = Document.Document;
    exports.Schema = Schema.Schema;
    exports.YAMLError = errors.YAMLError;
    exports.YAMLParseError = errors.YAMLParseError;
    exports.YAMLWarning = errors.YAMLWarning;
    exports.Alias = Alias.Alias;
    exports.isAlias = identity.isAlias;
    exports.isCollection = identity.isCollection;
    exports.isDocument = identity.isDocument;
    exports.isMap = identity.isMap;
    exports.isNode = identity.isNode;
    exports.isPair = identity.isPair;
    exports.isScalar = identity.isScalar;
    exports.isSeq = identity.isSeq;
    exports.Pair = Pair.Pair;
    exports.Scalar = Scalar.Scalar;
    exports.YAMLMap = YAMLMap.YAMLMap;
    exports.YAMLSeq = YAMLSeq.YAMLSeq;
    exports.CST = cst;
    exports.Lexer = lexer.Lexer;
    exports.LineCounter = lineCounter.LineCounter;
    exports.Parser = parser.Parser;
    exports.parse = publicApi.parse;
    exports.parseAllDocuments = publicApi.parseAllDocuments;
    exports.parseDocument = publicApi.parseDocument;
    exports.stringify = publicApi.stringify;
    exports.visit = visit.visit;
    exports.visitAsync = visit.visitAsync;
  }
});

// src/cli.ts
import { createHash as createHash2 } from "node:crypto";
import {
  existsSync as existsSync5,
  mkdirSync as mkdirSync2,
  readdirSync,
  readFileSync as readFileSync5,
  renameSync as renameSync2,
  statSync,
  writeFileSync as writeFileSync2
} from "node:fs";
import { basename, dirname as dirname3, extname, join as join7, resolve } from "node:path";

// src/icons.ts
import { readFileSync as readFileSync2 } from "node:fs";
import { join as join3 } from "node:path";

// src/color.ts
function parseHex(hex) {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return void 0;
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
}
var isHex = (s) => /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(s);
function toHex([r, g, b]) {
  return `#${[r, g, b].map(
    (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")
  ).join("")}`;
}
function mixHex(a, b, amount) {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return a;
  return toHex(
    [0, 1, 2].map((i) => (ca[i] ?? 0) * amount + (cb[i] ?? 0) * (1 - amount))
  );
}
function luminance(hex) {
  const c = parseHex(hex);
  if (!c) return 0;
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
function ensureContrast(fg, bg, ratio = 4.5) {
  if (!isHex(fg) || !isHex(bg) || contrast(fg, bg) >= ratio) return fg;
  const target = contrast("#000000", bg) >= contrast("#ffffff", bg) ? "#000000" : "#ffffff";
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const c = mixHex(target, fg, t);
    if (contrast(c, bg) >= ratio) return c;
  }
  return target;
}

// src/libraries.ts
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
var LibraryError = class extends Error {
  fixes;
  constructor(message, fixes) {
    super(message);
    this.fixes = fixes;
  }
};
var loaded = /* @__PURE__ */ new Map();
function cacheDir() {
  if (process.env.ORRERY_CACHE) return process.env.ORRERY_CACHE;
  const base = process.platform === "win32" ? process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local") : process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache");
  return join(base, "orrery");
}
var cachePath = (src) => join(cacheDir(), `${src.npm.replace("/", "+")}@${src.version}`, src.file);
var libraryUrls = (src) => [
  `https://cdn.jsdelivr.net/npm/${src.npm}@${src.version}/${src.file}`,
  `https://unpkg.com/${src.npm}@${src.version}/${src.file}`
];
var sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
function fromNodeModules(src) {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const pkgDir = join(dir, "node_modules", src.npm);
    const pkg = join(pkgDir, "package.json");
    if (existsSync(pkg)) {
      try {
        if (JSON.parse(readFileSync(pkg, "utf8")).version === src.version) {
          const buf = readFileSync(join(pkgDir, src.file));
          if (sha256(buf) === src.sha256) return buf;
        }
      } catch {
      }
    }
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return void 0;
}
function fromCache(src) {
  const path = cachePath(src);
  if (!existsSync(path)) return void 0;
  const buf = readFileSync(path);
  return sha256(buf) === src.sha256 ? buf : void 0;
}
async function download(src) {
  const problems = [];
  for (const url of libraryUrls(src)) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6e4) });
      if (!res.ok) {
        problems.push(`${url}: HTTP ${res.status}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (sha256(buf) !== src.sha256) {
        problems.push(`${url}: checksum mismatch`);
        continue;
      }
      const path = cachePath(src);
      mkdirSync(dirname(path), { recursive: true });
      const tmp = `${path}.${process.pid}.tmp`;
      writeFileSync(tmp, buf);
      renameSync(tmp, path);
      return buf;
    } catch (e) {
      problems.push(`${url}: ${e.message}`);
    }
  }
  throw new LibraryError(
    `icon library ${src.npm}@${src.version} could not be downloaded (${problems.join("; ")})`,
    [
      "connect to the internet once; the library is cached after the first download",
      `prefetch where there is network: orrery icons fetch, then copy ${cacheDir()} (or set ORRERY_CACHE)`,
      "use icons from the bundled official packs (aws, azure, gcp, k8s) instead"
    ]
  );
}
function librarySource(src) {
  if (fromNodeModules(src)) return "node_modules";
  if (fromCache(src)) return "cache";
  return void 0;
}
async function loadLibrary(pack, src) {
  const done = loaded.get(pack);
  if (done) return done;
  const buf = fromNodeModules(src) ?? fromCache(src) ?? await download(src);
  const json = JSON.parse(buf.toString("utf8"));
  const set = src.format === "octicons" ? fromOcticons(json) : json;
  loaded.set(pack, set);
  return set;
}
function fromOcticons(data) {
  const icons = {};
  for (const [name, icon2] of Object.entries(data))
    for (const [h, { width, path }] of Object.entries(icon2.heights))
      icons[`${name}-${h}`] = { body: path, width, height: Number(h) };
  return { prefix: "octicon", icons };
}
var loadedLibrary = (pack) => loaded.get(pack);
function libraryIcon(set, name, mono = false) {
  const icon2 = set.icons[name] ?? set.icons[set.aliases?.[name]?.parent ?? ""];
  if (!icon2) return void 0;
  let body = icon2.body;
  for (const id of new Set([...body.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1] ?? ""))) {
    const esc2 = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    body = body.replace(
      new RegExp(`(\\bid="|url\\(#|href="#)${esc2}(?=["')])`, "g"),
      `$1sdwid_${id}`
    );
  }
  if (mono) {
    body = body.replaceAll("currentColor", "{{c}}");
    if (!/\bfill="/.test(body) || !body.includes("{{c}}")) body = `<g fill="{{c}}">${body}</g>`;
  }
  const v = [
    icon2.left ?? set.left ?? 0,
    icon2.top ?? set.top ?? 0,
    icon2.width ?? set.width ?? 16,
    icon2.height ?? set.height ?? 16
  ].join(" ");
  return { v, b: body };
}
function allDark(body) {
  if (/Gradient|<image|style="[^"]*(?:fill|stroke)\s*:/.test(body)) return false;
  const colors = [...body.matchAll(/(?:fill|stroke|stop-color)="([^"]+)"/g)].map((m) => m[1] ?? "").filter((c) => c !== "none");
  return colors.every(
    (c) => c === "black" || /^#[0-9a-fA-F]{3,6}$/.test(c) && luminance(c) < 0.06
  );
}

// src/paths.ts
import { existsSync as existsSync2 } from "node:fs";
import { dirname as dirname2, join as join2 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
function findSkillRoot() {
  let dir = dirname2(fileURLToPath2(import.meta.url));
  for (let i = 0; i < 6; i++) {
    for (const candidate of [dir, join2(dir, "skills", "orrery")]) {
      if (existsSync2(join2(candidate, "assets", "icons", "index.json"))) return candidate;
    }
    dir = dirname2(dir);
  }
  throw new Error("orrery: cannot find the skill assets (assets/icons/index.json)");
}
var skillRoot = findSkillRoot();
var iconsDir = join2(skillRoot, "assets", "icons");
var fontsDir = join2(skillRoot, "assets", "fonts");
var vendorDir = join2(skillRoot, "scripts", "vendor");
var examplesDir = join2(skillRoot, "examples");

// src/icons.ts
var PACK_ORDER = ["aws", "azure", "gcp", "k8s", "github", "ibm", "logos", "si", "tabler"];
var index;
var infoById;
var packs = /* @__PURE__ */ new Map();
function loadIndex() {
  if (!index) index = JSON.parse(readFileSync2(join3(iconsDir, "index.json"), "utf8"));
  return index;
}
function infos() {
  if (infoById) return infoById;
  infoById = /* @__PURE__ */ new Map();
  for (const [id, name, category, type, keywords] of loadIndex().icons) {
    const [pack = "", slug = ""] = id.split(":");
    infoById.set(id, { id, pack, slug, name, category, type, keywords });
  }
  return infoById;
}
function loadPack(pack) {
  let file = packs.get(pack);
  if (!file) {
    file = JSON.parse(readFileSync2(join3(iconsDir, `${pack}.json`), "utf8"));
    packs.set(pack, file);
  }
  return file;
}
function packInfo() {
  return loadIndex().packs;
}
function aliases() {
  return loadIndex().aliases;
}
function clean(id) {
  return id.trim().toLowerCase().replace(/\s+/g, "-").replace(/^([a-z0-9]+)[/.]/, "$1:");
}
function resolveIcon(id) {
  let current = clean(id);
  const table = loadIndex().aliases;
  for (let hops = 0; hops < 4; hops++) {
    if (infos().has(current)) return current;
    const next = table[current];
    if (!next) return void 0;
    current = next;
  }
  return void 0;
}
function iconInfo(id) {
  const resolved = resolveIcon(id);
  return resolved ? infos().get(resolved) : void 0;
}
function levenshtein(a, b) {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j] ?? 0;
      row[j] = Math.min(
        (row[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = tmp;
    }
  }
  return row[b.length] ?? 0;
}
var tokens = (s) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
var collapse = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
var VENDOR_PREFIX = /^(aws|amazon|azure|microsoft|google|cloud)\s+/i;
var VENDOR_SLUG = /^(aws|amazon|azure|microsoft|google|gcp)/;
var OFFICIAL = /* @__PURE__ */ new Set(["aws", "azure", "gcp", "k8s", "github"]);
var PACK_WEIGHT = {
  aws: 10,
  azure: 10,
  gcp: 10,
  k8s: 10,
  github: 5,
  ibm: 4,
  logos: 6,
  si: 3,
  tabler: 0
};
var TYPE_WEIGHT = {
  service: 4,
  logo: 3,
  resource: 1,
  glyph: 0,
  category: -6,
  group: -6
};
var brands;
function brandNames() {
  brands ??= [...infos().values()].filter((i) => i.pack === "logos" || i.pack === "si").flatMap((i) => [collapse(i.slug), collapse(i.name)]);
  return brands;
}
var aliasTargets;
function aliasesByTarget() {
  if (aliasTargets) return aliasTargets;
  aliasTargets = /* @__PURE__ */ new Map();
  for (const [alias, target] of Object.entries(loadIndex().aliases)) {
    const list = aliasTargets.get(target) ?? [];
    list.push(alias.split(":")[1] ?? alias);
    aliasTargets.set(target, list);
  }
  return aliasTargets;
}
function searchIcons(query, opts = {}) {
  const q = clean(query);
  const [maybePack, rest] = q.includes(":") ? q.split(":", 2) : [void 0, q];
  const pack = opts.pack ?? (maybePack && PACK_ORDER.includes(maybePack) ? maybePack : void 0);
  const text2 = (rest ?? q).replace(/-/g, " ");
  const qTokens = tokens(text2);
  if (!qTokens.length) return [];
  const joined = qTokens.join("-");
  const collapsedQ = qTokens.join("");
  const productNamed = brandNames().some((b) => b.startsWith(collapsedQ));
  const officialHit = [...infos().values()].some((i) => {
    if (!OFFICIAL.has(i.pack)) return false;
    if (collapse(i.slug) === collapsedQ || collapse(i.name.replace(VENDOR_PREFIX, "")) === collapsedQ)
      return true;
    return !productNamed && (aliasesByTarget().get(i.id) ?? []).includes(joined);
  });
  const brandish = !pack && collapsedQ.length >= 3 && productNamed && !officialHit;
  const scored = [];
  for (const info of infos().values()) {
    if (pack && info.pack !== pack) continue;
    if (opts.type && info.type !== opts.type) continue;
    const alias = aliasesByTarget().get(info.id) ?? [];
    const keywordList = info.keywords.split(/\s+/).filter(Boolean);
    const hayTokens = /* @__PURE__ */ new Set([
      ...tokens(info.slug),
      ...tokens(info.name),
      ...tokens(info.keywords),
      ...alias.flatMap(tokens)
    ]);
    let score = 0;
    let matched = 0;
    for (const t of qTokens) {
      if (hayTokens.has(t)) {
        matched += 1;
        score += 10;
      } else if (t.length >= 2 && [...hayTokens].some((h) => h.startsWith(t))) {
        matched += 1;
        score += 6;
      }
    }
    const names = [info.slug, info.name, info.name.replace(VENDOR_PREFIX, ""), ...keywordList].map(
      collapse
    );
    const isLogo = info.pack === "logos" || info.pack === "si";
    if (collapsedQ.length >= 3) {
      if (names.includes(collapsedQ)) {
        matched = qTokens.length;
        score = Math.max(score, 10 * qTokens.length) + 30 + (brandish && isLogo ? 20 : 0);
      } else if (names.some((n3) => n3.startsWith(collapsedQ))) {
        matched = qTokens.length;
        score = Math.max(score, 10 * qTokens.length) + 10 + (brandish && isLogo ? 20 : 0);
      }
    }
    if (!matched) continue;
    if (matched < qTokens.length) score -= 8 * (qTokens.length - matched);
    const slugBase = info.pack === "logos" ? info.slug.replace(/-icon$/, "") : info.slug;
    if (slugBase === joined) score += 40;
    if (alias.includes(joined)) score += brandish ? 8 : 40;
    const plainName = tokens(info.name.replace(VENDOR_PREFIX, "")).join("-");
    if (plainName === joined || tokens(info.name).join("-") === joined) score += 30;
    if (slugBase.startsWith(joined)) score += 6;
    score -= Math.min(10, hayTokens.size * 0.3);
    score += (TYPE_WEIGHT[info.type] ?? 0) + (PACK_WEIGHT[info.pack] ?? 0);
    if (info.pack === "logos" && info.slug.endsWith("-icon")) score += 4;
    if (officialHit && !OFFICIAL.has(info.pack) && VENDOR_SLUG.test(info.slug)) score -= 25;
    scored.push([score, info]);
  }
  scored.sort((a, b) => b[0] - a[0] || a[1].id.localeCompare(b[1].id));
  return scored.slice(0, opts.limit ?? 15).map(([, info]) => info);
}
function suggestIcons(id, limit = 3) {
  const q = clean(id);
  const [pack, slug = q] = q.includes(":") ? q.split(":", 2) : [void 0, q];
  const found = searchIcons(slug.replace(/-/g, " "), { limit: 30 });
  const ranked = found.map((info) => {
    let score = levenshtein(slug, info.slug);
    if (pack && info.pack !== pack) score += 4;
    return [score, info.id];
  }).sort((a, b) => a[0] - b[0]);
  const close = [];
  if (pack) {
    const near = [...infos().values()].filter((i) => i.pack === pack).map((i) => [levenshtein(slug, i.slug), i.id]).filter(([d]) => d <= Math.max(2, Math.floor(slug.length / 4))).sort((a, b) => a[0] - b[0]);
    for (const [, nid] of near) if (!close.includes(nid)) close.push(nid);
  }
  for (const [, rid] of ranked) if (!close.includes(rid)) close.push(rid);
  return close.slice(0, limit);
}
var libEntries = /* @__PURE__ */ new Map();
function libraryEntry(info, lib) {
  const done = libEntries.get(info.id);
  if (done) return done;
  const set = loadedLibrary(info.pack);
  if (!set) throw new Error(`icon library ${lib.npm} is not loaded; call loadIconLibraries first`);
  const name = loadIndex().names?.[info.id] ?? `${info.slug}${lib.suffix ?? ""}`;
  const icon2 = libraryIcon(set, name, lib.mono);
  if (!icon2) throw new Error(`icon ${info.id} missing from ${lib.npm}@${lib.version}`);
  const entry = { ...icon2 };
  if (lib.mono) entry.m = 1;
  const col = loadIndex().colors?.[info.id];
  if (col) entry.col = col;
  if (!lib.mono && allDark(icon2.b)) entry.k = 1;
  libEntries.set(info.id, entry);
  return entry;
}
function packEntry(info) {
  const lib = loadIndex().packs[info.pack]?.lib;
  if (lib) return libraryEntry(info, lib);
  const icons = loadPack(info.pack).icons;
  const own = icons[info.slug];
  const entry = own?.r ? icons[own.r] : own;
  if (!entry) throw new Error(`icon ${info.id} missing from ${info.pack}.json`);
  return entry;
}
function iconAspect(id) {
  const info = iconInfo(id);
  if (!info) return void 0;
  if (loadIndex().packs[info.pack]?.lib && !loadedLibrary(info.pack)) return void 0;
  const [, , w, h] = packEntry(info).v.split(/[\s,]+/).map(Number);
  return w && h ? w / h : void 0;
}
async function loadIconLibraries(ids) {
  const packs2 = /* @__PURE__ */ new Map();
  for (const id of ids) {
    const info = iconInfo(id);
    const lib = info ? loadIndex().packs[info.pack]?.lib : void 0;
    if (info && lib) packs2.set(info.pack, lib);
  }
  await Promise.all([...packs2].map(([pack, lib]) => loadLibrary(pack, lib)));
}
var BLACK_OR_WHITE = /* @__PURE__ */ new Set(["github:mark-github"]);
function renderIcon(id, instance, paint) {
  const info = iconInfo(id);
  if (!info) throw new Error(`unknown icon ${id}`);
  const entry = packEntry(info);
  let body = paint.theme === "dark" && entry.d ? entry.d : entry.b;
  body = body.replaceAll("sdwid", `${instance}-`);
  if (entry.m) {
    let color = paint.color ?? entry.col ?? paint.ink;
    if (contrast(color, paint.background) < 2.2) color = paint.ink;
    if (BLACK_OR_WHITE.has(info.id))
      color = paint.color ?? (contrast("#000000", paint.background) >= contrast("#ffffff", paint.background) ? "#000000" : "#ffffff");
    body = body.replaceAll("{{c}}", color);
  } else if (entry.k && paint.theme === "dark" && !entry.d) {
    const light = paint.color ?? mixHex(paint.ink, paint.background, 0.92);
    body = body.replace(
      /(fill|stroke|stop-color)="(?:#(?:[0-9a-fA-F]{3}){1,2}|black)"/g,
      `$1="${light}"`
    );
    body = `<g fill="${light}">${body}</g>`;
  }
  const vb = entry.v.split(/[\s,]+/).map(Number);
  return { viewBox: [vb[0] ?? 0, vb[1] ?? 0, vb[2] ?? 24, vb[3] ?? 24], body };
}
function allIcons() {
  return [...infos().values()];
}

// src/import/mermaid.ts
var import_yaml = __toESM(require_dist(), 1);
var DIRECTIONS = {
  LR: "right",
  RL: "left",
  TB: "down",
  TD: "down",
  BT: "up"
};
var SHAPES = [
  ["(((", ")))", "circle"],
  ["([", "])", "pill"],
  ["[[", "]]", "box"],
  ["[(", ")]", "cylinder"],
  ["((", "))", "circle"],
  ["{{", "}}", "hexagon"],
  ["[/", "/]", "box"],
  ["[\\", "\\]", "box"],
  ["[/", "\\]", "box"],
  ["[\\", "/]", "box"],
  ["[", "]", "box"],
  ["(", ")", "rounded"],
  ["{", "}", "diamond"],
  [">", "]", "note"]
];
var ID = "[A-Za-z0-9_][A-Za-z0-9_.-]*";
var FRONTMATTER = /^\s*---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;
function splitStatements(line) {
  const out = [];
  let depth = 0;
  let quoted = false;
  let piped = false;
  let start = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') quoted = !quoted;
    else if (!quoted) {
      if (piped) piped = c !== "|";
      else if (c === "|" && depth === 0) piped = true;
      else if (c === "[" || c === "(" || c === "{") depth += 1;
      else if (c === "]" || c === ")" || c === "}") depth = Math.max(0, depth - 1);
      else if (c === ";" && depth === 0) {
        out.push(line.slice(start, i));
        start = i + 1;
      }
    }
  }
  out.push(line.slice(start));
  return out;
}
function unquote(s) {
  const t = s.trim();
  if (t.startsWith('"') && t.endsWith('"') || t.startsWith("'") && t.endsWith("'"))
    return t.slice(1, -1);
  return t;
}
function cleanLabel(s) {
  let text2 = unquote(s).replace(/<br\s*\/?>/gi, " ");
  for (let prev = ""; prev !== text2; ) {
    prev = text2;
    text2 = text2.replace(/<[^<>]*>/g, "");
  }
  return text2.replace(/[<>]/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}
function readNodes(chunk, nodes, parent) {
  const ids = [];
  for (const part of chunk.split(/\s+&\s+/)) {
    const text2 = part.trim();
    if (!text2) continue;
    const m = text2.match(new RegExp(`^(${ID})(.*)$`));
    if (!m) continue;
    const id = m[1] ?? "";
    const rest = (m[2] ?? "").trim().replace(/:::\w+$/, "");
    let label;
    let shape;
    for (const [open, close, kind] of SHAPES) {
      if (rest.startsWith(open) && rest.endsWith(close) && rest.length >= open.length + close.length) {
        label = cleanLabel(rest.slice(open.length, rest.length - close.length));
        shape = kind;
        break;
      }
    }
    const existing = nodes.get(id);
    if (existing) {
      if (label) existing.label = label;
      if (shape) existing.shape = shape;
    } else nodes.set(id, { id, label: label ?? id, shape, parent });
    ids.push(id);
  }
  return ids;
}
var EDGE_RE = /\s+--\s+([^-][^>]*?)\s+-->\s+|\s+==\s+([^=][^>]*?)\s+==>\s+|\s+-\.\s+([^.][^>]*?)\s+\.->\s+|\s*(<)?(-{2,}|={2,}|-\.+-|-\.+)(>|o|x)?(?:\|([^|]*)\|)?\s*/g;
function importMermaid(source) {
  const warnings = [];
  const nodes = /* @__PURE__ */ new Map();
  const groups = [];
  const edges = [];
  const stack = [];
  let direction = "right";
  let title;
  const front = source.match(FRONTMATTER);
  if (front) {
    const frontTitle = (front[1] ?? "").match(/^title:[ \t]*(.+)$/m);
    if (frontTitle) title = cleanLabel(frontTitle[1] ?? "");
  }
  const lines = (front ? source.slice(front[0].length) : source).replace(/%%.*$/gm, "").split(/\r?\n/).flatMap(splitStatements).map((l) => l.trim()).filter(Boolean);
  const first = lines.find((l) => l !== "---" && !/^title:/.test(l)) ?? "";
  if (!/^(flowchart|graph)\b/i.test(first)) {
    const kind = first.split(/\s/)[0] || "empty input";
    warnings.push(`only flowchart and graph diagrams can be imported; this is ${kind}`);
    lines.length = 0;
  }
  for (const line of lines) {
    const head = line.match(/^(flowchart|graph)\s*(LR|RL|TB|TD|BT)?/i);
    if (head) {
      direction = DIRECTIONS[(head[2] ?? "TB").toUpperCase()] ?? "down";
      continue;
    }
    if (/^---$/.test(line)) continue;
    const titleLine = line.match(/^title:\s*(.+)$/);
    if (titleLine) {
      title = cleanLabel(titleLine[1] ?? "");
      continue;
    }
    if (/^(classDef|class|style|linkStyle|click|direction|accTitle|accDescr)\b/.test(line))
      continue;
    const sub = line.match(/^subgraph\s+(.+)$/);
    if (sub) {
      const rest = (sub[1] ?? "").trim();
      const withLabel = rest.match(new RegExp(`^(${ID})\\s*\\[(.+)\\]$`));
      const bareId = new RegExp(`^${ID}$`).test(rest);
      const id = withLabel?.[1] ?? (bareId ? rest : `group-${groups.length + 1}`);
      const label = cleanLabel(withLabel?.[2] ?? rest);
      groups.push({ id, label, parent: stack[stack.length - 1] });
      stack.push(id);
      continue;
    }
    if (line === "end") {
      stack.pop();
      continue;
    }
    const parent = stack[stack.length - 1];
    const parts = [];
    let last = 0;
    for (const m of line.matchAll(EDGE_RE)) {
      parts.push(line.slice(last, m.index));
      const [, l1, l2, l3, lt, body = "", head2, pipeLabel] = m;
      const text2 = pipeLabel ?? l1 ?? l2 ?? l3;
      let lineStyle2 = "solid";
      if (l2 !== void 0 || body.startsWith("=")) lineStyle2 = "thick";
      else if (l3 !== void 0 || body.includes(".")) lineStyle2 = "dotted";
      const hasHead = head2 === ">" || l1 !== void 0 || l2 !== void 0 || l3 !== void 0;
      parts.push({
        from: "",
        to: "",
        label: text2 ? cleanLabel(text2) : void 0,
        line: lineStyle2,
        arrow: lt && hasHead ? "both" : hasHead ? "end" : "none"
      });
      last = (m.index ?? 0) + m[0].length;
    }
    parts.push(line.slice(last));
    if (parts.length === 1) {
      readNodes(line, nodes, parent);
      continue;
    }
    for (let i = 0; i + 2 < parts.length; i += 2) {
      const a = parts[i];
      const op = parts[i + 1];
      const b = parts[i + 2];
      if (typeof a !== "string" || typeof b !== "string" || typeof op === "string" || !op) continue;
      const froms = readNodes(a, nodes, parent);
      const tos = readNodes(b, nodes, parent);
      for (const f of froms) for (const t of tos) edges.push({ ...op, from: f, to: t });
    }
  }
  const groupIds = new Set(groups.map((g) => g.id));
  const guessed = {};
  const specNodes = {};
  for (const n3 of nodes.values()) {
    if (groupIds.has(n3.id)) continue;
    const entry = {};
    const icon2 = guessIcon(n3.label);
    if (icon2) {
      guessed[n3.id] = icon2;
      entry.icon = icon2;
      entry.label = n3.label;
    } else {
      entry.label = n3.label;
      entry.shape = n3.shape ?? "rounded";
    }
    if (n3.parent) entry.in = n3.parent;
    specNodes[n3.id] = entry;
  }
  const specGroups = {};
  for (const g of groups) {
    specGroups[g.id] = { type: "zone", label: g.label, ...g.parent ? { in: g.parent } : {} };
  }
  const specEdges = edges.map((e) => {
    const op = { solid: "->", dashed: "-->", dotted: "..>", thick: "==>" }[e.line];
    const arrow = e.arrow === "both" ? `<${op}` : e.arrow === "none" ? { solid: "--", dashed: "---", dotted: "...", thick: "===" }[e.line] : op;
    return `${e.from} ${arrow} ${e.to}${e.label ? `: ${e.label}` : ""}`;
  });
  if (!nodes.size)
    warnings.push("no flowchart nodes found; only flowchart/graph diagrams are supported");
  const doc = {};
  if (title) doc.title = title;
  doc.direction = direction;
  if (groups.length) doc.groups = specGroups;
  doc.nodes = specNodes;
  doc.edges = specEdges;
  const header = [
    "# yaml-language-server: $schema=https://raw.githubusercontent.com/Sagargupta16/orrery/main/skills/orrery/references/diagram.schema.json",
    "# Imported from Mermaid by orrery. Replace shapes with official icons (orrery icons search <words>),",
    "# turn zones into vendor groups (aws:vpc, gcp:project, azure:vnet...) and run orrery validate."
  ];
  if (Object.keys(guessed).length) {
    header.push(
      `# Icons guessed from exact names, check them: ${Object.entries(guessed).map(([k, v]) => `${k}=${v}`).join(", ")}`
    );
  }
  return { yaml: `${header.join("\n")}
${(0, import_yaml.stringify)(doc, { lineWidth: 0 })}`, warnings, guessed };
}
function guessIcon(label) {
  const collapsed = label.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (collapsed.length < 3) return void 0;
  const [top] = searchIcons(label, { limit: 1 });
  if (!top || top.type !== "service" && top.type !== "logo") return void 0;
  const names = [
    top.slug,
    top.name,
    top.name.replace(/^(aws|amazon|azure|microsoft|google|cloud)\s+/i, "")
  ].map((s) => s.toLowerCase().replace(/[^a-z0-9]/g, ""));
  if (!names.includes(collapsed.replace(/icon$/, "")) && !names.includes(collapsed)) {
    if (!names.some((n3) => n3 === `${collapsed}icon`)) return void 0;
  }
  return iconInfo(top.id)?.id;
}

// src/check.ts
var overlaps = (a, b, pad = 0) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
var EPS = 0.5;
var tenth = (v) => Math.round(v * 10) / 10;
var boxOf = (b) => ({ x: tenth(b.x), y: tenth(b.y), w: tenth(b.w), h: tenth(b.h) });
var pointOf = (p) => ({ x: tenth(p.x), y: tenth(p.y) });
var same = (a, b) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
function circleHitsBox(c, b) {
  const r = c.w / 2;
  const cx = c.x + r;
  const cy = c.y + c.h / 2;
  const nx = Math.min(Math.max(cx, b.x), b.x + b.w);
  const ny = Math.min(Math.max(cy, b.y), b.y + b.h);
  return Math.hypot(cx - nx, cy - ny) < r - EPS;
}
function headerChip(g) {
  if (!g.label.lines.length) return void 0;
  const b = g.labelBox;
  const icon2 = g.overlay ? g.iconBox : void 0;
  const parts = icon2 && icon2.y < b.y + b.h && b.y < icon2.y + icon2.h ? [b, icon2] : [b];
  const x = Math.min(...parts.map((b2) => b2.x));
  const y = Math.min(...parts.map((b2) => b2.y));
  const r = Math.max(...parts.map((b2) => b2.x + b2.w));
  const bt = Math.max(...parts.map((b2) => b2.y + b2.h));
  return { x: x - 4, y: y - 1, w: r - x + 8, h: bt - y + 2 };
}
function badgeRect(n3) {
  if (!n3.badge) return void 0;
  if (n3.badgeBox) return n3.badgeBox;
  const anchor2 = n3.look === "icon" ? n3.iconBox : n3.box;
  if (!anchor2) return void 0;
  const w = Math.max(18, 8 + n3.badge.length * 6.4);
  return { x: anchor2.x + anchor2.w - w / 2 - 2, y: anchor2.y - 7, w, h: 16 };
}
function nodeParts(n3) {
  const parts = [];
  const add = (what, box) => {
    if (box && box.w > 0 && box.h > 0) parts.push({ what, box });
  };
  add("label", n3.labelBox);
  add("note", n3.noteBox);
  if (n3.iconBox && !same(n3.iconBox, n3.box)) add("icon", n3.iconBox);
  add(n3.look === "icon" ? "icon" : "shape", n3.box);
  return parts;
}
function segmentHitsBox(p, q, b, inset = 3) {
  const box = { x: b.x + inset, y: b.y + inset, w: b.w - inset * 2, h: b.h - inset * 2 };
  if (box.w <= 0 || box.h <= 0) return false;
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const edges = [
    [-dx, p.x - box.x],
    [dx, box.x + box.w - p.x],
    [-dy, p.y - box.y],
    [dy, box.y + box.h - p.y]
  ];
  for (const [pp, qq] of edges) {
    if (pp === 0) {
      if (qq < 0) return false;
    } else {
      const r = qq / pp;
      if (pp < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return t0 < t1;
}
function checkScene(scene, model, opts = {}) {
  const out = [];
  const warn = (code, message, extra = {}) => out.push({ code, severity: "warning", message, ...extra });
  const nodeBoxes = scene.nodes.map((n3) => {
    const parts = [n3.box, n3.iconBox, n3.labelBox, n3.noteBox].filter((b) => !!b && b.w > 0);
    const x = Math.min(...parts.map((b) => b.x));
    const y = Math.min(...parts.map((b) => b.y));
    const r = Math.max(...parts.map((b) => b.x + b.w));
    const bt = Math.max(...parts.map((b) => b.y + b.h));
    return { id: n3.id, box: n3.box, foot: { x, y, w: r - x, h: bt - y }, label: n3.labelBox };
  });
  for (const e of scene.edges) {
    for (const nb of nodeBoxes) {
      if (nb.id === e.from || nb.id === e.to) continue;
      for (let i = 0; i + 1 < e.points.length; i++) {
        const p = e.points[i];
        const q = e.points[i + 1];
        if (p && q && segmentHitsBox(p, q, nb.box)) {
          warn("DG201", `edge ${e.from} -> ${e.to} passes through node "${nb.id}"`, {
            subject: { edge: e.id, from: e.from, to: e.to, node: nb.id },
            fixes: [
              `move "${nb.id}" earlier or later in the nodes list`,
              "try layout: { layering: simplex }",
              "change direction"
            ]
          });
          break;
        }
      }
    }
  }
  const labels = scene.edges.filter((e) => e.labelBox).map((e) => ({ e, box: e.labelBox }));
  for (const { e, box } of labels) {
    for (const nb of nodeBoxes) {
      if (overlaps(box, nb.foot, -1)) {
        warn(
          "DG202",
          `label "${e.label?.lines.join(" ")}" on ${e.from} -> ${e.to} covers node "${nb.id}"`,
          {
            subject: { edge: e.id, node: nb.id },
            fixes: ["shorten the edge label", "use layout: { spacing: loose }"]
          }
        );
      }
    }
  }
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i];
      const b = labels[j];
      if (a && b && overlaps(a.box, b.box, -1)) {
        warn(
          "DG202",
          `edge labels on ${a.e.from} -> ${a.e.to} and ${b.e.from} -> ${b.e.to} overlap`,
          {
            subject: { edges: [a.e.id, b.e.id] },
            fixes: ["shorten one label or drop a redundant one", "use layout: { spacing: loose }"]
          }
        );
      }
    }
  }
  for (let i = 0; i < nodeBoxes.length; i++) {
    for (let j = i + 1; j < nodeBoxes.length; j++) {
      const a = nodeBoxes[i];
      const b = nodeBoxes[j];
      if (a && b && overlaps(a.foot, b.foot, -2)) {
        warn("DG203", `nodes "${a.id}" and "${b.id}" overlap (labels collide)`, {
          subject: { nodes: [a.id, b.id] },
          fixes: [`shorten the label of "${a.id}" or "${b.id}"`, "use layout: { spacing: loose }"]
        });
      }
    }
  }
  for (const n3 of scene.nodes) {
    if (n3.label.lines.length > 3) {
      warn("DG204", `node "${n3.id}" label wraps to ${n3.label.lines.length} lines`, {
        subject: { node: n3.id },
        evidence: { lines: n3.label.lines },
        fixes: ["shorten the label and move detail into note"]
      });
    }
  }
  const maxWidth = opts.maxWidth ?? 2400;
  if (scene.width > maxWidth) {
    warn("DG205", `diagram is ${scene.width}px wide (over ${maxWidth}px)`, {
      evidence: { width: scene.width, height: scene.height },
      fixes: ["use direction: down", "group related nodes", "split into two diagrams"]
    });
  }
  const ratio = scene.width / Math.max(1, scene.height);
  if (ratio > 4.5 && scene.nodes.length > 6) {
    warn("DG205", `diagram is a ${ratio.toFixed(1)}:1 strip, hard to read in docs`, {
      evidence: { width: scene.width, height: scene.height },
      fixes: ["use direction: down for long chains", "group stages into zones"]
    });
  }
  const tall = scene.height / Math.max(1, scene.width);
  if (tall > 4.5 && scene.height > 1800 && scene.nodes.length > 6) {
    warn("DG205", `diagram is a ${tall.toFixed(1)}:1 tall strip, hard to read in docs`, {
      evidence: { width: scene.width, height: scene.height },
      fixes: [
        "use direction: right for long chains",
        "arrange stages in side-by-side zones",
        "split into two diagrams"
      ]
    });
  }
  if (model.nodes.length > 40) {
    warn("DG206", `${model.nodes.length} nodes in one diagram`, {
      fixes: [
        "split into an overview and detail diagrams",
        "collapse repeated nodes and use badge: x3"
      ]
    });
  }
  for (const g of model.groups) {
    const used = !!g.around?.length || model.nodes.some((x) => x.parent === g.id) || model.groups.some((x) => x.parent === g.id);
    if (!used) {
      warn("DG207", `group "${g.id}" is empty`, {
        subject: { group: g.id },
        fixes: [`put nodes in it with in: ${g.id}, or remove it`]
      });
    }
  }
  const touched = new Set(model.edges.flatMap((e) => [e.from, e.to]));
  const parentOf = new Map([
    ...model.nodes.map((x) => [x.id, x.parent]),
    ...model.groups.map((x) => [x.id, x.parent])
  ]);
  const reached = (id) => {
    for (let p = id; p; p = parentOf.get(p)) if (touched.has(p)) return true;
    return model.groups.some((g) => g.around?.includes(id) && touched.has(g.id));
  };
  for (const n3 of model.nodes) {
    if (!reached(n3.id) && model.edges.length) {
      warn("DG208", `node "${n3.id}" has no connections`, {
        subject: { node: n3.id },
        fixes: [`connect "${n3.id}" or remove it (fine for a legend or a standalone service)`]
      });
    }
  }
  for (const g of scene.groups) {
    const chip = headerChip(g);
    if (!chip) continue;
    for (const e of scene.edges) {
      for (let i = 0; i + 1 < e.points.length; i++) {
        const p = e.points[i];
        const q = e.points[i + 1];
        if (p && q && segmentHitsBox(p, q, chip, EPS)) {
          warn(
            "DG209",
            `edge ${e.from} -> ${e.to} runs through the header label of group "${g.id}"`,
            {
              subject: { edge: e.id, from: e.from, to: e.to, group: g.id },
              evidence: { header: boxOf(chip), segment: [pointOf(p), pointOf(q)] },
              fixes: [
                `shorten the label of group "${g.id}" so the edge clears it`,
                `move "${e.from}" or "${e.to}" in the nodes list so the edge enters the group elsewhere`,
                "use layout: { spacing: loose }"
              ]
            }
          );
          break;
        }
      }
    }
  }
  const off = (what, subject, box, fixes) => {
    if (!box) return;
    const past = {
      left: -box.x,
      top: -box.y,
      right: box.x + box.w - scene.width,
      bottom: box.y + box.h - scene.height
    };
    const sides = Object.entries(past).filter(([, v]) => v > EPS);
    if (!sides.length) return;
    warn(
      "DG210",
      `${what} sticks out of the ${scene.width}x${scene.height} canvas (${sides.map(([k, v]) => `${tenth(v)}px past the ${k}`).join(", ")})`,
      {
        subject,
        evidence: {
          box: boxOf(box),
          canvas: { width: scene.width, height: scene.height },
          past: Object.fromEntries(sides.map(([k, v]) => [k, tenth(v)]))
        },
        fixes
      }
    );
  };
  const hull = (boxes) => {
    const bs = boxes.filter((b) => !!b && (b.w > 0 || b.h > 0));
    if (!bs.length) return void 0;
    const x = Math.min(...bs.map((b) => b.x));
    const y = Math.min(...bs.map((b) => b.y));
    return {
      x,
      y,
      w: Math.max(...bs.map((b) => b.x + b.w)) - x,
      h: Math.max(...bs.map((b) => b.y + b.h)) - y
    };
  };
  const pathBox = (pts) => {
    if (!pts.length) return void 0;
    const x = Math.min(...pts.map((p) => p.x));
    const y = Math.min(...pts.map((p) => p.y));
    return {
      x,
      y,
      w: Math.max(...pts.map((p) => p.x)) - x,
      h: Math.max(...pts.map((p) => p.y)) - y
    };
  };
  const spread = ["use layout: { spacing: loose }", "move it elsewhere in the nodes list"];
  off("the title", { title: true }, scene.titleBox, spread);
  off("the subtitle", { subtitle: true }, scene.subtitleBox, spread);
  for (const n3 of scene.nodes) {
    const parts = [n3.box, n3.iconBox, n3.labelBox, n3.noteBox, badgeRect(n3)];
    off(`node "${n3.id}"`, { node: n3.id }, hull(parts), [
      `move "${n3.id}" in the nodes list`,
      ...spread
    ]);
  }
  for (const g of scene.groups) {
    const parts = [g.box, g.label.lines.length ? g.labelBox : void 0, g.iconBox];
    off(`group "${g.id}"`, { group: g.id }, hull(parts), spread);
  }
  for (const e of scene.edges) {
    const free = model.edges.some((x) => x.id === e.id && !x.constraint);
    const fixes = free ? [
      "remove constraint: false from this edge so layout reserves room for its label and step",
      "shorten the label"
    ] : ["shorten the label", "use layout: { spacing: loose }"];
    const who = `${e.from} -> ${e.to}`;
    off(`the path of edge ${who}`, { edge: e.id, part: "path" }, pathBox(e.points), fixes);
    off(`the label of edge ${who}`, { edge: e.id, part: "label" }, e.labelBox, fixes);
    off(`step ${e.step} of edge ${who}`, { edge: e.id, part: "step" }, e.stepBox, fixes);
  }
  off("the legend", { legend: true }, scene.legend?.box, spread);
  const pills = [];
  for (const e of scene.edges) {
    if (e.stepBox && e.step !== void 0) {
      const subject = { edge: e.id, from: e.from, to: e.to, step: e.step };
      pills.push({
        round: true,
        box: e.stepBox,
        what: `step ${e.step} on ${e.from} -> ${e.to}`,
        subject
      });
    }
  }
  for (const n3 of scene.nodes) {
    const box = badgeRect(n3);
    if (n3.badge && box) {
      const what = `badge "${n3.badge}" on node "${n3.id}"`;
      pills.push({ round: false, box, what, subject: { node: n3.id }, node: n3.id });
    }
  }
  const hits = (p, b) => p.round ? circleHitsBox(p.box, b) : overlaps(p.box, b, -EPS);
  const pillFixes = (p) => p.round ? ["shorten the edge label next to it", "use layout: { spacing: loose }"] : ["shorten the badge text", "use layout: { spacing: loose }"];
  const pillWarn = (p, over, subject, box) => warn("DG211", `${p.what} covers ${over}`, {
    subject: { ...p.subject, ...subject },
    evidence: { badge: boxOf(p.box), over: boxOf(box) },
    fixes: pillFixes(p)
  });
  for (const p of pills) {
    for (const n3 of scene.nodes) {
      const own = p.node === n3.id;
      const hit = nodeParts(n3).filter((x) => !own || x.what === "label" || x.what === "note").find((x) => hits(p, x.box));
      if (hit) pillWarn(p, `the ${hit.what} of node "${n3.id}"`, { over: n3.id }, hit.box);
    }
    for (const e of scene.edges) {
      if (e.labelBox && hits(p, e.labelBox)) {
        pillWarn(p, `the label of edge ${e.from} -> ${e.to}`, { over: e.id }, e.labelBox);
      }
    }
  }
  for (let i = 0; i < pills.length; i++) {
    for (let j = i + 1; j < pills.length; j++) {
      const a = pills[i];
      const b = pills[j];
      if (!a || !b) continue;
      const [ra, rb] = [a.box.w / 2, b.box.w / 2];
      const hit = a.round && b.round ? Math.hypot(a.box.x + ra - (b.box.x + rb), a.box.y + ra - (b.box.y + rb)) < ra + rb - EPS : a.round ? circleHitsBox(a.box, b.box) : hits(b, a.box);
      if (hit) pillWarn(a, `${b.what}`, { over: b.node ?? b.subject.edge }, b.box);
    }
  }
  for (const a of scene.edges) {
    if (!a.labelBox) continue;
    for (const b of scene.edges) {
      if (b === a) continue;
      for (let i = 0; i + 1 < b.points.length; i++) {
        const p = b.points[i];
        const q = b.points[i + 1];
        if (p && q && segmentHitsBox(p, q, a.labelBox, EPS)) {
          warn(
            "DG212",
            `edge ${b.from} -> ${b.to} runs through the label "${a.label?.lines.join(" ")}" of ${a.from} -> ${a.to}`,
            {
              subject: { edge: b.id, from: b.from, to: b.to, labelOf: a.id },
              evidence: { label: boxOf(a.labelBox), segment: [pointOf(p), pointOf(q)] },
              fixes: [
                "shorten the label or drop a redundant one",
                `move "${b.from}" or "${b.to}" in the nodes list so the two edges separate`,
                "use layout: { spacing: loose }"
              ]
            }
          );
          break;
        }
      }
    }
  }
  const member = (id, g) => {
    for (let p = id; p; p = parentOf.get(p)) {
      if (p === g.id || g.around?.includes(p)) return true;
    }
    return false;
  };
  for (const mg of model.groups) {
    const ov = mg.around?.length ? scene.groups.find((x) => x.id === mg.id) : void 0;
    if (!ov) continue;
    const enclosed = [];
    for (const n3 of scene.nodes) {
      if (!member(n3.id, mg) && overlaps(n3.box, ov.box, -EPS))
        enclosed.push({ id: n3.id, kind: "node", box: n3.box });
    }
    for (const g of scene.groups) {
      const b = g.box;
      const inside = b.x >= ov.box.x - EPS && b.y >= ov.box.y - EPS && b.x + b.w <= ov.box.x + ov.box.w + EPS && b.y + b.h <= ov.box.y + ov.box.h + EPS;
      if (!g.overlay && inside && !member(g.id, mg))
        enclosed.push({ id: g.id, kind: "group", box: b });
    }
    for (const x of enclosed) {
      warn(
        "DG213",
        `overlay group "${mg.id}" encloses ${x.kind} "${x.id}", which it does not list in around:`,
        {
          subject: { group: mg.id, enclosed: x.id, kind: x.kind },
          evidence: { overlay: boxOf(ov.box), enclosed: boxOf(x.box) },
          fixes: [
            `add "${x.id}" to around: of "${mg.id}" if it belongs to it`,
            `move "${x.id}" in the nodes list so it sits outside the overlay`,
            "put the members of the overlay next to each other (same parent group, adjacent in the nodes list)"
          ]
        }
      );
    }
  }
  const headerParts = (g) => [g.label.lines.length ? g.labelBox : void 0, g.iconBox].filter(
    (b) => !!b && b.w > 0 && b.h > 0
  );
  for (const ov of scene.groups) {
    if (!ov.overlay) continue;
    const own = headerParts(ov);
    const hits2 = (b) => own.find((o) => overlaps(o, b, -EPS));
    const covered = [];
    for (const g of scene.groups) {
      if (g.id === ov.id) continue;
      for (const b of headerParts(g)) {
        const by = hits2(b);
        if (by) {
          covered.push({
            what: `the header of group "${g.id}"`,
            id: g.id,
            kind: "group",
            box: b,
            by
          });
          break;
        }
      }
    }
    for (const n3 of scene.nodes) {
      for (const part of nodeParts(n3)) {
        const by = hits2(part.box);
        if (by) {
          covered.push({ what: `node "${n3.id}"`, id: n3.id, kind: "node", box: part.box, by });
          break;
        }
      }
    }
    const members = model.groups.find((g) => g.id === ov.id)?.around ?? [];
    const loose = members.filter((m) => !parentOf.get(m)).map((m) => `"${m}"`);
    for (const x of covered) {
      warn("DG214", `the header of overlay group "${ov.id}" covers ${x.what}`, {
        subject: { group: ov.id, covered: x.id, kind: x.kind },
        evidence: { header: boxOf(x.by), covered: boxOf(x.box) },
        fixes: [
          ...loose.length ? [`put ${loose.join(", ")} in a group (in:), so layout can make room for the header`] : [],
          x.kind === "node" ? `move "${x.id}" in the nodes list so it sits clear of the header of "${ov.id}"` : `move the members of "${ov.id}" in the nodes list so its header sits clear of "${x.id}"`,
          `shorten the label of "${ov.id}"`
        ]
      });
    }
  }
  const explained = new Set((model.legend ?? []).map((l) => l.line));
  const styles = /* @__PURE__ */ new Map();
  for (const e of model.edges) {
    if (e.line !== "solid" && !explained.has(e.line))
      styles.set(e.line, (styles.get(e.line) ?? 0) + 1);
  }
  if (styles.size) {
    const counts = [...styles].map(([line, k]) => `${line} (${k} edge${k === 1 ? "" : "s"})`);
    warn("DG217", `line styles without a legend entry: ${counts.join(", ")}`, {
      subject: { lines: [...styles.keys()] },
      evidence: Object.fromEntries(styles),
      fixes: [
        `add legend: { ${[...styles.keys()].map((l) => `${l}: <what ${l} means>`).join(", ")} }`,
        "or draw these edges solid"
      ]
    });
  }
  if (scene.layoutFallback) {
    warn(
      "DG218",
      `layout used the "${scene.layoutFallback}" fallback; spec order may not be kept`,
      {
        evidence: { fallback: scene.layoutFallback },
        fixes: [
          "check that the node order in the picture still tells the story",
          "simplify nested groups or links between groups",
          "try layout: { layering: simplex }"
        ]
      }
    );
  }
  return out;
}

// src/layout.ts
import { existsSync as existsSync3 } from "node:fs";
import { createRequire } from "node:module";
import { join as join5 } from "node:path";

// src/themes.ts
var THEME_TOKENS = {
  light: {
    name: "light",
    background: "#ffffff",
    text: "#232f3e",
    muted: "#5f6b7a",
    edge: "#545b64",
    edgeLabel: "#3b4552",
    surface: "#ffffff",
    border: "#c6ccd4",
    zone: "#f4f6f8",
    // Numbered callouts are black with white digits in the AWS deck.
    stepFill: "#000000",
    stepText: "#ffffff",
    shadow: "#0f172a",
    flow: "#0972d3"
  },
  dark: {
    name: "dark",
    background: "#0d1117",
    text: "#e6edf3",
    muted: "#9aa4b2",
    edge: "#8b949e",
    edgeLabel: "#c9d1d9",
    surface: "#161b22",
    border: "#3d444d",
    zone: "#151b23",
    stepFill: "#e6edf3",
    stepText: "#0d1117",
    shadow: "#000000",
    flow: "#58a6ff"
  }
};
var INK = "#0b1012";
var PAPER = "#eef2f6";
var STAGE_TOKENS = {
  dark: {
    name: "dark",
    background: INK,
    text: "#e6edf3",
    muted: mixHex("#e6edf3", INK, 0.68),
    edge: mixHex("#ffffff", INK, 0.42),
    edgeLabel: mixHex("#e6edf3", INK, 0.86),
    surface: mixHex("#ffffff", INK, 0.05),
    border: mixHex("#ffffff", INK, 0.16),
    zone: mixHex("#ffffff", INK, 0.03),
    stepFill: INK,
    stepText: "#e6edf3",
    shadow: "#000000",
    flow: "#60a5fa",
    stage: {
      top: "#0e1a24",
      tint: "#2563eb",
      tintOpacity: 0.14,
      dot: "#ffffff",
      dotOpacity: 0.06,
      wash: "#ffffff",
      washOpacity: 0.035,
      ring: "#60a5fa"
    }
  },
  light: {
    name: "light",
    background: PAPER,
    text: "#1f2933",
    muted: mixHex("#1f2933", PAPER, 0.74),
    edge: mixHex("#0b1012", PAPER, 0.56),
    edgeLabel: "#2b3640",
    surface: "#ffffff",
    border: mixHex("#0b1012", PAPER, 0.16),
    zone: mixHex("#ffffff", PAPER, 0.6),
    stepFill: INK,
    stepText: "#ffffff",
    shadow: "#0f172a",
    flow: "#2563eb",
    stage: {
      top: "#ffffff",
      tint: "#2563eb",
      tintOpacity: 0.08,
      dot: "#0b1012",
      dotOpacity: 0.07,
      wash: "#ffffff",
      washOpacity: 0.7,
      ring: "#2563eb"
    }
  }
};
function tokensFor(scene) {
  return scene.skin === "stage" ? STAGE_TOKENS[scene.theme] : THEME_TOKENS[scene.theme];
}
var FONT_STACK = "Inter, 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', Arial, sans-serif";

// src/skins.ts
function neutral(hex) {
  const c = parseHex(hex);
  if (!c) return false;
  return Math.max(...c) - Math.min(...c) < 26;
}
function stageColors(scene) {
  const t = tokensFor(scene);
  const s = t.stage;
  if (!s) return scene;
  const canvas = scene.background && scene.background !== "transparent" ? scene.background : t.background;
  const washed = mixHex(s.wash, canvas, s.washOpacity);
  for (const g of scene.groups) {
    if (g.fill === "none" || !neutral(g.fill)) continue;
    g.fill = washed;
    const inner = g.inner && neutral(g.inner.fill);
    if (g.inner && inner) g.inner.fill = washed;
    g.wash = { color: s.wash, opacity: s.washOpacity, ...inner ? { inner: true } : {} };
    g.labelColor = ensureContrast(g.labelColor, washed, 4.5);
  }
  return scene;
}

// src/styles.ts
var AWS_DECK = "AWS Architecture Icons deck 2026-07-31, Groups slide";
var aws = (s) => ({
  iconStyle: "tile",
  rounded: 0,
  strokeWidth: 1.67,
  labelColor: "ink",
  source: AWS_DECK,
  ...s
});
var AWS_DASH = "6.67 5";
var GCP_SVG = "Google Cloud Architecture Center diagrams (2025 deployment archetypes), measured";
var gcp = (s) => ({
  iconStyle: "inline",
  rounded: 6,
  strokeWidth: 2,
  labelColor: "#202124",
  source: GCP_SVG,
  ...s
});
var AZURE_SVG = "Azure Architecture Center diagrams (baseline App Service, hub-spoke, AKS baseline), measured";
var azure = (s) => ({
  iconStyle: "inline",
  rounded: 0,
  strokeWidth: 1,
  labelColor: "#000000",
  source: AZURE_SVG,
  ...s
});
var K8S_DECK = "kubernetes/community icon deck";
var ORRERY = "orrery";
var OUTLINE = "#888f99";
var C4 = "C4-PlantUML v2.14.0 boundary style";
var DEFS = {
  // ------------------------------------------------------------- AWS
  "aws:cloud": aws({
    label: "AWS Cloud",
    stroke: "#232f3e",
    icon: "aws:group-aws-cloud-logo",
    description: "The AWS Cloud boundary, with the AWS logo tile."
  }),
  "aws:cloud-alt": aws({
    label: "AWS Cloud",
    stroke: "#232f3e",
    icon: "aws:group-aws-cloud",
    description: "AWS Cloud boundary with the cloud tile instead of the logo."
  }),
  "aws:account": aws({
    label: "AWS account",
    stroke: "#e7157b",
    icon: "aws:group-aws-account",
    description: "An AWS account."
  }),
  "aws:region": aws({
    label: "Region",
    stroke: "#00a4a6",
    dash: "5 1.67",
    icon: "aws:group-region",
    description: "An AWS Region (teal, short dashes)."
  }),
  "aws:az": aws({
    label: "Availability Zone",
    stroke: "#00a4a6",
    dash: AWS_DASH,
    labelAlign: "center",
    description: "An Availability Zone (dashed teal, centered label, no icon)."
  }),
  "aws:vpc": aws({
    label: "VPC",
    stroke: "#8c4fff",
    icon: "aws:group-virtual-private-cloud-vpc",
    description: "A virtual private cloud (purple)."
  }),
  "aws:public-subnet": aws({
    label: "Public subnet",
    stroke: "#7aa116",
    icon: "aws:group-public-subnet",
    description: "A public subnet (green)."
  }),
  "aws:private-subnet": aws({
    label: "Private subnet",
    stroke: "#00a4a6",
    icon: "aws:group-private-subnet",
    description: "A private subnet (teal)."
  }),
  "aws:security-group": aws({
    label: "Security group",
    stroke: "#dd344c",
    labelAlign: "center",
    description: "A security group (red, centered label, no icon)."
  }),
  "aws:auto-scaling": aws({
    label: "Auto Scaling group",
    stroke: "#ed7100",
    dash: AWS_DASH,
    icon: "aws:group-auto-scaling-group",
    iconStyle: "tile-center",
    labelAlign: "center",
    description: "An Auto Scaling group (dashed orange, icon top center). Use around: to span zones."
  }),
  "aws:corporate-dc": aws({
    label: "Corporate data center",
    stroke: "#7d8998",
    icon: "aws:group-corporate-data-center",
    description: "An on-premises corporate data center."
  }),
  "aws:server-contents": aws({
    label: "Server contents",
    stroke: "#7d8998",
    icon: "aws:group-server-contents",
    description: "What runs on a server."
  }),
  "aws:ec2-contents": aws({
    label: "EC2 instance contents",
    stroke: "#ed7100",
    icon: "aws:group-ec2-instance-contents",
    description: "What runs on an EC2 instance."
  }),
  "aws:spot-fleet": aws({
    label: "Spot Fleet",
    stroke: "#ed7100",
    icon: "aws:group-spot-fleet",
    description: "An EC2 Spot Fleet."
  }),
  "aws:iot-greengrass": aws({
    label: "AWS IoT Greengrass Deployment",
    stroke: "#7aa116",
    icon: "aws:group-aws-iot-greengrass-deployment",
    description: "An AWS IoT Greengrass deployment."
  }),
  "aws:step-functions": aws({
    label: "AWS Step Functions workflow",
    stroke: "#e7157b",
    icon: "aws:step-functions",
    description: "A Step Functions state machine (pink)."
  }),
  "aws:elastic-beanstalk": aws({
    label: "Elastic Beanstalk container",
    stroke: "#ed7100",
    icon: "aws:elastic-beanstalk",
    description: "An Elastic Beanstalk environment."
  }),
  "aws:generic": aws({
    label: "",
    stroke: "#7d8998",
    labelAlign: "center",
    description: "A generic AWS group (grey, centered label)."
  }),
  "aws:generic-dashed": aws({
    label: "",
    stroke: "#7d8998",
    dash: AWS_DASH,
    labelAlign: "center",
    description: "A generic AWS group, dashed."
  }),
  // ------------------------------------------------------------- Google Cloud
  "gcp:cloud": gcp({
    label: "Google Cloud",
    stroke: "#1f2124",
    fill: "#1a73e8",
    innerFill: "#ffffff",
    labelColor: "#ffffff",
    description: "The Google Cloud frame (Google blue band, white label, white inner panel).",
    source: `${GCP_SVG}; frame #1a73e8 + #1f2124 2px in 6/6 SVGs (#4285f4 in 0/6)`
  }),
  "gcp:region": gcp({
    label: "Region",
    stroke: "#202124",
    fill: "#ffffff",
    description: "A Google Cloud region (white panel, dark outline).",
    source: `${GCP_SVG}; 7 regions in 4/6 SVGs, all white + solid #202124 2px (#e8eaed in 0/6)`
  }),
  "gcp:zone": gcp({
    label: "Zone",
    stroke: "#1f2124",
    dash: "4 4",
    fill: "#ffffff",
    description: "A zone (dashed, white). Google's diagrams often tag zones on cards instead.",
    source: `${GCP_SVG}; zone container inferred`
  }),
  "gcp:vpc": gcp({
    label: "VPC network",
    stroke: "#1f2124",
    dash: "8 8",
    icon: "gcp:virtual-private-cloud",
    description: "A VPC network (dashed)."
  }),
  "gcp:subnet": gcp({
    label: "Subnet",
    stroke: "#1f2124",
    dash: "4 4",
    strokeWidth: 1.5,
    description: "A subnet (short dashes)."
  }),
  "gcp:project": gcp({
    label: "Project",
    stroke: "#1f2124",
    fill: "#f1f3f4",
    description: "A Google Cloud project (light grey)."
  }),
  "gcp:tier": gcp({
    label: "",
    stroke: "#1f2124",
    fill: "#ffffff",
    description: "A tier inside a region: web, application, database (white box)."
  }),
  "gcp:gke-cluster": gcp({
    label: "GKE cluster",
    stroke: "#1f2124",
    fill: "#ffffff",
    icon: "gcp:gke",
    description: "A Google Kubernetes Engine cluster."
  }),
  "gcp:on-prem": gcp({
    label: "On-premises",
    stroke: "#1f2124",
    fill: "#f1f3f4",
    icon: "tabler:building",
    description: "An on-premises environment."
  }),
  "gcp:external": gcp({
    label: "External",
    stroke: "#edebea",
    fill: "#edebea",
    strokeWidth: 0,
    rounded: 0,
    description: "Third-party or external systems (grey zone).",
    source: "Google Cloud landing zone diagrams (legacy zone stencil), measured"
  }),
  "gcp:optional": gcp({
    label: "",
    stroke: "#1f2124",
    dash: "4 4",
    description: "An optional component boundary (dashed)."
  }),
  "gcp:users": gcp({
    label: "Users",
    stroke: "#1f2124",
    fill: "#ffffff",
    icon: "tabler:users",
    description: "End users or clients outside Google Cloud.",
    source: `${GCP_SVG}; inferred`
  }),
  // ------------------------------------------------------------- Azure
  "azure:tenant": azure({
    label: "Microsoft Entra tenant",
    stroke: "#0078d4",
    labelColor: "#0063b1",
    rounded: 4,
    description: "A Microsoft Entra tenant.",
    source: "inferred (Azure publishes no tenant boundary style)"
  }),
  "azure:subscription": azure({
    label: "Subscription",
    stroke: "#0078d4",
    labelColor: "#0063b1",
    icon: "azure:subscriptions",
    rounded: 4,
    description: "An Azure subscription.",
    source: "inferred (not drawn in Azure's reference diagrams)"
  }),
  "azure:resource-group": azure({
    label: "Resource group",
    stroke: "#7f7f7f",
    dash: "3.5 2.5",
    icon: "azure:resource-groups",
    rounded: 4,
    description: "A resource group (dashed grey).",
    source: "inferred from Azure's optional-group dash (3.5 2.5, #7F7F7F)"
  }),
  "azure:region": azure({
    label: "Region",
    stroke: "#5b9bd5",
    dash: "3 3",
    labelColor: "#0a609e",
    description: "An Azure region (dashed blue).",
    source: "Azure diagrams label regions in #5B9BD5; the boundary is inferred"
  }),
  "azure:az": azure({
    label: "Zone 1",
    stroke: "#ffd965",
    fill: "#fafafa",
    strokeWidth: 1.5,
    rounded: 9,
    labelColor: "#0a609e",
    description: "An availability zone (yellow border, near-white fill)."
  }),
  "azure:vnet": azure({
    label: "Virtual network",
    stroke: "#a4cbfb",
    fill: "#a4cbfb",
    strokeWidth: 0,
    icon: "azure:virtual-networks",
    description: "A virtual network (light blue panel)."
  }),
  "azure:vnet-hub": azure({
    label: "Hub virtual network",
    stroke: "#1490df",
    dash: "3 3",
    icon: "azure:virtual-networks",
    description: "A hub or spoke virtual network in hub-spoke topologies (dashed blue)."
  }),
  "azure:subnet": azure({
    label: "Subnet",
    stroke: "#bfbfbf",
    fill: "#f8f8f8",
    description: "A subnet (light grey)."
  }),
  "azure:service-group": azure({
    label: "",
    stroke: "#bfbfbf",
    fill: "#f2f2f2",
    description: "A logical grouping: plan, monitoring, identity, data (grey)."
  }),
  "azure:optional": azure({
    label: "",
    stroke: "#7f7f7f",
    dash: "3.5 2.5",
    description: "An optional component boundary (dashed grey)."
  }),
  "azure:node-pool": azure({
    label: "Node pool",
    stroke: "#7f7f7f",
    dash: "2.25 2.25",
    fill: "#ffffff",
    description: "An AKS node pool (dashed grey, white)."
  }),
  "azure:on-prem": azure({
    label: "On-premises",
    stroke: "#bfbfbf",
    fill: "#f2f2f2",
    icon: "tabler:building",
    description: "An on-premises network.",
    source: `${AZURE_SVG}; inferred`
  }),
  // ------------------------------------------------------------- Kubernetes
  "k8s:cluster": {
    label: "Kubernetes cluster",
    stroke: "#326ce5",
    labelColor: "#2457c5",
    icon: "k8s:kubernetes",
    rounded: 12,
    description: "A Kubernetes cluster (Kubernetes blue).",
    source: `${K8S_DECK}: cluster, node and pod groups are solid blue rounded boxes`
  },
  "k8s:namespace": {
    label: "Namespace",
    stroke: "#1f2937",
    dash: "4 3",
    labelColor: "ink",
    icon: "k8s:namespace",
    rounded: 10,
    description: "A namespace (dashed).",
    source: `${K8S_DECK}: namespaces are dashed black rounded boxes`
  },
  "k8s:node": {
    label: "Node",
    stroke: "#326ce5",
    labelColor: "#2457c5",
    icon: "k8s:node",
    rounded: 10,
    description: "A worker node.",
    source: K8S_DECK
  },
  "k8s:control-plane": {
    label: "Control plane",
    stroke: "#326ce5",
    labelColor: "#2457c5",
    icon: "k8s:control-plane",
    rounded: 10,
    description: "The control plane.",
    source: K8S_DECK
  },
  // ------------------------------------------------------------- C4 model
  "c4:boundary": {
    label: "",
    stroke: "#444444",
    dash: "6 4",
    labelColor: "#444444",
    rounded: 0,
    strokeWidth: 1.25,
    description: "A C4 system or container boundary (dashed grey).",
    source: C4
  },
  // ------------------------------------------------------------- Generic
  box: { label: "", stroke: OUTLINE, description: "A plain bordered box.", source: ORRERY },
  dashed: {
    label: "",
    stroke: OUTLINE,
    dash: "6 4",
    description: "A dashed boundary.",
    source: ORRERY
  },
  zone: {
    label: "",
    stroke: OUTLINE,
    fill: "#f4f6f8",
    rounded: 10,
    description: "A filled panel with a soft outline, for tiers and lanes.",
    source: ORRERY
  },
  boundary: {
    label: "",
    stroke: "#444444",
    dash: "6 4",
    labelColor: "#444444",
    rounded: 4,
    strokeWidth: 1.25,
    description: "A system boundary (dashed, C4 style).",
    source: C4
  },
  "on-prem": {
    label: "On-premises",
    stroke: "#7d8998",
    fill: "#f4f6f8",
    icon: "tabler:building",
    description: "An on-premises site, vendor-neutral.",
    source: ORRERY
  },
  internet: {
    label: "Internet",
    stroke: OUTLINE,
    dash: "2 3",
    icon: "tabler:world",
    description: "The public internet.",
    source: ORRERY
  }
};
var GROUP_STYLES = Object.fromEntries(
  Object.entries(DEFS).map(([key, s]) => [
    key,
    {
      key,
      iconStyle: "inline",
      labelAlign: "left",
      strokeWidth: 1,
      rounded: 8,
      ...s
    }
  ])
);
var TYPE_ALIASES = {
  "aws:availability-zone": "aws:az",
  "aws:subnet-public": "aws:public-subnet",
  "aws:subnet-private": "aws:private-subnet",
  "aws:sg": "aws:security-group",
  "aws:asg": "aws:auto-scaling",
  "aws:auto-scaling-group": "aws:auto-scaling",
  "aws:on-prem": "aws:corporate-dc",
  "aws:data-center": "aws:corporate-dc",
  "aws:corporate-data-center": "aws:corporate-dc",
  "aws:ec2-instance-contents": "aws:ec2-contents",
  "aws:greengrass": "aws:iot-greengrass",
  "aws:sfn": "aws:step-functions",
  "aws:beanstalk": "aws:elastic-beanstalk",
  "gcp:google-cloud": "gcp:cloud",
  "gcp:network": "gcp:vpc",
  "gcp:gke": "gcp:gke-cluster",
  "gcp:onprem": "gcp:on-prem",
  "azure:rg": "azure:resource-group",
  "azure:virtual-network": "azure:vnet",
  "azure:availability-zone": "azure:az",
  "azure:onprem": "azure:on-prem",
  "k8s:ns": "k8s:namespace",
  generic: "box",
  group: "box",
  onprem: "on-prem"
};
function resolveGroupStyle(type) {
  const key = type.trim().toLowerCase();
  return GROUP_STYLES[key] ?? GROUP_STYLES[TYPE_ALIASES[key] ?? ""];
}
function groupStyleKeys() {
  return [...Object.keys(GROUP_STYLES), ...Object.keys(TYPE_ALIASES)];
}

// src/text.ts
import { readFileSync as readFileSync3 } from "node:fs";
import { join as join4 } from "node:path";
var tables;
var unitsPerEm = 2048;
function load() {
  if (tables) return tables;
  const metrics = JSON.parse(readFileSync3(join4(fontsDir, "metrics.json"), "utf8"));
  unitsPerEm = metrics.unitsPerEm;
  tables = {};
  for (const [weight, packed] of Object.entries(metrics.weights)) {
    const widths = /* @__PURE__ */ new Map();
    let cp = -1;
    for (const part of packed.split(",")) {
      const colon = part.indexOf(":");
      if (colon >= 0) {
        cp = Number(part.slice(0, colon));
        widths.set(cp, Number(part.slice(colon + 1)));
      } else {
        cp += 1;
        widths.set(cp, Number(part));
      }
    }
    tables[Number(weight)] = { widths, fallback: unitsPerEm };
  }
  return tables;
}
function measure(text2, size, weight = 400) {
  const table = load()[weight] ?? load()[400];
  if (!table) return text2.length * size * 0.6;
  let units = 0;
  for (const ch of text2) units += table.widths.get(ch.codePointAt(0) ?? 32) ?? table.fallback;
  return units / unitsPerEm * size;
}
function wrap(text2, size, maxWidth, weight = 400) {
  const lines = [];
  for (const paragraph of text2.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate, size, weight) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      if (measure(word, size, weight) <= maxWidth) {
        line = word;
        continue;
      }
      const pieces = word.split(/(?<=[a-z0-9])(?=[A-Z])|(?<=-)/);
      if (pieces.length > 1 && pieces.every((x) => measure(x, size, weight) <= maxWidth)) {
        let part = "";
        for (const piece of pieces) {
          if (part && measure(part + piece, size, weight) > maxWidth) {
            lines.push(part);
            part = piece;
          } else part += piece;
        }
        line = part;
        continue;
      }
      let chunk = "";
      for (const ch of word) {
        if (measure(chunk + ch, size, weight) > maxWidth && chunk) {
          lines.push(chunk);
          chunk = ch;
        } else chunk += ch;
      }
      line = chunk;
    }
    if (line || !words.length) lines.push(line);
  }
  return lines;
}
function textBlock(text2, size, maxWidth, weight = 400, lineHeight = 1.3) {
  const lines = text2 ? wrap(text2, size, maxWidth, weight) : [];
  const lead = Math.round(size * lineHeight * 10) / 10;
  const width = Math.max(0, ...lines.map((l) => measure(l, size, weight)));
  return { lines, size, weight, lead, width, height: lines.length ? lines.length * lead : 0 };
}

// src/layout.ts
var elkInstance;
function elk() {
  if (elkInstance) return elkInstance;
  const require2 = createRequire(import.meta.url);
  const vendored = join5(vendorDir, "elk.bundled.cjs");
  const ELK = require2(
    existsSync3(vendored) ? vendored : "elkjs/lib/elk.bundled.js"
  );
  elkInstance = new ELK();
  return elkInstance;
}
var SIZES = {
  pad: 28,
  nodeLabel: 13,
  note: 11.5,
  groupLabel: 13,
  edgeLabel: 11.5,
  title: 20,
  subtitle: 13,
  iconLabelMax: 132,
  // Step badges: official AWS, Azure and Google badges are 0.54 to 0.75 of the icon size.
  step: 28,
  cardLabelMax: 168,
  shapeLabelMax: 156,
  edgeLabelMax: 150,
  // AWS group tiles are 40x40 next to 48px service icons in the deck ("DON'T: Resize group icons").
  tile: 40,
  inlineIcon: 20
};
var ELK_DIRECTION = {
  right: "RIGHT",
  down: "DOWN",
  left: "LEFT",
  up: "UP"
};
var ELK_ROUTING = {
  orthogonal: "ORTHOGONAL",
  polyline: "POLYLINE",
  spline: "SPLINES"
};
var round = (v) => Math.round(v * 100) / 100;
function nodeGeometry(n3, horizontal) {
  const S = n3.iconSize;
  if (n3.look === "icon") {
    const label2 = textBlock(n3.label, SIZES.nodeLabel, Math.max(SIZES.iconLabelMax, S + 40));
    const note2 = n3.note ? textBlock(n3.note, SIZES.note, Math.max(SIZES.iconLabelMax, S + 40)) : void 0;
    const textW2 = Math.max(label2.width, note2?.width ?? 0);
    const textH2 = label2.height + (note2 ? note2.height + 2 : 0);
    if (horizontal)
      return {
        w: S,
        h: S,
        label: label2,
        note: note2,
        outside: { w: Math.ceil(textW2), h: Math.ceil(textH2) }
      };
    return {
      w: Math.ceil(Math.max(S, textW2)),
      h: Math.ceil(S + 6 + textH2),
      label: label2,
      note: note2
    };
  }
  if (n3.look === "card") {
    const label2 = textBlock(n3.label, SIZES.nodeLabel, SIZES.cardLabelMax, 600);
    const note2 = n3.note ? textBlock(n3.note, SIZES.note, SIZES.cardLabelMax) : void 0;
    const textW2 = Math.max(label2.width, note2?.width ?? 0);
    const textH2 = label2.height + (note2 ? note2.height + 2 : 0);
    const icon3 = n3.icon ? S + 12 : 0;
    return {
      w: Math.ceil(Math.max(150, 16 + icon3 + textW2 + 18)),
      h: Math.ceil(Math.max(56, Math.max(textH2, n3.icon ? S : 0) + 24)),
      label: label2,
      note: note2
    };
  }
  const label = textBlock(n3.label, SIZES.nodeLabel, SIZES.shapeLabelMax, 600);
  const note = n3.note ? textBlock(n3.note, SIZES.note, SIZES.shapeLabelMax) : void 0;
  const textW = Math.max(label.width, note?.width ?? 0);
  const textH = label.height + (note ? note.height + 2 : 0);
  const icon2 = n3.icon ? 28 : 0;
  let w = Math.max(108, textW + icon2 + 32);
  let h = Math.max(52, textH + 26);
  switch (n3.shape) {
    case "circle":
      w = h = Math.max(w, h, 72);
      break;
    case "diamond":
      w *= 1.45;
      h *= 1.45;
      break;
    case "hexagon":
      w += 28;
      break;
    case "cylinder":
      h += 16;
      break;
    case "queue":
      w += 24;
      break;
    case "document":
      h += 10;
      break;
    case "person":
      h += 30;
      break;
    case "cloud":
      w += 36;
      h += 22;
      break;
    case "stack":
      w += 8;
      h += 8;
      break;
    case "note":
      w += 8;
      break;
    default:
      break;
  }
  return { w: Math.ceil(w), h: Math.ceil(h), label, note };
}
function badgePill(text2, anchor2) {
  const w = round(Math.max(18, measure(text2, 10, 600) + 10));
  const x = Math.max(anchor2.x + anchor2.w - w / 2 - 2, anchor2.x + anchor2.w / 2 + 6);
  return { x: round(x), y: round(anchor2.y - 7), w, h: 16 };
}
function groupGeometry(g) {
  const style2 = resolveGroupStyle(g.type);
  const icon2 = g.icon === null ? void 0 : g.icon ?? style2?.icon;
  const iconStyle = style2?.iconStyle ?? "inline";
  const label = textBlock(g.label, SIZES.groupLabel, 1e3, 600);
  const center = style2?.labelAlign === "center";
  let header;
  let minWidth;
  if (iconStyle === "tile-center") {
    header = (icon2 ? SIZES.tile + 3 : 6) + label.height + 4;
    minWidth = Math.max(icon2 ? SIZES.tile : 0, label.width) + 32;
  } else if (iconStyle === "tile") {
    header = icon2 ? Math.max(SIZES.tile, label.height + 12) : label.height + 12;
    minWidth = (icon2 ? SIZES.tile + 8 : 12) + label.width + 16;
  } else {
    header = Math.max(34, label.height + 17);
    minWidth = 12 + (icon2 ? SIZES.inlineIcon + 8 : 0) + label.width + 16;
  }
  return {
    label,
    header: Math.ceil(header),
    minWidth: Math.ceil(minWidth),
    icon: icon2,
    iconStyle,
    center
  };
}
async function layout(model, opts = {}) {
  const theme = opts.theme ?? model.theme;
  const t = THEME_TOKENS[theme];
  const horizontal = model.direction === "right" || model.direction === "left";
  const s = model.spacing;
  const minWidthOf = (id, gg) => !horizontal && opts.widen?.has(id) ? Math.max(gg.minWidth, 2 * (gg.minWidth - 10)) : gg.minWidth;
  const base = {
    "elk.algorithm": "layered",
    "elk.direction": ELK_DIRECTION[model.direction],
    "elk.hierarchyHandling": "INCLUDE_CHILDREN",
    "elk.edgeRouting": ELK_ROUTING[model.routing],
    "elk.layered.layering.strategy": model.layering === "simplex" ? "NETWORK_SIMPLEX" : "LONGEST_PATH_SOURCE",
    "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
    "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
    // Orders each layer by the elk.position hints below, so siblings keep spec order (AZ A left
    // of AZ B). considerModelOrder would do the same but crashes elkjs 0.12 on nested graphs.
    "elk.layered.crossingMinimization.semiInteractive": "true",
    "elk.spacing.nodeNode": String(Math.round(40 * s)),
    "elk.layered.spacing.nodeNodeBetweenLayers": String(Math.round(64 * s)),
    "elk.spacing.edgeNode": String(Math.round(18 * s)),
    "elk.spacing.edgeEdge": String(Math.round(10 * s)),
    "elk.layered.spacing.edgeNodeBetweenLayers": String(Math.round(20 * s)),
    "elk.layered.spacing.edgeEdgeBetweenLayers": String(Math.round(10 * s)),
    "elk.spacing.edgeLabel": "4",
    "elk.spacing.labelNode": "6",
    "elk.edgeLabels.placement": "CENTER",
    // One side for every label (and its step badge); ELK's default picks per edge.
    "elk.layered.edgeLabels.sideSelection": "ALWAYS_UP",
    "elk.json.shapeCoords": "ROOT",
    "elk.json.edgeCoords": "ROOT",
    "elk.layered.mergeEdges": model.merge ? "true" : "false",
    "elk.layered.unnecessaryBendpoints": "true",
    "elk.layered.thoroughness": "12"
  };
  const nodeGeom = /* @__PURE__ */ new Map();
  const groupGeom = /* @__PURE__ */ new Map();
  const elkNodes = /* @__PURE__ */ new Map();
  for (const n3 of model.nodes) {
    const g = nodeGeometry(n3, horizontal);
    nodeGeom.set(n3.id, g);
    const node3 = {
      id: n3.id,
      width: g.w,
      height: g.h,
      layoutOptions: { "elk.alignment": "CENTER" }
    };
    if (g.outside) {
      node3.labels = [
        {
          id: `${n3.id}__label`,
          text: n3.label,
          width: g.outside.w,
          height: g.outside.h
        }
      ];
      node3.layoutOptions = {
        ...node3.layoutOptions,
        "elk.nodeLabels.placement": "OUTSIDE V_BOTTOM H_CENTER",
        "elk.spacing.labelNode": "6"
      };
    }
    if (n3.badge) {
      const S = n3.iconSize;
      const anchor2 = n3.look === "icon" ? { x: horizontal ? 0 : (g.w - S) / 2, y: 0, w: S, h: S } : { x: 0, y: 0, w: g.w, h: g.h };
      const pill = badgePill(n3.badge, anchor2);
      const overhang = Math.ceil(pill.x + pill.w - g.w);
      if (overhang > 0)
        node3.labels = [
          ...node3.labels ?? [],
          {
            id: `${n3.id}__badge`,
            text: n3.badge,
            width: overhang,
            height: 16,
            layoutOptions: {
              "elk.nodeLabels.placement": "OUTSIDE V_TOP H_RIGHT H_PRIORITY"
            }
          }
        ];
    }
    elkNodes.set(n3.id, node3);
  }
  for (const grp of model.groups) groupGeom.set(grp.id, groupGeometry(grp));
  for (const grp of model.groups) {
    const gg = groupGeom.get(grp.id);
    if (!gg || grp.around) continue;
    const siblings = model.groups.filter((o) => !o.around && o.parent === grp.parent);
    gg.header = Math.max(...siblings.map((o) => groupGeom.get(o.id)?.header ?? 0));
  }
  for (const grp of model.groups) {
    const gg = groupGeom.get(grp.id);
    if (!gg || grp.around) continue;
    const top2 = gg.header + 18 + (opts.room?.get(grp.id) ?? 0);
    elkNodes.set(grp.id, {
      id: grp.id,
      children: [],
      layoutOptions: {
        ...base,
        "elk.padding": `[top=${top2},left=20,bottom=20,right=20]`,
        "elk.nodeSize.constraints": "MINIMUM_SIZE",
        // ELK applies a compound minimum in its rotated frame when the flow is vertical.
        "elk.nodeSize.minimum": horizontal ? `(${gg.minWidth}, ${top2 + 24})` : `(${top2 + 24}, ${minWidthOf(grp.id, gg)})`,
        // Centered in a column; frames side by side in a row share their top edge.
        "elk.alignment": horizontal ? "CENTER" : "TOP",
        // A group widened by its label keeps its children centered under the header.
        "elk.contentAlignment": horizontal ? "V_TOP H_CENTER" : "V_CENTER H_CENTER"
      }
    });
  }
  const titleBlock = model.title ? textBlock(model.title, SIZES.title, 1400, 600, 1.25) : void 0;
  const subtitleBlock = model.subtitle ? textBlock(model.subtitle, SIZES.subtitle, 1400, 400) : void 0;
  const root = {
    id: "__root",
    layoutOptions: {
      ...base,
      "elk.padding": `[top=${SIZES.pad},left=${SIZES.pad},bottom=${SIZES.pad},right=${SIZES.pad}]`
    },
    children: [],
    edges: []
  };
  for (const item of [...model.groups, ...model.nodes]) {
    const el = elkNodes.get(item.id);
    if (!el) continue;
    const parent = item.parent ? elkNodes.get(item.parent) : root;
    (parent?.children ?? root.children)?.push(el);
  }
  for (const parent of [root, ...elkNodes.values()]) {
    parent.children?.forEach((c, i) => {
      c.layoutOptions = {
        ...c.layoutOptions,
        "elk.position": horizontal ? `(0,${i * 10})` : `(${i * 10},0)`
      };
    });
  }
  for (const grp of model.groups) {
    const el = elkNodes.get(grp.id);
    const gg = groupGeom.get(grp.id);
    if (el && gg && !el.children?.length) {
      el.width = gg.minWidth;
      el.height = gg.header + 60;
    }
  }
  const groupIds = new Set(model.groups.map((g) => g.id));
  const overlays = new Map(
    model.groups.filter((g) => g.around?.length).map((g) => [g.id, g.around ?? []])
  );
  const free = (e) => !e.constraint || overlays.has(e.from) || overlays.has(e.to);
  const members = (id) => (overlays.get(id) ?? [id]).filter((m) => !overlays.has(m));
  const port = (nodeId, side, e) => {
    if (!model.merge || groupIds.has(nodeId)) return nodeId;
    const el = elkNodes.get(nodeId);
    if (!el) return nodeId;
    const head = side === "in" ? e.arrow === "end" || e.arrow === "both" : e.arrow === "start" || e.arrow === "both";
    const id = `${nodeId}::${side}::${e.line}::${head ? 1 : 0}::${e.color ?? ""}`;
    el.ports ??= [];
    if (!el.ports.some((p) => p.id === id)) el.ports.push({ id, width: 0, height: 0 });
    el.layoutOptions = { ...el.layoutOptions, "elk.portConstraints": "FREE" };
    return id;
  };
  const labelledFrom = new Set(
    model.edges.filter((e) => !free(e) && (e.label || e.step !== void 0)).map((e) => e.from)
  );
  const edgeLabels = /* @__PURE__ */ new Map();
  for (const e of model.edges) {
    if (free(e)) {
      if (!e.constraint) continue;
      let i = 0;
      for (const s2 of members(e.from))
        for (const t2 of members(e.to))
          if (s2 !== t2) root.edges?.push({ id: `${e.id}__via${i++}`, sources: [s2], targets: [t2] });
      continue;
    }
    const elkEdge = {
      id: e.id,
      sources: [port(e.from, "out", e)],
      targets: [port(e.to, "in", e)]
    };
    if (!e.label && e.step === void 0 && labelledFrom.has(e.from)) {
      elkEdge.labels = [{ id: `${e.id}__spacer`, text: " ", width: 1, height: 1 }];
    }
    const stepW = e.step !== void 0 ? SIZES.step + 2 : 0;
    if (e.label || e.step !== void 0) {
      const block = textBlock(e.label ?? "", SIZES.edgeLabel, SIZES.edgeLabelMax);
      const w = Math.ceil((e.label ? block.width + 12 : 0) + stepW + (e.label && stepW ? 2 : 0));
      const h = Math.ceil(Math.max(e.label ? block.height + 6 : 0, stepW ? SIZES.step : 0));
      edgeLabels.set(e.id, { block, w, h, stepW });
      elkEdge.labels = [
        {
          id: `${e.id}__label`,
          text: e.label || `step ${e.step}`,
          width: w,
          height: h
        }
      ];
    }
    root.edges?.push(elkEdge);
  }
  let { graph: result, fallback } = await runElk(root);
  const strict = crossings(result);
  if (strict.count > 0) {
    const free2 = structuredClone(root);
    const leaves = new Set(model.nodes.map((n3) => n3.id).filter((id) => strict.nodes.has(id)));
    const unpin = (n3) => {
      if (leaves.has(n3.id) && n3.layoutOptions) delete n3.layoutOptions["elk.position"];
      for (const c of n3.children ?? []) unpin(c);
    };
    unpin(free2);
    const alt = await runElk(free2);
    if (crossings(alt.graph).count < strict.count) ({ graph: result, fallback } = alt);
  }
  const top = titleBlock ? Math.ceil(SIZES.pad + titleBlock.height + (subtitleBlock ? subtitleBlock.height + 4 : 0) - 6) : 0;
  const shift = (p) => ({ x: round(p.x), y: round(p.y + top) });
  const placed = /* @__PURE__ */ new Map();
  const walk = (n3) => {
    placed.set(n3.id, n3);
    for (const c of n3.children ?? []) walk(c);
  };
  walk(result);
  const depth = (id) => {
    let d = 0;
    let p = id;
    while (p) {
      d += 1;
      p = model.groups.find((g) => g.id === p)?.parent;
    }
    return d;
  };
  const elkEdges = [...placed.values()].flatMap((n3) => n3.edges ?? []);
  const edgeMarks = elkEdges.flatMap((e) => [
    ...(e.sections ?? []).flatMap(
      (s2) => [s2.startPoint, ...s2.bendPoints ?? [], s2.endPoint].map((p) => ({
        ...p,
        w: 0,
        h: 0
      }))
    ),
    ...(e.labels ?? []).map((l) => ({
      x: l.x ?? 0,
      y: l.y ?? 0,
      w: l.width,
      h: l.height
    }))
  ]);
  const byDepth = model.groups.filter((g) => !g.around).sort((a, b) => depth(b.parent) - depth(a.parent));
  for (const grp of byDepth) {
    const el = placed.get(grp.id);
    const gg = groupGeom.get(grp.id);
    if (!el?.children?.length || !gg) continue;
    const kids = el.children.flatMap((c) => [
      { x: c.x ?? 0, y: c.y ?? 0, w: c.width ?? 0, h: c.height ?? 0 },
      ...(c.labels ?? []).map((l) => ({
        x: l.x ?? 0,
        y: l.y ?? 0,
        w: l.width,
        h: l.height
      }))
    ]);
    const old = {
      x: el.x ?? 0,
      y: el.y ?? 0,
      w: el.width ?? 0,
      h: el.height ?? 0
    };
    const k = union(kids);
    let x0 = Math.max(old.x, k.x - 20);
    let y0 = Math.max(old.y, k.y - gg.header - 18 - (opts.room?.get(grp.id) ?? 0));
    let x1 = Math.min(old.x + old.w, k.x + k.w + 20);
    let y1 = Math.min(old.y + old.h, k.y + k.h + 20);
    if (x1 - x0 < minWidthOf(grp.id, gg)) [x0, x1] = [old.x, old.x + old.w];
    if (y1 - y0 < gg.header + 42) [y0, y1] = [old.y, old.y + old.h];
    for (const b of edgeMarks) {
      if (!contains(old, b)) continue;
      if (b.x < x0) x0 = old.x;
      if (b.y < y0) y0 = old.y;
      if (b.x + b.w > x1) x1 = old.x + old.w;
      if (b.y + b.h > y1) y1 = old.y + old.h;
    }
    Object.assign(el, { x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
  }
  stretchColumns(model, placed, elkEdges);
  const groups = [];
  const headerRoom = /* @__PURE__ */ new Map();
  const paintGroup = (grp, box, overlay) => {
    const gg = groupGeom.get(grp.id);
    const style2 = resolveGroupStyle(grp.type);
    if (!gg || !style2) return void 0;
    const strokeBase = grp.color ?? style2.stroke;
    let stroke2 = strokeBase;
    let fill = grp.fill === "none" ? "none" : grp.fill ?? style2.fill ?? "none";
    if (overlay) fill = "none";
    const ink = style2.labelColor === "ink" || !style2.labelColor;
    let labelColor = grp.color ?? (ink ? t.text : style2.labelColor ?? t.text);
    if (theme === "dark") {
      if (luminance(strokeBase) < 0.04) stroke2 = "#c9d1d9";
      else if (contrast(strokeBase, t.background) < 2) stroke2 = mixHex(strokeBase, "#ffffff", 0.55);
      if (fill !== "none") fill = mixHex(fill, t.background, 0.14);
      if (!grp.color && !ink && luminance(style2.labelColor ?? "#000000") < 0.04)
        labelColor = t.text;
    }
    labelColor = ensureContrast(labelColor, fill === "none" ? t.background : fill, 4.5);
    const L = gg.label;
    let iconBox;
    let labelX;
    let labelY;
    if (overlay && gg.iconStyle === "tile-center" && gg.icon) {
      iconBox = {
        x: box.x + (box.w - SIZES.tile) / 2,
        y: box.y - SIZES.tile / 2,
        w: SIZES.tile,
        h: SIZES.tile
      };
      labelX = box.x + (box.w - L.width) / 2;
      labelY = iconBox.y + SIZES.tile + 3;
    } else if (overlay) {
      iconBox = gg.icon ? { x: box.x + 10, y: box.y - 8, w: 16, h: 16 } : void 0;
      labelX = iconBox ? iconBox.x + iconBox.w + 5 : box.x + 12;
      labelY = box.y - L.height / 2;
    } else if (gg.iconStyle === "tile-center") {
      iconBox = gg.icon ? {
        x: box.x + (box.w - SIZES.tile) / 2,
        y: box.y,
        w: SIZES.tile,
        h: SIZES.tile
      } : void 0;
      labelX = box.x + (box.w - L.width) / 2;
      labelY = box.y + (gg.icon ? SIZES.tile + 3 : 6);
    } else if (gg.iconStyle === "tile") {
      iconBox = gg.icon ? { x: box.x, y: box.y, w: SIZES.tile, h: SIZES.tile } : void 0;
      labelX = gg.center ? box.x + (box.w - L.width) / 2 : iconBox ? box.x + SIZES.tile + 8 : box.x + 12;
      labelY = iconBox ? box.y + Math.max(6, (SIZES.tile - L.height) / 2) : box.y + 6;
    } else {
      iconBox = gg.icon ? {
        x: box.x + 12,
        y: box.y + 9,
        w: SIZES.inlineIcon,
        h: SIZES.inlineIcon
      } : void 0;
      labelX = gg.center && !iconBox ? box.x + (box.w - L.width) / 2 : iconBox ? iconBox.x + iconBox.w + 8 : box.x + 12;
      labelY = box.y + 10;
    }
    const cornerTile = !overlay && gg.iconStyle === "tile" && !!iconBox;
    const inset = overlay ? 10 : 12;
    headerRoom.set(grp.id, {
      moveIcon: !!iconBox && !cornerTile,
      lo: cornerTile ? box.x + SIZES.tile + 8 : box.x + inset,
      hi: box.x + box.w - inset
    });
    const innerFill = !overlay && style2.innerFill ? theme === "dark" ? mixHex(style2.innerFill, t.background, 0.06) : style2.innerFill : void 0;
    const headerH = gg.header + 4;
    const inner = innerFill ? {
      box: {
        x: round(box.x + 8),
        y: round(box.y + headerH),
        w: round(box.w - 16),
        h: round(box.h - headerH - 8)
      },
      fill: innerFill
    } : void 0;
    return {
      inner,
      id: grp.id,
      type: grp.type,
      box,
      depth: overlay ? 1e3 : depth(grp.parent),
      label: gg.label,
      labelBox: {
        x: round(labelX),
        y: round(labelY),
        w: round(gg.label.width),
        h: round(gg.label.height)
      },
      iconBox,
      icon: gg.icon,
      stroke: stroke2,
      fill,
      labelColor,
      dash: grp.dashed === false ? void 0 : style2.dash ?? (grp.dashed ? "6 4" : void 0),
      strokeWidth: style2.strokeWidth,
      radius: style2.rounded,
      parent: overlay ? void 0 : grp.parent,
      overlay: overlay || void 0
    };
  };
  for (const grp of model.groups) {
    if (grp.around) continue;
    const el = placed.get(grp.id);
    if (!el) continue;
    const box = {
      x: round(el.x ?? 0),
      y: round((el.y ?? 0) + top),
      w: round(el.width ?? 0),
      h: round(el.height ?? 0)
    };
    const sg = paintGroup(grp, box, false);
    if (sg) groups.push(sg);
  }
  groups.sort((a, b) => a.depth - b.depth);
  const nodes = [];
  for (const n3 of model.nodes) {
    const el = placed.get(n3.id);
    const g = nodeGeom.get(n3.id);
    if (!el || !g) continue;
    const box = {
      x: round(el.x ?? 0),
      y: round((el.y ?? 0) + top),
      w: round(el.width ?? 0),
      h: round(el.height ?? 0)
    };
    const node3 = {
      id: n3.id,
      look: n3.look,
      shape: n3.shape,
      box,
      icon: n3.icon,
      label: g.label,
      labelBox: { x: 0, y: 0, w: 0, h: 0 },
      note: g.note,
      color: n3.color,
      badge: n3.badge,
      url: n3.url,
      parent: n3.parent
    };
    let surface;
    for (let p = n3.parent; p && !surface; p = model.groups.find((g2) => g2.id === p)?.parent) {
      const sg = groups.find((g2) => g2.id === p);
      if (sg?.inner) surface = sg.inner.fill;
      else if (sg && sg.fill !== "none") surface = sg.fill;
    }
    if (surface) {
      const ink = ensureContrast(t.text, surface, 4.5);
      const inkMuted = ensureContrast(t.muted, surface, 4.5);
      if (ink !== t.text) node3.ink = ink;
      if (inkMuted !== t.muted) node3.inkMuted = inkMuted;
    }
    const S = n3.iconSize;
    if (n3.look === "icon") {
      if (horizontal) {
        node3.iconBox = { ...box };
        const lab = el.labels?.[0];
        const lx = lab?.x !== void 0 ? lab.x : box.x + (S - (g.outside?.w ?? 0)) / 2;
        const ly = lab?.y !== void 0 ? lab.y + top : box.y + S + 6;
        const ow = g.outside?.w ?? g.label.width;
        node3.labelBox = {
          x: round(lx + (ow - g.label.width) / 2),
          y: round(ly),
          w: round(g.label.width),
          h: round(g.label.height)
        };
      } else {
        node3.iconBox = {
          x: round(box.x + (box.w - S) / 2),
          y: box.y,
          w: S,
          h: S
        };
        node3.labelBox = {
          x: round(box.x + (box.w - g.label.width) / 2),
          y: round(box.y + S + 6),
          w: round(g.label.width),
          h: round(g.label.height)
        };
      }
      if (g.note) {
        node3.noteBox = {
          x: round(node3.labelBox.x + (g.label.width - g.note.width) / 2),
          y: round(node3.labelBox.y + g.label.height + 2),
          w: round(g.note.width),
          h: round(g.note.height)
        };
      }
    } else if (n3.look === "card") {
      const textH = g.label.height + (g.note ? g.note.height + 2 : 0);
      const ix = box.x + 16;
      if (n3.icon)
        node3.iconBox = {
          x: round(ix),
          y: round(box.y + (box.h - S) / 2),
          w: S,
          h: S
        };
      const tx = n3.icon ? ix + S + 12 : box.x + 16;
      const ty = box.y + (box.h - textH) / 2;
      node3.labelBox = {
        x: round(tx),
        y: round(ty),
        w: round(g.label.width),
        h: round(g.label.height)
      };
      if (g.note)
        node3.noteBox = {
          x: round(tx),
          y: round(ty + g.label.height + 2),
          w: round(g.note.width),
          h: round(g.note.height)
        };
    } else {
      const textH = g.label.height + (g.note ? g.note.height + 2 : 0);
      const extraTop = n3.shape === "person" ? 30 : n3.shape === "cylinder" ? 10 : n3.shape === "cloud" ? 8 : 0;
      const innerH = box.h - extraTop - (n3.shape === "document" ? 10 : 0);
      const iconW = n3.icon ? 28 : 0;
      const textW = Math.max(g.label.width, g.note?.width ?? 0);
      const startX = box.x + (box.w - (textW + iconW)) / 2;
      const ty = box.y + extraTop + (innerH - textH) / 2;
      if (n3.icon)
        node3.iconBox = {
          x: round(startX),
          y: round(ty + (textH - 20) / 2),
          w: 20,
          h: 20
        };
      const tx = startX + iconW;
      node3.labelBox = {
        x: round(tx + (textW - g.label.width) / 2),
        y: round(ty),
        w: round(g.label.width),
        h: round(g.label.height)
      };
      if (g.note) {
        node3.noteBox = {
          x: round(tx + (textW - g.note.width) / 2),
          y: round(ty + g.label.height + 2),
          w: round(g.note.width),
          h: round(g.note.height)
        };
      }
    }
    if (n3.badge)
      node3.badgeBox = badgePill(n3.badge, node3.iconBox && n3.look === "icon" ? node3.iconBox : box);
    nodes.push(node3);
  }
  for (const grp of model.groups) {
    if (!grp.around?.length) continue;
    const gg = groupGeom.get(grp.id);
    const boxes = [];
    for (const id of grp.around) {
      const nd = nodes.find((x) => x.id === id);
      if (nd)
        boxes.push(
          ...[nd.box, nd.iconBox, nd.labelBox, nd.noteBox, nd.badgeBox].filter(
            (b) => !!b && b.w > 0
          )
        );
      const sg2 = groups.find((x) => x.id === id);
      if (sg2) boxes.push(sg2.box);
    }
    if (!boxes.length || !gg) continue;
    const pad = 12;
    const head = gg.iconStyle === "tile-center" && gg.icon ? Math.ceil(SIZES.tile / 2 + 3 + gg.label.height + 6) : pad + 2;
    let x0 = Math.min(...boxes.map((b) => b.x)) - pad;
    let x1 = Math.max(...boxes.map((b) => b.x + b.w)) + pad;
    const short = gg.minWidth + 2 * pad - (x1 - x0);
    if (short > 0) [x0, x1] = [x0 - short / 2, x1 + short / 2];
    const y0 = Math.min(...boxes.map((b) => b.y)) - head;
    const y1 = Math.max(...boxes.map((b) => b.y + b.h)) + pad;
    const sg = paintGroup(
      grp,
      { x: round(x0), y: round(y0), w: round(x1 - x0), h: round(y1 - y0) },
      true
    );
    if (sg) groups.push(sg);
  }
  const edges = [];
  const attachBox = (id) => {
    const nd = nodes.find((x) => x.id === id);
    if (nd) {
      const side = nd.look === "icon" && horizontal && nd.iconBox ? nd.iconBox : nd.box;
      return {
        side,
        full: union([nd.box, nd.iconBox, nd.labelBox, nd.noteBox])
      };
    }
    const g = groups.find((x) => x.id === id);
    if (!g) return void 0;
    const head = g.overlay ? [g.iconBox, g.labelBox].filter((b) => !!b && b.w > 0) : [];
    return { side: g.box, full: g.box, avoid: head.length ? union(head) : void 0 };
  };
  const freeRoutes = /* @__PURE__ */ new Map();
  const claimed = [];
  const related = (a, b) => [a.from, a.to].some((id) => id === b.from || id === b.to);
  const fits = (points, e) => {
    const [s2, p, q, t2] = points;
    if (!s2 || !p || !q || !t2) return true;
    const v = Math.abs(p.x - q.x) < 0.5;
    const at = v ? p.x : p.y;
    const [lo, hi] = v ? [s2.x, t2.x].sort((m, n3) => m - n3) : [s2.y, t2.y].sort((m, n3) => m - n3);
    if (at < (lo ?? at) + 8 || at > (hi ?? at) - 8) return false;
    const span = (a, b) => (v ? [a.y, b.y] : [a.x, b.x]).sort((m, n3) => m - n3);
    const [a0 = 0, a1 = 0] = span(p, q);
    return !claimed.some((c) => {
      if (related(c.e, e) || Math.abs(c.p.x - c.q.x) < 0.5 !== v) return false;
      if (Math.abs((v ? c.p.x : c.p.y) - at) >= 6) return false;
      const [b0 = 0, b1 = 0] = span(c.p, c.q);
      return Math.min(a1, b1) - Math.max(a0, b0) > 0.5;
    });
  };
  for (const straight of [true, false]) {
    for (const e of model.edges) {
      const a = attachBox(e.from);
      const b = attachBox(e.to);
      if (!free(e) || !a || !b) continue;
      const route = (d) => steer(steer(freeRoute(a, b, d), "to", b.avoid, b.full), "from", a.avoid, a.full);
      let points = route(0);
      if (points.length === 2 !== straight) continue;
      if (!straight)
        points = [0, 12, -12, 24, -24, 36, -36].map(route).find((p) => fits(p, e)) ?? points;
      freeRoutes.set(e.id, points);
      claimed.push(...points.slice(1).map((q, i) => ({ e, p: points[i] ?? q, q })));
    }
  }
  for (const e of model.edges) {
    if (free(e)) {
      const points2 = freeRoutes.get(e.id);
      if (points2)
        edges.push({
          id: e.id,
          from: e.from,
          to: e.to,
          points: points2,
          line: e.line,
          arrow: e.arrow,
          color: e.color,
          step: e.step
        });
      continue;
    }
    const el = result.edges?.find((x) => x.id === e.id) ?? findEdge(result, e.id);
    const section = el?.sections?.[0];
    if (!el || !section) continue;
    const points = [section.startPoint, ...section.bendPoints ?? [], section.endPoint].map(shift);
    const edge3 = {
      id: e.id,
      from: e.from,
      to: e.to,
      points,
      line: e.line,
      arrow: e.arrow,
      color: e.color,
      step: e.step
    };
    const lab = edgeLabels.get(e.id);
    const elkLabel = el.labels?.[0];
    if (lab && elkLabel?.x !== void 0 && elkLabel.y !== void 0) {
      const box = {
        x: round(elkLabel.x),
        y: round(elkLabel.y + top),
        w: lab.w,
        h: lab.h
      };
      if (e.step !== void 0) {
        edge3.stepBox = {
          x: box.x,
          y: round(box.y + (box.h - SIZES.step) / 2),
          w: SIZES.step,
          h: SIZES.step
        };
      }
      if (e.label) {
        edge3.label = lab.block;
        edge3.labelBox = {
          x: round(box.x + lab.stepW + (lab.stepW ? 2 : 0)),
          y: box.y,
          w: round(lab.w - lab.stepW - (lab.stepW ? 2 : 0)),
          h: lab.h
        };
      }
    }
    edges.push(edge3);
  }
  if (model.routing !== "spline") for (const e of edges) e.points = dropStraightPoints(e.points);
  if (model.routing === "orthogonal") {
    const sides = new Map([
      ...groups.filter((g) => !g.overlay).map((g) => [g.id, [g.box]]),
      ...nodes.map((n3) => [
        n3.id,
        n3.look === "icon" && n3.iconBox ? [n3.iconBox, n3.box] : [n3.box]
      ])
    ]);
    for (const e of edges) {
      straightenEnd(e, "to", sides.get(e.to), edges);
      straightenEnd(e, "from", sides.get(e.from), edges);
      e.points = dropStraightPoints(e.points);
    }
  }
  const footprints = nodes.map((n3) => union([n3.box, n3.iconBox, n3.labelBox, n3.noteBox]));
  for (const e of model.edges) {
    const edge3 = edges.find((x) => x.id === e.id);
    if (!free(e) || !edge3 || !e.label && e.step === void 0) continue;
    const block = textBlock(e.label ?? "", SIZES.edgeLabel, SIZES.edgeLabelMax);
    const stepW = e.step !== void 0 ? SIZES.step + 2 : 0;
    const w = Math.ceil((e.label ? block.width + 12 : 0) + stepW + (e.label && stepW ? 2 : 0));
    const h = Math.ceil(Math.max(e.label ? block.height + 6 : 0, stepW ? SIZES.step : 0));
    const box = freeLabelBox(edge3.points, w, h, [
      ...footprints,
      ...edges.flatMap((x) => [x.labelBox, x.stepBox]),
      ...groups.map((g) => g.labelBox)
    ]);
    if (e.step !== void 0)
      edge3.stepBox = {
        x: box.x,
        y: round(box.y + (h - SIZES.step) / 2),
        w: SIZES.step,
        h: SIZES.step
      };
    if (e.label) {
      edge3.label = block;
      edge3.labelBox = {
        x: round(box.x + stepW + (stepW ? 2 : 0)),
        y: box.y,
        w: round(w - stepW - (stepW ? 2 : 0)),
        h
      };
    }
  }
  for (const [i, g] of groups.entries()) {
    const grp = g.overlay ? model.groups.find((x) => x.id === g.id) : void 0;
    if (!grp) continue;
    let [x0, y0, x1, y1] = [g.box.x, g.box.y, g.box.x + g.box.w, g.box.y + g.box.h];
    for (const e of edges)
      for (let k = 1; k < e.points.length; k++) {
        const p = e.points[k - 1];
        const q = e.points[k];
        if (!p || !q) continue;
        const flat = Math.abs(p.y - q.y) < 0.5;
        if (!flat && Math.abs(p.x - q.x) >= 0.5) continue;
        const [lo, hi] = flat ? [Math.min(p.x, q.x), Math.max(p.x, q.x)] : [Math.min(p.y, q.y), Math.max(p.y, q.y)];
        const [from, to] = flat ? [x0, x1] : [y0, y1];
        if (Math.min(hi, to) - Math.max(lo, from) < 20) continue;
        const at = flat ? p.y : p.x;
        if (flat && Math.abs(at - y0) < 8) y0 = Math.min(y0, at - 8);
        if (flat && Math.abs(at - y1) < 8) y1 = Math.max(y1, at + 8);
        if (!flat && Math.abs(at - x0) < 8) x0 = Math.min(x0, at - 8);
        if (!flat && Math.abs(at - x1) < 8) x1 = Math.max(x1, at + 8);
      }
    if (x0 === g.box.x && y0 === g.box.y && x1 === g.box.x + g.box.w && y1 === g.box.y + g.box.h)
      continue;
    const box = { x: round(x0), y: round(y0), w: round(x1 - x0), h: round(y1 - y0) };
    const sg = paintGroup(grp, box, true);
    if (sg) groups[i] = sg;
  }
  const blocked = [];
  for (const g of groups) {
    const room2 = headerRoom.get(g.id);
    if (room2 && !clearHeader(g, room2, groups, nodes, edges)) blocked.push(g.id);
  }
  const widen = blocked.filter((id) => {
    const gg = groupGeom.get(id);
    const box = groups.find((g) => g.id === id)?.box;
    if (!gg || !box || gg.center || gg.iconStyle === "tile-center") return false;
    if (model.groups.find((g) => g.id === id)?.around) return false;
    return box.w + 0.5 < Math.max(gg.minWidth, 2 * (gg.minWidth - 10));
  });
  const room = /* @__PURE__ */ new Map();
  const headOf = (g) => {
    const parts = [g.label.lines.length ? g.labelBox : void 0, g.iconBox].filter(
      (b) => !!b && b.w > 0 && b.h > 0
    );
    return parts.length ? union(parts) : void 0;
  };
  const hits = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (const ov of groups) {
    const head = ov.overlay ? headOf(ov) : void 0;
    if (!head) continue;
    let need = 0;
    for (const g of groups) {
      const h = g.overlay ? void 0 : headOf(g);
      if (h && hits(head, h)) need = Math.max(need, h.y + h.h + 8 - head.y);
    }
    if (need <= 0) continue;
    for (const id of overlays.get(ov.id) ?? []) {
      const parent = model.nodes.find((n3) => n3.id === id)?.parent ?? model.groups.find((g) => g.id === id)?.parent;
      if (parent && !overlays.has(parent))
        room.set(parent, Math.max(room.get(parent) ?? 0, Math.ceil(need)));
    }
  }
  const wider = !horizontal && widen.length > 0;
  if (!opts.widen && !opts.room && (wider || room.size))
    return layout(model, {
      ...opts,
      widen: wider ? new Set(widen) : void 0,
      room: room.size ? room : void 0
    });
  const drawn = [
    ...groups.flatMap((g) => [g.box, g.labelBox, g.iconBox]),
    ...nodes.flatMap((n3) => [n3.box, n3.iconBox, n3.labelBox, n3.noteBox, n3.badgeBox]),
    ...edges.flatMap((e) => [
      e.labelBox,
      e.stepBox,
      ...e.points.map((p) => ({ ...p, w: 0, h: 0 }))
    ])
  ].filter((b) => !!b);
  const dx = Math.max(0, Math.ceil(4 - Math.min(...drawn.map((b) => b.x))));
  const dy = Math.max(
    0,
    Math.ceil(top + (titleBlock ? 8 : 4) - Math.min(...drawn.map((b) => b.y)))
  );
  if (dx || dy) {
    const moved = /* @__PURE__ */ new Set();
    const move = (b) => {
      if (!b || moved.has(b)) return;
      moved.add(b);
      b.x = round(b.x + dx);
      b.y = round(b.y + dy);
    };
    for (const g of groups) [g.box, g.labelBox, g.iconBox, g.inner?.box].forEach(move);
    for (const n3 of nodes) [n3.box, n3.iconBox, n3.labelBox, n3.noteBox, n3.badgeBox].forEach(move);
    for (const e of edges) {
      [e.labelBox, e.stepBox].forEach(move);
      e.points = e.points.map((p) => ({
        x: round(p.x + dx),
        y: round(p.y + dy)
      }));
    }
  }
  let width = round((result.width ?? 0) + dx);
  let height = round((result.height ?? 0) + top + dy);
  for (const b of [...groups.map((g) => g.box), ...edges.flatMap((e) => [e.labelBox, e.stepBox])]) {
    if (!b) continue;
    width = Math.max(width, round(b.x + b.w + SIZES.pad));
    height = Math.max(height, round(b.y + b.h + SIZES.pad));
  }
  let titleBox;
  let subtitleBox;
  if (titleBlock) {
    titleBox = {
      x: SIZES.pad,
      y: SIZES.pad - 4,
      w: round(titleBlock.width),
      h: round(titleBlock.height)
    };
    width = Math.max(width, round(titleBlock.width + SIZES.pad * 2));
    if (subtitleBlock) {
      subtitleBox = {
        x: SIZES.pad,
        y: round(titleBox.y + titleBlock.height + 4),
        w: round(subtitleBlock.width),
        h: round(subtitleBlock.height)
      };
      width = Math.max(width, round(subtitleBlock.width + SIZES.pad * 2));
    }
  }
  width = Math.ceil(width);
  height = Math.ceil(height);
  let legend3;
  if (model.legend?.length) {
    legend3 = placeLegend(model.legend, width, height);
    width = Math.max(width, Math.ceil(legend3.box.w + SIZES.pad * 2));
    height = Math.ceil(legend3.box.y + legend3.box.h + SIZES.pad);
  }
  const scene = {
    width,
    height,
    theme,
    direction: model.direction,
    routing: model.routing,
    arrowhead: model.arrowhead,
    animate: animateOf(model),
    skin: model.skin,
    background: model.background,
    title: titleBlock,
    titleBox,
    subtitle: subtitleBlock,
    subtitleBox,
    nodes,
    groups,
    edges,
    legend: legend3,
    layoutFallback: fallback,
    description: describe(model)
  };
  return model.skin === "stage" ? stageColors(scene) : scene;
}
var animateOf = (model) => model.animate ?? (model.skin === "stage" ? "relay" : "packets");
function placeLegend(entries, width, height) {
  const P = 10;
  const rows = entries.map((e) => ({
    line: e.line,
    label: textBlock(e.label, SIZES.edgeLabel, 240)
  }));
  const w = Math.ceil(P + 28 + 8 + Math.max(...rows.map((r) => r.label.width)) + P);
  const pitch = rows.map((r) => Math.max(18, r.label.height + 3));
  const last = rows[rows.length - 1]?.label.height ?? 0;
  const h = Math.ceil(P + pitch.slice(0, -1).reduce((a, b) => a + b, 0) + last + P);
  const box = {
    x: Math.max(SIZES.pad, width - SIZES.pad - w),
    y: height - SIZES.pad + 12,
    w,
    h
  };
  let y = box.y + P;
  const items = rows.map((r, i) => {
    const swatch = {
      x: box.x + P,
      y: round(y + (r.label.lead - 12) / 2),
      w: 28,
      h: 12
    };
    const labelBox = {
      x: box.x + P + 36,
      y: round(y),
      w: round(r.label.width),
      h: round(r.label.height)
    };
    y += pitch[i] ?? 18;
    return { line: r.line, swatch, label: r.label, labelBox };
  });
  return { box, items };
}
function fitIcons(scene) {
  if (scene.direction !== "right" && scene.direction !== "left") return;
  for (const n3 of scene.nodes) {
    const b = n3.iconBox;
    const aspect = n3.look === "icon" && n3.icon ? iconAspect(n3.icon) : void 0;
    if (!b || !aspect || aspect >= 1) continue;
    const w = round(b.h * aspect);
    if (w >= b.w - 0.01) continue;
    const x = round(b.x + (b.w - w) / 2);
    for (const e of scene.edges) {
      const ends = [e.from === n3.id ? 0 : -1, e.to === n3.id ? e.points.length - 1 : -1];
      for (const i of ends) {
        const p = e.points[i];
        const next = e.points[i === 0 ? 1 : i - 1];
        if (!p || !next || Math.abs(next.y - p.y) > 0.5 || p.y < b.y || p.y > b.y + b.h) continue;
        if (Math.abs(p.x - b.x) < 0.5) e.points[i] = { x, y: p.y };
        else if (Math.abs(p.x - (b.x + b.w)) < 0.5) e.points[i] = { x: round(x + w), y: p.y };
      }
    }
    n3.iconBox = { ...b, x, w };
    if (n3.badge) n3.badgeBox = badgePill(n3.badge, n3.iconBox);
  }
}
function stretchColumns(model, placed, edges) {
  const parentOf = new Map([...model.groups, ...model.nodes].map((x) => [x.id, x.parent]));
  const related = (a, b) => {
    for (let p = parentOf.get(a); p; p = parentOf.get(p)) if (p === b) return true;
    for (let p = parentOf.get(b); p; p = parentOf.get(p)) if (p === a) return true;
    return a === b;
  };
  const boxOf2 = (n3) => ({
    x: n3.x ?? 0,
    y: n3.y ?? 0,
    w: n3.width ?? 0,
    h: n3.height ?? 0
  });
  const items = [...placed.values()].filter((n3) => n3.id !== "__root").flatMap((n3) => [
    { id: n3.id, box: boxOf2(n3) },
    ...(n3.labels ?? []).map((l) => ({
      id: n3.id,
      box: { x: l.x ?? 0, y: l.y ?? 0, w: l.width, h: l.height }
    }))
  ]);
  const labels = edges.flatMap(
    (e) => (e.labels ?? []).map((l) => ({
      x: l.x ?? 0,
      y: l.y ?? 0,
      w: l.width,
      h: l.height
    }))
  );
  const segments2 = edges.flatMap(
    (e) => (e.sections ?? []).flatMap((s) => {
      const pts = dropStraightPoints([s.startPoint, ...s.bendPoints ?? [], s.endPoint]);
      return pts.slice(1).map((q, i) => [pts[i] ?? q, q]);
    })
  );
  const columns = [];
  for (const grp of model.groups) {
    const el = placed.get(grp.id);
    if (grp.around || !el) continue;
    const b = boxOf2(el);
    const column = columns.find(
      (c) => c.every((o) => {
        const ob = boxOf2(placed.get(o.id) ?? el);
        const shared = Math.min(b.x + b.w, ob.x + ob.w) - Math.max(b.x, ob.x);
        const stacked = b.y >= ob.y + ob.h || ob.y >= b.y + b.h;
        return o.type === grp.type && o.parent === grp.parent && stacked && shared > b.w / 2;
      })
    );
    if (column) column.push(grp);
    else columns.push([grp]);
  }
  for (const column of columns.filter((c) => c.length > 1)) {
    const els = column.map((g) => placed.get(g.id)).filter((n3) => !!n3);
    const x0 = Math.min(...els.map((n3) => n3.x ?? 0));
    const x1 = Math.max(...els.map((n3) => (n3.x ?? 0) + (n3.width ?? 0)));
    for (const el of els) {
      const b = boxOf2(el);
      if (b.w < (x1 - x0) * 0.75) continue;
      const strips = [
        { x: x0, y: b.y, w: b.x - x0, h: b.h, left: true },
        { x: b.x + b.w, y: b.y, w: x1 - b.x - b.w, h: b.h, left: false }
      ];
      const open = strips.every((s) => {
        if (s.w < 0.5) return true;
        const hit = (o) => overlaps2(s, { x: o.x, y: o.y, w: o.w || 0.01, h: o.h || 0.01 });
        if (items.some((it) => !related(it.id, el.id) && hit(it.box))) return false;
        if (labels.some(hit)) return false;
        return segments2.every(([p, q]) => {
          const [lo, hi] = [Math.min(p.x, q.x), Math.max(p.x, q.x)];
          const across = s.left ? lo <= s.x + 0.01 && hi > b.x + 0.5 : hi >= x1 - 0.01 && lo < s.x - 0.5;
          return !hit(segmentBox(p, q)) || Math.abs(p.y - q.y) < 0.5 && across;
        });
      });
      if (open) Object.assign(el, { x: x0, width: x1 - x0 });
    }
  }
}
var segmentBox = (p, q) => ({
  x: Math.min(p.x, q.x),
  y: Math.min(p.y, q.y),
  w: Math.abs(q.x - p.x),
  h: Math.abs(q.y - p.y)
});
function clearHeader(g, room, groups, nodes, edges) {
  const icon2 = room.moveIcon ? g.iconBox : void 0;
  const u = union([g.labelBox, icon2]);
  const chip = { x: u.x - 6, y: u.y - 1, w: u.w + 12, h: u.h + 2 };
  const inBand = (b) => b.y < chip.y + chip.h - 0.5 && b.y + b.h > chip.y + 0.5;
  const hit = (b, dx2) => b.x < chip.x + dx2 + chip.w - 0.01 && b.x + b.w > chip.x + dx2 + 0.01;
  const segments2 = edges.flatMap((e) => e.points.slice(1).map((q, i) => segmentBox(e.points[i] ?? q, q))).filter(inBand);
  const others = [
    ...segments2,
    ...nodes.flatMap((n3) => [n3.box, n3.iconBox, n3.labelBox, n3.noteBox, n3.badgeBox]),
    ...edges.flatMap((e) => [e.labelBox, e.stepBox]),
    ...groups.filter((o) => o !== g).flatMap((o) => [o.labelBox, o.iconBox])
  ].filter((b) => !!b && inBand(b));
  if (!(g.overlay ? others : segments2).some((b) => hit(b, 0))) return true;
  const min = room.lo - u.x;
  const max = room.hi - (u.x + u.w);
  const dx = others.flatMap((b) => [b.x - (chip.x + chip.w), b.x + b.w - chip.x]).filter((d) => d >= min - 0.01 && d <= max + 0.01 && !others.some((b) => hit(b, d))).sort((a, b) => Math.abs(a) - Math.abs(b) || a - b)[0];
  if (dx === void 0) return false;
  g.labelBox.x = round(g.labelBox.x + dx);
  if (icon2) icon2.x = round(icon2.x + dx);
  return true;
}
var contains = (outer, b) => b.x >= outer.x - 0.01 && b.y >= outer.y - 0.01 && b.x + b.w <= outer.x + outer.w + 0.01 && b.y + b.h <= outer.y + outer.h + 0.01;
function union(boxes) {
  const list = boxes.filter((b) => !!b);
  const x = Math.min(...list.map((b) => b.x));
  const y = Math.min(...list.map((b) => b.y));
  const w = Math.max(...list.map((b) => b.x + b.w)) - x;
  const h = Math.max(...list.map((b) => b.y + b.h)) - y;
  return { x, y, w, h };
}
function steer(points, end, avoid, border) {
  if (!avoid) return points;
  const pts = (end === "to" ? [...points].reverse() : [...points]).map((q) => ({ ...q }));
  const [e, p] = pts;
  const far = pts.at(-1);
  if (!e || !p || !far || pts.length < 2) return points;
  const gap = 12;
  const under = e.x >= avoid.x - gap && e.x <= avoid.x + avoid.w + gap && e.y >= avoid.y - gap && e.y <= avoid.y + avoid.h + gap;
  if (!under) return points;
  const vertical = Math.abs(p.x - e.x) < 0.5;
  const k = vertical ? "x" : "y";
  const j = vertical ? "y" : "x";
  const clear = 20;
  const lo = (vertical ? avoid.x : avoid.y) - clear;
  const hi = (vertical ? avoid.x + avoid.w : avoid.y + avoid.h) + clear;
  const min = (vertical ? border.x : border.y) + gap;
  const max = (vertical ? border.x + border.w : border.y + border.h) - gap;
  const to = (far[k] <= (lo + hi) / 2 ? [lo, hi] : [hi, lo]).map(round).find((v) => v >= min && v <= max);
  if (to === void 0) return points;
  let out = pts;
  if (pts.length === 2) {
    const mid = round((e[j] + far[j]) / 2);
    const at = (a, b) => vertical ? { x: a, y: b } : { x: b, y: a };
    out = [at(to, e[j]), at(to, mid), at(far[k], mid), far];
  } else {
    e[k] = to;
    p[k] = to;
  }
  return end === "to" ? out.reverse() : out;
}
function freeRoute(from, to, shift) {
  const sideBySide = from.full.x + from.full.w <= to.full.x || to.full.x + to.full.w <= from.full.x;
  const a = sideBySide ? from.side : from.full;
  const b = sideBySide ? to.side : to.full;
  const ac = { x: from.side.x + from.side.w / 2, y: a.y + a.h / 2 };
  const bc = { x: to.side.x + to.side.w / 2, y: b.y + b.h / 2 };
  if (sideBySide) {
    const right = a.x + a.w <= b.x;
    const sx = right ? a.x + a.w : a.x;
    const ex = right ? b.x : b.x + b.w;
    if (Math.abs(ac.y - bc.y) < 1)
      return [
        { x: sx, y: ac.y },
        { x: ex, y: ac.y }
      ];
    const mx = round((sx + ex) / 2 + shift);
    return [
      { x: sx, y: ac.y },
      { x: mx, y: ac.y },
      { x: mx, y: bc.y },
      { x: ex, y: bc.y }
    ];
  }
  const down = a.y + a.h <= b.y;
  const sy = down ? a.y + a.h : a.y;
  const ey = down ? b.y : b.y + b.h;
  if (Math.abs(ac.x - bc.x) < 1)
    return [
      { x: ac.x, y: sy },
      { x: ac.x, y: ey }
    ];
  const my = round((sy + ey) / 2 + shift);
  return [
    { x: ac.x, y: sy },
    { x: ac.x, y: my },
    { x: bc.x, y: my },
    { x: bc.x, y: ey }
  ];
}
function straightenEnd(e, end, sides, edges) {
  const n3 = e.points.length;
  const at = (i) => e.points[end === "to" ? n3 - 1 - i : i];
  const E = at(0);
  const P = at(1);
  const Q = at(2);
  if (!E || !P || !sides) return;
  const vertical = Math.abs(P.y - E.y) > Math.abs(P.x - E.x);
  const k = vertical ? "x" : "y";
  const a = vertical ? "y" : "x";
  let target = P[k];
  let moveP = false;
  if (Q) {
    const lateral = Math.abs(Q[k] - P[k]);
    const along2 = Math.abs(Q[a] - P[a]);
    const jog = along2 < 0.01 && lateral > 0.01 && lateral < 6 && n3 >= 4;
    const skew = lateral > 0.01 && lateral <= 1 && along2 > lateral;
    if (jog || skew) [target, moveP] = [Q[k], true];
  }
  if (Math.abs(target - E[k]) < 0.01 || Math.abs(target - E[k]) > 6) return;
  const side = sides.find((b) => {
    const edge3 = vertical ? [b.y, b.y + b.h] : [b.x, b.x + b.w];
    const [lo2, hi2] = vertical ? [b.x, b.x + b.w] : [b.y, b.y + b.h];
    return edge3.some((v) => Math.abs(v - E[a]) < 0.5) && E[k] >= lo2 - 0.5 && E[k] <= hi2 + 0.5;
  });
  if (!side) return;
  const [lo, hi] = vertical ? [side.x, side.x + side.w] : [side.y, side.y + side.h];
  if (target < lo + 2 || target > hi - 2) return;
  const others = edges.flatMap(
    (o) => o === e ? [] : [o.points[0], o.points[o.points.length - 1]]
  );
  const near = (p, q, d) => !!p && Math.abs(p.x - q.x) < d && Math.abs(p.y - q.y) < d;
  const moved = { ...E, [k]: target };
  if (others.some((p) => near(p, E, 0.5) || near(p, moved, 4))) return;
  const iE = end === "to" ? n3 - 1 : 0;
  e.points[iE] = moved;
  if (moveP) e.points[end === "to" ? n3 - 2 : 1] = { ...P, [k]: target };
}
function dropStraightPoints(points) {
  const out = [];
  for (const p of points) {
    const last = out[out.length - 1];
    const prev = out[out.length - 2];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    if (prev && last) {
      const cross = (last.x - prev.x) * (p.y - prev.y) - (last.y - prev.y) * (p.x - prev.x);
      const ahead = (last.x - prev.x) * (p.x - last.x) + (last.y - prev.y) * (p.y - last.y) >= 0;
      if (Math.abs(cross) < 0.01 && ahead) out.pop();
    }
    out.push(p);
  }
  return out.length >= 2 ? out : points;
}
function midpoint(points) {
  const i = Math.max(0, Math.floor((points.length - 1) / 2));
  const a = points[i] ?? { x: 0, y: 0 };
  const b = points[i + 1] ?? a;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
var overlaps2 = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
function freeLabelBox(points, w, h, avoid) {
  const runs = points.slice(1).map((q2, i) => [points[i] ?? q2, q2]).filter(([p2, q2]) => Math.abs(p2.x - q2.x) < 0.5 && Math.abs(p2.y - q2.y) > 0.5).sort(([a, b], [c, d]) => Math.abs(d.y - c.y) - Math.abs(b.y - a.y));
  const inside = (b) => ({
    ...b,
    x: round(Math.max(0, b.x)),
    y: round(Math.max(0, b.y))
  });
  const clear = (b) => !avoid.some((o) => o && overlaps2(b, o));
  const pick = (first, second) => clear(first) || !clear(second) ? first : second;
  const run = runs[0];
  if (!run) {
    const mid = midpoint(points);
    const above = inside({ x: mid.x - w / 2, y: mid.y - h - 3, w, h });
    return pick(above, inside({ ...above, y: mid.y + 3 }));
  }
  const [p, q] = run;
  const y = (p.y + q.y) / 2 - h / 2;
  return pick(inside({ x: p.x + 6, y, w, h }), inside({ x: p.x - 6 - w, y, w, h }));
}
function findEdge(n3, id) {
  for (const e of n3.edges ?? []) if (e.id === id) return e;
  for (const c of n3.children ?? []) {
    const f = findEdge(c, id);
    if (f) return f;
  }
  return void 0;
}
var elkRuns = /* @__PURE__ */ new Map();
async function runElk(root) {
  const key = JSON.stringify(root);
  let run = elkRuns.get(key);
  if (!run) {
    run = runElkUncached(root);
    elkRuns.set(key, run);
    run.catch(() => elkRuns.delete(key));
    if (elkRuns.size > 16) {
      const oldest = elkRuns.keys().next().value;
      if (oldest !== void 0) elkRuns.delete(oldest);
    }
  }
  const { graph, fallback } = await run;
  return { graph: structuredClone(graph), fallback };
}
function crossings(graph) {
  const nodeOf = (ref) => (ref ?? "").split("::")[0];
  const lines = (graph.edges ?? []).flatMap((e) => {
    const s = e.sections?.[0];
    if (!s) return [];
    const pts = [s.startPoint, ...s.bendPoints ?? [], s.endPoint];
    const ends = [nodeOf(e.sources[0]), nodeOf(e.targets[0])];
    return [{ ends, segs: pts.slice(1).map((q, i) => [pts[i] ?? q, q]) }];
  });
  const cross = (a, b, c, d) => {
    const o = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
  };
  let count = 0;
  const nodes = /* @__PURE__ */ new Set();
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i];
      const b = lines[j];
      if (!a || !b || a.ends.some((x) => b.ends.includes(x))) continue;
      for (const [p, q] of a.segs)
        for (const [r, t] of b.segs)
          if (cross(p, q, r, t)) {
            count++;
            for (const x of [...a.ends, ...b.ends]) if (x) nodes.add(x);
          }
    }
  return { count, nodes };
}
async function runElkUncached(root) {
  const fallbacks = [
    [void 0, {}],
    [
      "brandes-koepf placement",
      {
        "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
        "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED"
      }
    ],
    [
      "network-simplex layering, simple placement",
      {
        "elk.layered.layering.strategy": "NETWORK_SIMPLEX",
        "elk.layered.nodePlacement.strategy": "SIMPLE"
      }
    ]
  ];
  let lastError;
  for (const [fallback, extra] of fallbacks) {
    const graph = applyOptions(structuredClone(root), extra);
    try {
      return { graph: await elk().layout(graph), fallback };
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`layout failed: ${lastError?.message ?? lastError}`);
}
function applyOptions(n3, extra) {
  if (n3.layoutOptions && "elk.algorithm" in n3.layoutOptions) Object.assign(n3.layoutOptions, extra);
  for (const c of n3.children ?? []) applyOptions(c, extra);
  return n3;
}
function describe(model) {
  const name = (id) => model.nodes.find((n3) => n3.id === id)?.label ?? model.groups.find((g) => g.id === id)?.label ?? id;
  const parts = [];
  if (model.title) parts.push(`${model.title}.`);
  parts.push(
    `${model.nodes.length} components${model.groups.length ? ` in ${model.groups.length} groups` : ""}.`
  );
  const flows = model.edges.slice(0, 24).map((e) => `${name(e.from)} to ${name(e.to)}${e.label ? ` (${e.label})` : ""}`);
  if (flows.length)
    parts.push(`Connections: ${flows.join("; ")}${model.edges.length > 24 ? "; and more" : ""}.`);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

// src/render/svg.ts
var ASCENT = 0.96875;
var DESCENT = 0.2412;
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
var n = (v) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
};
function text(block, box, color, anchor2 = "middle", extra = "") {
  if (!block.lines.length) return "";
  const x = anchor2 === "middle" ? box.x + box.w / 2 : box.x;
  const first = box.y + (block.lead - block.size * (ASCENT + DESCENT)) / 2 + block.size * ASCENT;
  const weight = block.weight === 600 ? ` font-weight="600"` : "";
  const tspans = block.lines.map((line, i) => `<tspan x="${n(x)}" y="${n(first + i * block.lead)}">${esc(line)}</tspan>`).join("");
  const anchorAttr = anchor2 === "middle" ? ` text-anchor="middle"` : "";
  return `<text font-size="${n(block.size)}"${weight} fill="${color}"${anchorAttr}${extra}>${tspans}</text>`;
}
var SYMBOL_ID = "SDWSYM";
function icon(ctx, id, box, color, background) {
  const r = renderIcon(id, SYMBOL_ID, {
    theme: ctx.t.name,
    background: background ?? ctx.t.background,
    ink: ctx.t.text,
    color
  });
  const viewBox = r.viewBox.join(" ");
  const key = `${viewBox}|${r.body}`;
  let ref = ctx.symbols.get(key);
  if (!ref) {
    ref = `${ctx.prefix}s${ctx.symbols.size + 1}`;
    ctx.symbols.set(key, ref);
    ctx.defs.push(
      `<symbol id="${ref}" viewBox="${viewBox}" overflow="visible">${r.body.replaceAll(`${SYMBOL_ID}-`, `${ref}-`)}</symbol>`
    );
  }
  return `<use href="#${ref}" x="${n(box.x)}" y="${n(box.y)}" width="${n(box.w)}" height="${n(box.h)}"/>`;
}
function groupFrame(g) {
  const { box } = g;
  const dash = g.dash ? ` stroke-dasharray="${g.dash}"` : "";
  const paint = (fill2, washed) => g.wash && washed ? `fill="${g.wash.color}" fill-opacity="${g.wash.opacity}"` : `fill="${fill2}"`;
  const inner = g.inner ? `<rect x="${n(g.inner.box.x)}" y="${n(g.inner.box.y)}" width="${n(g.inner.box.w)}" height="${n(g.inner.box.h)}" rx="${Math.max(0, g.radius - 2)}" ${paint(g.inner.fill, g.wash?.inner)}/>` : "";
  const fill = paint(g.fill, !!g.wash && !g.inner);
  return `<rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.w)}" height="${n(box.h)}"${g.radius ? ` rx="${g.radius}"` : ""} ${fill} stroke="${g.stroke}" stroke-width="${g.strokeWidth}"${dash}/>${inner}`;
}
function surfaceBehind(ctx, g) {
  if (g.overlay) {
    const px = g.labelBox.x;
    const py = g.box.y;
    const under = ctx.scene.groups.filter((x) => !x.overlay && x.fill !== "none").filter(
      (x) => px >= x.box.x && px <= x.box.x + x.box.w && py >= x.box.y && py <= x.box.y + x.box.h
    ).sort((a, b) => b.depth - a.depth)[0];
    if (under) return under.fill;
  }
  let cur = g.overlay ? void 0 : g;
  while (cur) {
    if (cur.fill !== "none") return cur.fill;
    const parent = cur.parent;
    cur = parent ? ctx.scene.groups.find((x) => x.id === parent) : void 0;
  }
  const bg = ctx.scene.background;
  return bg && bg !== "transparent" ? bg : ctx.t.background;
}
function groupHeader(ctx, g) {
  const parts = [];
  const surface = surfaceBehind(ctx, g);
  if (g.label.lines.length) {
    const b = g.labelBox;
    const iconInRow = g.overlay && g.iconBox && g.iconBox.y < b.y + b.h && b.y < g.iconBox.y + g.iconBox.h;
    const left = iconInRow && g.iconBox ? g.iconBox.x - 4 : b.x - 4;
    parts.push(
      `<rect x="${n(left)}" y="${n(b.y - 1)}" width="${n(b.x + b.w + 4 - left)}" height="${n(b.h + 2)}" rx="3" fill="${surface}"/>`
    );
  }
  if (g.icon && g.iconBox) parts.push(icon(ctx, g.icon, g.iconBox, void 0, surface));
  parts.push(text(g.label, g.labelBox, g.labelColor, "start"));
  return parts.join("");
}
function edgePath(points, routing) {
  if (points.length < 2) return "";
  const [first] = points;
  if (!first) return "";
  if (routing === "spline" && (points.length - 1) % 3 === 0 && points.length > 2) {
    let d2 = `M${n(first.x)} ${n(first.y)}`;
    for (let i = 1; i + 2 < points.length; i += 3) {
      const [a, b, c] = [points[i], points[i + 1], points[i + 2]];
      if (a && b && c) d2 += ` C${n(a.x)} ${n(a.y)} ${n(b.x)} ${n(b.y)} ${n(c.x)} ${n(c.y)}`;
    }
    const last2 = points[points.length - 1];
    if (last2) d2 += ` L${n(last2.x)} ${n(last2.y)}`;
    return d2;
  }
  const R = routing === "orthogonal" ? 8 : 4;
  let d = `M${n(first.x)} ${n(first.y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const a = points[i - 1];
    const b = points[i + 1];
    if (!p || !a || !b) continue;
    const inLen = Math.hypot(p.x - a.x, p.y - a.y);
    const outLen = Math.hypot(b.x - p.x, b.y - p.y);
    const r = Math.min(R, inLen / 2, outLen / 2);
    if (r < 0.5) {
      d += ` L${n(p.x)} ${n(p.y)}`;
      continue;
    }
    const p1 = { x: p.x - (p.x - a.x) / inLen * r, y: p.y - (p.y - a.y) / inLen * r };
    const p2 = { x: p.x + (b.x - p.x) / outLen * r, y: p.y + (b.y - p.y) / outLen * r };
    d += ` L${n(p1.x)} ${n(p1.y)} Q${n(p.x)} ${n(p.y)} ${n(p2.x)} ${n(p2.y)}`;
  }
  const last = points[points.length - 1];
  if (last) d += ` L${n(last.x)} ${n(last.y)}`;
  return d;
}
function trim(points, atEnd, by) {
  const pts = points.map((p) => ({ ...p }));
  const i = atEnd ? pts.length - 1 : 0;
  const j = atEnd ? pts.length - 2 : 1;
  const tip = pts[i];
  const prev = pts[j];
  if (!tip || !prev) return pts;
  const len = Math.hypot(tip.x - prev.x, tip.y - prev.y);
  if (len <= by) return pts;
  pts[i] = { x: tip.x - (tip.x - prev.x) / len * by, y: tip.y - (tip.y - prev.y) / len * by };
  return pts;
}
function arrowHead(tip, from, len, half, color, open = false, width = 1.5) {
  if (open) {
    const d2 = Math.hypot(tip.x - from.x, tip.y - from.y) || 1;
    const ux2 = (tip.x - from.x) / d2;
    const uy2 = (tip.y - from.y) / d2;
    const bx2 = tip.x - ux2 * len;
    const by2 = tip.y - uy2 * len;
    return `<path d="M${n(bx2 - uy2 * half)} ${n(by2 + ux2 * half)} L${n(tip.x)} ${n(tip.y)} L${n(bx2 + uy2 * half)} ${n(by2 - ux2 * half)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  const d = Math.hypot(tip.x - from.x, tip.y - from.y) || 1;
  const ux = (tip.x - from.x) / d;
  const uy = (tip.y - from.y) / d;
  const bx = tip.x - ux * len;
  const by = tip.y - uy * len;
  const pts = [
    [tip.x, tip.y],
    [bx - uy * half, by + ux * half],
    [bx + ux * 1.5, by + uy * 1.5],
    [bx + uy * half, by - ux * half]
  ];
  return `<path d="M${pts.map(([x, y]) => `${n(x ?? 0)} ${n(y ?? 0)}`).join(" L")} Z" fill="${color}"/>`;
}
function stroke(line) {
  const width = line === "thick" ? 2.5 : 1.5;
  const dash = line === "dashed" ? ` stroke-dasharray="6 4"` : line === "dotted" ? ` stroke-dasharray="1.5 3.5" stroke-linecap="round"` : "";
  return { width, dash };
}
function edge(ctx, e, routing) {
  const color = e.color ?? ctx.t.edge;
  const { width, dash } = stroke(e.line);
  const len = e.line === "thick" ? 11 : 9;
  const half = e.line === "thick" ? 5.5 : 4.5;
  let pts = e.points;
  if (pts.length < 2) return "";
  const end = e.arrow === "end" || e.arrow === "both";
  const start = e.arrow === "start" || e.arrow === "both";
  const spline = routing === "spline" && (pts.length - 1) % 3 === 0 && pts.length > 2;
  if (!spline) {
    const cut = ctx.scene.arrowhead === "open" ? width / 2 : len - 1;
    if (end) pts = trim(pts, true, cut);
    if (start) pts = trim(pts, false, cut);
  }
  const flow = ctx.scene.animate === "flow" ? ` class="sdw-flow${e.line === "solid" || e.line === "thick" ? " sdw-solid" : ""}"` : "";
  const d = edgePath(pts, routing);
  const parts = [
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round"${dash}${flow}/>`
  ];
  const motion = ctx.motion.get(e.id);
  if (motion) parts.push(packets(ctx, e, d, motion));
  const beat = ctx.relay.edges.get(e.id);
  const orig = e.points;
  const last = orig[orig.length - 1];
  const beforeLast = orig[orig.length - 2];
  const firstPt = orig[0];
  const second = orig[1];
  const open = ctx.scene.arrowhead === "open";
  if (end && last && beforeLast)
    parts.push(arrowHead(last, beforeLast, len, half, color, open, width));
  if (start && firstPt && second)
    parts.push(arrowHead(firstPt, second, len, half, color, open, width));
  if (beat) {
    const lit = ctx.relay.color;
    const heads = [
      end && last && beforeLast ? arrowHead(last, beforeLast, len, half, lit, open, width) : "",
      start && firstPt && second ? arrowHead(firstPt, second, len, half, lit, open, width) : ""
    ].join("");
    parts.push(relayLine(ctx, e, d, heads, beat, width, dash));
  }
  return `<g id="${ctx.prefix}e-${e.id}">${parts.join("")}</g>`;
}
function edgeLabel(ctx, e) {
  if (e.points.length < 2) return "";
  const parts = [];
  if (e.labelBox && e.label) {
    const b = e.labelBox;
    parts.push(
      `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="4" fill="${ctx.scene.background === "transparent" ? ctx.t.background : ctx.scene.background ?? ctx.t.background}" fill-opacity="0.92"/>`
    );
    const h = e.label.height;
    parts.push(text(e.label, { x: b.x, y: b.y + (b.h - h) / 2, w: b.w, h }, ctx.t.edgeLabel));
  }
  if (e.stepBox && e.step !== void 0) {
    const s = e.stepBox;
    const cx = s.x + s.w / 2;
    const cy = s.y + s.h / 2;
    const motion = ctx.motion.get(e.id) ?? relayMotion(ctx, e.id);
    if (motion?.stepped) parts.push(ping(ctx, cx, cy, s.w / 2, motion));
    parts.push(
      `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(s.w / 2)}" fill="${ctx.t.stepFill}"${ring(ctx)}/>`
    );
    parts.push(
      `<text x="${n(cx)}" y="${n(cy + 5)}" font-size="14" font-weight="700" fill="${ctx.t.stepText}" text-anchor="middle">${e.step}</text>`
    );
  }
  return parts.length ? `<g id="${ctx.prefix}el-${e.id}">${parts.join("")}</g>` : "";
}
var SPEED = 150;
var REST = 0.9;
var FADE = 0.12;
function length(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b) total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}
function motionPlan(scene) {
  const plan = /* @__PURE__ */ new Map();
  if (scene.animate !== "packets") return plan;
  const moving = scene.edges.filter((e) => e.arrow !== "none" && e.points.length > 1);
  const travel = (e) => Math.min(2.4, Math.max(0.6, length(e.points) / SPEED));
  const stepped = moving.filter((e) => e.step !== void 0);
  const steps = [...new Set(stepped.map((e) => e.step ?? 0))].sort((a, b) => a - b);
  const slot = (e) => travel(e) * (e.arrow === "both" ? 2 : 1);
  const starts = /* @__PURE__ */ new Map();
  let t = 0;
  for (const step of steps) {
    starts.set(step, t);
    t += Math.max(...stepped.filter((e) => e.step === step).map(slot)) + 0.15;
  }
  const story = t + REST;
  for (const e of stepped) {
    const start = starts.get(e.step ?? 0) ?? 0;
    plan.set(e.id, { cycle: story, start, travel: travel(e), begin: 0, stepped: true });
  }
  moving.filter((e) => e.step === void 0).forEach((e, i) => {
    const tr = travel(e);
    const cycle = tr + REST;
    const begin = -(i * 0.618034 % 1 * cycle);
    plan.set(e.id, { cycle, start: 0, travel: tr, begin, stepped: false });
  });
  return plan;
}
var secs = (v) => `${Math.round(v * 1e3) / 1e3}s`;
function keyTimes(times, cycle) {
  let prev = 0;
  return times.map((t, i) => {
    const v = i === times.length - 1 ? 1 : Math.min(1, Math.max(prev, t / cycle));
    prev = Math.round(v * 1e4) / 1e4;
    return prev;
  }).join(";");
}
function packets(ctx, e, d, m) {
  const color = e.color ?? ctx.t.flow;
  const r = e.line === "thick" ? 4.2 : 3.6;
  const { cycle, start, travel } = m;
  const one = (reverse, from, shift = 0) => {
    const end = from + travel;
    const fadeIn = from === 0 ? [0, FADE] : [0, from, from + FADE];
    const opacity = from === 0 ? "0;1;1;0;0" : "0;0;1;1;0;0";
    const fade = keyTimes([...fadeIn, end - FADE, end, cycle], cycle);
    const at = keyTimes([0, from, end, cycle], cycle);
    const dot = (lag, body) => {
      const begin = m.begin - shift + lag;
      const loop = `dur="${secs(cycle)}" repeatCount="indefinite"${begin ? ` begin="${secs(begin)}"` : ""}`;
      return `<g opacity="0">${body}<animateMotion path="${d}" ${loop} calcMode="linear" keyPoints="${reverse ? "1;1;0;0" : "0;0;1;1"}" keyTimes="${at}"/><animate attributeName="opacity" values="${opacity}" keyTimes="${fade}" ${loop}/></g>`;
    };
    if (ctx.scene.skin === "stage")
      return dot(0.1, `<circle r="${n(r * 0.5)}" fill="${color}" fill-opacity="0.3"/>`) + dot(0.05, `<circle r="${n(r * 0.72)}" fill="${color}" fill-opacity="0.55"/>`) + dot(0, `<circle r="${r}" fill="${color}"/>`);
    return dot(
      0,
      `<circle r="${n(r * 2.3)}" fill="${color}" fill-opacity="0.22"/><circle r="${r}" fill="${color}"/>`
    );
  };
  if (e.arrow === "both")
    return m.stepped ? one(false, start) + one(true, start + travel) : one(false, start) + one(true, start, cycle / 2);
  return one(e.arrow === "start", start);
}
function ping(ctx, cx, cy, r, m) {
  const at = keyTimes([0, Math.max(0, m.start - 0.01), m.start, m.start + 0.6, m.cycle], m.cycle);
  const loop = `dur="${secs(m.cycle)}" repeatCount="indefinite"`;
  return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="none" stroke="${ctx.t.flow}" stroke-width="2" opacity="0"><animate attributeName="r" values="${n(r)};${n(r)};${n(r)};${n(r + 8)};${n(r + 8)}" keyTimes="${at}" ${loop}/><animate attributeName="opacity" values="0;0;0.7;0;0" keyTimes="${at}" ${loop}/></circle>`;
}
var FIRST = 0.3;
var BEAT = 0.55;
var DRAW = 0.45;
var HOLD = 1.2;
var END = 0.92;
var GONE = 0.95;
var MAX_BEATS = 8;
function relayPlan(scene, t) {
  const relay = {
    color: t.stage?.ring ?? t.flow,
    cycle: 0,
    edges: /* @__PURE__ */ new Map(),
    nodes: /* @__PURE__ */ new Map()
  };
  if (scene.animate !== "relay") return relay;
  const drawn = scene.edges.filter((e) => e.points.length > 1);
  if (!drawn.length) return relay;
  const raw = /* @__PURE__ */ new Map();
  const steps = [...new Set(drawn.flatMap((e) => e.step === void 0 ? [] : [e.step]))].sort(
    (a, b) => a - b
  );
  if (steps.length) {
    for (const e of drawn) raw.set(e.id, e.step === void 0 ? 0 : steps.indexOf(e.step) + 1);
  } else {
    const into = new Set(drawn.map((e) => e.to));
    const level = /* @__PURE__ */ new Map();
    const queue = [...new Set(drawn.map((e) => e.from))].filter((id) => !into.has(id));
    for (const id of queue) level.set(id, 0);
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i] ?? "";
      const l = level.get(id) ?? 0;
      for (const e of drawn)
        if (e.from === id && !level.has(e.to)) {
          level.set(e.to, l + 1);
          queue.push(e.to);
        }
    }
    for (const e of drawn) raw.set(e.id, level.get(e.from) ?? 0);
  }
  const distinct = [...new Set(raw.values())].sort((a, b) => a - b);
  const beatOf = (v) => {
    const i = distinct.indexOf(v);
    return distinct.length > MAX_BEATS ? Math.floor(i * MAX_BEATS / distinct.length) : i;
  };
  let last = 0;
  for (const e of drawn) {
    const b = beatOf(raw.get(e.id) ?? 0);
    last = Math.max(last, b);
    const t0 = FIRST + b * BEAT;
    relay.edges.set(e.id, { t0, t1: t0 + DRAW, stepped: e.step !== void 0 });
  }
  relay.cycle = Math.max(3, (FIRST + last * BEAT + DRAW + HOLD) / END);
  const nodes = new Set(scene.nodes.map((nd) => nd.id));
  const leaves = /* @__PURE__ */ new Map();
  for (const e of drawn) {
    const b = relay.edges.get(e.id);
    if (!b) continue;
    if (nodes.has(e.to)) relay.nodes.set(e.to, Math.min(relay.nodes.get(e.to) ?? b.t1, b.t1));
    if (nodes.has(e.from)) leaves.set(e.from, Math.min(leaves.get(e.from) ?? b.t0, b.t0));
  }
  for (const [id, at] of leaves) if (!relay.nodes.has(id)) relay.nodes.set(id, at);
  return relay;
}
function relayMotion(ctx, id) {
  const b = ctx.relay.edges.get(id);
  return b?.stepped ? { cycle: ctx.relay.cycle, start: b.t0, travel: DRAW, begin: 0, stepped: true } : void 0;
}
function relayLine(ctx, e, d, heads, b, width, dash) {
  const { cycle, color } = ctx.relay;
  const loop = `dur="${secs(cycle)}" repeatCount="indefinite"`;
  const kt = (times) => keyTimes(times, cycle);
  const end = END * cycle;
  const gone = GONE * cycle;
  const id = `${ctx.prefix}rm-${e.id}`;
  const reverse = e.arrow === "start";
  const hide = reverse ? "-1" : "1";
  ctx.defs.push(
    `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${ctx.scene.width}" height="${ctx.scene.height}"><path d="${d}" fill="none" stroke="#ffffff" stroke-width="${n(width + 8)}" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="${hide}"><animate attributeName="stroke-dashoffset" values="${hide};${hide};0;0;${hide}" keyTimes="${kt([0, b.t0, b.t1, gone, cycle])}" ${loop}/></path></mask>`
  );
  const show = (from) => `<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="${kt([0, from, from + 0.05, end, gone, cycle])}" ${loop}/>`;
  const r = e.line === "thick" ? 3.6 : 3;
  return `<g mask="url(#${id})" opacity="0"><path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round"${dash}/>${show(b.t0)}</g>` + (heads ? `<g opacity="0">${heads}${show(b.t1)}</g>` : "") + `<circle r="${r}" fill="${color}" opacity="0"><animateMotion path="${d}" ${loop} calcMode="linear" keyPoints="${reverse ? "1;1;0;0" : "0;0;1;1"}" keyTimes="${kt([0, b.t0, b.t1, cycle])}"/><animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="${kt([0, b.t0, b.t0 + 0.05, b.t1 - 0.05, b.t1, cycle])}" ${loop}/></circle>`;
}
function plate(ctx, nd, at) {
  const { cycle, color } = ctx.relay;
  const icon2 = nd.look === "icon" && nd.iconBox ? nd.iconBox : void 0;
  const b = icon2 ?? nd.box;
  const pad = icon2 ? 7 : 4;
  const loop = `dur="${secs(cycle)}" repeatCount="indefinite"`;
  const times = keyTimes([0, at, at + 0.15, END * cycle, GONE * cycle, cycle], cycle);
  return `<rect x="${n(b.x - pad)}" y="${n(b.y - pad)}" width="${n(b.w + 2 * pad)}" height="${n(b.h + 2 * pad)}" rx="${icon2 ? 10 : 12}" fill="${color}" fill-opacity="0.14" stroke="${color}" stroke-opacity="0.6" stroke-width="1" opacity="0"><animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="${times}" ${loop}/></rect>`;
}
function stageCanvas(ctx, W, H, s) {
  const p = ctx.prefix;
  ctx.defs.push(
    `<linearGradient id="${p}bg" x1="0" y1="0" x2="0.36" y2="1"><stop offset="0" stop-color="${s.top}"/><stop offset="0.6" stop-color="${ctx.t.background}"/></linearGradient><radialGradient id="${p}tint" cx="0.88" cy="0.04" r="0.7"><stop offset="0" stop-color="${s.tint}" stop-opacity="${s.tintOpacity}"/><stop offset="1" stop-color="${s.tint}" stop-opacity="0"/></radialGradient><pattern id="${p}dots" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="8" cy="8" r="0.9" fill="${s.dot}" fill-opacity="${s.dotOpacity}"/></pattern>`
  );
  return `<rect width="${W}" height="${H}" fill="url(#${p}bg)"/><rect width="${W}" height="${H}" fill="url(#${p}dots)"/><rect width="${W}" height="${H}" fill="url(#${p}tint)"/>`;
}
var ring = (ctx) => ctx.t.stage ? ` stroke="${ctx.t.stage.ring}" stroke-width="1.5"` : "";
function shapePath(shape, b) {
  const { x, y, w, h } = b;
  switch (shape) {
    case "box":
      return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="4"/>`;
    case "pill":
      return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(h / 2)}"/>`;
    case "circle":
      return `<ellipse cx="${n(x + w / 2)}" cy="${n(y + h / 2)}" rx="${n(w / 2)}" ry="${n(h / 2)}"/>`;
    case "diamond":
      return `<path d="M${n(x + w / 2)} ${n(y)} L${n(x + w)} ${n(y + h / 2)} L${n(x + w / 2)} ${n(y + h)} L${n(x)} ${n(y + h / 2)} Z"/>`;
    case "hexagon": {
      const k = Math.min(16, w / 4);
      return `<path d="M${n(x + k)} ${n(y)} H${n(x + w - k)} L${n(x + w)} ${n(y + h / 2)} L${n(x + w - k)} ${n(y + h)} H${n(x + k)} L${n(x)} ${n(y + h / 2)} Z"/>`;
    }
    case "cylinder": {
      const ry = 8;
      return `<path d="M${n(x)} ${n(y + ry)} A${n(w / 2)} ${ry} 0 0 1 ${n(x + w)} ${n(y + ry)} V${n(y + h - ry)} A${n(w / 2)} ${ry} 0 0 1 ${n(x)} ${n(y + h - ry)} Z"/><path d="M${n(x)} ${n(y + ry)} A${n(w / 2)} ${ry} 0 0 0 ${n(x + w)} ${n(y + ry)}" fill="none"/>`;
    }
    case "queue": {
      const rx = 10;
      return `<path d="M${n(x + rx)} ${n(y)} H${n(x + w - rx)} A${rx} ${n(h / 2)} 0 0 1 ${n(x + w - rx)} ${n(y + h)} H${n(x + rx)} A${rx} ${n(h / 2)} 0 0 1 ${n(x + rx)} ${n(y)} Z"/><path d="M${n(x + w - rx)} ${n(y)} A${rx} ${n(h / 2)} 0 0 0 ${n(x + w - rx)} ${n(y + h)}" fill="none"/>`;
    }
    case "document":
      return `<path d="M${n(x)} ${n(y)} H${n(x + w)} V${n(y + h - 10)} Q${n(x + w * 3 / 4)} ${n(y + h - 20)} ${n(x + w / 2)} ${n(y + h - 10)} T${n(x)} ${n(y + h - 10)} Z"/>`;
    case "note":
      return `<path d="M${n(x)} ${n(y)} H${n(x + w - 14)} L${n(x + w)} ${n(y + 14)} V${n(y + h)} H${n(x)} Z"/><path d="M${n(x + w - 14)} ${n(y)} V${n(y + 14)} H${n(x + w)}" fill="none"/>`;
    case "person": {
      const cx = x + w / 2;
      return `<circle cx="${n(cx)}" cy="${n(y + 14)}" r="13"/><rect x="${n(x)}" y="${n(y + 28)}" width="${n(w)}" height="${n(h - 28)}" rx="16"/>`;
    }
    case "cloud": {
      const sx = w / 100;
      const sy = h / 64;
      const P = (px, py) => `${n(x + px * sx)} ${n(y + py * sy)}`;
      return `<path d="M${P(22, 62)} C${P(8, 62)} ${P(0, 51)} ${P(2, 41)} C${P(4, 31)} ${P(13, 26)} ${P(22, 28)} C${P(24, 13)} ${P(38, 4)} ${P(52, 8)} C${P(62, 0)} ${P(81, 3)} ${P(85, 18)} C${P(97, 19)} ${P(101, 35)} ${P(95, 44)} C${P(99, 55)} ${P(90, 63)} ${P(79, 62)} Z"/>`;
    }
    case "stack":
      return `<rect x="${n(x + 8)}" y="${n(y)}" width="${n(w - 8)}" height="${n(h - 8)}" rx="6"/><rect x="${n(x + 4)}" y="${n(y + 4)}" width="${n(w - 8)}" height="${n(h - 8)}" rx="6"/><rect x="${n(x)}" y="${n(y + 8)}" width="${n(w - 8)}" height="${n(h - 8)}" rx="6"/>`;
    default:
      return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="12"/>`;
  }
}
function badge(ctx, label, anchor2, placed) {
  const w = placed?.w ?? Math.max(18, 8 + label.length * 6.4);
  const h = placed?.h ?? 16;
  const x = placed?.x ?? anchor2.x + anchor2.w - w / 2 - 2;
  const y = placed?.y ?? anchor2.y - 7;
  return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(h / 2)}" fill="${ctx.t.stepFill}"${ring(ctx)}/><text x="${n(x + w / 2)}" y="${n(y + h / 2 + 3.5)}" font-size="10" font-weight="600" fill="${ctx.t.stepText}" text-anchor="middle">${esc(label)}</text>`;
}
function node(ctx, nd) {
  const parts = [];
  const bg = ctx.scene.background && ctx.scene.background !== "transparent" ? ctx.scene.background : ctx.t.background;
  if (nd.look === "icon") {
    if (nd.icon && nd.iconBox) parts.push(icon(ctx, nd.icon, nd.iconBox, nd.color));
    parts.push(text(nd.label, nd.labelBox, nd.ink ?? ctx.t.text));
    if (nd.note && nd.noteBox) parts.push(text(nd.note, nd.noteBox, nd.inkMuted ?? ctx.t.muted));
    if (nd.badge && nd.iconBox) parts.push(badge(ctx, nd.badge, nd.iconBox, nd.badgeBox));
  } else if (nd.look === "card") {
    const b = nd.box;
    const stroke2 = nd.color ?? ctx.t.border;
    parts.push(
      `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="8" fill="${ctx.t.surface}" stroke="${stroke2}" stroke-width="1"/>`
    );
    if (nd.color) {
      parts.push(
        `<rect x="${n(b.x)}" y="${n(b.y + 8)}" width="3" height="${n(b.h - 16)}" rx="1.5" fill="${nd.color}"/>`
      );
    }
    if (nd.icon && nd.iconBox) parts.push(icon(ctx, nd.icon, nd.iconBox, void 0, ctx.t.surface));
    parts.push(text(nd.label, nd.labelBox, ctx.t.text, "start"));
    if (nd.note && nd.noteBox) parts.push(text(nd.note, nd.noteBox, ctx.t.muted, "start"));
    if (nd.badge) parts.push(badge(ctx, nd.badge, nd.box, nd.badgeBox));
  } else {
    const stroke2 = nd.color ?? (ctx.t.name === "dark" ? "#6e7681" : "#8b95a1");
    const fill = nd.color ? mixHex(nd.color, bg, ctx.t.name === "dark" ? 0.16 : 0.1) : ctx.t.surface;
    parts.push(
      `<g fill="${fill}" stroke="${stroke2}" stroke-width="1.25">${shapePath(nd.shape, nd.box)}</g>`
    );
    if (nd.icon && nd.iconBox) parts.push(icon(ctx, nd.icon, nd.iconBox, nd.color, fill));
    parts.push(text(nd.label, nd.labelBox, nd.ink ?? ctx.t.text));
    if (nd.note && nd.noteBox) parts.push(text(nd.note, nd.noteBox, nd.inkMuted ?? ctx.t.muted));
    if (nd.badge) parts.push(badge(ctx, nd.badge, nd.box, nd.badgeBox));
  }
  const inner = parts.join("");
  const body = nd.url ? `<a href="${esc(nd.url)}" xlink:href="${esc(nd.url)}" target="_blank">${inner}</a>` : inner;
  return `<g id="${ctx.prefix}n-${nd.id}">${body}</g>`;
}
function legend(ctx, l) {
  const b = l.box;
  const parts = [
    `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="6" fill="${ctx.t.surface}" stroke="${ctx.t.border}" stroke-width="1"/>`
  ];
  for (const item of l.items) {
    const s = item.swatch;
    const { width, dash } = stroke(item.line);
    const y = s.y + s.h / 2;
    parts.push(
      `<path d="M${n(s.x)} ${n(y)} H${n(s.x + s.w)}" fill="none" stroke="${ctx.t.edge}" stroke-width="${width}"${dash}/>`
    );
    parts.push(text(item.label, item.labelBox, ctx.t.text, "start"));
  }
  return `<g id="${ctx.prefix}legend">${parts.join("")}</g>`;
}
var FLOW_CSS = `@keyframes sdw-flow{to{stroke-dashoffset:-20}}.sdw-flow{animation:sdw-flow 1.1s linear infinite}.sdw-solid{stroke-dasharray:7 3}`;
function renderSvg(scene, opts = {}) {
  const t = tokensFor(scene);
  const prefix = opts.idPrefix ? `${opts.idPrefix.replace(/[^A-Za-z0-9_-]/g, "")}-` : "";
  const ctx = {
    t,
    prefix,
    scene,
    motion: motionPlan(scene),
    relay: relayPlan(scene, t),
    symbols: /* @__PURE__ */ new Map(),
    defs: []
  };
  const { width: W, height: H } = scene;
  const titleId = `${prefix}sdw-title`;
  const descId = `${prefix}sdw-desc`;
  const out = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="${titleId} ${descId}" font-family="${esc(FONT_STACK)}">`
  );
  out.push(
    `<title id="${titleId}">${esc(scene.title?.lines.join(" ") ?? "Architecture diagram")}</title>`
  );
  out.push(`<desc id="${descId}">${esc(scene.description)}</desc>`);
  if (scene.animate === "flow") out.push(`<style>${FLOW_CSS}</style>`);
  const defsAt = out.length;
  if (scene.background === void 0 && t.stage) out.push(stageCanvas(ctx, W, H, t.stage));
  else if (scene.background !== "transparent") {
    out.push(`<rect width="${W}" height="${H}" fill="${scene.background ?? t.background}"/>`);
  }
  if (scene.title && scene.titleBox) out.push(text(scene.title, scene.titleBox, t.text, "start"));
  if (scene.subtitle && scene.subtitleBox)
    out.push(text(scene.subtitle, scene.subtitleBox, t.muted, "start"));
  for (const g of scene.groups) out.push(`<g id="${ctx.prefix}g-${g.id}">${groupFrame(g)}</g>`);
  for (const e of scene.edges) out.push(edge(ctx, e, scene.routing));
  for (const e of scene.edges) {
    const label = edgeLabel(ctx, e);
    if (label) out.push(label);
  }
  for (const g of scene.groups) {
    const header = groupHeader(ctx, g);
    if (header) out.push(`<g id="${ctx.prefix}gh-${g.id}">${header}</g>`);
  }
  for (const nd of scene.nodes) {
    const at = ctx.relay.nodes.get(nd.id);
    if (at !== void 0) out.push(plate(ctx, nd, at));
  }
  for (const nd of scene.nodes) out.push(node(ctx, nd));
  if (scene.legend?.items.length) out.push(legend(ctx, scene.legend));
  if (ctx.defs.length) out.splice(defsAt, 0, `<defs>${ctx.defs.join("")}</defs>`);
  out.push("</svg>");
  return `${out.join("\n")}
`;
}

// src/render/drawio.ts
var n2 = (v) => String(Math.round(v * 100) / 100);
function iconData(ctx, id, color, background) {
  ctx.icons += 1;
  const r = renderIcon(id, `d${ctx.icons}`, {
    theme: ctx.t.name,
    background: background ?? ctx.t.background,
    ink: ctx.t.text,
    color
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${r.viewBox.join(" ")}">${r.body}</svg>`;
  return `data:image/svg+xml,${Buffer.from(svg).toString("base64")}`;
}
function style(entries) {
  return Object.entries(entries).filter(([, v]) => v !== void 0 && v !== "").map(([k, v]) => v === null ? k : `${k}=${v}`).join(";").concat(";");
}
var FONT = "Inter,Helvetica,Arial,sans-serif";
function geometry(box, parent, ctx) {
  const origin = parent && ctx ? ctx.groupBox.get(parent) : void 0;
  const x = box.x - (origin?.x ?? 0);
  const y = box.y - (origin?.y ?? 0);
  return `<mxGeometry x="${n2(x)}" y="${n2(y)}" width="${n2(box.w)}" height="${n2(box.h)}" as="geometry"/>`;
}
var cellParent = (parent) => parent ? `g-${parent}` : "1";
function htmlLabel(label, note, noteColor) {
  const main2 = label.map(esc).join("<br>");
  if (!note?.length) return main2;
  return `${main2}<br><font style="font-size: 11px;" color="${noteColor}">${note.map(esc).join("<br>")}</font>`;
}
function group(ctx, g) {
  ctx.groupBox.set(g.id, g.box);
  const s = style({
    rounded: g.radius ? 1 : 0,
    absoluteArcSize: g.radius ? 1 : void 0,
    arcSize: g.radius ? g.radius * 2 : void 0,
    whiteSpace: "wrap",
    html: 1,
    fillColor: g.fill,
    strokeColor: g.stroke,
    strokeWidth: g.strokeWidth,
    dashed: g.dash ? 1 : 0,
    dashPattern: g.dash,
    verticalAlign: "top",
    align: "left",
    spacingLeft: Math.round(g.labelBox.x - g.box.x - 2),
    spacingTop: Math.round(g.labelBox.y - g.box.y - 4),
    fontColor: g.labelColor,
    fontStyle: 1,
    fontSize: 13,
    fontFamily: FONT,
    container: g.overlay ? 0 : 1,
    collapsible: 0,
    recursiveResize: 0,
    pointerEvents: 0
  });
  ctx.cells.push(
    `<mxCell id="g-${g.id}" value="${esc(esc(g.label.lines.join(" ")))}" style="${s}" vertex="1" parent="${cellParent(g.parent)}">${geometry(g.box, g.parent, ctx)}</mxCell>`
  );
  if (g.inner) {
    ctx.cells.push(
      `<mxCell id="g-${g.id}:inner" value="" style="${style({ rounded: 1, absoluteArcSize: 1, arcSize: 8, fillColor: g.inner.fill, strokeColor: "none", movable: 0, resizable: 0, connectable: 0 })}" vertex="1" parent="g-${g.id}">${geometry(g.inner.box, g.id, ctx)}</mxCell>`
    );
  }
  if (g.icon && g.iconBox) {
    const img = iconData(ctx, g.icon, void 0, g.fill === "none" ? void 0 : g.fill);
    ctx.cells.push(
      `<mxCell id="g-${g.id}:icon" value="" style="${style({ shape: "image", html: 1, imageAspect: 1, aspect: "fixed", movable: 0, resizable: 0, image: img })}" vertex="1" parent="g-${g.id}">${geometry(g.iconBox, g.id, ctx)}</mxCell>`
    );
  }
}
var SHAPE_STYLE = {
  box: { rounded: 0 },
  rounded: { rounded: 1, absoluteArcSize: 1, arcSize: 24 },
  pill: { rounded: 1, arcSize: 50 },
  circle: { ellipse: null },
  diamond: { rhombus: null },
  hexagon: { shape: "hexagon", perimeter: "hexagonPerimeter2", size: 0.12, fixedSize: 0 },
  cylinder: { shape: "cylinder3", boundedLbl: 1, backgroundOutline: 1, size: 8 },
  queue: { shape: "mxgraph.flowchart.direct_data" },
  document: { shape: "document", boundedLbl: 1, size: 0.18 },
  note: { shape: "note", size: 14, backgroundOutline: 1 },
  person: { shape: "actor" },
  cloud: { ellipse: null, shape: "cloud" },
  stack: { rounded: 1, absoluteArcSize: 1, arcSize: 12, shadow: 0 }
};
function node2(ctx, nd) {
  const id = `n-${nd.id}`;
  const parent = cellParent(nd.parent);
  const value = htmlLabel(nd.label.lines, nd.note?.lines, nd.inkMuted ?? ctx.t.muted);
  const bg = ctx.scene.background && ctx.scene.background !== "transparent" ? ctx.scene.background : ctx.t.background;
  let s;
  let geom;
  if (nd.look === "icon" && nd.icon && nd.iconBox) {
    const vertical = ctx.scene.direction === "down" || ctx.scene.direction === "up";
    const img = iconData(ctx, nd.icon, nd.color);
    s = vertical ? style({
      shape: "label",
      image: img,
      imageWidth: nd.iconBox.w,
      imageHeight: nd.iconBox.h,
      imageAlign: "center",
      imageVerticalAlign: "top",
      verticalAlign: "bottom",
      align: "center",
      fillColor: "none",
      strokeColor: "none",
      html: 1,
      // Layout already broke the label into lines; draw.io's own wrap would break them again.
      whiteSpace: "nowrap",
      fontColor: nd.ink ?? ctx.t.text,
      fontSize: 13,
      fontFamily: FONT,
      spacing: 0
    }) : style({
      shape: "image",
      image: img,
      imageAspect: 1,
      aspect: "fixed",
      verticalLabelPosition: "bottom",
      verticalAlign: "top",
      labelPosition: "center",
      align: "center",
      html: 1,
      // The label sits under a 48px image; wrapping to that width stacked "Amazon API
      // Gateway" three lines deep into the next icon.
      whiteSpace: "nowrap",
      fontColor: nd.ink ?? ctx.t.text,
      fontSize: 13,
      fontFamily: FONT,
      spacingTop: 0
    });
    geom = geometry(vertical ? nd.box : nd.iconBox, nd.parent, ctx);
  } else if (nd.look === "card") {
    const img = nd.icon ? iconData(ctx, nd.icon, void 0, ctx.t.surface) : void 0;
    s = style({
      shape: "label",
      rounded: 1,
      absoluteArcSize: 1,
      arcSize: 16,
      whiteSpace: "wrap",
      html: 1,
      fillColor: ctx.t.surface,
      strokeColor: nd.color ?? ctx.t.border,
      image: img,
      imageWidth: nd.iconBox?.w,
      imageHeight: nd.iconBox?.h,
      imageAlign: "left",
      imageVerticalAlign: "middle",
      spacingLeft: Math.round(nd.labelBox.x - nd.box.x - 4),
      align: "left",
      verticalAlign: "middle",
      fontColor: ctx.t.text,
      fontSize: 13,
      fontStyle: 1,
      fontFamily: FONT
    });
    geom = geometry(nd.box, nd.parent, ctx);
  } else {
    const stroke2 = nd.color ?? (ctx.t.name === "dark" ? "#6e7681" : "#8b95a1");
    const fill = nd.color ? mixHex(nd.color, bg, ctx.t.name === "dark" ? 0.16 : 0.1) : ctx.t.surface;
    const img = nd.icon ? iconData(ctx, nd.icon, nd.color, fill) : void 0;
    s = style({
      ...SHAPE_STYLE[nd.shape],
      whiteSpace: "wrap",
      html: 1,
      fillColor: fill,
      strokeColor: stroke2,
      fontColor: ctx.t.text,
      fontSize: 13,
      fontStyle: 1,
      fontFamily: FONT,
      image: img,
      imageWidth: img ? 20 : void 0,
      imageHeight: img ? 20 : void 0
    });
    geom = geometry(nd.box, nd.parent, ctx);
  }
  ctx.cells.push(
    nd.url ? `<UserObject id="${id}" label="${esc(value)}" link="${esc(nd.url)}"><mxCell style="${s}" vertex="1" parent="${parent}">${geom}</mxCell></UserObject>` : `<mxCell id="${id}" value="${esc(value)}" style="${s}" vertex="1" parent="${parent}">${geom}</mxCell>`
  );
}
function anchor(p, b) {
  const clamp = (v) => Math.max(0, Math.min(1, Math.round(v * 1e3) / 1e3));
  return [clamp((p.x - b.x) / (b.w || 1)), clamp((p.y - b.y) / (b.h || 1))];
}
var lineStyle = (line) => ({
  strokeWidth: line === "thick" ? 2.5 : 1.5,
  dashed: line === "dashed" || line === "dotted" ? 1 : 0,
  dashPattern: line === "dotted" ? "1 3" : line === "dashed" ? "6 4" : void 0
});
function edge2(ctx, e, boxes) {
  const first = e.points[0];
  const last = e.points[e.points.length - 1];
  const src = boxes.get(e.from);
  const dst = boxes.get(e.to);
  if (!first || !last) return;
  const [ex, ey] = src ? anchor(first, src) : [0.5, 0.5];
  const [nx, ny] = dst ? anchor(last, dst) : [0.5, 0.5];
  const end = e.arrow === "end" || e.arrow === "both";
  const start = e.arrow === "start" || e.arrow === "both";
  const routing = ctx.scene.routing;
  const s = style({
    edgeStyle: routing === "orthogonal" ? "orthogonalEdgeStyle" : "none",
    curved: routing === "spline" ? 1 : void 0,
    rounded: 1,
    orthogonalLoop: 1,
    html: 1,
    endArrow: end ? ctx.scene.arrowhead === "open" ? "open" : "block" : "none",
    endFill: 1,
    endSize: 6,
    startArrow: start ? ctx.scene.arrowhead === "open" ? "open" : "block" : "none",
    startFill: 1,
    startSize: 6,
    strokeColor: e.color ?? ctx.t.edge,
    ...lineStyle(e.line),
    fontColor: ctx.t.edgeLabel,
    fontSize: 11,
    fontFamily: FONT,
    labelBackgroundColor: ctx.scene.background && ctx.scene.background !== "transparent" ? ctx.scene.background : ctx.t.background,
    exitX: ex,
    exitY: ey,
    exitDx: 0,
    exitDy: 0,
    exitPerimeter: 0,
    entryX: nx,
    entryY: ny,
    entryDx: 0,
    entryDy: 0,
    entryPerimeter: 0
  });
  const bends = e.points.slice(1, -1);
  const points = bends.length ? `<Array as="points">${bends.map((p) => `<mxPoint x="${n2(p.x)}" y="${n2(p.y)}"/>`).join("")}</Array>` : "";
  const label = e.label?.lines.join(" ") ?? "";
  ctx.cells.push(
    `<mxCell id="${e.id}" value="${esc(esc(label))}" style="${s}" edge="1" parent="1" source="${boxes.has(e.from) ? ctx.groupBox.has(e.from) ? `g-${e.from}` : `n-${e.from}` : ""}" target="${ctx.groupBox.has(e.to) ? `g-${e.to}` : `n-${e.to}`}"><mxGeometry relative="1" as="geometry">${points}</mxGeometry></mxCell>`
  );
  if (e.step !== void 0 && e.stepBox) {
    ctx.cells.push(
      `<mxCell id="${e.id}:step" value="${e.step}" style="${style({ ellipse: null, whiteSpace: "wrap", html: 1, fillColor: ctx.t.stepFill, strokeColor: "none", fontColor: ctx.t.stepText, fontStyle: 1, fontSize: 14, fontFamily: FONT })}" vertex="1" parent="1">${geometry(e.stepBox)}</mxCell>`
    );
  }
}
function legend2(ctx, l) {
  const { box } = l;
  const local = (b) => ({ ...b, x: b.x - box.x, y: b.y - box.y });
  ctx.cells.push(
    `<mxCell id="legend" value="" style="${style({ rounded: 1, absoluteArcSize: 1, arcSize: 12, html: 1, fillColor: ctx.t.surface, strokeColor: ctx.t.border, container: 1, collapsible: 0, recursiveResize: 0 })}" vertex="1" parent="1">${geometry(box)}</mxCell>`
  );
  for (const [i, item] of l.items.entries()) {
    ctx.cells.push(
      `<mxCell id="legend:${i}:line" value="" style="${style({ line: null, html: 1, fillColor: "none", strokeColor: ctx.t.edge, ...lineStyle(item.line) })}" vertex="1" parent="legend">${geometry(local(item.swatch))}</mxCell>`,
      `<mxCell id="legend:${i}:text" value="${esc(esc(item.label.lines.join(" ")))}" style="${style({ text: null, html: 1, align: "left", verticalAlign: "middle", whiteSpace: "nowrap", fontSize: item.label.size, fontColor: ctx.t.text, fontFamily: FONT, spacing: 0 })}" vertex="1" parent="legend">${geometry(local(item.labelBox))}</mxCell>`
    );
  }
}
function renderDrawio(scene, name = "Diagram") {
  const t = tokensFor(scene);
  const ctx = { t, scene, icons: 0, cells: [], groupBox: /* @__PURE__ */ new Map() };
  if (scene.title && scene.titleBox) {
    ctx.cells.push(
      `<mxCell id="title" value="${esc(esc(scene.title.lines.join(" ")))}" style="${style({ text: null, html: 1, align: "left", verticalAlign: "top", fontSize: 20, fontStyle: 1, fontColor: t.text, fontFamily: FONT, spacing: 0 })}" vertex="1" parent="1">${geometry({ ...scene.titleBox, w: scene.titleBox.w + 20 })}</mxCell>`
    );
  }
  if (scene.subtitle && scene.subtitleBox) {
    ctx.cells.push(
      `<mxCell id="subtitle" value="${esc(esc(scene.subtitle.lines.join(" ")))}" style="${style({ text: null, html: 1, align: "left", verticalAlign: "top", fontSize: 13, fontColor: t.muted, fontFamily: FONT, spacing: 0 })}" vertex="1" parent="1">${geometry({ ...scene.subtitleBox, w: scene.subtitleBox.w + 20 })}</mxCell>`
    );
  }
  for (const g of scene.groups) group(ctx, g);
  const boxes = /* @__PURE__ */ new Map();
  for (const g of scene.groups) boxes.set(g.id, g.box);
  const vertical = scene.direction === "down" || scene.direction === "up";
  for (const nd of scene.nodes) {
    boxes.set(nd.id, nd.look === "icon" && nd.iconBox && !vertical ? nd.iconBox : nd.box);
    node2(ctx, nd);
  }
  for (const e of scene.edges) edge2(ctx, e, boxes);
  if (scene.legend?.items.length) legend2(ctx, scene.legend);
  const bg = scene.background === "transparent" ? "none" : scene.background ?? t.background;
  return [
    `<mxfile host="orrery" agent="orrery" type="device">`,
    `<diagram id="orrery" name="${esc(name)}">`,
    `<mxGraphModel dx="${scene.width}" dy="${scene.height}" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="${scene.width}" pageHeight="${scene.height}" background="${bg}" math="0" shadow="0">`,
    `<root><mxCell id="0"/><mxCell id="1" parent="0"/>`,
    ...ctx.cells,
    `</root></mxGraphModel></diagram></mxfile>`,
    ""
  ].join("\n");
}

// src/render/html.ts
function renderHtml(input) {
  const b64 = (svg) => Buffer.from(svg).toString("base64");
  const lightB64 = b64(input.light);
  const darkB64 = b64(input.dark);
  const stills = input.lightStill && input.darkStill ? `{ light: "${b64(input.lightStill)}", dark: "${b64(input.darkStill)}" }` : "svgs";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="generator" content="orrery">
<title>${esc(input.title)}</title>
<style>
:root{color-scheme:light dark;--bg:#f6f7f9;--panel:#ffffff;--ink:#1f2937;--muted:#5f6b7a;--line:#d8dde3;--accent:#2563eb}
body[data-theme=dark]{--bg:#090c10;--panel:#0d1117;--ink:#e6edf3;--muted:#9aa4b2;--line:#30363d;--accent:#58a6ff}
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{background:var(--bg);color:var(--ink);font:14px/1.4 Inter,"Segoe UI",-apple-system,BlinkMacSystemFont,Roboto,Arial,sans-serif;display:flex;flex-direction:column;transition:background .25s ease,color .25s ease}
header{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;padding:12px 16px;border-bottom:1px solid var(--line);background:var(--panel)}
h1{font-size:15px;font-weight:600;margin:0;flex:1 1 220px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tools{display:flex;flex-wrap:wrap;gap:6px}
button,a.btn{appearance:none;border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:8px;padding:7px 12px;font:inherit;font-size:13px;cursor:pointer;text-decoration:none;min-height:44px;min-width:44px;justify-content:center;display:inline-flex;align-items:center;gap:6px;transition:border-color .15s ease,transform .15s ease}
button:hover,a.btn:hover{border-color:var(--accent)}
button:active,a.btn:active{transform:scale(.97)}
main{position:relative;flex:1;overflow:hidden;touch-action:none;cursor:grab}
main.dragging{cursor:grabbing}
#canvas{position:absolute;left:0;top:0}
#canvas img{display:block;max-width:none;border-radius:10px;box-shadow:0 1px 2px rgba(15,23,42,.06),0 8px 24px rgba(15,23,42,.08);transition:opacity .2s ease}
body[data-theme=dark] #canvas img{box-shadow:0 0 0 1px var(--line)}
.hint{position:absolute;right:12px;bottom:10px;font-size:12px;color:var(--muted);pointer-events:none}
</style>
</head>
<body data-theme="${input.initial}">
<header>
<h1>${esc(input.title)}</h1>
<div class="tools">
<button type="button" data-act="theme" aria-label="Switch light or dark">Theme</button>
<button type="button" data-act="out" aria-label="Zoom out">-</button>
<button type="button" data-act="in" aria-label="Zoom in">+</button>
<button type="button" data-act="fit">Fit</button>
<a class="btn" data-act="svg" download="${esc(input.name)}.svg" href="#">SVG</a>
<button type="button" data-act="png">PNG</button>
</div>
</header>
<main id="stage" aria-label="Diagram, drag to pan, scroll or pinch to zoom">
<div id="canvas"><img id="diagram" alt="${esc(input.title)}"></div>
<div class="hint">drag to pan, scroll or pinch to zoom</div>
</main>
<script>
(() => {
  const svgs = { light: "${lightB64}", dark: "${darkB64}" };
  const stills = ${stills};
  const toUrl = (b64) => "data:image/svg+xml;base64," + b64;
  const body = document.body, stage = document.getElementById("stage"), canvas = document.getElementById("canvas"), img = document.getElementById("diagram");
  let theme = body.dataset.theme, scale = 1, x = 0, y = 0;
  const size = () => { const m = atob(svgs[theme].slice(0, 800)).match(/width="([\\d.]+)" height="([\\d.]+)"/); return m ? [Number(m[1]), Number(m[2])] : [1000, 600]; };
  const apply = () => { const [w, h] = size(); canvas.style.left = x + "px"; canvas.style.top = y + "px"; img.style.width = w * scale + "px"; img.style.height = h * scale + "px"; };
  const fit = () => { const [w, h] = size(); const r = stage.getBoundingClientRect(); scale = Math.min((r.width - 32) / w, (r.height - 32) / h, 2); x = (r.width - w * scale) / 2; y = Math.max(16, (r.height - h * scale) / 2); apply(); };
  const show = () => { body.dataset.theme = theme; img.src = toUrl(svgs[theme]); const [w, h] = size(); img.width = w; img.height = h; apply(); const a = document.querySelector('[data-act=svg]'); a.href = toUrl(svgs[theme]); a.download = "${esc(input.name)}-" + theme + ".svg"; };
  const zoomAt = (f, cx, cy) => { const ns = Math.max(0.1, Math.min(8, scale * f)); x = cx - (cx - x) * (ns / scale); y = cy - (cy - y) * (ns / scale); scale = ns; apply(); };
  const pointers = new Map(); let pinch = 0;
  stage.addEventListener("pointerdown", (e) => { stage.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]); stage.classList.add("dragging"); });
  stage.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); const r = stage.getBoundingClientRect();
      if (pinch) zoomAt(d / pinch, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top); pinch = d;
    } else { x += e.clientX - prev[0]; y += e.clientY - prev[1]; apply(); }
  });
  const up = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = 0; if (!pointers.size) stage.classList.remove("dragging"); };
  stage.addEventListener("pointerup", up); stage.addEventListener("pointercancel", up);
  stage.addEventListener("wheel", (e) => { e.preventDefault(); const r = stage.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  document.querySelector("[data-act=theme]").onclick = () => { theme = theme === "light" ? "dark" : "light"; show(); };
  document.querySelector("[data-act=in]").onclick = () => { const r = stage.getBoundingClientRect(); zoomAt(1.25, r.width / 2, r.height / 2); };
  document.querySelector("[data-act=out]").onclick = () => { const r = stage.getBoundingClientRect(); zoomAt(0.8, r.width / 2, r.height / 2); };
  document.querySelector("[data-act=fit]").onclick = fit;
  document.querySelector("[data-act=png]").onclick = () => {
    // 3x like the CLI, capped at 16.7M pixels, the largest canvas iOS Safari will export.
    const [w, h] = size(); const k = Math.min(3, Math.sqrt(16.7e6 / (w * h))); const c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
    const im = new Image(); im.onload = () => { const g = c.getContext("2d"); g.scale(c.width / w, c.height / h); g.drawImage(im, 0, 0, w, h); const a = document.createElement("a"); a.download = "${esc(input.name)}-" + theme + ".png"; a.href = c.toDataURL("image/png"); a.click(); };
    im.src = toUrl(stills[theme]);
  };
  addEventListener("resize", fit);
  show(); fit();
})();
</script>
</body>
</html>
`;
}

// src/render/png.ts
import { existsSync as existsSync4, readFileSync as readFileSync4 } from "node:fs";
import { createRequire as createRequire2 } from "node:module";
import { join as join6 } from "node:path";
import { pathToFileURL } from "node:url";
var resvg;
async function load2() {
  const vendored = join6(vendorDir, "resvg", "index.mjs");
  let mod;
  let wasm;
  if (existsSync4(vendored)) {
    mod = await import(pathToFileURL(vendored).href);
    wasm = readFileSync4(join6(vendorDir, "resvg", "index_bg.wasm"));
  } else {
    const require2 = createRequire2(import.meta.url);
    const entry = require2.resolve("@resvg/resvg-wasm");
    mod = await import(pathToFileURL(join6(entry, "..", "index.mjs")).href);
    wasm = readFileSync4(join6(entry, "..", "index_bg.wasm"));
  }
  await mod.initWasm(wasm);
  return mod;
}
var fonts;
function fontBuffers(extra) {
  fonts ??= ["Inter-Regular.ttf", "Inter-SemiBold.ttf"].map(
    (f) => new Uint8Array(readFileSync4(join6(fontsDir, f)))
  );
  return [...fonts, ...extra.map((f) => new Uint8Array(readFileSync4(f)))];
}
async function renderPng(svg, opts = {}) {
  resvg ??= load2();
  const { Resvg } = await resvg;
  const r = new Resvg(svg, {
    fitTo: { mode: "zoom", value: opts.scale ?? 3 },
    background: opts.background,
    font: {
      fontBuffers: fontBuffers(opts.fonts ?? []),
      defaultFontFamily: "Inter",
      loadSystemFonts: false
    },
    shapeRendering: 2,
    textRendering: 1,
    imageRendering: 0
  });
  return r.render().asPng();
}

// src/render/tsx.ts
var UID = "SDWUID";
var KEEP = /* @__PURE__ */ new Set([
  "viewBox",
  "gradientUnits",
  "gradientTransform",
  "patternUnits",
  "patternTransform",
  "preserveAspectRatio",
  "clipPathUnits",
  "maskUnits",
  "maskContentUnits",
  "spreadMethod",
  "stdDeviation",
  "baseFrequency",
  "numOctaves",
  "markerWidth",
  "markerHeight",
  "refX",
  "refY",
  "fx",
  "fy"
]);
function attrName(name) {
  if (name === "class") return "className";
  if (name === "xlink:href") return "xlinkHref";
  if (name === "xmlns:xlink") return "xmlnsXlink";
  if (name === "xml:space") return "xmlSpace";
  if (name.startsWith("aria-") || name.startsWith("data-") || KEEP.has(name)) return name;
  return name.replace(/[-:]([a-z])/g, (_, c) => c.toUpperCase());
}
function attrValue(name, value) {
  const decoded = value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  if (name === "style") {
    const obj = decoded.split(";").map((d) => d.trim()).filter((d) => d && !d.startsWith("-")).map((d) => {
      const [k = "", ...v] = d.split(":");
      const key = k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      return `${JSON.stringify(key)}: ${JSON.stringify(v.join(":").trim())}`;
    });
    return `{{ ${obj.join(", ")} }}`;
  }
  if (decoded.includes(UID)) return templateLiteral(decoded);
  return /["\\{}]/.test(decoded) ? `{${JSON.stringify(decoded)}}` : `"${decoded}"`;
}
function templateLiteral(s) {
  const body = s.replace(/[`\\]/g, "\\$&").replaceAll("$", "\\$").replaceAll(`${UID}-`, "${uid}-");
  return `{\`${body}\`}`;
}
function jsxText(s) {
  return s.replace(/[{}]/g, (c) => `{"${c}"}`);
}
function componentName(title, fallback) {
  const base = (title || fallback).replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
  const name = base || "Diagram";
  return /^[A-Z]/.test(name) ? name : `Diagram${name}`;
}
function renderTsx(scene, name) {
  const svg = renderSvg(scene, { idPrefix: UID });
  const out = [];
  let depth = 2;
  const indent = () => "  ".repeat(depth);
  let inStyle = false;
  const tokens2 = svg.match(/<\/?[a-zA-Z][^>]*>|[^<]+/g) ?? [];
  for (const tok of tokens2) {
    if (tok.startsWith("</")) {
      const tag = tok.slice(2, -1).trim();
      if (tag === "style") inStyle = false;
      depth -= 1;
      out.push(`${indent()}</${tag}>`);
      continue;
    }
    if (tok.startsWith("<")) {
      const selfClosing = tok.endsWith("/>");
      const inner = tok.slice(1, selfClosing ? -2 : -1);
      const [tag = ""] = inner.split(/\s/, 1);
      const attrs = [...inner.slice(tag.length).matchAll(/([\w:.-]+)="([^"]*)"/g)].map(
        ([, k = "", v = ""]) => `${attrName(k)}=${attrValue(k, v)}`
      );
      if (tag === "svg") attrs.push("{...props}");
      out.push(
        `${indent()}<${tag}${attrs.length ? ` ${attrs.join(" ")}` : ""}${selfClosing ? " />" : ">"}`
      );
      if (!selfClosing) {
        depth += 1;
        if (tag === "style") inStyle = true;
      }
      continue;
    }
    const textNode = tok.replace(/\n/g, "");
    if (!textNode.trim()) continue;
    out.push(`${indent()}${inStyle ? templateLiteral(textNode) : jsxText(textNode)}`);
  }
  return [
    "// Generated by orrery. Edit the diagram spec and re-render instead of editing this file.",
    `import { type SVGProps, useId } from "react";`,
    "",
    `export default function ${name}(props: SVGProps<SVGSVGElement>) {`,
    `  const uid = useId().replace(/[^A-Za-z0-9_-]/g, "");`,
    "  return (",
    ...out,
    "  );",
    "}",
    ""
  ].join("\n");
}

// src/render/index.ts
var FORMATS = ["svg", "png", "drawio", "tsx", "html"];
async function renderModel(req) {
  const model = {
    ...req.model,
    ...req.skin ? { skin: req.skin } : {},
    ...req.animate ? { animate: req.animate } : {}
  };
  const themes = [
    ...new Set(req.formats.includes("html") ? [...req.themes, "light", "dark"] : req.themes)
  ];
  const scenes = {};
  for (const theme of themes) scenes[theme] = await layout(model, { theme });
  if (req.formats.length) {
    const ids = Object.values(scenes).flatMap((s) => [
      ...s.nodes.map((n3) => n3.icon),
      ...s.groups.map((g) => g.icon)
    ]);
    await loadIconLibraries(ids.filter((id) => !!id));
  }
  for (const s of Object.values(scenes)) fitIcons(s);
  const first = scenes[req.themes[0] ?? model.theme] ?? Object.values(scenes)[0];
  const diagnostics = first ? checkScene(first, model) : [];
  const idPrefix = (theme) => `${req.name}-${theme}`.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^(?=[^A-Za-z_])/, "sd-");
  const svgOf = (theme, scene) => renderSvg(scene, { idPrefix: idPrefix(theme) });
  const stillOf = (theme, scene) => scene.animate !== "none" ? svgOf(theme, { ...scene, animate: "none" }) : void 0;
  const artifacts = [];
  for (const theme of req.themes) {
    const scene = scenes[theme];
    if (!scene || !req.formats.length) continue;
    const svg = svgOf(theme, scene);
    for (const format of req.formats) {
      const base = { format, theme, width: scene.width, height: scene.height };
      if (format === "svg") artifacts.push({ ...base, data: svg });
      if (format === "png") {
        const still = stillOf(theme, scene) ?? svg;
        artifacts.push({
          ...base,
          data: await renderPng(still, { scale: req.scale, fonts: req.fonts }),
          width: Math.round(scene.width * (req.scale ?? 3)),
          height: Math.round(scene.height * (req.scale ?? 3))
        });
      }
      if (format === "drawio")
        artifacts.push({
          ...base,
          data: renderDrawio({ ...scene, animate: "none" }, model.title ?? req.name)
        });
      if (format === "tsx")
        artifacts.push({ ...base, data: renderTsx(scene, componentName(model.title, req.name)) });
    }
  }
  if (req.formats.includes("html") && scenes.light && scenes.dark) {
    artifacts.push({
      format: "html",
      data: renderHtml({
        title: model.title ?? req.name,
        light: svgOf("light", scenes.light),
        dark: svgOf("dark", scenes.dark),
        lightStill: stillOf("light", scenes.light),
        darkStill: stillOf("dark", scenes.dark),
        name: req.name,
        initial: req.themes[0] ?? model.theme
      }),
      width: scenes.light.width,
      height: scenes.light.height
    });
  }
  return { artifacts, diagnostics, scenes };
}

// src/review.ts
var DEFAULT_REVIEW_WIDTH = 880;
var DIMENSIONS = ["conventions", "layout", "grid", "flow", "overlap", "quality"];
var WEIGHTS = {
  conventions: 0.15,
  layout: 0.15,
  grid: 0.1,
  flow: 0.2,
  overlap: 0.2,
  quality: 0.2
};
var FINDINGS = {
  "overlap.edge-through-node": {
    dimension: "overlap",
    rule: "DG201",
    cap: 60,
    about: "an edge runs through a node it does not connect"
  },
  "overlap.label-over-node": {
    dimension: "overlap",
    rule: "DG202",
    cap: 40,
    about: "an edge label covers a node"
  },
  "overlap.labels-collide": {
    dimension: "overlap",
    rule: "DG202",
    cap: 40,
    about: "two edge labels overlap"
  },
  "overlap.nodes-collide": {
    dimension: "overlap",
    rule: "DG203",
    cap: 60,
    about: "two nodes' drawn footprints overlap"
  },
  "overlap.edge-through-header": {
    dimension: "overlap",
    rule: "DG209",
    cap: 40,
    about: "an edge runs under a group header label, so it looks broken"
  },
  "overlap.edge-through-label": {
    dimension: "overlap",
    rule: "DG212",
    cap: 40,
    about: "an edge runs through another edge's label or step badge, or a node's label text"
  },
  "overlap.off-canvas": {
    dimension: "overlap",
    rule: "DG210",
    cap: 60,
    about: "something is drawn outside the canvas and gets cut off"
  },
  "overlap.badge": {
    dimension: "overlap",
    rule: "DG211",
    cap: 40,
    about: "a step badge or node badge covers a node, a label or another badge"
  },
  "overlap.overlay-encloses": {
    dimension: "overlap",
    rule: "DG213",
    cap: 30,
    about: "an overlay (around:) group draws around a node that is not a member"
  },
  "overlap.overlay-header": {
    dimension: "overlap",
    rule: "DG214",
    cap: 30,
    about: "an overlay (around:) group's header covers another group's header or a node"
  },
  "overlap.outside-group": {
    dimension: "overlap",
    cap: 30,
    about: "a node or group sticks out of its parent group or into its header"
  },
  "overlap.groups-collide": {
    dimension: "overlap",
    cap: 30,
    about: "two groups that do not nest overlap"
  },
  "flow.head-hidden": {
    dimension: "flow",
    cap: 40,
    about: "an arrowhead sits under a label, badge, header or node, so the direction is lost"
  },
  "flow.shared-trunk": {
    dimension: "flow",
    cap: 32,
    about: "two unrelated edges run on the same line, so readers cannot tell them apart"
  },
  "flow.step-order": {
    dimension: "flow",
    rule: "AWS-14",
    cap: 32,
    about: "step numbers do not follow reading order (left to right, top to bottom, or clockwise)"
  },
  "flow.step-numbering": {
    dimension: "flow",
    cap: 8,
    about: "step numbers skip a number or do not start at 1"
  },
  "flow.bidirectional": {
    dimension: "flow",
    rule: "AZ-04",
    cap: 12,
    about: "a two-headed arrow hides who initiates"
  },
  "flow.undirected": {
    dimension: "flow",
    rule: "AZ-03",
    cap: 12,
    about: "a line without an arrowhead leaves the relationship unclear"
  },
  "flow.unlabelled-boundary": {
    dimension: "flow",
    cap: 10,
    about: "an unlabelled edge crosses a group boundary"
  },
  "flow.head-on-bend": {
    dimension: "flow",
    cap: 15,
    about: "the last straight run is shorter than the arrowhead, so the head sits on the bend"
  },
  "flow.arrow-short": {
    dimension: "flow",
    cap: 10,
    about: "an edge stops short of the drawn icon glyph"
  },
  "flow.unconnected": {
    dimension: "flow",
    rule: "DG208",
    cap: 12,
    about: "a node nothing connects to"
  },
  "layout.against-flow": {
    dimension: "layout",
    cap: 30,
    about: "an arrowhead points against the diagram direction"
  },
  "layout.crossings": {
    dimension: "layout",
    cap: 30,
    about: "edges cross each other"
  },
  "layout.empty-space": {
    dimension: "layout",
    cap: 25,
    about: "a large empty rectangle inside the content"
  },
  "layout.aspect": {
    dimension: "layout",
    rule: "DG205",
    cap: 25,
    about: "the picture is a strip, hard to read in a document column"
  },
  "layout.too-wide": {
    dimension: "layout",
    rule: "DG205",
    cap: 15,
    about: "the canvas is wider than 2400px"
  },
  "layout.long-edge": {
    dimension: "layout",
    cap: 15,
    about: "an edge is far longer than the median edge"
  },
  "layout.fallback": {
    dimension: "layout",
    rule: "DG218",
    cap: 5,
    about: "ELK needed a fallback strategy, so spec order may not be kept"
  },
  "layout.empty-group": {
    dimension: "layout",
    rule: "DG207",
    cap: 10,
    about: "a group with nothing in it"
  },
  "grid.ragged": {
    dimension: "grid",
    cap: 24,
    about: "items in one layer share no start, center or end line"
  },
  "grid.jog": {
    dimension: "grid",
    cap: 24,
    about: "an edge has a tiny step (under 6px) where it could run straight"
  },
  "grid.off-center": {
    dimension: "grid",
    cap: 21,
    about: "a group's content is off its center by more than 6px"
  },
  "grid.uneven-gaps": {
    dimension: "grid",
    cap: 15,
    about: "gaps between layers vary a lot"
  },
  "quality.label-size": {
    dimension: "quality",
    rule: "LEG-01",
    cap: 60,
    about: "node labels are too small at the display width"
  },
  "quality.text-size": {
    dimension: "quality",
    rule: "LEG-02",
    cap: 20,
    about: "the smallest text (notes, edge labels, badges) is too small at the display width"
  },
  "quality.icon-size": {
    dimension: "quality",
    rule: "LEG-03",
    cap: 15,
    about: "icons are too small to recognize at the display width"
  },
  "quality.contrast": {
    dimension: "quality",
    rule: "LEG-04",
    cap: 40,
    about: "text below the WCAG 2.2 contrast minimum"
  },
  "quality.node-count": {
    dimension: "quality",
    rule: "DG206",
    cap: 20,
    about: "more nodes than one diagram can carry"
  },
  "quality.long-label": {
    dimension: "quality",
    rule: "DG204",
    cap: 12,
    about: "a node label wraps to more than three lines"
  },
  "quality.mid-word-break": {
    dimension: "quality",
    rule: "AWS-07",
    cap: 12,
    about: "a label breaks in the middle of a word"
  },
  "conventions.legend-missing": {
    dimension: "conventions",
    rule: "DG217",
    cap: 30,
    about: "a line style is used without a legend that explains it"
  },
  "conventions.legend-unused": {
    dimension: "conventions",
    cap: 6,
    about: "the legend explains a line style the diagram does not draw"
  },
  "conventions.title-missing": {
    dimension: "conventions",
    rule: "C4-01",
    cap: 8,
    about: "the diagram has no title"
  },
  "conventions.short-name": {
    dimension: "conventions",
    rule: "AWS-08",
    cap: 20,
    about: "an AWS short form with no full service name anywhere in the diagram"
  },
  "conventions.label-lines": {
    dimension: "conventions",
    rule: "AWS-07",
    cap: 15,
    about: "an AWS service label runs over two lines"
  },
  "conventions.callout-sizes": {
    dimension: "conventions",
    rule: "AWS-13",
    cap: 5,
    about: "step callouts come in more than one size"
  },
  "conventions.c4-element": {
    dimension: "conventions",
    rule: "C4-04",
    cap: 24,
    about: "a C4 element lacks its type, description or technology"
  },
  "conventions.c4-relationship": {
    dimension: "conventions",
    rule: "C4-07",
    cap: 15,
    about: "a C4 relationship lacks a specific label or its technology"
  },
  "conventions.icon-recolored": {
    dimension: "conventions",
    rule: "AZ-06",
    cap: 15,
    about: "a brand mark is recolored"
  },
  "conventions.gcp-product-icon": {
    dimension: "conventions",
    rule: "GCP-02",
    cap: 24,
    about: "a Google Cloud product is drawn with another product's icon"
  }
};
var EPS2 = 0.5;
var r1 = (v) => Math.round(v * 10) / 10;
var r2 = (v) => Math.round(v * 100) / 100;
var real = (b) => !!b && b.w > 0 && b.h > 0;
function union2(list) {
  const l = list.filter(real);
  if (!l.length) return void 0;
  const x = Math.min(...l.map((b) => b.x));
  const y = Math.min(...l.map((b) => b.y));
  return {
    x,
    y,
    w: Math.max(...l.map((b) => b.x + b.w)) - x,
    h: Math.max(...l.map((b) => b.y + b.h)) - y
  };
}
function interArea(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}
var inBox = (x, y, b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
function clipLen(p, q, b, inset = 0) {
  const box = { x: b.x + inset, y: b.y + inset, w: b.w - 2 * inset, h: b.h - 2 * inset };
  if (box.w <= 0 || box.h <= 0) return 0;
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const sides = [
    [-dx, p.x - box.x],
    [dx, box.x + box.w - p.x],
    [-dy, p.y - box.y],
    [dy, box.y + box.h - p.y]
  ];
  for (const [pp, qq] of sides) {
    if (pp === 0) {
      if (qq < 0) return 0;
    } else {
      const r = qq / pp;
      if (pp < 0) {
        if (r > t1) return 0;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return 0;
        if (r < t1) t1 = r;
      }
    }
  }
  return t0 < t1 ? (t1 - t0) * Math.hypot(dx, dy) : 0;
}
function pathClipLen(points, b, inset = 0) {
  let total = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const p = points[i];
    const q = points[i + 1];
    if (p && q) total += clipLen(p, q, b, inset);
  }
  return total;
}
var segments = (points) => points.slice(1).flatMap((q, i) => {
  const p = points[i];
  return p ? [[p, q]] : [];
});
var pathLen = (points) => segments(points).reduce((s, [p, q]) => s + Math.hypot(q.x - p.x, q.y - p.y), 0);
function simplify(points) {
  const out = [];
  for (const p of points) {
    const last = out.at(-1);
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    out.push(p);
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3);
      if (Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) < 0.01)
        out.splice(out.length - 2, 1);
      else break;
    }
  }
  return out;
}
function midpoint2(points) {
  const half = pathLen(points) / 2;
  let walked = 0;
  for (const [p, q] of segments(points)) {
    const l = Math.hypot(q.x - p.x, q.y - p.y);
    if (walked + l >= half && l > 0) {
      const t = (half - walked) / l;
      return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
    }
    walked += l;
  }
  return points[0] ?? { x: 0, y: 0 };
}
var horizontalFlow = (d) => d === "right" || d === "left";
var along = (d, dx, dy) => d === "right" ? dx : d === "left" ? -dx : d === "down" ? dy : -dy;
function footprint(n3) {
  return union2([n3.box, n3.iconBox, n3.labelBox, n3.noteBox]) ?? n3.box;
}
function headerChip2(g) {
  if (!g.label.lines.length) return void 0;
  const parts = g.overlay && g.iconBox ? [g.labelBox, g.iconBox] : [g.labelBox];
  const u = union2(parts);
  return u ? { x: u.x - 4, y: u.y - 1, w: u.w + 8, h: u.h + 2 } : void 0;
}
function badgeRect2(n3) {
  if (!n3.badge) return void 0;
  if (n3.badgeBox) return n3.badgeBox;
  const anchor2 = n3.look === "icon" ? n3.iconBox : n3.box;
  if (!anchor2) return void 0;
  const w = Math.max(18, 8 + n3.badge.length * 6.4);
  return { x: anchor2.x + anchor2.w - w / 2 - 2, y: anchor2.y - 7, w, h: 16 };
}
function headerBottom(g) {
  if (g.overlay) return g.box.y;
  const parts = [g.labelBox, g.iconBox].filter(real);
  return Math.max(g.box.y, ...parts.map((b) => b.y + b.h));
}
var norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
var escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
var hasPhrase = (text2, phrase) => !!phrase && new RegExp(`(^| )${escapeRe(norm(phrase))}s?( |$)`).test(text2);
var edgeName = (e) => `${e.from} -> ${e.to}`;
var OVERLAP_RULES = {
  DG201: {
    id: "overlap.edge-through-node",
    severity: "blocker",
    cost: 15,
    hard: "edgesThroughNodes",
    ids: ["edge", "node"]
  },
  DG202: {
    id: "overlap.label-over-node",
    severity: "major",
    cost: 12,
    hard: "overlaps",
    ids: ["edge", "node"]
  },
  "DG202:labels": {
    id: "overlap.labels-collide",
    severity: "major",
    cost: 12,
    hard: "overlaps",
    ids: ["edges"]
  },
  DG203: {
    id: "overlap.nodes-collide",
    severity: "blocker",
    cost: 15,
    hard: "overlaps",
    ids: ["nodes"]
  },
  DG209: {
    id: "overlap.edge-through-header",
    severity: "major",
    cost: 8,
    hard: "edgesThroughHeaders",
    ids: ["edge", "group"]
  },
  DG210: {
    id: "overlap.off-canvas",
    severity: "blocker",
    cost: 15,
    hard: "offCanvas",
    ids: ["node", "group", "edge", "legend", "title", "subtitle"]
  },
  DG211: {
    id: "overlap.badge",
    severity: "major",
    cost: 8,
    hard: "overlaps",
    ids: ["edge", "node", "over"]
  },
  DG212: {
    id: "overlap.edge-through-label",
    severity: "major",
    cost: 8,
    hard: "edgesThroughLabels",
    ids: ["edge", "labelOf"]
  },
  DG213: {
    id: "overlap.overlay-encloses",
    severity: "major",
    cost: 10,
    hard: "overlaps",
    ids: ["group", "enclosed"]
  },
  DG214: {
    id: "overlap.overlay-header",
    severity: "major",
    cost: 10,
    hard: "overlaps",
    ids: ["group", "covered"]
  }
};
function flatEvidence(v, key = "", out = {}) {
  if (typeof v === "number" || typeof v === "string") out[key] = v;
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) flatEvidence(x, key ? `${key}.${k}` : k, out);
  return out;
}
var subjectIds = (d, keys) => keys.flatMap((k) => {
  const v = d.subject?.[k];
  if (v === true) return [k];
  if (Array.isArray(v)) return v.map(String);
  return typeof v === "string" ? [v] : [];
});
function measureOverlap(c, diagnostics) {
  const { scene, add, hard } = c;
  const m = c.metrics.overlap;
  const count = (code) => diagnostics.filter((d) => d.code === code).length;
  for (const d of diagnostics) {
    const rule = OVERLAP_RULES[d.code === "DG202" && d.subject?.edges ? "DG202:labels" : d.code];
    if (!rule) continue;
    hard[rule.hard]++;
    add(
      rule.id,
      rule.severity,
      subjectIds(d, rule.ids),
      flatEvidence(d.evidence),
      d.message,
      d.fixes ?? [],
      rule.cost
    );
  }
  for (const g of scene.groups) {
    if (!g.iconBox) continue;
    for (const e of scene.edges) {
      const len = pathClipLen(e.points, g.iconBox, EPS2);
      const reported = diagnostics.some(
        (d) => d.code === "DG209" && d.subject?.edge === e.id && d.subject?.group === g.id
      );
      if (len <= 1 || reported) continue;
      hard.edgesThroughHeaders++;
      add(
        "overlap.edge-through-header",
        "major",
        [e.id, g.id],
        { edge: edgeName(e), group: g.id, lengthPx: r1(len) },
        `edge ${edgeName(e)} runs ${r1(len)}px through the icon of group "${g.id}", so it looks broken`,
        [
          `reorder the nodes inside "${g.id}" so the edge enters away from the header`,
          `shorten the label of "${g.id}"`,
          "change direction"
        ],
        8
      );
    }
  }
  const horizontal = horizontalFlow(scene.direction);
  for (const e of scene.edges) {
    for (const o of scene.edges) {
      const len = o.id !== e.id && real(o.stepBox) ? pathClipLen(e.points, o.stepBox, 1) : 0;
      if (len > 1) {
        hard.edgesThroughLabels++;
        add(
          "overlap.edge-through-label",
          "major",
          [e.id, o.id],
          { edge: edgeName(e), other: edgeName(o), part: "step", lengthPx: r1(len) },
          `edge ${edgeName(e)} runs ${r1(len)}px through the step of ${edgeName(o)}`,
          [
            "move one endpoint earlier or later in the nodes list",
            `shorten or drop the label on ${edgeName(o)}`,
            "use layout: { spacing: loose }"
          ],
          8
        );
      }
    }
    for (const n3 of scene.nodes) {
      const own = n3.id === e.from || n3.id === e.to;
      if (own && !horizontal && n3.look === "icon") continue;
      for (const [part, b] of [
        ["label", n3.labelBox],
        ["note", n3.noteBox]
      ]) {
        if (!real(b) || n3.look !== "icon" && own) continue;
        const len = pathClipLen(e.points, b, 1);
        if (len > 1) {
          hard.edgesThroughLabels++;
          add(
            "overlap.edge-through-label",
            "major",
            [e.id, n3.id],
            { edge: edgeName(e), node: n3.id, part, lengthPx: r1(len) },
            `edge ${edgeName(e)} runs ${r1(len)}px through the ${part} text of "${n3.id}"`,
            [`move "${n3.id}" earlier or later in the nodes list`, "change direction"],
            8
          );
        }
      }
    }
  }
  let nesting = 0;
  const check = (id, box, parentId) => {
    const p = parentId ? c.groups.get(parentId) : void 0;
    if (!p || !box || p.overlay) return;
    const hb = headerBottom(p);
    const clear = {
      left: box.x - p.box.x,
      right: p.box.x + p.box.w - (box.x + box.w),
      top: box.y - hb,
      bottom: p.box.y + p.box.h - (box.y + box.h)
    };
    const min = Math.min(clear.left, clear.right, clear.top, clear.bottom);
    if (min < -EPS2) {
      nesting++;
      add(
        "overlap.outside-group",
        "major",
        [id, p.id],
        {
          parent: p.id,
          left: r1(clear.left),
          right: r1(clear.right),
          top: r1(clear.top),
          bottom: r1(clear.bottom)
        },
        `"${id}" sticks ${r1(-min)}px out of "${p.id}" or into its header`,
        [`shorten the label of "${id}"`, `shorten the label of "${p.id}"`],
        8
      );
    }
  };
  for (const n3 of scene.nodes) check(n3.id, c.foot.get(n3.id), n3.parent);
  for (const g of scene.groups) if (!g.overlay) check(g.id, g.box, g.parent);
  const frames = scene.groups.filter((g) => !g.overlay);
  for (let i = 0; i < frames.length; i++)
    for (let j = i + 1; j < frames.length; j++) {
      const a = frames[i];
      const b = frames[j];
      if (!a || !b || c.isDescendant(a.id, b.id) || c.isDescendant(b.id, a.id)) continue;
      const area = interArea(a.box, b.box);
      if (area > 1) {
        nesting++;
        add(
          "overlap.groups-collide",
          "major",
          [a.id, b.id],
          { areaPx: r1(area) },
          `groups "${a.id}" and "${b.id}" overlap but do not nest`,
          ["nest one inside the other with in:", "use around: for a group that spans others"],
          10
        );
      }
    }
  hard.overlaps += nesting;
  Object.assign(m, {
    edgesThroughNodes: hard.edgesThroughNodes,
    labelsOverNodesOrLabels: count("DG202"),
    nodesColliding: count("DG203"),
    edgesThroughHeaders: hard.edgesThroughHeaders,
    edgesThroughLabels: hard.edgesThroughLabels,
    offCanvas: hard.offCanvas,
    badgeOverlaps: count("DG211"),
    nestingProblems: count("DG213") + nesting
  });
}
function measureFlow(c, diagnostics) {
  const { scene, model, add, dir } = c;
  const m = c.metrics.flow;
  const horizontal = horizontalFlow(dir);
  let hidden = 0;
  let onBend = 0;
  let short = 0;
  const chips = scene.groups.flatMap((g) => {
    const chip = headerChip2(g);
    return [
      ...chip ? [{ id: g.id, box: chip }] : [],
      ...g.iconBox ? [{ id: g.id, box: g.iconBox }] : []
    ];
  });
  for (const e of scene.edges) {
    const pts = simplify(e.points);
    const heads = [];
    const last = pts.at(-1);
    const before = pts.at(-2);
    const first = pts[0];
    const second = pts[1];
    if ((e.arrow === "end" || e.arrow === "both") && last && before)
      heads.push({ at: "to", tip: last, prev: before, target: e.to });
    if ((e.arrow === "start" || e.arrow === "both") && first && second)
      heads.push({ at: "from", tip: first, prev: second, target: e.from });
    const len = e.line === "thick" ? 11 : 9;
    const half = e.line === "thick" ? 5.5 : 4.5;
    for (const h of heads) {
      const L = Math.hypot(h.tip.x - h.prev.x, h.tip.y - h.prev.y);
      const ux = (h.tip.x - h.prev.x) / (L || 1);
      const uy = (h.tip.y - h.prev.y) / (L || 1);
      const bx = h.tip.x - ux * len;
      const by = h.tip.y - uy * len;
      const xs = [h.tip.x, bx - uy * half, bx + uy * half];
      const ys = [h.tip.y, by + ux * half, by - ux * half];
      const hb = {
        x: Math.min(...xs),
        y: Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys)
      };
      const hit = (b) => {
        const ib = { x: b.x + EPS2, y: b.y + EPS2, w: b.w - 2 * EPS2, h: b.h - 2 * EPS2 };
        return interArea(hb, ib) > EPS2;
      };
      const covers = [];
      for (const o of scene.edges) {
        if (real(o.labelBox) && hit(o.labelBox)) covers.push(`label of ${o.id}`);
        if (real(o.stepBox) && hit(o.stepBox)) covers.push(`step of ${o.id}`);
      }
      for (const ch of chips) if (hit(ch.box)) covers.push(`header of ${ch.id}`);
      for (const n3 of scene.nodes) {
        const parts = [
          ["label", n3.labelBox],
          ["note", n3.noteBox],
          ["badge", badgeRect2(n3)]
        ];
        if (n3.id !== h.target) parts.push(["node", n3.iconBox ?? n3.box]);
        for (const [what, b] of parts) if (real(b) && hit(b)) covers.push(`${what} of ${n3.id}`);
      }
      if (covers.length) {
        hidden++;
        add(
          "flow.head-hidden",
          "major",
          [e.id, h.target],
          { edge: edgeName(e), end: h.at, under: covers.join(", ") },
          `the arrowhead of ${edgeName(e)} at "${h.target}" sits under the ${covers.join(", ")}`,
          [
            `move "${h.target}" earlier or later in the nodes list`,
            "shorten the covering label or badge"
          ],
          10
        );
      }
      if (L < len - EPS2) {
        onBend++;
        add(
          "flow.head-on-bend",
          "minor",
          [e.id],
          { edge: edgeName(e), lastRunPx: r1(L), headPx: len },
          `the last straight run of ${edgeName(e)} is ${r1(L)}px, shorter than its ${len}px arrowhead`,
          ["use layout: { spacing: loose }", `reorder so "${h.target}" lines up with its source`],
          3
        );
      }
    }
    if (horizontal) {
      for (const [id, p] of [
        [e.from, first],
        [e.to, last]
      ]) {
        const n3 = c.nodes.get(id);
        if (!n3 || !p || n3.look !== "icon" || !n3.icon || !n3.iconBox) continue;
        const aspect = iconAspect(n3.icon);
        if (!aspect || aspect >= 0.98) continue;
        const ib = n3.iconBox;
        const onSide = (Math.abs(p.x - ib.x) < 1.5 || Math.abs(p.x - (ib.x + ib.w)) < 1.5) && p.y >= ib.y - EPS2 && p.y <= ib.y + ib.h + EPS2;
        const gap = (ib.w - ib.h * aspect) / 2;
        if (onSide && gap > 1.5) {
          short++;
          add(
            "flow.arrow-short",
            "minor",
            [e.id, id],
            { edge: edgeName(e), node: id, gapPx: r1(gap), aspect: r2(aspect) },
            `${edgeName(e)} stops ${r1(gap)}px short of the "${n3.icon}" glyph`,
            [`use a square icon for "${id}"`, "use look: card for that node"],
            2
          );
        }
      }
    }
  }
  let trunks = 0;
  const E = scene.edges;
  for (let i = 0; i < E.length; i++)
    for (let j = i + 1; j < E.length; j++) {
      const a = E[i];
      const b = E[j];
      if (!a || !b) continue;
      if (a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to) continue;
      let olap = 0;
      for (const [p, q] of segments(a.points))
        for (const [u, v] of segments(b.points)) {
          const ah = Math.abs(p.y - q.y) < EPS2;
          const av = Math.abs(p.x - q.x) < EPS2;
          const bh = Math.abs(u.y - v.y) < EPS2;
          const bv = Math.abs(u.x - v.x) < EPS2;
          if (ah && bh && Math.abs(p.y - u.y) < 1.5)
            olap += Math.max(
              0,
              Math.min(Math.max(p.x, q.x), Math.max(u.x, v.x)) - Math.max(Math.min(p.x, q.x), Math.min(u.x, v.x))
            );
          else if (av && bv && Math.abs(p.x - u.x) < 1.5)
            olap += Math.max(
              0,
              Math.min(Math.max(p.y, q.y), Math.max(u.y, v.y)) - Math.max(Math.min(p.y, q.y), Math.min(u.y, v.y))
            );
        }
      if (olap > 10) {
        trunks++;
        add(
          "flow.shared-trunk",
          olap > 40 ? "major" : "minor",
          [a.id, b.id],
          { a: edgeName(a), b: edgeName(b), sharedPx: r1(olap) },
          `${edgeName(a)} and ${edgeName(b)} share ${r1(olap)}px of line, so readers cannot tell them apart`,
          [
            "reorder nodes so the two edges take different channels",
            "use layout: { merge: false }",
            "use layout: { spacing: loose }"
          ],
          8
        );
      }
    }
  const stepped = scene.edges.filter((e) => e.step !== void 0).map((e) => {
    const at = real(e.stepBox) ? { x: e.stepBox.x + e.stepBox.w / 2, y: e.stepBox.y + e.stepBox.h / 2 } : midpoint2(e.points);
    return { e, step: e.step, at };
  }).sort((a, b) => a.step - b.step);
  let inversions = 0;
  if (stepped.length >= 2) {
    const nums = [...new Set(stepped.map((x) => x.step))];
    const gaps = nums.filter((n3, i) => n3 !== i + 1);
    if (gaps.length) {
      add(
        "flow.step-numbering",
        "minor",
        stepped.map((x) => x.e.id),
        { steps: nums.join(",") },
        `step numbers ${nums.join(", ")} do not run 1 to ${nums.length}`,
        ["renumber the steps from 1 without gaps"],
        4
      );
    }
    const reps = nums.map((n3) => {
      const same2 = stepped.filter((x) => x.step === n3);
      return {
        step: n3,
        ids: same2.map((x) => x.e.id),
        x: same2.reduce((s, x) => s + x.at.x, 0) / same2.length,
        y: same2.reduce((s, x) => s + x.at.y, 0) / same2.length
      };
    });
    const tol = 24;
    const linearBad = [];
    for (let i = 1; i < reps.length; i++) {
      const p = reps[i - 1];
      const q = reps[i];
      if (!p || !q) continue;
      const d = along(dir, q.x - p.x, q.y - p.y);
      const cross = horizontal ? q.y - p.y : q.x - p.x;
      if (d < -tol && !(cross > tol && Math.abs(cross) > Math.abs(d) / 2))
        linearBad.push(`${p.step}->${q.step}`);
    }
    let clockBad = linearBad;
    if (reps.length >= 3) {
      const cx = reps.reduce((s, r) => s + r.x, 0) / reps.length;
      const cy = reps.reduce((s, r) => s + r.y, 0) / reps.length;
      const angle = (r) => Math.atan2(r.y - cy, r.x - cx);
      const bad = [];
      for (let i = 1; i < reps.length; i++) {
        const p = reps[i - 1];
        const q = reps[i];
        if (!p || !q) continue;
        let d = angle(q) - angle(p);
        while (d <= -Math.PI) d += 2 * Math.PI;
        while (d > Math.PI) d -= 2 * Math.PI;
        if (d < -0.05) bad.push(`${p.step}->${q.step}`);
      }
      if (bad.length < clockBad.length) clockBad = bad;
    }
    inversions = clockBad.length;
    if (inversions) {
      add(
        "flow.step-order",
        inversions > 1 ? "major" : "minor",
        reps.flatMap((r) => r.ids),
        { inversions, jumps: clockBad.join(" "), direction: dir },
        `step numbers jump against reading order at ${clockBad.join(", ")}`,
        [
          "renumber the steps in the order they appear left to right, top to bottom or clockwise",
          "reorder the nodes so the walkthrough runs with the direction"
        ],
        8
      );
    }
  }
  const both = scene.edges.filter((e) => e.arrow === "both");
  const none = scene.edges.filter((e) => e.arrow === "none");
  for (const e of both)
    add(
      "flow.bidirectional",
      "minor",
      [e.id],
      { edge: edgeName(e) },
      `${edgeName(e)} has two heads, so it does not say who initiates`,
      [
        `split it into ${edgeName(e)} and ${e.to} -> ${e.from} with their own labels`,
        `keep one direction (${edgeName(e)}) from the caller to the dependency`
      ],
      3
    );
  for (const e of none)
    add(
      "flow.undirected",
      "minor",
      [e.id],
      { edge: edgeName(e) },
      `${edgeName(e)} has no arrowhead`,
      [`give it a direction (${edgeName(e)}) or explain the plain line in the legend`],
      3
    );
  const chain = (id) => {
    const out = /* @__PURE__ */ new Set();
    for (let p = c.parentOf(id); p; p = c.parentOf(p)) out.add(p);
    return out;
  };
  const crossing = model.edges.filter((e) => {
    if (e.label) return false;
    const a = chain(e.from);
    const b = chain(e.to);
    if (a.has(e.to) || b.has(e.from)) return false;
    return [...a].some((g) => !b.has(g)) || [...b].some((g) => !a.has(g));
  });
  if (crossing.length) {
    add(
      "flow.unlabelled-boundary",
      "minor",
      crossing.map((e) => e.id),
      { count: crossing.length, edges: crossing.map(edgeName).slice(0, 6).join("; ") },
      `${crossing.length} unlabelled edge(s) cross a group boundary; the mechanism is left to guess`,
      ["label the edge with the protocol or action (HTTPS, VPC peering, PrivateLink)"],
      Math.min(10, 2 * crossing.length)
    );
  }
  const unconnected = diagnostics.filter((d) => d.code === "DG208");
  for (const d of unconnected) {
    const node3 = String(d.subject?.node ?? "");
    add("flow.unconnected", "minor", node3 ? [node3] : [], { node: node3 }, d.message, d.fixes ?? [], 3);
  }
  Object.assign(m, {
    hiddenHeads: hidden,
    headsOnBends: onBend,
    shortEnds: short,
    sharedTrunks: trunks,
    steps: stepped.length,
    stepInversions: inversions,
    bidirectional: both.length,
    undirected: none.length,
    unlabelledCrossings: crossing.length,
    unconnected: unconnected.length
  });
  c.hard.overlaps += hidden;
}
function measureLayout(c, diagnostics) {
  const { scene, model, add, dir } = c;
  const m = c.metrics.layout;
  const W = scene.width;
  const H = scene.height;
  const edges = scene.edges;
  let forward = 0;
  const against = [];
  for (const e of edges) {
    const a = e.points[0];
    const b = e.points.at(-1);
    if (!a || !b) continue;
    const p = along(dir, b.x - a.x, b.y - a.y);
    if (p > 8) forward++;
    if (e.arrow === "end" && p < -8) against.push(e);
  }
  if (against.length) {
    const share = against.length / Math.max(1, edges.length);
    add(
      "layout.against-flow",
      share > 0.25 ? "major" : "minor",
      against.map((e) => e.id),
      {
        count: against.length,
        sharePct: r1(100 * share),
        direction: dir,
        edges: against.map(edgeName).slice(0, 6).join("; ")
      },
      `${against.length} of ${edges.length} arrowheads point against direction: ${dir}`,
      [
        "list nodes in the order data moves, so the target comes after its source",
        "write the edge the way data flows and use <- or arrow: start only for replies",
        "change direction"
      ],
      6 * against.length
    );
  }
  let crossings2 = 0;
  const crossingPairs = [];
  for (let i = 0; i < edges.length; i++)
    for (let j = i + 1; j < edges.length; j++) {
      const A = edges[i];
      const B = edges[j];
      if (!A || !B) continue;
      let n3 = 0;
      for (const [p, q] of segments(A.points))
        for (const [s, t] of segments(B.points)) {
          const rx = q.x - p.x;
          const ry = q.y - p.y;
          const sx = t.x - s.x;
          const sy = t.y - s.y;
          const den = rx * sy - ry * sx;
          if (Math.abs(den) < 1e-9) continue;
          const tt = ((s.x - p.x) * sy - (s.y - p.y) * sx) / den;
          const uu = ((s.x - p.x) * ry - (s.y - p.y) * rx) / den;
          const e1 = 1.5 / (Math.hypot(rx, ry) || 1);
          const e2 = 1.5 / (Math.hypot(sx, sy) || 1);
          if (tt > e1 && tt < 1 - e1 && uu > e2 && uu < 1 - e2) n3++;
        }
      if (n3) {
        crossings2 += n3;
        crossingPairs.push(`${A.id}x${B.id}`);
      }
    }
  if (crossings2) {
    add(
      "layout.crossings",
      crossings2 > Math.max(3, edges.length / 4) ? "major" : "minor",
      [...new Set(crossingPairs.flatMap((p) => p.split("x")))],
      { crossings: crossings2, pairs: crossingPairs.slice(0, 8).join(" ") },
      `${crossings2} edge crossing(s)`,
      [
        "reorder nodes inside their group so connected nodes sit side by side",
        "try layout: { layering: simplex }",
        "split a hub with many edges into two nodes"
      ],
      3 * crossings2
    );
  }
  const lens = edges.map((e) => ({ e, len: pathLen(e.points) }));
  const sorted = lens.map((l) => l.len).sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length ? sorted.length % 2 ? sorted[mid] ?? 0 : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : 0;
  const long = lens.filter((l) => l.len > 2.5 * median && l.len > 300);
  for (const l of long)
    add(
      "layout.long-edge",
      "minor",
      [l.e.id],
      { edge: edgeName(l.e), lengthPx: Math.round(l.len), medianPx: Math.round(median) },
      `${edgeName(l.e)} is ${Math.round(l.len)}px, ${r1(l.len / (median || 1))}x the median edge`,
      [`move "${l.e.from}" or "${l.e.to}" next to the other in the nodes list`],
      3
    );
  const ink = [
    ...scene.nodes.map((n3) => c.foot.get(n3.id)),
    ...edges.flatMap((e) => [e.labelBox, e.stepBox]),
    ...scene.groups.flatMap((g) => [g.labelBox, g.iconBox]),
    scene.titleBox,
    scene.subtitleBox,
    scene.legend?.box
  ].filter(real);
  const edgeBoxes = edges.map((e) => {
    const xs = e.points.map((p) => p.x);
    const ys = e.points.map((p) => p.y);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs) || 1,
      h: Math.max(...ys) - Math.min(...ys) || 1
    };
  });
  const content = union2([...ink, ...scene.groups.map((g) => g.box), ...edgeBoxes]) ?? {
    x: 0,
    y: 0,
    w: W,
    h: H
  };
  const C = 8;
  const cols = Math.ceil(W / C);
  const rows = Math.ceil(H / C);
  const grid = new Uint8Array(cols * rows);
  const paint = (b) => {
    for (let r = Math.max(0, Math.floor(b.y / C)); r < Math.min(rows, Math.ceil((b.y + b.h) / C)); r++)
      for (let k = Math.max(0, Math.floor(b.x / C)); k < Math.min(cols, Math.ceil((b.x + b.w) / C)); k++)
        grid[r * cols + k] = 1;
  };
  for (const b of ink) paint(b);
  for (const e of edges)
    for (const [s, t] of segments(e.points))
      paint({
        x: Math.min(s.x, t.x) - 2,
        y: Math.min(s.y, t.y) - 2,
        w: Math.abs(t.x - s.x) + 4,
        h: Math.abs(t.y - s.y) + 4
      });
  const c0 = Math.max(0, Math.floor(content.x / C));
  const c1 = Math.min(cols, Math.ceil((content.x + content.w) / C));
  const row0 = Math.max(0, Math.floor(content.y / C));
  const row1 = Math.min(rows, Math.ceil((content.y + content.h) / C));
  const hist = new Array(cols + 1).fill(0);
  let hole = { area: 0, x: 0, y: 0, w: 0, h: 0 };
  for (let r = row0; r < row1; r++) {
    for (let k = c0; k < c1; k++) hist[k] = grid[r * cols + k] ? 0 : (hist[k] ?? 0) + 1;
    const stack = [];
    for (let k = c0; k <= c1; k++) {
      const h = k < c1 ? hist[k] ?? 0 : 0;
      let start = k;
      while (stack.length && (stack.at(-1)?.[1] ?? 0) >= h) {
        const [sc, sh] = stack.pop();
        const area = sh * (k - sc);
        if (area > hole.area)
          hole = { area, x: sc * C, y: (r - sh + 1) * C, w: (k - sc) * C, h: sh * C };
        start = sc;
      }
      stack.push([start, h]);
    }
  }
  const holePct = 100 * hole.w * hole.h / Math.max(1, W * H);
  if (holePct > 22 && Math.min(hole.w, hole.h) >= 80) {
    const inside = scene.groups.filter((g) => !g.overlay && interArea(g.box, hole) > 0.9 * hole.w * hole.h).sort((a, b) => b.depth - a.depth)[0];
    add(
      "layout.empty-space",
      holePct > 32 ? "major" : "minor",
      inside ? [inside.id] : [],
      { holePct: r1(holePct), x: hole.x, y: hole.y, w: hole.w, h: hole.h },
      `an empty ${hole.w}x${hole.h}px rectangle covers ${r1(holePct)}% of the canvas`,
      [
        "change direction so the long chain wraps",
        "move a side branch next to the empty area in the nodes list",
        "split the diagram"
      ],
      Math.max(0, holePct - 18) * 1.5
    );
  }
  const aspect = W / Math.max(1, H);
  const tall = H / Math.max(1, W);
  if (aspect > 3 || tall > 2.5) {
    const wide = aspect > 3;
    const ratio = wide ? aspect : tall;
    const strip = ratio > 4.5 && scene.nodes.length > 6;
    add(
      "layout.aspect",
      strip ? "major" : "minor",
      [],
      { aspect: r2(aspect), width: W, height: H },
      `the canvas is ${r1(ratio)}:1 ${wide ? "wide" : "tall"} (${W}x${H}px)`,
      wide ? ["use direction: down for long chains", "group stages into zones"] : ["use direction: right", "put independent tiers side by side"],
      (ratio - (wide ? 3 : 2.5)) * 10
    );
  }
  if (W > 2400)
    add(
      "layout.too-wide",
      "major",
      [],
      { width: W },
      `the canvas is ${W}px wide (over 2400px)`,
      ["use direction: down", "group related nodes", "split into two diagrams"],
      15
    );
  if (scene.layoutFallback)
    add(
      "layout.fallback",
      "minor",
      [],
      { strategy: scene.layoutFallback },
      `ELK needed the fallback strategy "${scene.layoutFallback}", so spec order may not be kept`,
      ["reorder or regroup nodes and render again", "try layout: { layering: simplex }"],
      5
    );
  for (const d of diagnostics.filter((x) => x.code === "DG207")) {
    const group2 = String(d.subject?.group ?? "");
    add(
      "layout.empty-group",
      "minor",
      group2 ? [group2] : [],
      { group: group2 },
      d.message,
      d.fixes ?? [],
      5
    );
  }
  const cross = horizontalFlow(dir) ? "y" : "x";
  let pairs = 0;
  let inOrder = 0;
  const parents = [void 0, ...model.groups.filter((g) => !g.around).map((g) => g.id)];
  for (const P of parents) {
    const kids = [
      ...model.groups.filter((g) => !g.around && g.parent === P).map((g) => ({ kind: "g", box: c.groups.get(g.id)?.box })),
      ...model.nodes.filter((n3) => n3.parent === P).map((n3) => ({ kind: "n", box: c.nodes.get(n3.id)?.box }))
    ].filter((k) => !!k.box);
    for (let i = 0; i < kids.length; i++)
      for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i];
        const b = kids[j];
        if (!a || !b || a.kind !== b.kind) continue;
        const ca = cross === "y" ? a.box.y + a.box.h / 2 : a.box.x + a.box.w / 2;
        const cb = cross === "y" ? b.box.y + b.box.h / 2 : b.box.x + b.box.w / 2;
        if (Math.abs(ca - cb) < 1) continue;
        const pa = cross === "y" ? [a.box.x, a.box.x + a.box.w] : [a.box.y, a.box.y + a.box.h];
        const pb = cross === "y" ? [b.box.x, b.box.x + b.box.w] : [b.box.y, b.box.y + b.box.h];
        const ov = Math.min(pa[1] ?? 0, pb[1] ?? 0) - Math.max(pa[0] ?? 0, pb[0] ?? 0);
        const span = Math.min((pa[1] ?? 0) - (pa[0] ?? 0), (pb[1] ?? 0) - (pb[0] ?? 0));
        if (ov < 0.5 * span) continue;
        pairs++;
        if (ca < cb) inOrder++;
      }
  }
  Object.assign(m, {
    forwardPct: r1(100 * forward / Math.max(1, edges.length)),
    againstFlow: against.length,
    crossings: crossings2,
    holePct: r1(holePct),
    aspect: r2(aspect),
    longEdges: long.length,
    edgeMedianPx: Math.round(median),
    edgeMaxPx: Math.round(Math.max(0, ...lens.map((l) => l.len))),
    specOrderPct: pairs ? r1(100 * inOrder / pairs) : 100,
    fallback: scene.layoutFallback ?? "none"
  });
}
function measureGrid(c) {
  const { scene, add } = c;
  const m = c.metrics.grid;
  const horizontal = horizontalFlow(scene.direction);
  const F = horizontal ? "x" : "y";
  const FW = horizontal ? "w" : "h";
  const frames = scene.groups.filter((g) => !g.overlay);
  let ragged = 0;
  const gaps = [];
  for (const P of /* @__PURE__ */ new Set([void 0, ...frames.map((g) => g.id)])) {
    const items = [
      ...scene.nodes.filter((n3) => n3.parent === P).map((n3) => ({ id: n3.id, box: n3.box, v: c.foot.get(n3.id) ?? n3.box })),
      ...frames.filter((g) => g.parent === P).map((g) => ({ id: g.id, box: g.box, v: g.box }))
    ].sort((a, b) => a.box[F] - b.box[F]);
    const layers = [];
    for (const it of items) {
      const L = layers.at(-1);
      if (L && it.box[F] < L.end - 0.01) {
        L.items.push(it);
        L.end = Math.max(L.end, it.box[F] + it.box[FW]);
      } else layers.push({ items: [it], end: it.box[F] + it.box[FW] });
    }
    for (const L of layers) {
      if (L.items.length < 2) continue;
      const spread = (f) => Math.max(...L.items.map(f)) - Math.min(...L.items.map(f));
      const st = spread((i) => i.v[F]);
      const ce = spread((i) => i.v[F] + i.v[FW] / 2);
      const en = spread((i) => i.v[F] + i.v[FW]);
      if (Math.min(st, ce, en) > 2) {
        ragged++;
        add(
          "grid.ragged",
          "minor",
          L.items.map((i) => i.id),
          { startPx: r1(st), centerPx: r1(ce), endPx: r1(en), parent: P ?? "(root)" },
          `${L.items.map((i) => `"${i.id}"`).join(", ")} share no start, center or end line (best ${r1(Math.min(st, ce, en))}px off)`,
          ["give the items in this layer the same look and similar label lengths"],
          4
        );
      }
    }
    for (let i = 1; i < layers.length; i++) {
      const prev = layers[i - 1];
      const next = layers[i];
      if (!prev || !next) continue;
      const end = Math.max(...prev.items.map((it) => it.v[F] + it.v[FW]));
      const start = Math.min(...next.items.map((it) => it.v[F]));
      gaps.push(start - end);
    }
  }
  let jogs = 0;
  for (const e of scene.edges) {
    const pts = simplify(e.points);
    for (let i = 1; i < pts.length - 2; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (!a || !b) continue;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len > 0.01 && len < 6) {
        jogs++;
        add(
          "grid.jog",
          "minor",
          [e.id],
          { edge: edgeName(e), jogPx: r2(len), x: r1(a.x), y: r1(a.y) },
          `${edgeName(e)} steps ${r2(len)}px sideways where it could run straight`,
          [`give "${e.from}" and "${e.to}" the same look and size`, "use layout: { merge: false }"],
          3
        );
      }
    }
  }
  let offCenter = 0;
  for (const g of frames) {
    const kids = [
      ...scene.nodes.filter((n3) => n3.parent === g.id).map((n3) => c.foot.get(n3.id)),
      ...frames.filter((x) => x.parent === g.id).map((x) => x.box)
    ];
    const u = union2(kids);
    if (!u) continue;
    const left = u.x - g.box.x;
    const right = g.box.x + g.box.w - (u.x + u.w);
    if (Math.abs(left - right) > 6) {
      offCenter++;
      add(
        "grid.off-center",
        "minor",
        [g.id],
        { leftPx: r1(left), rightPx: r1(right) },
        `the content of "${g.id}" sits ${r1(Math.abs(left - right) / 2)}px off center (left ${r1(left)}, right ${r1(right)})`,
        [`shorten the label of "${g.id}" so it does not widen the frame`],
        3
      );
    }
  }
  const mean = gaps.reduce((s, v) => s + v, 0) / Math.max(1, gaps.length);
  const sd = Math.sqrt(gaps.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, gaps.length));
  const cv = mean > 0 ? sd / mean : 0;
  if (gaps.length >= 3 && cv > 0.35) {
    add(
      "grid.uneven-gaps",
      "minor",
      [],
      {
        gapCv: r2(cv),
        gapMinPx: r1(Math.min(...gaps)),
        gapMaxPx: r1(Math.max(...gaps)),
        layers: gaps.length + 1
      },
      `gaps between layers range from ${r1(Math.min(...gaps))} to ${r1(Math.max(...gaps))}px (spread ${r2(cv)})`,
      ["shorten the longest edge labels; a labelled edge widens its gap"],
      (cv - 0.35) * 40
    );
  }
  Object.assign(m, {
    raggedLayers: ragged,
    jogs,
    offCenterGroups: offCenter,
    gapCv: r2(cv),
    gapMinPx: gaps.length ? r1(Math.min(...gaps)) : 0,
    gapMaxPx: gaps.length ? r1(Math.max(...gaps)) : 0
  });
}
function textItems(scene) {
  const t = tokensFor(scene);
  const canvas = scene.background && scene.background !== "transparent" ? scene.background : t.background;
  const byDepth = [...scene.groups].sort((a, b) => a.depth - b.depth);
  const surfaceAt = (x, y) => {
    let col = canvas;
    for (const g of byDepth) {
      if (g.fill !== "none" && inBox(x, y, g.box)) col = g.fill;
      if (g.inner && inBox(x, y, g.inner.box)) col = g.inner.fill;
    }
    return col;
  };
  const samples = (b) => [
    surfaceAt(b.x + b.w / 2, b.y + b.h / 2),
    surfaceAt(b.x + 1, b.y + 1),
    surfaceAt(b.x + b.w - 1, b.y + 1),
    surfaceAt(b.x + 1, b.y + b.h - 1),
    surfaceAt(b.x + b.w - 1, b.y + b.h - 1)
  ];
  const behind = (g) => {
    if (g.overlay) {
      const under = scene.groups.filter((x) => !x.overlay && x.fill !== "none" && inBox(g.labelBox.x, g.box.y, x.box)).sort((a, b) => b.depth - a.depth)[0];
      if (under) return under.fill;
    }
    let cur = g.overlay ? void 0 : g;
    while (cur) {
      if (cur.fill !== "none") return cur.fill;
      const parent = cur.parent;
      cur = parent ? scene.groups.find((x) => x.id === parent) : void 0;
    }
    return canvas;
  };
  const out = [];
  const push = (id, what, fg, bgs, size, weight) => {
    const valid = bgs.filter(isHex);
    if (!isHex(fg) || !valid.length) return;
    const bg = valid.reduce((w, b) => contrast(fg, b) < contrast(fg, w) ? b : w);
    out.push({ id, what, fg, bg, size, weight });
  };
  if (scene.title && scene.titleBox)
    push("title", "title", t.text, [canvas], scene.title.size, scene.title.weight);
  if (scene.subtitle && scene.subtitleBox)
    push("subtitle", "subtitle", t.muted, [canvas], scene.subtitle.size, scene.subtitle.weight);
  for (const g of scene.groups)
    if (g.label.lines.length)
      push(g.id, "group label", g.labelColor, [behind(g)], g.label.size, g.label.weight);
  for (const n3 of scene.nodes) {
    const shapeFill = n3.color ? mixHex(n3.color, canvas, scene.theme === "dark" ? 0.16 : 0.1) : t.surface;
    const under = (b) => n3.look === "card" ? [t.surface] : n3.look === "shape" ? [shapeFill] : samples(b);
    const ink = n3.look === "card" ? t.text : n3.ink ?? t.text;
    const muted = n3.look === "card" ? t.muted : n3.inkMuted ?? t.muted;
    if (n3.label.lines.length)
      push(n3.id, "label", ink, under(n3.labelBox), n3.label.size, n3.label.weight);
    if (n3.note && n3.noteBox)
      push(n3.id, "note", muted, under(n3.noteBox), n3.note.size, n3.note.weight);
    if (n3.badge) push(n3.id, "badge", t.stepText, [t.stepFill], 10, 600);
  }
  const chipFill = scene.background === "transparent" ? t.background : scene.background ?? t.background;
  for (const e of scene.edges) {
    if (e.label && e.labelBox)
      push(
        e.id,
        "edge label",
        t.edgeLabel,
        samples(e.labelBox).map((u) => mixHex(chipFill, u, 0.92)),
        e.label.size,
        e.label.weight
      );
    if (e.step !== void 0 && e.stepBox) push(e.id, "step", t.stepText, [t.stepFill], 14, 600);
  }
  for (const item of scene.legend?.items ?? [])
    push("legend", `legend ${item.line}`, t.text, [t.surface], item.label.size, item.label.weight);
  return out;
}
function measureQuality(c, scenes) {
  const { scene, add, s } = c;
  const m = c.metrics.quality;
  const nodeSizes = scene.nodes.filter((n4) => n4.label.lines.length).map((n4) => n4.label.size);
  const nodeLabelPx = (nodeSizes.length ? Math.min(...nodeSizes) : 13) * s;
  if (nodeLabelPx < 10) {
    add(
      "quality.label-size",
      nodeLabelPx < 6 ? "blocker" : nodeLabelPx < 8 ? "major" : "minor",
      [],
      {
        nodeLabelPx: r2(nodeLabelPx),
        scale: r2(s),
        canvasW: scene.width,
        width: c.width
      },
      `node labels render at ${r2(nodeLabelPx)}px at this width (${scene.width}px canvas shown at ${r2(s)}x)`,
      [
        "use direction: down so the diagram is narrower",
        "split into an overview and detail diagrams",
        "move detail from labels into note and drop nodes the reader does not need"
      ],
      (10 - nodeLabelPx) * 9
    );
  }
  const others = [
    ...scene.nodes.flatMap((n4) => [n4.note?.size, n4.badge ? 10 : void 0]),
    ...scene.edges.flatMap((e) => [e.label?.size, e.step !== void 0 ? 14 : void 0]),
    ...scene.groups.map((g) => g.label.lines.length ? g.label.size : void 0),
    scene.subtitle?.size,
    ...scene.legend?.items.map((i) => i.label.size) ?? []
  ].filter((v) => typeof v === "number");
  const smallest = others.length ? Math.min(...others) : 0;
  const textPx = smallest * s;
  if (others.length && textPx < 8) {
    add(
      "quality.text-size",
      textPx < 6 ? "major" : "minor",
      [],
      { smallestTextPx: r2(textPx), fontPx: smallest, scale: r2(s) },
      `the smallest text (${smallest}px notes, edge labels or badges) renders at ${r2(textPx)}px`,
      [
        "shorten notes and edge labels or drop them",
        "use direction: down so the diagram is narrower"
      ],
      (8 - textPx) * 4
    );
  }
  const icons = scene.nodes.filter((n4) => n4.look === "icon" && n4.iconBox).map((n4) => n4.iconBox?.h ?? 0);
  const iconPx = (icons.length ? Math.min(...icons) : 48) * s;
  if (icons.length && iconPx < 20)
    add(
      "quality.icon-size",
      "minor",
      [],
      { iconPx: r1(iconPx), scale: r2(s) },
      `icons render at ${r1(iconPx)}px, too small to tell apart`,
      ["use direction: down so the diagram is narrower", "split the diagram"],
      (20 - iconPx) * 1.5
    );
  let failures = 0;
  let worst = 21;
  const themes = [];
  for (const sc of scenes) {
    themes.push(sc.theme);
    for (const it of textItems(sc)) {
      const ratio = contrast(it.fg, it.bg);
      worst = Math.min(worst, ratio);
      const large = it.size >= 24 || it.size >= 18.66 && it.weight >= 600;
      const need = large ? 3 : 4.5;
      if (ratio + 1e-6 >= need) continue;
      failures++;
      add(
        "quality.contrast",
        ratio < 2 ? "blocker" : "major",
        it.id === "title" || it.id === "subtitle" || it.id === "legend" ? [] : [it.id],
        { theme: sc.theme, what: it.what, fg: it.fg, bg: it.bg, ratio: r2(ratio), needed: need },
        `the ${it.what} of "${it.id}" is ${r2(ratio)}:1 against ${it.bg} in the ${sc.theme} theme (needs ${need}:1)`,
        ["drop the custom color: or fill:", "pick a darker or lighter color: for that element"],
        10
      );
    }
  }
  c.hard.contrastFailures = failures;
  const n3 = c.model.nodes.length;
  if (n3 > 25)
    add(
      "quality.node-count",
      n3 > 40 ? "major" : "minor",
      [],
      { nodes: n3 },
      `${n3} nodes in one diagram (6 to 25 read well)`,
      ["split into an overview and detail diagrams", "collapse repeated nodes and use badge: x3"],
      (n3 - 25) * 2
    );
  for (const node3 of scene.nodes) {
    if (node3.label.lines.length > 3)
      add(
        "quality.long-label",
        "minor",
        [node3.id],
        { lines: node3.label.lines.length },
        `the label of "${node3.id}" wraps to ${node3.label.lines.length} lines`,
        ["shorten the label and move detail into note"],
        3
      );
    const text2 = c.model.nodes.find((x) => x.id === node3.id)?.label ?? "";
    const broken = midWordBreak(text2, node3.label.lines);
    if (broken)
      add(
        "quality.mid-word-break",
        "minor",
        [node3.id],
        { at: broken },
        `the label of "${node3.id}" breaks mid-word at "${broken}"`,
        ["use shorter words or a shorter label", "put a line break (\\n) where it should wrap"],
        3
      );
  }
  Object.assign(m, {
    nodeLabelPx: r2(nodeLabelPx),
    smallestTextPx: others.length ? r2(textPx) : "none",
    iconPx: r1(iconPx),
    contrastFailures: failures,
    contrastMin: r2(worst),
    themes: themes.join(","),
    nodes: n3,
    edges: c.model.edges.length,
    groups: c.model.groups.length
  });
}
function midWordBreak(text2, lines) {
  const flat = text2.replace(/\s+/g, " ").trim();
  let pos = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i] ?? "";
    if (!flat.startsWith(line, pos)) return void 0;
    pos += line.length;
    if (flat[pos] === " ") {
      pos++;
      continue;
    }
    const prev = flat[pos - 1] ?? "";
    const next = flat[pos] ?? "";
    if (prev === "-" || /[a-z0-9]/.test(prev) && /[A-Z]/.test(next)) continue;
    return `${prev}|${next}`;
  }
  return void 0;
}
var shortForms;
function aliasesFor(id) {
  if (!shortForms) {
    shortForms = /* @__PURE__ */ new Map();
    for (const alias of Object.keys(aliases())) {
      const target = resolveIcon(alias);
      if (!target) continue;
      const slug = alias.split(":")[1]?.replace(/-/g, " ") ?? "";
      shortForms.set(target, [...shortForms.get(target) ?? [], slug]);
    }
  }
  return shortForms.get(id) ?? [];
}
var C4_TYPE = /\[(person|software system|external (software )?system|system|container|component|database|queue)\b([^\]]*)\]/i;
function measureConventions(c) {
  const { scene, model, add } = c;
  const m = c.metrics.conventions;
  const packs2 = /* @__PURE__ */ new Set();
  for (const n3 of model.nodes) {
    const info = n3.icon ? iconInfo(n3.icon) : void 0;
    if (info) packs2.add(info.pack);
  }
  for (const g of model.groups) {
    const prefix = g.type.split(":")[0];
    if (g.type.includes(":") && prefix) packs2.add(prefix);
  }
  const c4 = model.groups.some((g) => g.type.startsWith("c4:")) || /\bC4\b/.test(`${model.title ?? ""} ${model.subtitle ?? ""}`);
  const vendors = [
    ...["aws", "azure", "gcp", "k8s"].filter((p) => packs2.has(p)),
    ...c4 ? ["c4"] : []
  ];
  const rubrics = vendors.filter((v) => v !== "k8s").map((v) => `conventions-${v}.md`);
  const used = [...new Set(model.edges.map((e) => e.line))].filter((l) => l !== "solid");
  const keyed = new Set((model.legend ?? []).map((l) => l.line));
  const missing = used.filter((l) => !keyed.has(l));
  if (missing.length || c4 && !model.legend?.length) {
    const styles = missing.length ? missing : ["solid"];
    add(
      "conventions.legend-missing",
      "major",
      model.edges.filter((e) => styles.includes(e.line)).map((e) => e.id),
      {
        styles: styles.join(","),
        edges: model.edges.filter((e) => styles.includes(e.line)).length
      },
      `${styles.join(" and ")} line(s) are drawn but no legend says what they mean`,
      [`add legend: { ${styles.map((l) => `${l}: <what it means>`).join(", ")} }`],
      15 * styles.length
    );
  }
  const unusedKey = (model.legend ?? []).filter((l) => !model.edges.some((e) => e.line === l.line));
  if (unusedKey.length)
    add(
      "conventions.legend-unused",
      "minor",
      [],
      { styles: unusedKey.map((l) => l.line).join(",") },
      `the legend explains ${unusedKey.map((l) => l.line).join(", ")} but no edge uses it`,
      [`remove ${unusedKey.map((l) => l.line).join(", ")} from legend:`],
      3 * unusedKey.length
    );
  if (!model.title)
    add(
      "conventions.title-missing",
      "minor",
      [],
      { title: "none" },
      "the diagram has no title, so readers do not know its scope",
      ["add title: <system and scope>, for example title: Orders API on AWS"],
      8
    );
  const allText = norm(
    [
      model.title,
      model.subtitle,
      ...model.nodes.flatMap((n3) => [n3.label, n3.note]),
      ...model.groups.map((g) => g.label),
      ...model.edges.map((e) => e.label),
      ...(model.legend ?? []).map((l) => l.label)
    ].filter(Boolean).join(" | ")
  );
  let shorts = 0;
  let longAws = 0;
  for (const n3 of model.nodes) {
    const info = n3.icon ? iconInfo(n3.icon) : void 0;
    if (info?.pack !== "aws" || info.type !== "service" || !/^(Amazon|AWS) /.test(info.name))
      continue;
    const full = info.name;
    const label = norm(`${n3.label} ${n3.note ?? ""}`);
    if (!hasPhrase(allText, full)) {
      const core = full.replace(/^(Amazon|AWS)\s+/, "");
      const acronym = core.split(/\s+/).filter((w) => /^[A-Z]/.test(w)).map((w) => w[0]).join("");
      const form = [core, acronym.length >= 2 ? acronym : "", ...aliasesFor(info.id)].find(
        (f) => hasPhrase(label, f)
      );
      if (form) {
        shorts++;
        const where = hasPhrase(norm(n3.label), form) ? `"${n3.label}"` : `the note of "${n3.label}"`;
        add(
          "conventions.short-name",
          "minor",
          [n3.id],
          { label: n3.label, shortForm: form, fullName: full },
          `${where} uses the short form "${form}" but "${full}" appears nowhere in the diagram`,
          [`set label: ${full} on one "${info.id}" node, or note: ${full}`],
          4
        );
      }
    }
    const sn = c.nodes.get(n3.id);
    if (sn && sn.label.lines.length > 2) {
      longAws++;
      add(
        "conventions.label-lines",
        "minor",
        [n3.id],
        { lines: sn.label.lines.length },
        `the AWS label of "${n3.id}" runs over ${sn.label.lines.length} lines (the deck allows two)`,
        ["shorten the label and move the rest into note"],
        3
      );
    }
  }
  const callouts = new Set(
    scene.edges.filter((e) => real(e.stepBox)).map((e) => `${r1(e.stepBox?.w ?? 0)}`)
  );
  if (callouts.size > 1)
    add(
      "conventions.callout-sizes",
      "minor",
      [],
      { sizes: [...callouts].join(",") },
      `step callouts come in ${callouts.size} sizes (${[...callouts].join(", ")}px)`,
      ["report it: callout size is set by the renderer, not the spec"],
      5
    );
  let c4Elements = 0;
  let c4Relations = 0;
  if (c4) {
    for (const n3 of model.nodes) {
      const text2 = `${n3.label} ${n3.note ?? ""}`;
      const tag = text2.match(C4_TYPE);
      const lacks = [];
      if (!tag) lacks.push("type");
      const kind = tag?.[1]?.toLowerCase() ?? "";
      if ((kind === "container" || kind === "component") && !/:\s*\S/.test(tag?.[3] ?? ""))
        lacks.push("technology");
      const desc = (n3.note ?? "").replace(/\[[^\]]*\]/g, "").trim();
      if (!desc) lacks.push("description");
      if (lacks.length) {
        c4Elements++;
        add(
          "conventions.c4-element",
          "minor",
          [n3.id],
          { lacks: lacks.join(",") },
          `C4 element "${n3.id}" has no ${lacks.join(", ")}`,
          [`set note: "[Container: <technology>] <what it does>" (or [Person], [Software System])`],
          4
        );
      }
    }
    for (const e of model.edges) {
      const label = e.label ?? "";
      const words = label.replace(/\[[^\]]*\]/g, "").trim();
      const lacks = [];
      if (!label) lacks.push("label");
      else {
        if (!/\[[^\]]+\]/.test(label)) lacks.push("technology");
        if (!/\s/.test(words)) lacks.push("specific intent");
      }
      if (lacks.length) {
        c4Relations++;
        add(
          "conventions.c4-relationship",
          "minor",
          [e.id],
          { edge: edgeName(e), label, lacks: lacks.join(",") },
          `C4 relationship ${edgeName(e)} has no ${lacks.join(", ")}`,
          [`label it with the intent and protocol, for example "Reads orders from [SQL]"`],
          3
        );
      }
    }
  }
  let recolored = 0;
  for (const n3 of model.nodes) {
    const info = n3.icon ? iconInfo(n3.icon) : void 0;
    if (!n3.color || !info || n3.look !== "icon" || !["si", "github"].includes(info.pack)) continue;
    recolored++;
    add(
      "conventions.icon-recolored",
      "minor",
      [n3.id],
      { icon: info.id, color: n3.color },
      `"${n3.id}" recolors the ${info.name} mark to ${n3.color}`,
      [`remove color: from "${n3.id}"`],
      5
    );
  }
  let gcpWrong = 0;
  for (const n3 of model.nodes) {
    const info = n3.icon ? iconInfo(n3.icon) : void 0;
    if (info?.pack !== "gcp") continue;
    const slug = n3.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const product = iconInfo(`gcp:${slug}`) ?? iconInfo(`gcp:${slug.replace(/-/g, "")}`);
    if (!product || product.type === "category" || product.id === info.id) continue;
    if (norm(product.name) !== norm(n3.label)) continue;
    const ok = info.name === product.name || product.category !== "Core products" && info.name === `${product.category} category`;
    if (ok) continue;
    gcpWrong++;
    add(
      "conventions.gcp-product-icon",
      "major",
      [n3.id],
      { label: n3.label, icon: info.id, expected: product.id },
      `"${n3.label}" is drawn with ${info.id}; Google assigns it ${product.id}`,
      [`set icon: ${product.id} on "${n3.id}"`],
      8
    );
  }
  Object.assign(m, {
    vendors: vendors.join(",") || "none",
    title: model.title ? "yes" : "no",
    legendMissing: missing.length,
    shortNames: shorts,
    longAwsLabels: longAws,
    calloutSizes: callouts.size,
    c4Elements,
    c4Relations,
    recolored,
    gcpIconMismatches: gcpWrong
  });
  return { vendors, rubrics };
}
function reviewScene(scene, model, diagnostics, opts) {
  const width = opts.width > 0 ? opts.width : DEFAULT_REVIEW_WIDTH;
  const s = Math.min(1, width / Math.max(1, scene.width));
  const findings = [];
  const spent = /* @__PURE__ */ new Map();
  const metrics = Object.fromEntries(DIMENSIONS.map((d) => [d, {}]));
  const hard = {
    overlaps: 0,
    edgesThroughNodes: 0,
    edgesThroughHeaders: 0,
    edgesThroughLabels: 0,
    offCanvas: 0,
    contrastFailures: 0
  };
  const modelGroups = new Map(model.groups.map((g) => [g.id, g]));
  const modelNodes = new Map(model.nodes.map((n3) => [n3.id, n3]));
  const parentOf = (id) => (modelGroups.get(id) ?? modelNodes.get(id))?.parent;
  const ctx = {
    scene,
    model,
    s,
    width,
    dir: scene.direction,
    nodes: new Map(scene.nodes.map((n3) => [n3.id, n3])),
    groups: new Map(scene.groups.map((g) => [g.id, g])),
    foot: new Map(scene.nodes.map((n3) => [n3.id, footprint(n3)])),
    parentOf,
    isDescendant: (id, ancestor) => {
      for (let p = parentOf(id); p; p = parentOf(p)) if (p === ancestor) return true;
      return false;
    },
    add: (id, severity, subjects, evidence, claim, fixes, cost) => {
      const kind = FINDINGS[id];
      spent.set(id, (spent.get(id) ?? 0) + Math.max(0, cost));
      findings.push({
        id,
        dimension: kind.dimension,
        severity,
        subjects: [...new Set(subjects.filter(Boolean))],
        evidence,
        claim,
        fixes,
        ...kind.rule ? { rule: kind.rule } : {}
      });
    },
    metrics,
    hard
  };
  metrics.quality.width = width;
  measureOverlap(ctx, diagnostics);
  measureFlow(ctx, diagnostics);
  measureLayout(ctx, diagnostics);
  measureGrid(ctx);
  measureQuality(ctx, [scene, ...(opts.themes ?? []).filter((x) => x.theme !== scene.theme)]);
  const { vendors, rubrics } = measureConventions(ctx);
  const dimensions = Object.fromEntries(
    DIMENSIONS.map((d) => {
      let penalty = 0;
      for (const [id, cost] of spent) {
        const kind = FINDINGS[id];
        if (kind.dimension === d) penalty += Math.min(kind.cap, cost);
      }
      return [
        d,
        { score: r1(Math.max(0, 100 - penalty)), weight: WEIGHTS[d], metrics: metrics[d] }
      ];
    })
  );
  const score = r1(DIMENSIONS.reduce((sum, d) => sum + dimensions[d].score * WEIGHTS[d], 0));
  const rank = { blocker: 0, major: 1, minor: 2 };
  findings.sort(
    (a, b) => rank[a.severity] - rank[b.severity] || DIMENSIONS.indexOf(a.dimension) - DIMENSIONS.indexOf(b.dimension)
  );
  const scaled = (b) => ({
    x: r1(b.x * s),
    y: r1(b.y * s),
    w: r1(b.w * s),
    h: r1(b.h * s)
  });
  const elements = [
    ...scene.nodes.map((n3) => ({
      id: n3.id,
      kind: "node",
      label: n3.label.lines.join(" "),
      box: scaled(ctx.foot.get(n3.id) ?? n3.box)
    })),
    ...scene.groups.map((g) => ({
      id: g.id,
      kind: "group",
      label: g.label.lines.join(" "),
      box: scaled(g.box)
    })),
    ...scene.edges.map((e) => {
      const xs = e.points.map((p) => p.x);
      const ys = e.points.map((p) => p.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return {
        id: e.id,
        kind: "edge",
        label: `${edgeName(e)}${e.label ? `: ${e.label.lines.join(" ")}` : ""}`,
        box: scaled({ x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y })
      };
    })
  ];
  return {
    ...opts.name ? { name: opts.name } : {},
    width,
    scale: r2(s),
    theme: scene.theme,
    themes: [
      scene.theme,
      ...(opts.themes ?? []).map((x) => x.theme).filter((t) => t !== scene.theme)
    ],
    canvas: { width: scene.width, height: scene.height },
    display: { width: Math.round(scene.width * s), height: Math.round(scene.height * s) },
    vendors,
    rubrics,
    score,
    pass: score >= 85 && !findings.some((f) => f.severity !== "minor"),
    hard,
    dimensions,
    findings,
    elements
  };
}
async function reviewModel(req) {
  const theme = req.theme ?? req.model.theme;
  const themes = [theme, theme === "light" ? "dark" : "light"];
  const rendered = await renderModel({
    model: req.model,
    formats: ["svg"],
    themes,
    name: req.name,
    fonts: req.fonts,
    animate: "none"
  });
  const scene = rendered.scenes[theme];
  if (!scene) throw new Error(`no ${theme} scene was laid out`);
  const diagnostics = [...req.diagnostics ?? [], ...rendered.diagnostics];
  const report = reviewScene(scene, req.model, diagnostics, {
    width: req.width ?? DEFAULT_REVIEW_WIDTH,
    name: req.name,
    themes: themes.slice(1).flatMap((t) => rendered.scenes[t] ?? [])
  });
  const svg = rendered.artifacts.find((a) => a.format === "svg" && a.theme === theme)?.data;
  const scale = report.display.width / scene.width;
  const png = req.png !== false && typeof svg === "string" ? await renderPng(svg, { scale, fonts: req.fonts }) : void 0;
  return { report, ...png ? { png } : {}, scenes: rendered.scenes, diagnostics };
}
function formatReview(report, opts = {}) {
  const count = (d, sev) => report.findings.filter((f) => f.dimension === d && f.severity === sev).length;
  const lines = [
    `review ${report.name ?? "diagram"}: ${report.canvas.width}x${report.canvas.height} in a ${report.width}px column, seen at ${report.display.width}x${report.display.height} (scale ${report.scale}, ${report.theme})`,
    `score ${report.score}/100  ${report.pass ? "PASS" : "FAIL"} (pass = no blocker or major and score >= 85)`,
    "",
    "dimension    score  weight  blocker  major  minor",
    ...DIMENSIONS.map(
      (d) => `${d.padEnd(12)} ${String(report.dimensions[d].score).padStart(5)}  ${String(report.dimensions[d].weight).padStart(6)}  ${String(count(d, "blocker")).padStart(7)}  ${String(count(d, "major")).padStart(5)}  ${String(count(d, "minor")).padStart(5)}`
    ),
    "",
    `hard: overlaps ${report.hard.overlaps}, through nodes ${report.hard.edgesThroughNodes}, through headers ${report.hard.edgesThroughHeaders}, through labels ${report.hard.edgesThroughLabels}, off canvas ${report.hard.offCanvas}, contrast ${report.hard.contrastFailures}`
  ];
  if (report.rubrics.length) lines.push(`rubrics: ${report.rubrics.join(", ")}`);
  if (report.findings.length) lines.push("");
  for (const f of report.findings) {
    const subjects = f.subjects.length ? ` [${f.subjects.join(", ")}]` : "";
    lines.push(`${f.severity.padEnd(7)} ${f.id}${subjects} ${f.claim}`);
    if (opts.fixes !== false)
      for (const fix of f.fixes.slice(0, 2)) lines.push(`        fix: ${fix}`);
  }
  return lines.join("\n");
}

// src/spec.ts
var import_yaml2 = __toESM(require_dist(), 1);

// src/types.ts
var DIRECTIONS2 = ["right", "down", "left", "up"];
var THEMES = ["light", "dark"];
var EDGE_LINES = ["solid", "dashed", "dotted", "thick"];
var ARROWS = ["end", "start", "both", "none"];
var LOOKS = ["icon", "card", "shape"];
var SHAPES2 = [
  "box",
  "rounded",
  "pill",
  "circle",
  "diamond",
  "hexagon",
  "cylinder",
  "queue",
  "document",
  "note",
  "person",
  "cloud",
  "stack"
];
var ROUTINGS = ["orthogonal", "polyline", "spline"];
var SPACINGS = ["compact", "normal", "loose"];
var ANIMATE_MODES = ["packets", "flow", "relay", "none"];
var SKINS = ["classic", "stage"];

// src/spec.ts
var TOP_KEYS = [
  "$schema",
  "version",
  "title",
  "subtitle",
  "direction",
  "theme",
  "look",
  "arrowhead",
  "layout",
  "animate",
  "skin",
  "background",
  "legend",
  "nodes",
  "groups",
  "edges"
];
var NODE_KEYS = [
  "id",
  "icon",
  "label",
  "note",
  "in",
  "look",
  "shape",
  "color",
  "badge",
  "url",
  "size"
];
var NODE_SYNONYMS = {
  sublabel: "note",
  description: "note",
  parent: "in",
  group: "in",
  link: "url",
  href: "url",
  style: "look"
};
var GROUP_KEYS = [
  "id",
  "type",
  "label",
  "in",
  "color",
  "fill",
  "icon",
  "dashed",
  "contains",
  "around"
];
var GROUP_SYNONYMS = {
  style: "type",
  kind: "type",
  parent: "in",
  children: "contains",
  nodes: "contains"
};
var EDGE_KEYS = ["from", "to", "label", "line", "arrow", "color", "step", "constraint"];
var EDGE_SYNONYMS = {
  style: "line",
  source: "from",
  target: "to",
  text: "label"
};
var LAYOUT_KEYS = ["spacing", "routing", "layering", "merge"];
var ID_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
var isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
function closest(word, options) {
  let best;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const o of options) {
    const d = distance(word.toLowerCase(), o.toLowerCase());
    if (d < bestScore) {
      bestScore = d;
      best = o;
    }
  }
  return bestScore <= Math.max(2, Math.floor(word.length / 3)) ? best : void 0;
}
function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j] ?? 0;
      row[j] = Math.min(
        (row[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = tmp;
    }
  }
  return row[b.length] ?? 0;
}
var OPS = [
  ["<-->", { line: "dashed", arrow: "both" }],
  ["<==>", { line: "thick", arrow: "both" }],
  ["<..>", { line: "dotted", arrow: "both" }],
  ["<->", { line: "solid", arrow: "both" }],
  ["-->", { line: "dashed", arrow: "end" }],
  ["<--", { line: "dashed", arrow: "start" }],
  ["==>", { line: "thick", arrow: "end" }],
  ["<==", { line: "thick", arrow: "start" }],
  ["..>", { line: "dotted", arrow: "end" }],
  ["<..", { line: "dotted", arrow: "start" }],
  ["->", { line: "solid", arrow: "end" }],
  ["<-", { line: "solid", arrow: "start" }],
  ["---", { line: "dashed", arrow: "none" }],
  ["===", { line: "thick", arrow: "none" }],
  ["...", { line: "dotted", arrow: "none" }],
  ["--", { line: "solid", arrow: "none" }]
];
var OP_RE = new RegExp(
  [
    "-\\[([^\\]]*)\\]->",
    "--\\[([^\\]]*)\\]-->",
    ...OPS.map(([op]) => {
      const esc2 = op.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return /[<>]/.test(op) ? esc2 : `(?<=\\s)${esc2}(?=\\s)`;
    })
  ].join("|"),
  "g"
);
var hasOperator = (s) => new RegExp(OP_RE.source).test(` ${s} `);
function labelColon(s) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "[") depth += 1;
    else if (c === "]") depth = Math.max(0, depth - 1);
    else if (c === ":" && depth === 0 && (i + 1 === s.length || /\s/.test(s[i + 1] ?? "")))
      return i;
  }
  return -1;
}
var ICON_ID = /^(aws|azure|gcp|k8s|github|logos|si|tabler|generic):[a-z0-9]/i;
function parseEdgeExpression(expr) {
  let body = expr.trim();
  let label;
  const colon = labelColon(body);
  if (colon >= 0) {
    label = body.slice(colon + 1).trim() || void 0;
    body = body.slice(0, colon).trim();
  }
  const parts = [];
  let last = 0;
  for (const m of body.matchAll(OP_RE)) {
    parts.push(body.slice(last, m.index).trim());
    if (m[1] !== void 0) parts.push({ line: "solid", arrow: "end", label: m[1].trim() });
    else if (m[2] !== void 0) parts.push({ line: "dashed", arrow: "end", label: m[2].trim() });
    else {
      const op = OPS.find(([o]) => o === m[0])?.[1];
      if (op) parts.push({ ...op });
    }
    last = (m.index ?? 0) + m[0].length;
  }
  parts.push(body.slice(last).trim());
  if (parts.length < 3) return `no arrow found in "${expr}" (use ->, -->, <->, -- ...)`;
  const hops = [];
  for (let i = 0; i + 2 < parts.length; i += 2) {
    const a = parts[i];
    const op = parts[i + 1];
    const b = parts[i + 2];
    if (typeof a !== "string" || typeof b !== "string" || typeof op === "string" || !op) {
      return `cannot read "${expr}"`;
    }
    const from = a.split(",").map((s) => s.trim()).filter(Boolean);
    const to = b.split(",").map((s) => s.trim()).filter(Boolean);
    if (!from.length || !to.length) return `missing endpoint in "${expr}"`;
    hops.push({ from, to, op });
  }
  return { hops, label };
}
var hasControlChar = (s) => [...s].some((ch) => {
  const c = ch.charCodeAt(0);
  return c <= 31 || c === 127;
});
function parseSpec(source, filename = "diagram.yaml") {
  const diagnostics = [];
  const err = (code, message, extra = {}) => diagnostics.push({ code, severity: "error", message, ...extra });
  const warn = (code, message, extra = {}) => diagnostics.push({ code, severity: "warning", message, ...extra });
  let raw;
  try {
    raw = /\.json$/i.test(filename) ? JSON.parse(source) : (0, import_yaml2.parse)(source);
  } catch (e) {
    err("DG100", `cannot parse ${filename}: ${e.message.split("\n")[0]}`, {
      fixes: ["fix the YAML/JSON syntax at the reported line"]
    });
    return { diagnostics };
  }
  if (!isObj(raw)) {
    err("DG100", "the spec must be a mapping with nodes, groups and edges", {
      fixes: ["start from `orrery init`"]
    });
    return { diagnostics };
  }
  const unknownKeys = (obj, allowed, synonyms, where) => {
    for (const key of Object.keys(obj)) {
      if (allowed.includes(key) || key in synonyms) continue;
      const near = closest(key, allowed);
      let fixes = near ? [`rename "${key}" to "${near}"`] : [`remove "${key}"; allowed: ${allowed.join(", ")}`];
      if (obj[key] === null) {
        fixes = [
          `a comma inside an unquoted value split it; quote that value, e.g. note: "..., ${key.trim()}"`
        ];
      }
      err("DG108", `unknown key "${key}" in ${where}`, { subject: { where, key }, fixes });
    }
  };
  const pick = (obj, key, synonyms) => {
    if (key in obj) return obj[key];
    for (const [syn, target] of Object.entries(synonyms))
      if (target === key && syn in obj) return obj[syn];
    return void 0;
  };
  const oneOf = (value, options, fallback, where) => {
    if (value === void 0 || value === null || value === "") return fallback;
    const v = String(value).toLowerCase();
    if (options.includes(v)) return v;
    const near = closest(String(value), options);
    err("DG107", `${where} must be one of ${options.join(", ")}; got "${String(value)}"`, {
      subject: { where, value },
      fixes: near ? [`use "${near}"`] : [`use one of ${options.join(", ")}`]
    });
    return fallback;
  };
  const str = (v) => v === void 0 || v === null ? void 0 : typeof v === "string" ? v : String(v);
  const hexColor = (value, key, where, subject, extra = []) => {
    const name = where ? `${where} ${key}` : key;
    if (value === null) {
      warn("DG107", `${name} is empty; an unquoted # starts a YAML comment`, {
        subject: { ...subject, [key]: null },
        fixes: [`write ${key}: "#2563eb" (the quotes keep the # from starting a comment)`]
      });
      return void 0;
    }
    const c = str(value);
    if (c === void 0 || extra.includes(c) || isHex(c)) return c;
    const or = extra.map((w) => ` or "${w}"`).join("");
    err("DG107", `${name} must be a hex color with a leading #${or}; got "${c}"`, {
      subject: { ...subject, [key]: c },
      fixes: [`use a quoted hex color such as "#2563eb"${or}`]
    });
    return c;
  };
  unknownKeys(raw, TOP_KEYS, {}, "the top level");
  const direction = oneOf(raw.direction, DIRECTIONS2, "right", "direction");
  const theme = oneOf(raw.theme, THEMES, "light", "theme");
  const defaultLook = oneOf(raw.look, ["icon", "card"], "icon", "look");
  const layout2 = isObj(raw.layout) ? raw.layout : {};
  if (raw.layout !== void 0 && !isObj(raw.layout))
    err("DG107", "layout must be a mapping", {
      subject: { where: "layout" },
      fixes: ["write layout: { spacing: normal, routing: orthogonal }"]
    });
  unknownKeys(layout2, LAYOUT_KEYS, {}, "layout");
  const routing = oneOf(layout2.routing, ROUTINGS, "orthogonal", "layout.routing");
  let spacing = 1;
  if (typeof layout2.spacing === "number") spacing = Math.max(0.5, Math.min(3, layout2.spacing));
  else {
    const s = oneOf(layout2.spacing, SPACINGS, "normal", "layout.spacing");
    spacing = { compact: 0.75, normal: 1, loose: 1.35 }[s];
  }
  const layering = oneOf(
    layout2.layering,
    ["source", "simplex"],
    "source",
    "layout.layering"
  );
  if (layout2.merge !== void 0 && typeof layout2.merge !== "boolean") {
    err("DG107", "layout.merge must be true or false", {
      subject: { where: "layout.merge" },
      fixes: ["use layout: { merge: false } to give every edge its own port"]
    });
  }
  const merge = layout2.merge !== false;
  const arrowhead = oneOf(raw.arrowhead, ["open", "filled"], "open", "arrowhead");
  const animate = raw.animate === void 0 ? void 0 : raw.animate === true ? "packets" : raw.animate === false ? "none" : oneOf(raw.animate, ANIMATE_MODES, "packets", "animate");
  const skin = oneOf(raw.skin, SKINS, "classic", "skin");
  const background = hexColor(raw.background, "background", "", { where: "background" }, [
    "transparent"
  ]);
  const legend3 = [];
  if (raw.legend !== void 0 && raw.legend !== null && !isObj(raw.legend)) {
    err("DG107", "legend must be a mapping of line style to meaning", {
      subject: { where: "legend" },
      fixes: ["write legend: { dashed: Asynchronous events, dotted: Replication }"]
    });
  } else if (isObj(raw.legend)) {
    for (const [key, value] of Object.entries(raw.legend)) {
      const line = key.trim().toLowerCase();
      const label = str(value)?.trim();
      if (!EDGE_LINES.includes(line)) {
        const near = closest(key, EDGE_LINES);
        const fixes = [near ? `use "${near}"` : `use one of ${EDGE_LINES.join(", ")}`];
        if (value === null) fixes.push("a comma split an unquoted meaning; quote the whole text");
        err("DG107", `legend line style must be one of ${EDGE_LINES.join(", ")}; got "${key}"`, {
          subject: { where: "legend", key },
          fixes
        });
      } else if (!label) {
        err("DG107", `legend ${line} needs a meaning`, {
          subject: { where: "legend", key },
          fixes: [`write ${line}: Asynchronous events`]
        });
      } else legend3.push({ line, label });
    }
  }
  const entries = (value, what) => {
    if (value === void 0 || value === null) return [];
    if (Array.isArray(value)) {
      return value.map((item, i) => {
        if (isObj(item) && typeof item.id === "string") return [item.id, item];
        if (isObj(item) && Object.keys(item).length === 1) {
          const [k, v] = Object.entries(item)[0];
          return [k, v];
        }
        err("DG100", `${what}[${i}] needs an id`, {
          subject: { [what]: i },
          fixes: [`give the item an id: - { id: name, ... }, or use a mapping keyed by id`]
        });
        return [`__invalid_${i}`, void 0];
      });
    }
    if (isObj(value)) return Object.entries(value);
    err("DG100", `${what} must be a mapping of id to definition`, {
      subject: { where: what },
      fixes: [`write ${what}: { my-id: { ... } }`]
    });
    return [];
  };
  const nodes = [];
  const groups = [];
  const ids = /* @__PURE__ */ new Map();
  const pendingContains = [];
  const claim = (id, kind) => {
    if (!ID_RE.test(id)) {
      err("DG103", `id "${id}" may only use letters, digits, "_", "-" and "."`, {
        subject: { id },
        fixes: [`rename to "${id.replace(/[^A-Za-z0-9_.-]+/g, "-")}"`]
      });
    }
    if (ids.has(id)) {
      err("DG103", `duplicate id "${id}" (used by a ${ids.get(id)} and a ${kind})`, {
        subject: { id },
        fixes: [`rename one of them, e.g. "${id}-2"`]
      });
      return false;
    }
    ids.set(id, kind);
    return true;
  };
  for (const [id, value] of entries(raw.groups, "groups")) {
    if (id.startsWith("__invalid_")) continue;
    if (!claim(id, "group")) continue;
    const g = isObj(value) ? value : typeof value === "string" ? { type: value } : {};
    unknownKeys(g, GROUP_KEYS, GROUP_SYNONYMS, `group "${id}"`);
    const type = str(pick(g, "type", GROUP_SYNONYMS)) ?? "box";
    const style2 = resolveGroupStyle(type);
    if (!style2) {
      const near = closest(type, groupStyleKeys());
      err("DG102", `group "${id}" has unknown type "${type}"`, {
        subject: { group: id, type },
        fixes: [
          ...near ? [`use type "${near}"`] : [],
          "run `orrery styles` for every group type"
        ]
      });
    }
    const iconValue = pick(g, "icon", GROUP_SYNONYMS);
    let icon2;
    if (iconValue === false || iconValue === null || iconValue === "none") icon2 = null;
    else if (typeof iconValue === "string") {
      icon2 = resolveIcon(iconValue);
      if (!icon2) {
        err("DG101", `group "${id}" uses unknown icon "${iconValue}"`, {
          subject: { group: id, icon: iconValue },
          fixes: suggestIcons(iconValue).map((s) => `use icon "${s}"`)
        });
      }
    }
    const color = hexColor(pick(g, "color", GROUP_SYNONYMS), "color", `group "${id}"`, {
      group: id
    });
    const fill = hexColor(pick(g, "fill", GROUP_SYNONYMS), "fill", `group "${id}"`, { group: id }, [
      "none"
    ]);
    const dashed = pick(g, "dashed", GROUP_SYNONYMS);
    groups.push({
      id,
      type: style2?.key ?? "box",
      label: str(pick(g, "label", GROUP_SYNONYMS)) ?? style2?.label ?? (style2 ? "" : id),
      parent: str(pick(g, "in", GROUP_SYNONYMS)),
      color,
      fill,
      icon: icon2,
      dashed: typeof dashed === "boolean" ? dashed : void 0
    });
    const containsRaw = pick(g, "contains", GROUP_SYNONYMS);
    const contains2 = typeof containsRaw === "string" ? [containsRaw] : containsRaw;
    if (Array.isArray(contains2)) {
      pendingContains.push([id, contains2.map(String)]);
    } else if (contains2 !== void 0) {
      err("DG107", `group "${id}" contains must be a list of ids`, {
        subject: { group: id },
        fixes: [`write contains: [a, b]`]
      });
    }
    const around = pick(g, "around", GROUP_SYNONYMS);
    if (around !== void 0) {
      const group2 = groups[groups.length - 1];
      if (!Array.isArray(around) || !around.length) {
        err("DG107", `group "${id}" around must be a list of node or group ids`, {
          subject: { group: id },
          fixes: ["write around: [web-a, web-b]"]
        });
      } else if (group2) {
        group2.around = around.map(String);
        if (Array.isArray(contains2)) {
          err("DG104", `group "${id}" uses both around and contains`, {
            subject: { group: id },
            fixes: ["use contains (or in:) to nest, around to outline nodes that live elsewhere"]
          });
        }
      }
    }
  }
  for (const [id, value] of entries(raw.nodes, "nodes")) {
    if (id.startsWith("__invalid_")) continue;
    if (!claim(id, "node")) continue;
    let n3;
    if (isObj(value)) n3 = value;
    else if (typeof value === "string")
      n3 = resolveIcon(value) || ICON_ID.test(value.trim()) ? { icon: value } : { label: value };
    else if (value === null || value === void 0) n3 = {};
    else n3 = { label: String(value) };
    unknownKeys(n3, NODE_KEYS, NODE_SYNONYMS, `node "${id}"`);
    const iconRaw = str(pick(n3, "icon", NODE_SYNONYMS));
    let icon2;
    if (iconRaw) {
      icon2 = resolveIcon(iconRaw);
      if (!icon2) {
        err("DG101", `node "${id}" uses unknown icon "${iconRaw}"`, {
          subject: { node: id, icon: iconRaw },
          fixes: [
            ...suggestIcons(iconRaw).map((s) => `use icon "${s}"`),
            `run \`orrery icons search ${iconRaw.split(":").pop()?.replace(/-/g, " ")}\``
          ]
        });
      }
    }
    const lookRaw = pick(n3, "look", NODE_SYNONYMS);
    let look = icon2 || iconRaw ? defaultLook : "shape";
    if (lookRaw !== void 0) look = oneOf(lookRaw, LOOKS, look, `node "${id}" look`);
    if ((look === "icon" || look === "card") && !icon2 && !iconRaw) look = "shape";
    const shape = oneOf(
      pick(n3, "shape", NODE_SYNONYMS),
      SHAPES2,
      "rounded",
      `node "${id}" shape`
    );
    if (pick(n3, "shape", NODE_SYNONYMS) !== void 0 && icon2 && lookRaw === void 0)
      look = "shape";
    const url = str(pick(n3, "url", NODE_SYNONYMS));
    if (url && hasControlChar(url)) {
      err("DG107", `node "${id}" url must not contain control characters (tab, newline ...)`, {
        subject: { node: id, url },
        fixes: ["use an https:// link on one line, without tabs or line breaks"]
      });
    } else if (url) {
      const bare = url.replace(/\s/g, "");
      if (/^[a-z][a-z0-9+.-]*:/i.test(bare) && !/^(https?|mailto):/i.test(bare)) {
        err("DG107", `node "${id}" url must be http(s), mailto or a relative path`, {
          subject: { node: id, url },
          fixes: ["use an https:// link"]
        });
      }
    }
    const color = hexColor(pick(n3, "color", NODE_SYNONYMS), "color", `node "${id}"`, { node: id });
    const sizeRaw = pick(n3, "size", NODE_SYNONYMS);
    let iconSize = look === "card" ? 32 : 48;
    if (typeof sizeRaw === "number") iconSize = Math.max(16, Math.min(128, sizeRaw));
    else if (sizeRaw !== void 0) {
      const named = { sm: 32, md: 48, lg: 64, xl: 80 };
      const v = named[String(sizeRaw)];
      if (v) iconSize = v;
      else
        err("DG107", `node "${id}" size must be sm, md, lg, xl or a number of px`, {
          subject: { node: id },
          fixes: ["use size: lg, or a number such as 64"]
        });
    }
    const label = str(pick(n3, "label", NODE_SYNONYMS)) ?? (icon2 ? iconInfo(icon2)?.name : void 0) ?? id;
    nodes.push({
      id,
      label,
      note: str(pick(n3, "note", NODE_SYNONYMS)),
      icon: icon2,
      look,
      shape,
      parent: str(pick(n3, "in", NODE_SYNONYMS)),
      color,
      badge: str(pick(n3, "badge", NODE_SYNONYMS)),
      url,
      iconSize
    });
  }
  for (const [groupId, children] of pendingContains) {
    for (const child of children) {
      const target = nodes.find((x) => x.id === child) ?? groups.find((x) => x.id === child);
      if (!target) {
        err("DG104", `group "${groupId}" contains unknown id "${child}"`, {
          subject: { group: groupId, child },
          fixes: suggestIds(child, ids).map((s) => `use "${s}"`)
        });
        continue;
      }
      if (target.parent && target.parent !== groupId) {
        err("DG104", `"${child}" is placed in both "${target.parent}" and "${groupId}"`, {
          subject: { id: child },
          fixes: [`keep one parent for "${child}"`]
        });
        continue;
      }
      target.parent = groupId;
    }
  }
  for (const g of groups) {
    for (const member of g.around ?? []) {
      if (ids.has(member)) continue;
      err("DG104", `group "${g.id}" is drawn around unknown id "${member}"`, {
        subject: { group: g.id, member },
        fixes: suggestIds(member, ids).map((x) => `use "${x}"`)
      });
    }
  }
  for (const item of [...nodes, ...groups]) {
    if (!item.parent) continue;
    const kind = ids.get(item.parent);
    if (kind === "group" && groups.find((x) => x.id === item.parent)?.around) {
      err(
        "DG104",
        `"${item.id}" is in "${item.parent}", an around group, which only outlines other ids`,
        {
          subject: { id: item.id, in: item.parent },
          fixes: [`list "${item.id}" under around: of "${item.parent}" instead`]
        }
      );
      item.parent = void 0;
      continue;
    }
    if (kind === "group") continue;
    err(
      "DG104",
      `"${item.id}" is in "${item.parent}", which ${kind ? "is a node, not a group" : "does not exist"}`,
      {
        subject: { id: item.id, in: item.parent },
        fixes: kind ? [`add a group and put both inside it`] : suggestIds(item.parent, ids, "group").map((s) => `use in: ${s}`)
      }
    );
    item.parent = void 0;
  }
  for (const g of groups) {
    const seen = /* @__PURE__ */ new Set([g.id]);
    let p = g.parent;
    while (p) {
      if (seen.has(p)) {
        err("DG105", `groups "${[...seen].join('", "')}" contain each other`, {
          subject: { group: g.id },
          fixes: [`remove the "in" of one of them`]
        });
        g.parent = void 0;
        break;
      }
      seen.add(p);
      p = groups.find((x) => x.id === p)?.parent;
    }
  }
  const edges = [];
  const rawEdges = raw.edges;
  const list = Array.isArray(rawEdges) ? rawEdges : isObj(rawEdges) ? Object.entries(rawEdges).map(([k, v]) => ({ [k]: v })) : [];
  if (rawEdges !== void 0 && !Array.isArray(rawEdges) && !isObj(rawEdges)) {
    err("DG109", "edges must be a list", {
      subject: { where: "edges" },
      fixes: ["write edges as a list: - a -> b"]
    });
  }
  const endpoint = (id, where) => {
    if (ids.has(id)) return true;
    err("DG106", `${where} connects unknown id "${id}"`, {
      subject: { edge: where, id },
      fixes: suggestIds(id, ids).map((s) => `use "${s}"`)
    });
    return false;
  };
  const push = (from, to, op, label, extra, where) => {
    if (!endpoint(from, where) || !endpoint(to, where)) return;
    const reverse = op.arrow === "start";
    const lineRaw = pick(extra, "line", EDGE_SYNONYMS);
    const arrowRaw = pick(extra, "arrow", EDGE_SYNONYMS);
    const color = hexColor(pick(extra, "color", EDGE_SYNONYMS), "color", where, { edge: where });
    const stepRaw = pick(extra, "step", EDGE_SYNONYMS);
    const step = stepRaw === void 0 ? void 0 : Number(stepRaw);
    if (step !== void 0 && (!Number.isInteger(step) || step < 0 || step > 99)) {
      err("DG107", `${where} step must be a whole number from 0 to 99`, {
        subject: { edge: where },
        fixes: ["use step: 1, 2, 3..."]
      });
    }
    edges.push({
      id: `e${edges.length + 1}`,
      from: reverse ? to : from,
      to: reverse ? from : to,
      label: op.label ?? label,
      line: lineRaw !== void 0 ? oneOf(lineRaw, EDGE_LINES, op.line, `${where} line`) : op.line,
      arrow: arrowRaw !== void 0 ? oneOf(arrowRaw, ARROWS, "end", `${where} arrow`) : reverse ? "end" : op.arrow,
      color,
      step: step !== void 0 && Number.isInteger(step) ? step : void 0,
      constraint: pick(extra, "constraint", EDGE_SYNONYMS) !== false
    });
  };
  const expand = (expr, label, extra, where) => {
    const parsed = parseEdgeExpression(expr);
    if (typeof parsed === "string") {
      err("DG109", `${where}: ${parsed}`, {
        subject: { edge: where },
        fixes: ['write edges as "a -> b", "a -> b: label" or {from: a, to: b}']
      });
      return;
    }
    const single = parsed.hops.length === 1;
    for (const hop of parsed.hops) {
      for (const f of hop.from)
        for (const t of hop.to)
          push(f, t, hop.op, single ? label ?? parsed.label : void 0, extra, where);
    }
    if (!single && (label ?? parsed.label)) {
      warn("DG110", `${where}: a label on a chain applies to no single hop and was dropped`, {
        fixes: ['label one hop inline: "a -[label]-> b -> c"']
      });
    }
  };
  for (const [i, item] of list.entries()) {
    const where = `edges[${i}]`;
    if (typeof item === "string") {
      expand(item, void 0, {}, where);
      continue;
    }
    if (!isObj(item)) {
      err("DG109", `${where} must be a string or a mapping`, {
        subject: { edge: where },
        fixes: ['write "a -> b", "a -> b: label" or { from: a, to: b }']
      });
      continue;
    }
    const keys = Object.keys(item);
    const exprKey = keys.length === 1 && hasOperator(keys[0] ?? "") ? keys[0] : void 0;
    if (exprKey) {
      const v = item[exprKey];
      if (typeof v === "string" || typeof v === "number") expand(exprKey, String(v), {}, where);
      else if (isObj(v)) {
        unknownKeys(
          v,
          EDGE_KEYS.filter((k) => k !== "from" && k !== "to"),
          EDGE_SYNONYMS,
          where
        );
        expand(exprKey, str(pick(v, "label", EDGE_SYNONYMS)), v, where);
      } else expand(exprKey, void 0, {}, where);
      continue;
    }
    unknownKeys(item, EDGE_KEYS, EDGE_SYNONYMS, where);
    const from = pick(item, "from", EDGE_SYNONYMS);
    const to = pick(item, "to", EDGE_SYNONYMS);
    if (from === void 0 || to === void 0) {
      err("DG109", `${where} needs "from" and "to"`, {
        fixes: ['add from: and to:, or write "a -> b"']
      });
      continue;
    }
    const froms = (Array.isArray(from) ? from : [from]).map(String);
    const tos = (Array.isArray(to) ? to : [to]).map(String);
    const op = { line: "solid", arrow: "end" };
    for (const f of froms)
      for (const t of tos) push(f, t, op, str(pick(item, "label", EDGE_SYNONYMS)), item, where);
  }
  if (!nodes.length) {
    err("DG100", "the diagram has no nodes", { fixes: ["add at least one entry under nodes"] });
  }
  if (diagnostics.some((d) => d.severity === "error")) return { diagnostics };
  const model = {
    title: str(raw.title),
    subtitle: str(raw.subtitle),
    direction,
    theme,
    routing,
    spacing,
    layering,
    merge,
    arrowhead,
    ...animate ? { animate } : {},
    skin,
    background: background === "transparent" ? "transparent" : background,
    ...legend3.length ? { legend: legend3 } : {},
    nodes,
    groups,
    edges
  };
  return { model, diagnostics };
}
function suggestIds(id, ids, kind) {
  return [...ids.entries()].filter(([, k]) => !kind || k === kind).map(([candidate]) => [distance(id.toLowerCase(), candidate.toLowerCase()), candidate]).filter(([d]) => d <= Math.max(2, Math.floor(id.length / 3))).sort((a, b) => a[0] - b[0]).slice(0, 3).map(([, c]) => c);
}

// src/cli.ts
var VERSION = true ? "0.6.1" : "dev";
var HELP = `orrery ${VERSION}: architecture and system design diagrams with official icons

Usage:
  orrery render <spec.yaml> [-o out] [-f svg,png,drawio,tsx,html|all] [--theme light|dark|both]
                    [--scale 3] [--skin classic|stage] [--animate packets|flow|relay|none]
                    [--static] [--font extra.ttf]
                    [--strict] [--force] [--json]
  orrery validate <spec.yaml> [--strict] [--json]
  orrery review <spec.yaml> [-o out] [--width 880] [--theme light|dark] [--skin classic|stage]
                    [--strict] [--json]
  orrery icons search <words...> [--pack aws] [--type service] [--limit 15] [--json]
  orrery icons show <icon-id> [-o icon.svg|icon.png] [--theme dark]
  orrery icons list [--pack aws] [--category Compute] [--type service] [--json]
  orrery icons packs [--json]
  orrery icons fetch [pack...]
  orrery styles [--json]
  orrery import mermaid <flowchart.mmd|-> [-o diagram.yaml]
  orrery init [template] [-o diagram.yaml] [--list]
  orrery doctor
  orrery demo [out-dir]

Packs: ${PACK_ORDER.join(", ")}. Spec reference: references/spec.md in the skill folder.
Exit codes: 0 ok, 1 diagram errors (or warnings with --strict), 2 bad command line.`;
var BOOL = /* @__PURE__ */ new Set(["json", "strict", "force", "static", "list", "help", "version"]);
var KNOWN_FLAGS = /* @__PURE__ */ new Set([
  ...BOOL,
  "out",
  "format",
  "theme",
  "scale",
  "animate",
  "skin",
  "font",
  "pack",
  "type",
  "limit",
  "category",
  "width"
]);
function closest2(word, options) {
  const w = word.toLowerCase();
  let best;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const o of options) {
    const prefix = w.length >= 3 && (o.startsWith(w) || w.startsWith(o));
    const d = prefix ? 0 : distance(w, o);
    if (d < bestScore) {
      bestScore = d;
      best = o;
    }
  }
  return bestScore <= Math.max(2, Math.floor(w.length / 3)) ? best : void 0;
}
var SPEC_FILE = /\.(ya?ml|json)$/i;
function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? "";
    if (a === "-h") out.flags.help = true;
    else if (a.startsWith("--") || a.startsWith("-") && (a.length === 2 || a[2] === "=")) {
      const eq = a.indexOf("=");
      let key = a.replace(/^--?/, "");
      let value;
      if (eq > 0) {
        key = a.slice(a.startsWith("--") ? 2 : 1, eq);
        value = a.slice(eq + 1);
      }
      const short = {
        o: "out",
        f: "format",
        t: "theme",
        s: "scale",
        n: "limit",
        p: "pack"
      };
      key = short[key] ?? key;
      if (!KNOWN_FLAGS.has(key)) {
        const near = closest2(key, KNOWN_FLAGS);
        usage(
          `unknown flag ${eq > 0 ? a.slice(0, eq) : a}${near ? ` (did you mean --${near}?)` : ""}`
        );
      }
      if (value === void 0) {
        const next = argv[i + 1];
        if (BOOL.has(key)) value = true;
        else if (key === "animate" && !ANIMATE_MODES.includes(next) && (next === void 0 || next.startsWith("-") || SPEC_FILE.test(next)))
          value = true;
        else {
          value = next;
          i += 1;
        }
      }
      if (value === void 0) usage(`--${key} needs a value`);
      if (BOOL.has(key) && typeof value === "string") {
        const b = value.toLowerCase();
        if (b !== "true" && b !== "false") usage(`--${key} must be true or false (got "${value}")`);
        value = b === "true";
      }
      if (key === "animate" && value !== true && !ANIMATE_MODES.includes(value))
        usage(`--animate must be ${ANIMATE_MODES.join(", ")} (got "${value}")`);
      if (key === "skin" && !SKINS.includes(value))
        usage(`--skin must be ${SKINS.join(", ")} (got "${value}")`);
      const prev = out.flags[key];
      out.flags[key] = key === "font" && typeof prev === "string" ? `${prev},${value}` : value;
    } else out._.push(a);
  }
  return out;
}
function usage(message) {
  process.stderr.write(`orrery: ${message}

${HELP}
`);
  process.exit(2);
}
var sha = (data) => createHash2("sha256").update(data).digest("hex");
function writeAtomic(path, data) {
  mkdirSync2(dirname3(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync2(tmp, data);
  renameSync2(tmp, path);
}
function printDiagnostics(list, json) {
  if (json) return;
  for (const d of list) {
    const where = d.subject ? ` ${JSON.stringify(d.subject)}` : "";
    process.stderr.write(
      `${d.severity === "error" ? "error" : "warn "} ${d.code} ${d.message}${where}
`
    );
    for (const fix of d.fixes ?? []) process.stderr.write(`      fix: ${fix}
`);
  }
}
function readSpec(path) {
  if (path === "-") return { text: readFileSync5(0, "utf8"), name: "diagram", path: "stdin.yaml" };
  const full = resolve(path);
  if (!existsSync5(full)) usage(`no such spec file: ${path}`);
  return {
    text: readFileSync5(full, "utf8"),
    name: basename(full).replace(/\.(ya?ml|json)$/i, ""),
    path: full
  };
}
async function cmdRender(args, validateOnly) {
  const [specPath] = args._;
  if (!specPath) usage(`${validateOnly ? "validate" : "render"} needs a spec file`);
  const json = args.flags.json === true;
  const strict = args.flags.strict === true;
  const spec = readSpec(specPath);
  const parsed = parseSpec(spec.text, spec.path);
  const diagnostics = [...parsed.diagnostics];
  const themeFlag = String(args.flags.theme ?? parsed.model?.theme ?? "light");
  if (!["light", "dark", "both"].includes(themeFlag)) usage(`--theme must be light, dark or both`);
  const themes = themeFlag === "both" ? ["light", "dark"] : [themeFlag];
  const fonts2 = typeof args.flags.font === "string" ? args.flags.font.split(",") : [];
  for (const f of fonts2) if (!existsSync5(f)) usage(`no such file: ${f} (from --font)`);
  const outFlag = typeof args.flags.out === "string" ? args.flags.out : void 0;
  let formats;
  const fmtFlag = typeof args.flags.format === "string" ? args.flags.format : void 0;
  const outExt = outFlag ? extname(outFlag).slice(1).toLowerCase() : "";
  if (fmtFlag) {
    formats = fmtFlag === "all" ? [...FORMATS] : fmtFlag.split(",").map((f) => f.trim());
    for (const f of formats)
      if (!FORMATS.includes(f)) usage(`unknown format "${f}" (use ${FORMATS.join(", ")} or all)`);
  } else if (FORMATS.includes(outExt)) formats = [outExt];
  else formats = ["svg", "png"];
  let base;
  if (!outFlag)
    base = spec.path === "stdin.yaml" ? resolve("diagram") : spec.path.replace(/\.(ya?ml|json)$/i, "");
  else if (outFlag.endsWith("/") || outFlag.endsWith("\\") || existsSync5(outFlag) && statSync(outFlag).isDirectory())
    base = join7(resolve(outFlag), spec.name);
  else
    base = resolve(
      FORMATS.includes(outExt) ? outFlag.slice(0, -(outExt.length + 1)) : outFlag
    );
  let ok = !diagnostics.some((d) => d.severity === "error");
  const receipt = {
    ok,
    spec: { path: spec.path, sha256: sha(spec.text) },
    outputs: [],
    diagnostics
  };
  if (parsed.model && ok) {
    const scale = args.flags.scale !== void 0 ? Number(args.flags.scale) : 3;
    if (!(scale > 0 && scale <= 8)) usage("--scale must be between 0 and 8");
    const animateFlag = args.flags.static === true ? "none" : args.flags.animate === true ? "packets" : args.flags.animate;
    let result;
    try {
      result = await renderModel({
        model: parsed.model,
        formats: validateOnly ? [] : formats,
        themes: validateOnly ? [themes[0] ?? "light"] : themes,
        name: spec.name,
        scale,
        fonts: fonts2,
        animate: animateFlag,
        skin: args.flags.skin
      });
    } catch (e) {
      if (!(e instanceof LibraryError)) throw e;
      result = { artifacts: [], diagnostics: [], scenes: {} };
      diagnostics.push({ severity: "error", code: "DG301", message: e.message, fixes: e.fixes });
    }
    diagnostics.push(...result.diagnostics);
    const scene = result.scenes[themes[0] ?? "light"];
    const iconsByPack = {};
    for (const n3 of parsed.model.nodes) {
      if (n3.icon) {
        const p = n3.icon.split(":")[0] ?? "";
        iconsByPack[p] = (iconsByPack[p] ?? 0) + 1;
      }
    }
    receipt.stats = {
      nodes: parsed.model.nodes.length,
      groups: parsed.model.groups.length,
      edges: parsed.model.edges.length,
      icons: iconsByPack,
      width: scene?.width,
      height: scene?.height
    };
    const blocked = strict && diagnostics.some((d) => d.severity === "warning");
    if (!validateOnly && (!blocked || args.flags.force === true)) {
      const outputs = receipt.outputs;
      for (const a of result.artifacts) {
        const suffix = themes.length > 1 && a.format !== "html" ? `-${a.theme}` : "";
        const path = `${base}${suffix}.${a.format}`;
        writeAtomic(path, a.data);
        outputs.push({
          path,
          format: a.format,
          theme: a.format === "html" ? "light+dark" : a.theme,
          bytes: typeof a.data === "string" ? Buffer.byteLength(a.data) : a.data.length,
          sha256: sha(a.data),
          width: a.width,
          height: a.height
        });
      }
    }
    ok = !blocked;
  }
  receipt.ok = ok && !diagnostics.some((d) => d.severity === "error");
  printDiagnostics(diagnostics, json);
  if (json) process.stdout.write(`${JSON.stringify(receipt, null, 2)}
`);
  else {
    const errors = diagnostics.filter((d) => d.severity === "error").length;
    const warnings = diagnostics.length - errors;
    const outputs = receipt.outputs;
    for (const o of outputs) process.stdout.write(`wrote ${o.path} (${o.bytes} bytes)
`);
    process.stdout.write(
      `${receipt.ok ? "ok" : "failed"}: ${errors} error(s), ${warnings} warning(s)
`
    );
  }
  process.exitCode = receipt.ok ? 0 : 1;
}
async function cmdIcons(args) {
  const [sub, ...rest] = args._;
  const json = args.flags.json === true;
  if (sub === "packs") {
    const packs2 = packInfo();
    if (json) return void process.stdout.write(`${JSON.stringify(packs2, null, 2)}
`);
    for (const key of PACK_ORDER) {
      const p = packs2[key];
      const from = p?.lib ? `npm ${p.lib.npm}@${p.lib.version}, loaded on first use` : "bundled";
      if (p)
        process.stdout.write(
          `${key.padEnd(7)} ${String(p.count).padStart(5)}  ${p.title} (${p.version}; ${from})
        ${p.source}
`
        );
    }
    return;
  }
  if (sub === "fetch") {
    const packs2 = packInfo();
    const wanted = rest.length ? rest : PACK_ORDER.filter((k) => packs2[k]?.lib);
    for (const key of wanted) {
      if (Object.hasOwn(packs2, key)) continue;
      const near = closest2(key, Object.keys(packs2));
      usage(
        `unknown pack "${key}"${near ? ` (did you mean ${near}?)` : ""}; packs: ${PACK_ORDER.join(", ")}`
      );
    }
    for (const key of wanted) {
      const lib = packs2[key]?.lib;
      if (!lib) {
        process.stdout.write(`${key.padEnd(7)} bundled, nothing to fetch
`);
        continue;
      }
      const before = librarySource(lib);
      await loadLibrary(key, lib);
      process.stdout.write(
        `${key.padEnd(7)} ${lib.npm}@${lib.version} ${before ? `from ${before}` : `downloaded to ${cachePath(lib)}`}
`
      );
    }
    return;
  }
  if (sub === "search") {
    const query = rest.join(" ");
    if (!query) usage("icons search needs words, e.g. icons search load balancer");
    const limit = args.flags.limit;
    if (limit !== void 0 && !/^[1-9]\d*$/.test(String(limit)))
      usage(`--limit must be a positive integer (got "${limit}")`);
    const results = searchIcons(query, {
      pack: typeof args.flags.pack === "string" ? args.flags.pack : void 0,
      type: typeof args.flags.type === "string" ? args.flags.type : void 0,
      limit: limit === void 0 ? 15 : Number(limit)
    });
    if (json) return void process.stdout.write(`${JSON.stringify(results, null, 2)}
`);
    if (!results.length) process.stdout.write(`no icons match "${query}"
`);
    const w = Math.max(10, ...results.map((r) => r.id.length));
    for (const r of results)
      process.stdout.write(`${r.id.padEnd(w)}  ${r.name}  [${r.category}, ${r.type}]
`);
    return;
  }
  if (sub === "list") {
    const pack = typeof args.flags.pack === "string" ? args.flags.pack : void 0;
    const category = typeof args.flags.category === "string" ? args.flags.category.toLowerCase() : void 0;
    const type = typeof args.flags.type === "string" ? args.flags.type : void 0;
    const list = allIcons().filter(
      (i) => (!pack || i.pack === pack) && (!category || i.category.toLowerCase().includes(category)) && (!type || i.type === type)
    );
    if (json) return void process.stdout.write(`${JSON.stringify(list, null, 2)}
`);
    for (const i of list) process.stdout.write(`${i.id}  ${i.name}  [${i.category}]
`);
    process.stdout.write(`${list.length} icons
`);
    return;
  }
  if (sub === "show") {
    const [id] = rest;
    if (!id) usage("icons show needs an icon id");
    const info = iconInfo(id);
    if (!info) {
      const near = searchIcons(id.split(":").pop() ?? id, { limit: 5 }).map((i) => i.id);
      process.stderr.write(
        `unknown icon "${id}"${near.length ? `; closest: ${near.join(", ")}` : ""}
`
      );
      process.exitCode = 1;
      return;
    }
    const theme = args.flags.theme === "dark" ? "dark" : "light";
    const t = THEME_TOKENS[theme];
    await loadIconLibraries([info.id]);
    const r = renderIcon(info.id, "s", { theme, background: t.background, ink: t.text });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="96" height="96" viewBox="${r.viewBox.join(" ")}">${r.body}</svg>
`;
    const out = typeof args.flags.out === "string" ? args.flags.out : void 0;
    if (out) {
      writeAtomic(resolve(out), out.endsWith(".png") ? await renderPng(svg, { scale: 4 }) : svg);
      process.stdout.write(`wrote ${resolve(out)}
`);
    }
    process.stdout.write(`${JSON.stringify(info, null, 2)}
`);
    return;
  }
  usage(`unknown icons command "${sub ?? ""}" (use search, show, list, packs or fetch)`);
}
function cmdStyles(args) {
  if (args.flags.json === true) {
    return void process.stdout.write(
      `${JSON.stringify({ groups: GROUP_STYLES, shapes: SHAPES2 }, null, 2)}
`
    );
  }
  process.stdout.write("Group types (groups: { id: { type: ... } }):\n");
  for (const s of Object.values(GROUP_STYLES))
    process.stdout.write(`  ${s.key.padEnd(22)} ${s.description}
`);
  process.stdout.write(`
Node shapes (nodes: { id: { shape: ... } }): ${SHAPES2.join(", ")}
`);
  process.stdout.write(
    "Node looks: icon (icon over label), card (icon beside label in a box), shape\n"
  );
}
function templates() {
  if (!existsSync5(examplesDir)) return [];
  return readdirSync(examplesDir).filter((f) => /\.ya?ml$/.test(f)).map((f) => f.replace(/\.ya?ml$/, "")).sort();
}
function cmdInit(args) {
  const list = templates();
  if (args.flags.list === true) {
    for (const t of list) process.stdout.write(`${t}
`);
    return;
  }
  const name = args._[0] ?? "starter";
  const file = join7(examplesDir, `${name}.yaml`);
  if (!existsSync5(file)) usage(`no template "${name}" (templates: ${list.join(", ")})`);
  const out = resolve(typeof args.flags.out === "string" ? args.flags.out : "diagram.yaml");
  if (existsSync5(out) && args.flags.force !== true) {
    process.stderr.write(`${out} exists; pass --force to overwrite
`);
    process.exitCode = 1;
    return;
  }
  writeAtomic(out, readFileSync5(file, "utf8"));
  process.stdout.write(
    `wrote ${out} from template ${name}
next: orrery render ${basename(out)}
`
  );
}
function cmdImport(args) {
  const [kind, file] = args._;
  if (kind !== "mermaid") usage('import supports "mermaid" (flowchart and graph diagrams)');
  if (!file) usage("import mermaid needs a file, or - for stdin");
  if (file !== "-" && !existsSync5(resolve(file))) usage(`no such file: ${file}`);
  const text2 = file === "-" ? readFileSync5(0, "utf8") : readFileSync5(resolve(file), "utf8");
  const result = importMermaid(text2.replace(/^```mermaid\s*|```\s*$/gm, ""));
  for (const w of result.warnings) process.stderr.write(`warn  ${w}
`);
  const out = typeof args.flags.out === "string" ? resolve(args.flags.out) : void 0;
  if (!out) return void process.stdout.write(result.yaml);
  if (existsSync5(out) && args.flags.force !== true) {
    process.stderr.write(`${out} exists; pass --force to overwrite
`);
    process.exitCode = 1;
    return;
  }
  writeAtomic(out, result.yaml);
  const guessed = Object.keys(result.guessed).length;
  process.stdout.write(
    `wrote ${out}${guessed ? ` (${guessed} icon(s) guessed from exact names)` : ""}
next: add icons, then orrery validate ${basename(out)}
`
  );
}
async function cmdReview(args) {
  const [specPath] = args._;
  if (!specPath) usage("review needs a spec file");
  const width = args.flags.width === void 0 ? DEFAULT_REVIEW_WIDTH : Number(args.flags.width);
  if (!(width > 0)) usage("--width must be a positive number of px");
  const spec = readSpec(specPath);
  const parsed = parseSpec(spec.text, spec.path);
  if (!parsed.model) {
    printDiagnostics(parsed.diagnostics, false);
    process.exitCode = 1;
    return;
  }
  const theme = args.flags.theme ?? parsed.model.theme;
  if (theme !== "light" && theme !== "dark") usage("--theme must be light or dark");
  const fonts2 = typeof args.flags.font === "string" ? args.flags.font.split(",") : [];
  for (const f of fonts2) if (!existsSync5(f)) usage(`no such file: ${f} (from --font)`);
  const outFlag = typeof args.flags.out === "string" ? args.flags.out : void 0;
  const base = outFlag ? resolve(outFlag) : spec.path === "stdin.yaml" ? resolve("diagram") : spec.path.replace(/\.(ya?ml|json)$/i, "");
  const skin = args.flags.skin;
  const run = await reviewModel({
    model: skin ? { ...parsed.model, skin } : parsed.model,
    name: spec.name,
    width,
    theme,
    fonts: fonts2,
    diagnostics: parsed.diagnostics
  });
  writeAtomic(`${base}.review.json`, `${JSON.stringify(run.report, null, 2)}
`);
  if (run.png) writeAtomic(`${base}.review.png`, run.png);
  if (args.flags.json === true) process.stdout.write(`${JSON.stringify(run.report, null, 2)}
`);
  else
    process.stdout.write(
      `${formatReview(run.report)}

wrote ${base}.review.json${run.png ? ` and ${base}.review.png` : ""}
`
    );
  process.exitCode = args.flags.strict === true && !run.report.pass ? 1 : 0;
}
async function cmdDoctor() {
  const checks = [];
  const major = Number(process.versions.node.split(".")[0]);
  checks.push(["node >= 22", major >= 22, process.versions.node]);
  const packs2 = packInfo();
  const total = Object.values(packs2).reduce((s, p) => s + p.count, 0);
  checks.push([
    "icon catalogs",
    total > 1e3,
    `${total} icons in ${Object.keys(packs2).length} packs`
  ]);
  const missing = Object.keys(packs2).filter(
    (p) => !packs2[p]?.lib && !existsSync5(join7(skillRoot, "assets", "icons", `${p}.json`))
  );
  checks.push([
    "bundled icon packs",
    !missing.length,
    missing.length ? `missing ${missing.join(", ")}` : "all present"
  ]);
  const libs = Object.values(packs2).flatMap((p) => p.lib ? [p.lib] : []);
  const ready = libs.filter((lib) => librarySource(lib)).length;
  checks.push([
    "icon libraries",
    true,
    `${ready}/${libs.length} available offline${ready < libs.length ? "; the rest download on first use (icons fetch)" : ""}`
  ]);
  try {
    const parsed = parseSpec(
      "nodes:\n  a: { icon: aws:lambda }\n  b: { icon: generic:database }\nedges:\n  - a -> b\n",
      "doctor.yaml"
    );
    if (!parsed.model) throw new Error(parsed.diagnostics.map((d) => d.message).join("; "));
    const r = await renderModel({
      model: parsed.model,
      formats: ["svg", "png"],
      themes: ["light"],
      name: "doctor"
    });
    const png = r.artifacts.find((a) => a.format === "png");
    checks.push(["layout (ELK)", true, `${r.scenes.light?.width}x${r.scenes.light?.height}`]);
    checks.push([
      "PNG (resvg wasm + Inter)",
      !!png && png.data.length > 1e3,
      `${png?.data.length ?? 0} bytes`
    ]);
  } catch (e) {
    checks.push(["render", false, e.message]);
  }
  for (const [name, pass, detail] of checks)
    process.stdout.write(`${pass ? "ok  " : "FAIL"} ${name.padEnd(26)} ${detail}
`);
  process.exitCode = checks.every(([, p]) => p) ? 0 : 1;
}
async function cmdDemo(args) {
  const dir = resolve(args._[0] ?? "orrery-demo");
  let failed = 0;
  let libraryFixes;
  for (const t of templates()) {
    const text2 = readFileSync5(join7(examplesDir, `${t}.yaml`), "utf8");
    const parsed = parseSpec(text2, `${t}.yaml`);
    if (!parsed.model) {
      failed += 1;
      process.stderr.write(`${t}: ${parsed.diagnostics.map((d) => d.message).join("; ")}
`);
      continue;
    }
    let r;
    try {
      r = await renderModel({
        model: parsed.model,
        formats: ["svg", "png"],
        themes: [parsed.model.theme],
        name: t
      });
    } catch (e) {
      if (!(e instanceof LibraryError)) throw e;
      failed += 1;
      libraryFixes ??= e.fixes;
      process.stderr.write(`${t}: error DG301 ${e.message}
`);
      continue;
    }
    for (const a of r.artifacts) writeAtomic(join7(dir, `${t}.${a.format}`), a.data);
    const scene = r.scenes[parsed.model.theme];
    process.stdout.write(`${t}: ${scene?.width}x${scene?.height}
`);
  }
  for (const fix of libraryFixes ?? []) process.stderr.write(`      fix: ${fix}
`);
  process.stdout.write(`wrote ${dir}
`);
  process.exitCode = failed ? 1 : 0;
}
async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const [cmd, ...rest] = args._;
  args._ = rest;
  if (args.flags.version === true) return void process.stdout.write(`${VERSION}
`);
  if (!cmd || args.flags.help === true || cmd === "help")
    return void process.stdout.write(`${HELP}
`);
  switch (cmd) {
    case "render":
      return cmdRender(args, false);
    case "validate":
    case "check":
      return cmdRender(args, true);
    case "review":
      return cmdReview(args);
    case "icons":
    case "icon":
      return cmdIcons(args);
    case "styles":
      return cmdStyles(args);
    case "init":
      return cmdInit(args);
    case "import":
      return cmdImport(args);
    case "doctor":
      return cmdDoctor();
    case "demo":
      return cmdDemo(args);
    default:
      usage(`unknown command "${cmd}"`);
  }
}

// src/main.ts
main().catch((e) => {
  if (e instanceof LibraryError) {
    process.stderr.write(`error DG301 ${e.message}
`);
    for (const fix of e.fixes) process.stderr.write(`      fix: ${fix}
`);
  } else process.stderr.write(`orrery: ${e?.stack ?? e}
`);
  process.exitCode = 1;
});
