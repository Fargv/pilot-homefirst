var __dsPreview = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // <define:import.meta.env>
  var init_define_import_meta_env = __esm({
    "<define:import.meta.env>"() {
    }
  });

  // ds-raw:__ds_raw__
  var require_ds_raw = __commonJS({
    "ds-raw:__ds_raw__"(exports, module) {
      init_define_import_meta_env();
      module.exports = window.LunchfyKitchen;
    }
  });

  // shim:react-shim
  var require_react_shim = __commonJS({
    "shim:react-shim"(exports, module) {
      init_define_import_meta_env();
      var R = window.React;
      function jsx2(t, p, k) {
        return R.createElement(t, k === void 0 ? p : Object.assign({ key: k }, p));
      }
      module.exports = R;
      module.exports.jsx = jsx2;
      module.exports.jsxs = jsx2;
      module.exports.jsxDEV = jsx2;
      module.exports.Fragment = R.Fragment;
    }
  });

  // .design-sync/previews/BottomNav.tsx
  var BottomNav_exports = {};
  __export(BottomNav_exports, {
    Default: () => Default
  });
  init_define_import_meta_env();

  // ds-shim:ds
  var ds_exports = {};
  __export(ds_exports, {
    default: () => ds_default
  });
  init_define_import_meta_env();
  __reExport(ds_exports, __toESM(require_ds_raw()));
  var g = window.LunchfyKitchen;
  var ds_default = "default" in g ? g.default : g;

  // .design-sync/previews/BottomNav.tsx
  var import_jsx_runtime = __toESM(require_react_shim());
  var HomeIcon = ({ className }) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z", strokeLinecap: "round", strokeLinejoin: "round" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("polyline", { points: "9,22 9,12 15,12 15,22" })
  ] });
  var SearchIcon = ({ className }) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: 11, cy: 11, r: 8 }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M21 21l-4.35-4.35", strokeLinecap: "round" })
  ] });
  var CalendarIcon = ({ className }) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { x: 3, y: 4, width: 18, height: 18, rx: 2 }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: 16, y1: 2, x2: 16, y2: 6 }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: 8, y1: 2, x2: 8, y2: 6 }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: 3, y1: 10, x2: 21, y2: 10 })
  ] });
  var UserIcon = ({ className }) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: 12, cy: 7, r: 4 })
  ] });
  var links = [
    { to: "/semana", label: "Semana", icon: HomeIcon },
    { to: "/buscar", label: "Buscar", icon: SearchIcon },
    { to: "/lista", label: "Lista", icon: CalendarIcon },
    { to: "/perfil", label: "Perfil", icon: UserIcon }
  ];
  function Default() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ds_exports.BottomNav, { links });
  }
  return __toCommonJS(BottomNav_exports);
})();
