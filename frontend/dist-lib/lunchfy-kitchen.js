import qe, { useState as L, useRef as H, useEffect as X, useCallback as V } from "react";
import { ChevronLeft as Fe, Calendar as Tt, ChevronRight as Ue } from "lucide-react";
import { NavLink as wt, useNavigate as ze, MemoryRouter as Rt } from "react-router-dom";
import { createPortal as Ct } from "react-dom";
import { animate as ue } from "animejs";
var de = { exports: {} }, J = {};
/**
 * @license React
 * react-jsx-runtime.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var Le;
function _t() {
  if (Le) return J;
  Le = 1;
  var r = qe, n = Symbol.for("react.element"), o = Symbol.for("react.fragment"), i = Object.prototype.hasOwnProperty, u = r.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner, g = { key: !0, ref: !0, __self: !0, __source: !0 };
  function k(p, f, d) {
    var l, h = {}, N = null, C = null;
    d !== void 0 && (N = "" + d), f.key !== void 0 && (N = "" + f.key), f.ref !== void 0 && (C = f.ref);
    for (l in f) i.call(f, l) && !g.hasOwnProperty(l) && (h[l] = f[l]);
    if (p && p.defaultProps) for (l in f = p.defaultProps, f) h[l] === void 0 && (h[l] = f[l]);
    return { $$typeof: n, type: p, key: N, ref: C, props: h, _owner: u.current };
  }
  return J.Fragment = o, J.jsx = k, J.jsxs = k, J;
}
var K = {};
/**
 * @license React
 * react-jsx-runtime.development.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var Ie;
function St() {
  return Ie || (Ie = 1, process.env.NODE_ENV !== "production" && function() {
    var r = qe, n = Symbol.for("react.element"), o = Symbol.for("react.portal"), i = Symbol.for("react.fragment"), u = Symbol.for("react.strict_mode"), g = Symbol.for("react.profiler"), k = Symbol.for("react.provider"), p = Symbol.for("react.context"), f = Symbol.for("react.forward_ref"), d = Symbol.for("react.suspense"), l = Symbol.for("react.suspense_list"), h = Symbol.for("react.memo"), N = Symbol.for("react.lazy"), C = Symbol.for("react.offscreen"), D = Symbol.iterator, M = "@@iterator";
    function I(e) {
      if (e === null || typeof e != "object")
        return null;
      var a = D && e[D] || e[M];
      return typeof a == "function" ? a : null;
    }
    var v = r.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
    function w(e) {
      {
        for (var a = arguments.length, s = new Array(a > 1 ? a - 1 : 0), c = 1; c < a; c++)
          s[c - 1] = arguments[c];
        Y("error", e, s);
      }
    }
    function Y(e, a, s) {
      {
        var c = v.ReactDebugCurrentFrame, y = c.getStackAddendum();
        y !== "" && (a += "%s", s = s.concat([y]));
        var j = s.map(function(b) {
          return String(b);
        });
        j.unshift("Warning: " + a), Function.prototype.apply.call(console[e], console, j);
      }
    }
    var x = !1, O = !1, A = !1, $ = !1, Ge = !1, fe;
    fe = Symbol.for("react.module.reference");
    function He(e) {
      return !!(typeof e == "string" || typeof e == "function" || e === i || e === g || Ge || e === u || e === d || e === l || $ || e === C || x || O || A || typeof e == "object" && e !== null && (e.$$typeof === N || e.$$typeof === h || e.$$typeof === k || e.$$typeof === p || e.$$typeof === f || // This needs to include all possible module reference object
      // types supported by any Flight configuration anywhere since
      // we don't know which Flight build this will end up being used
      // with.
      e.$$typeof === fe || e.getModuleId !== void 0));
    }
    function Xe(e, a, s) {
      var c = e.displayName;
      if (c)
        return c;
      var y = a.displayName || a.name || "";
      return y !== "" ? s + "(" + y + ")" : s;
    }
    function he(e) {
      return e.displayName || "Context";
    }
    function P(e) {
      if (e == null)
        return null;
      if (typeof e.tag == "number" && w("Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."), typeof e == "function")
        return e.displayName || e.name || null;
      if (typeof e == "string")
        return e;
      switch (e) {
        case i:
          return "Fragment";
        case o:
          return "Portal";
        case g:
          return "Profiler";
        case u:
          return "StrictMode";
        case d:
          return "Suspense";
        case l:
          return "SuspenseList";
      }
      if (typeof e == "object")
        switch (e.$$typeof) {
          case p:
            var a = e;
            return he(a) + ".Consumer";
          case k:
            var s = e;
            return he(s._context) + ".Provider";
          case f:
            return Xe(e, e.render, "ForwardRef");
          case h:
            var c = e.displayName || null;
            return c !== null ? c : P(e.type) || "Memo";
          case N: {
            var y = e, j = y._payload, b = y._init;
            try {
              return P(b(j));
            } catch {
              return null;
            }
          }
        }
      return null;
    }
    var F = Object.assign, q = 0, me, pe, ve, be, ge, ye, xe;
    function je() {
    }
    je.__reactDisabledLog = !0;
    function Ze() {
      {
        if (q === 0) {
          me = console.log, pe = console.info, ve = console.warn, be = console.error, ge = console.group, ye = console.groupCollapsed, xe = console.groupEnd;
          var e = {
            configurable: !0,
            enumerable: !0,
            value: je,
            writable: !0
          };
          Object.defineProperties(console, {
            info: e,
            log: e,
            warn: e,
            error: e,
            group: e,
            groupCollapsed: e,
            groupEnd: e
          });
        }
        q++;
      }
    }
    function Qe() {
      {
        if (q--, q === 0) {
          var e = {
            configurable: !0,
            enumerable: !0,
            writable: !0
          };
          Object.defineProperties(console, {
            log: F({}, e, {
              value: me
            }),
            info: F({}, e, {
              value: pe
            }),
            warn: F({}, e, {
              value: ve
            }),
            error: F({}, e, {
              value: be
            }),
            group: F({}, e, {
              value: ge
            }),
            groupCollapsed: F({}, e, {
              value: ye
            }),
            groupEnd: F({}, e, {
              value: xe
            })
          });
        }
        q < 0 && w("disabledDepth fell below zero. This is a bug in React. Please file an issue.");
      }
    }
    var re = v.ReactCurrentDispatcher, ne;
    function Z(e, a, s) {
      {
        if (ne === void 0)
          try {
            throw Error();
          } catch (y) {
            var c = y.stack.trim().match(/\n( *(at )?)/);
            ne = c && c[1] || "";
          }
        return `
` + ne + e;
      }
    }
    var ae = !1, Q;
    {
      var et = typeof WeakMap == "function" ? WeakMap : Map;
      Q = new et();
    }
    function ke(e, a) {
      if (!e || ae)
        return "";
      {
        var s = Q.get(e);
        if (s !== void 0)
          return s;
      }
      var c;
      ae = !0;
      var y = Error.prepareStackTrace;
      Error.prepareStackTrace = void 0;
      var j;
      j = re.current, re.current = null, Ze();
      try {
        if (a) {
          var b = function() {
            throw Error();
          };
          if (Object.defineProperty(b.prototype, "props", {
            set: function() {
              throw Error();
            }
          }), typeof Reflect == "object" && Reflect.construct) {
            try {
              Reflect.construct(b, []);
            } catch (_) {
              c = _;
            }
            Reflect.construct(e, [], b);
          } else {
            try {
              b.call();
            } catch (_) {
              c = _;
            }
            e.call(b.prototype);
          }
        } else {
          try {
            throw Error();
          } catch (_) {
            c = _;
          }
          e();
        }
      } catch (_) {
        if (_ && c && typeof _.stack == "string") {
          for (var m = _.stack.split(`
`), R = c.stack.split(`
`), E = m.length - 1, T = R.length - 1; E >= 1 && T >= 0 && m[E] !== R[T]; )
            T--;
          for (; E >= 1 && T >= 0; E--, T--)
            if (m[E] !== R[T]) {
              if (E !== 1 || T !== 1)
                do
                  if (E--, T--, T < 0 || m[E] !== R[T]) {
                    var S = `
` + m[E].replace(" at new ", " at ");
                    return e.displayName && S.includes("<anonymous>") && (S = S.replace("<anonymous>", e.displayName)), typeof e == "function" && Q.set(e, S), S;
                  }
                while (E >= 1 && T >= 0);
              break;
            }
        }
      } finally {
        ae = !1, re.current = j, Qe(), Error.prepareStackTrace = y;
      }
      var W = e ? e.displayName || e.name : "", U = W ? Z(W) : "";
      return typeof e == "function" && Q.set(e, U), U;
    }
    function tt(e, a, s) {
      return ke(e, !1);
    }
    function rt(e) {
      var a = e.prototype;
      return !!(a && a.isReactComponent);
    }
    function ee(e, a, s) {
      if (e == null)
        return "";
      if (typeof e == "function")
        return ke(e, rt(e));
      if (typeof e == "string")
        return Z(e);
      switch (e) {
        case d:
          return Z("Suspense");
        case l:
          return Z("SuspenseList");
      }
      if (typeof e == "object")
        switch (e.$$typeof) {
          case f:
            return tt(e.render);
          case h:
            return ee(e.type, a, s);
          case N: {
            var c = e, y = c._payload, j = c._init;
            try {
              return ee(j(y), a, s);
            } catch {
            }
          }
        }
      return "";
    }
    var z = Object.prototype.hasOwnProperty, Ne = {}, Ee = v.ReactDebugCurrentFrame;
    function te(e) {
      if (e) {
        var a = e._owner, s = ee(e.type, e._source, a ? a.type : null);
        Ee.setExtraStackFrame(s);
      } else
        Ee.setExtraStackFrame(null);
    }
    function nt(e, a, s, c, y) {
      {
        var j = Function.call.bind(z);
        for (var b in e)
          if (j(e, b)) {
            var m = void 0;
            try {
              if (typeof e[b] != "function") {
                var R = Error((c || "React class") + ": " + s + " type `" + b + "` is invalid; it must be a function, usually from the `prop-types` package, but received `" + typeof e[b] + "`.This often happens because of typos such as `PropTypes.function` instead of `PropTypes.func`.");
                throw R.name = "Invariant Violation", R;
              }
              m = e[b](a, b, c, s, null, "SECRET_DO_NOT_PASS_THIS_OR_YOU_WILL_BE_FIRED");
            } catch (E) {
              m = E;
            }
            m && !(m instanceof Error) && (te(y), w("%s: type specification of %s `%s` is invalid; the type checker function must return `null` or an `Error` but returned a %s. You may have forgotten to pass an argument to the type checker creator (arrayOf, instanceOf, objectOf, oneOf, oneOfType, and shape all require an argument).", c || "React class", s, b, typeof m), te(null)), m instanceof Error && !(m.message in Ne) && (Ne[m.message] = !0, te(y), w("Failed %s type: %s", s, m.message), te(null));
          }
      }
    }
    var at = Array.isArray;
    function ie(e) {
      return at(e);
    }
    function it(e) {
      {
        var a = typeof Symbol == "function" && Symbol.toStringTag, s = a && e[Symbol.toStringTag] || e.constructor.name || "Object";
        return s;
      }
    }
    function st(e) {
      try {
        return Te(e), !1;
      } catch {
        return !0;
      }
    }
    function Te(e) {
      return "" + e;
    }
    function we(e) {
      if (st(e))
        return w("The provided key is an unsupported type %s. This value must be coerced to a string before before using it here.", it(e)), Te(e);
    }
    var Re = v.ReactCurrentOwner, ot = {
      key: !0,
      ref: !0,
      __self: !0,
      __source: !0
    }, Ce, _e;
    function lt(e) {
      if (z.call(e, "ref")) {
        var a = Object.getOwnPropertyDescriptor(e, "ref").get;
        if (a && a.isReactWarning)
          return !1;
      }
      return e.ref !== void 0;
    }
    function ct(e) {
      if (z.call(e, "key")) {
        var a = Object.getOwnPropertyDescriptor(e, "key").get;
        if (a && a.isReactWarning)
          return !1;
      }
      return e.key !== void 0;
    }
    function ut(e, a) {
      typeof e.ref == "string" && Re.current;
    }
    function dt(e, a) {
      {
        var s = function() {
          Ce || (Ce = !0, w("%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://reactjs.org/link/special-props)", a));
        };
        s.isReactWarning = !0, Object.defineProperty(e, "key", {
          get: s,
          configurable: !0
        });
      }
    }
    function ft(e, a) {
      {
        var s = function() {
          _e || (_e = !0, w("%s: `ref` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://reactjs.org/link/special-props)", a));
        };
        s.isReactWarning = !0, Object.defineProperty(e, "ref", {
          get: s,
          configurable: !0
        });
      }
    }
    var ht = function(e, a, s, c, y, j, b) {
      var m = {
        // This tag allows us to uniquely identify this as a React Element
        $$typeof: n,
        // Built-in properties that belong on the element
        type: e,
        key: a,
        ref: s,
        props: b,
        // Record the component responsible for creating this element.
        _owner: j
      };
      return m._store = {}, Object.defineProperty(m._store, "validated", {
        configurable: !1,
        enumerable: !1,
        writable: !0,
        value: !1
      }), Object.defineProperty(m, "_self", {
        configurable: !1,
        enumerable: !1,
        writable: !1,
        value: c
      }), Object.defineProperty(m, "_source", {
        configurable: !1,
        enumerable: !1,
        writable: !1,
        value: y
      }), Object.freeze && (Object.freeze(m.props), Object.freeze(m)), m;
    };
    function mt(e, a, s, c, y) {
      {
        var j, b = {}, m = null, R = null;
        s !== void 0 && (we(s), m = "" + s), ct(a) && (we(a.key), m = "" + a.key), lt(a) && (R = a.ref, ut(a, y));
        for (j in a)
          z.call(a, j) && !ot.hasOwnProperty(j) && (b[j] = a[j]);
        if (e && e.defaultProps) {
          var E = e.defaultProps;
          for (j in E)
            b[j] === void 0 && (b[j] = E[j]);
        }
        if (m || R) {
          var T = typeof e == "function" ? e.displayName || e.name || "Unknown" : e;
          m && dt(b, T), R && ft(b, T);
        }
        return ht(e, m, R, y, c, Re.current, b);
      }
    }
    var se = v.ReactCurrentOwner, Se = v.ReactDebugCurrentFrame;
    function B(e) {
      if (e) {
        var a = e._owner, s = ee(e.type, e._source, a ? a.type : null);
        Se.setExtraStackFrame(s);
      } else
        Se.setExtraStackFrame(null);
    }
    var oe;
    oe = !1;
    function le(e) {
      return typeof e == "object" && e !== null && e.$$typeof === n;
    }
    function De() {
      {
        if (se.current) {
          var e = P(se.current.type);
          if (e)
            return `

Check the render method of \`` + e + "`.";
        }
        return "";
      }
    }
    function pt(e) {
      return "";
    }
    var Oe = {};
    function vt(e) {
      {
        var a = De();
        if (!a) {
          var s = typeof e == "string" ? e : e.displayName || e.name;
          s && (a = `

Check the top-level render call using <` + s + ">.");
        }
        return a;
      }
    }
    function Pe(e, a) {
      {
        if (!e._store || e._store.validated || e.key != null)
          return;
        e._store.validated = !0;
        var s = vt(a);
        if (Oe[s])
          return;
        Oe[s] = !0;
        var c = "";
        e && e._owner && e._owner !== se.current && (c = " It was passed a child from " + P(e._owner.type) + "."), B(e), w('Each child in a list should have a unique "key" prop.%s%s See https://reactjs.org/link/warning-keys for more information.', s, c), B(null);
      }
    }
    function Me(e, a) {
      {
        if (typeof e != "object")
          return;
        if (ie(e))
          for (var s = 0; s < e.length; s++) {
            var c = e[s];
            le(c) && Pe(c, a);
          }
        else if (le(e))
          e._store && (e._store.validated = !0);
        else if (e) {
          var y = I(e);
          if (typeof y == "function" && y !== e.entries)
            for (var j = y.call(e), b; !(b = j.next()).done; )
              le(b.value) && Pe(b.value, a);
        }
      }
    }
    function bt(e) {
      {
        var a = e.type;
        if (a == null || typeof a == "string")
          return;
        var s;
        if (typeof a == "function")
          s = a.propTypes;
        else if (typeof a == "object" && (a.$$typeof === f || // Note: Memo only checks outer props here.
        // Inner props are checked in the reconciler.
        a.$$typeof === h))
          s = a.propTypes;
        else
          return;
        if (s) {
          var c = P(a);
          nt(s, e.props, "prop", c, e);
        } else if (a.PropTypes !== void 0 && !oe) {
          oe = !0;
          var y = P(a);
          w("Component %s declared `PropTypes` instead of `propTypes`. Did you misspell the property assignment?", y || "Unknown");
        }
        typeof a.getDefaultProps == "function" && !a.getDefaultProps.isReactClassApproved && w("getDefaultProps is only used on classic React.createClass definitions. Use a static property named `defaultProps` instead.");
      }
    }
    function gt(e) {
      {
        for (var a = Object.keys(e.props), s = 0; s < a.length; s++) {
          var c = a[s];
          if (c !== "children" && c !== "key") {
            B(e), w("Invalid prop `%s` supplied to `React.Fragment`. React.Fragment can only have `key` and `children` props.", c), B(null);
            break;
          }
        }
        e.ref !== null && (B(e), w("Invalid attribute `ref` supplied to `React.Fragment`."), B(null));
      }
    }
    var Ae = {};
    function $e(e, a, s, c, y, j) {
      {
        var b = He(e);
        if (!b) {
          var m = "";
          (e === void 0 || typeof e == "object" && e !== null && Object.keys(e).length === 0) && (m += " You likely forgot to export your component from the file it's defined in, or you might have mixed up default and named imports.");
          var R = pt();
          R ? m += R : m += De();
          var E;
          e === null ? E = "null" : ie(e) ? E = "array" : e !== void 0 && e.$$typeof === n ? (E = "<" + (P(e.type) || "Unknown") + " />", m = " Did you accidentally export a JSX literal instead of a component?") : E = typeof e, w("React.jsx: type is invalid -- expected a string (for built-in components) or a class/function (for composite components) but got: %s.%s", E, m);
        }
        var T = mt(e, a, s, y, j);
        if (T == null)
          return T;
        if (b) {
          var S = a.children;
          if (S !== void 0)
            if (c)
              if (ie(S)) {
                for (var W = 0; W < S.length; W++)
                  Me(S[W], e);
                Object.freeze && Object.freeze(S);
              } else
                w("React.jsx: Static children should always be an array. You are likely explicitly calling React.jsxs or React.jsxDEV. Use the Babel transform instead.");
            else
              Me(S, e);
        }
        if (z.call(a, "key")) {
          var U = P(e), _ = Object.keys(a).filter(function(Et) {
            return Et !== "key";
          }), ce = _.length > 0 ? "{key: someKey, " + _.join(": ..., ") + ": ...}" : "{key: someKey}";
          if (!Ae[U + ce]) {
            var Nt = _.length > 0 ? "{" + _.join(": ..., ") + ": ...}" : "{}";
            w(`A props object containing a "key" prop is being spread into JSX:
  let props = %s;
  <%s {...props} />
React keys must be passed directly to JSX without using spread:
  let props = %s;
  <%s key={someKey} {...props} />`, ce, U, Nt, U), Ae[U + ce] = !0;
          }
        }
        return e === i ? gt(T) : bt(T), T;
      }
    }
    function yt(e, a, s) {
      return $e(e, a, s, !0);
    }
    function xt(e, a, s) {
      return $e(e, a, s, !1);
    }
    var jt = xt, kt = yt;
    K.Fragment = i, K.jsx = jt, K.jsxs = kt;
  }()), K;
}
process.env.NODE_ENV === "production" ? de.exports = _t() : de.exports = St();
var t = de.exports;
const Ye = {
  primary: "kitchen-ui-button",
  secondary: "kitchen-ui-button kitchen-ui-button-secondary",
  ghost: "kitchen-ui-button kitchen-ui-button-ghost",
  danger: "kitchen-ui-button kitchen-ui-button-danger",
  destructive: "kitchen-ui-button kitchen-ui-button-danger"
};
function Gt({
  children: r,
  type: n = "button",
  variant: o = "primary",
  className: i = "",
  ...u
}) {
  return /* @__PURE__ */ t.jsx("button", { type: n, className: `${Ye[o] || Ye.primary} ${i}`.trim(), ...u, children: r });
}
function Ht({ className: r = "", children: n, ...o }) {
  return /* @__PURE__ */ t.jsx("section", { className: `kitchen-ui-card ${r}`.trim(), ...o, children: n });
}
function Xt({ children: r, tone: n = "default" }) {
  return /* @__PURE__ */ t.jsx("span", { className: `kitchen-ui-badge kitchen-ui-badge-${n}`, children: r });
}
function Zt({ label: r, id: n, className: o = "", ...i }) {
  return /* @__PURE__ */ t.jsxs("label", { className: "kitchen-ui-input-group", htmlFor: n, children: [
    r ? /* @__PURE__ */ t.jsx("span", { className: "kitchen-label", children: r }) : null,
    /* @__PURE__ */ t.jsx("input", { id: n, className: `kitchen-ui-input ${o}`.trim(), ...i })
  ] });
}
function Qt({ label: r, id: n, ...o }) {
  return /* @__PURE__ */ t.jsxs("label", { className: "kitchen-ui-input-group", htmlFor: n, children: [
    r ? /* @__PURE__ */ t.jsx("span", { className: "kitchen-label", children: r }) : null,
    /* @__PURE__ */ t.jsx("input", { id: n, type: "date", className: "kitchen-ui-input", ...o })
  ] });
}
function G(r) {
  return /* @__PURE__ */ new Date(`${r}T00:00:00Z`);
}
function Je(r) {
  const n = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth(), r.getUTCDate())), o = n.getUTCDay(), i = o === 0 ? -6 : 1 - o;
  return n.setUTCDate(n.getUTCDate() + i), n.toISOString().slice(0, 10);
}
function Be(r, n) {
  const o = G(r);
  return o.setUTCDate(o.getUTCDate() + n), o.toISOString().slice(0, 10);
}
function Dt() {
  const r = /* @__PURE__ */ new Date();
  return Je(new Date(Date.UTC(r.getFullYear(), r.getMonth(), r.getDate())));
}
function Ot() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
function We(r) {
  if (!r) return "";
  const n = G(r), o = new Date(n);
  o.setUTCDate(o.getUTCDate() + 6);
  const i = (u) => u.toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${i(n)} – ${i(o)}`;
}
function Pt(r, n) {
  const i = new Date(Date.UTC(r, n, 1)).toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
  return i.charAt(0).toUpperCase() + i.slice(1);
}
function Mt(r, n) {
  const o = new Date(Date.UTC(r, n, 1)), i = o.getUTCDay(), u = i === 0 ? -6 : 1 - i, g = new Date(o);
  g.setUTCDate(g.getUTCDate() + u);
  const k = Ot(), p = [], f = new Date(g);
  for (let d = 0; d < 6; d++) {
    const l = [];
    for (let h = 0; h < 7; h++) {
      const N = f.toISOString().slice(0, 10);
      l.push({
        iso: N,
        day: f.getUTCDate(),
        isCurrentMonth: f.getUTCMonth() === n,
        isToday: N === k
      }), f.setUTCDate(f.getUTCDate() + 1);
    }
    l.some((h) => h.isCurrentMonth) && p.push(l);
  }
  return p;
}
const At = ["L", "M", "X", "J", "V", "S", "D"];
function er({ selectedWeek: r, onWeekChange: n, className: o = "" }) {
  const [i, u] = L(!1), g = H(null), k = r ? G(r) : /* @__PURE__ */ new Date(), [p, f] = L(k.getUTCFullYear()), [d, l] = L(k.getUTCMonth());
  X(() => {
    if (!r || i) return;
    const x = G(r);
    f(x.getUTCFullYear()), l(x.getUTCMonth());
  }, [r, i]), X(() => {
    if (!i) return;
    const x = (O) => {
      var A;
      (A = g.current) != null && A.contains(O.target) || u(!1);
    };
    return document.addEventListener("mousedown", x), document.addEventListener("touchstart", x, { passive: !0 }), () => {
      document.removeEventListener("mousedown", x), document.removeEventListener("touchstart", x);
    };
  }, [i]);
  const h = Dt(), N = r === h, C = V(() => {
    n(Be(r, -7));
  }, [r, n]), D = V(() => {
    n(Be(r, 7));
  }, [r, n]), M = V(() => {
    n(h), u(!1);
  }, [n, h]), I = V(
    (x) => {
      n(x), u(!1);
    },
    [n]
  ), v = () => {
    d === 0 ? (f((x) => x - 1), l(11)) : l((x) => x - 1);
  }, w = () => {
    d === 11 ? (f((x) => x + 1), l(0)) : l((x) => x + 1);
  }, Y = Mt(p, d);
  return /* @__PURE__ */ t.jsxs("div", { className: `wdp-container${o ? ` ${o}` : ""}`, ref: g, children: [
    /* @__PURE__ */ t.jsxs("div", { className: "wdp-strip", children: [
      /* @__PURE__ */ t.jsx(
        "button",
        {
          type: "button",
          className: "wdp-chevron",
          onClick: C,
          "aria-label": "Semana anterior",
          children: /* @__PURE__ */ t.jsx(Fe, { size: 14 })
        }
      ),
      /* @__PURE__ */ t.jsxs(
        "button",
        {
          type: "button",
          className: `wdp-date-btn${i ? " is-open" : ""}`,
          onClick: () => u((x) => !x),
          "aria-label": "Seleccionar semana",
          "aria-expanded": i,
          "aria-haspopup": "dialog",
          children: [
            /* @__PURE__ */ t.jsx(Tt, { size: 13, "aria-hidden": "true" }),
            /* @__PURE__ */ t.jsx("span", { className: "wdp-date-label", children: We(r) })
          ]
        }
      ),
      /* @__PURE__ */ t.jsx(
        "button",
        {
          type: "button",
          className: "wdp-chevron",
          onClick: D,
          "aria-label": "Semana siguiente",
          children: /* @__PURE__ */ t.jsx(Ue, { size: 14 })
        }
      ),
      N ? null : /* @__PURE__ */ t.jsx(
        "button",
        {
          type: "button",
          className: "wdp-today-chip",
          onClick: M,
          "aria-label": "Ir a la semana actual",
          children: "Hoy"
        }
      )
    ] }),
    i ? /* @__PURE__ */ t.jsxs("div", { className: "wdp-dropdown", role: "dialog", "aria-label": "Seleccionar semana", "aria-modal": "true", children: [
      /* @__PURE__ */ t.jsxs("div", { className: "wdp-month-header", children: [
        /* @__PURE__ */ t.jsx(
          "button",
          {
            type: "button",
            className: "wdp-month-arrow",
            onClick: v,
            "aria-label": "Mes anterior",
            children: /* @__PURE__ */ t.jsx(Fe, { size: 15 })
          }
        ),
        /* @__PURE__ */ t.jsx("span", { className: "wdp-month-title", children: Pt(p, d) }),
        /* @__PURE__ */ t.jsx(
          "button",
          {
            type: "button",
            className: "wdp-month-arrow",
            onClick: w,
            "aria-label": "Mes siguiente",
            children: /* @__PURE__ */ t.jsx(Ue, { size: 15 })
          }
        ),
        /* @__PURE__ */ t.jsx(
          "button",
          {
            type: "button",
            className: "wdp-today-inline-btn",
            onClick: M,
            children: "Hoy"
          }
        )
      ] }),
      /* @__PURE__ */ t.jsx("div", { className: "wdp-day-labels", "aria-hidden": "true", children: At.map((x) => /* @__PURE__ */ t.jsx("span", { className: "wdp-day-label", children: x }, x)) }),
      /* @__PURE__ */ t.jsx("div", { className: "wdp-grid", children: Y.map((x) => {
        const O = Je(G(x[0].iso)), A = O === r;
        return /* @__PURE__ */ t.jsx(
          "button",
          {
            type: "button",
            className: `wdp-week-row${A ? " is-selected" : ""}`,
            onClick: () => I(O),
            "aria-label": We(O),
            "aria-pressed": A,
            children: x.map(($) => /* @__PURE__ */ t.jsxs(
              "span",
              {
                className: [
                  "wdp-cell",
                  $.isCurrentMonth ? "" : "is-other-month",
                  $.isToday ? "is-today" : ""
                ].filter(Boolean).join(" "),
                children: [
                  $.day,
                  $.isToday ? /* @__PURE__ */ t.jsx("span", { className: "wdp-today-dot", "aria-hidden": "true" }) : null
                ]
              },
              $.iso
            ))
          },
          O
        );
      }) })
    ] }) : null
  ] });
}
function tr({
  as: r = "div",
  className: n = "",
  style: o,
  children: i,
  ...u
}) {
  return /* @__PURE__ */ t.jsx(
    r,
    {
      className: ["kitchen-skeleton", n].filter(Boolean).join(" "),
      style: o,
      "aria-hidden": "true",
      ...u,
      children: i
    }
  );
}
function rr({ children: r, className: n = "", ...o }) {
  return /* @__PURE__ */ t.jsx("button", { className: `kitchen-ui-fab ${n}`.trim(), type: "button", ...o, children: r });
}
function nr({ users: r = [] }) {
  return /* @__PURE__ */ t.jsx("div", { className: "kitchen-ui-avatar-stack", "aria-label": "Participantes", children: r.map((n) => /* @__PURE__ */ t.jsx("span", { className: "kitchen-ui-avatar", title: n.name, children: (n.name || "?").slice(0, 1).toUpperCase() }, n.id || n.name)) });
}
function ar({ left: r, center: n, right: o, mobileExtra: i = null }) {
  return /* @__PURE__ */ t.jsx("header", { className: "kitchen-ui-header", children: /* @__PURE__ */ t.jsxs("div", { className: "kitchen-ui-header-inner", children: [
    /* @__PURE__ */ t.jsx("div", { className: "kitchen-ui-header-left", children: r }),
    /* @__PURE__ */ t.jsxs("div", { className: "kitchen-ui-header-center", children: [
      n,
      i ? /* @__PURE__ */ t.jsx("div", { className: "kitchen-mobile-header-extra", children: i }) : null
    ] }),
    /* @__PURE__ */ t.jsx("div", { className: "kitchen-ui-header-right", children: o })
  ] }) });
}
function ir({ open: r, title: n, children: o, actions: i, onClose: u }) {
  return r ? /* @__PURE__ */ t.jsx("div", { className: "kitchen-ui-sheet-backdrop", role: "presentation", children: /* @__PURE__ */ t.jsxs(
    "div",
    {
      className: "kitchen-ui-sheet",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": n,
      children: [
        /* @__PURE__ */ t.jsxs("div", { className: "kitchen-ui-sheet-header", children: [
          n ? /* @__PURE__ */ t.jsx("h3", { children: n }) : /* @__PURE__ */ t.jsx("span", {}),
          typeof u == "function" ? /* @__PURE__ */ t.jsx(
            "button",
            {
              type: "button",
              className: "kitchen-ui-sheet-close",
              "aria-label": "Cerrar modal",
              onClick: u,
              children: "x"
            }
          ) : null
        ] }),
        /* @__PURE__ */ t.jsx("div", { children: o }),
        i ? /* @__PURE__ */ t.jsx("div", { className: "kitchen-ui-sheet-actions", children: i }) : null
      ]
    }
  ) }) : null;
}
function Ve(r) {
  return /* @__PURE__ */ t.jsx("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", ...r, children: /* @__PURE__ */ t.jsx("path", { d: "M15 18l-6-6 6-6" }) });
}
function sr({
  value: r,
  onChange: n,
  onPrevious: o,
  onNext: i,
  className: u = "",
  ariaLabel: g = "Cambiar semana",
  inputAriaLabel: k = "Semana",
  previousLabel: p = "Ir a la semana anterior",
  nextLabel: f = "Ir a la semana siguiente"
}) {
  const d = ["kitchen-week-nav", u].filter(Boolean).join(" ");
  return /* @__PURE__ */ t.jsxs("div", { className: d, role: "group", "aria-label": g, children: [
    /* @__PURE__ */ t.jsx("button", { className: "kitchen-week-arrow", type: "button", onClick: o, "aria-label": p, children: /* @__PURE__ */ t.jsx(Ve, { className: "kitchen-week-arrow-icon" }) }),
    /* @__PURE__ */ t.jsx("label", { className: "kitchen-field kitchen-week-picker", children: /* @__PURE__ */ t.jsx(
      "input",
      {
        className: "kitchen-input",
        type: "date",
        value: r,
        onChange: (l) => n(l.target.value),
        "aria-label": k
      }
    ) }),
    /* @__PURE__ */ t.jsx("button", { className: "kitchen-week-arrow", type: "button", onClick: i, "aria-label": f, children: /* @__PURE__ */ t.jsx(Ve, { className: "kitchen-week-arrow-icon is-next" }) })
  ] });
}
function or({ links: r = [], onNavigate: n, onPrefetch: o }) {
  return /* @__PURE__ */ t.jsx("nav", { className: "kitchen-ui-bottom-nav", "aria-label": "Navegación inferior", children: /* @__PURE__ */ t.jsx("div", { className: "kitchen-ui-bottom-nav-inner", children: r.map((i) => {
    const u = i.icon;
    return /* @__PURE__ */ t.jsxs(
      wt,
      {
        to: i.to,
        onClick: n,
        onMouseEnter: o ? () => o(i.to) : void 0,
        onTouchStart: o ? () => o(i.to) : void 0,
        className: ({ isActive: g }) => `kitchen-ui-bottom-nav-item${g ? " active" : ""}`,
        children: [
          /* @__PURE__ */ t.jsx(u, { className: "kitchen-bottom-nav-icon" }),
          /* @__PURE__ */ t.jsx("span", { className: "kitchen-bottom-nav-label", children: i.label })
        ]
      },
      i.to
    );
  }) }) });
}
function lr({ onClose: r, className: n = "" }) {
  const o = ze();
  return /* @__PURE__ */ t.jsxs("div", { className: `dinner-upgrade-banner ${n}`.trim(), role: "region", "aria-label": "Función Pro", children: [
    /* @__PURE__ */ t.jsx("div", { className: "dinner-upgrade-banner-icon", "aria-hidden": "true", children: /* @__PURE__ */ t.jsxs("svg", { viewBox: "0 0 24 24", width: "22", height: "22", fill: "none", children: [
      /* @__PURE__ */ t.jsx("path", { d: "M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z", fill: "currentColor", opacity: ".18", stroke: "currentColor", strokeWidth: "1.6", strokeLinejoin: "round" }),
      /* @__PURE__ */ t.jsx("path", { d: "M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z", stroke: "currentColor", strokeWidth: "1.6", strokeLinejoin: "round" }),
      /* @__PURE__ */ t.jsx("path", { d: "M15 9l-4.5 4.5M15 13.5L10.5 9", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", opacity: "0" })
    ] }) }),
    /* @__PURE__ */ t.jsxs("div", { className: "dinner-upgrade-banner-body", children: [
      /* @__PURE__ */ t.jsx("p", { className: "dinner-upgrade-banner-title", children: "Las cenas están disponibles en Pro" }),
      /* @__PURE__ */ t.jsx("p", { className: "dinner-upgrade-banner-desc", children: "Desbloquea planificación completa semanal con comidas y cenas." })
    ] }),
    /* @__PURE__ */ t.jsxs("div", { className: "dinner-upgrade-banner-actions", children: [
      /* @__PURE__ */ t.jsx(
        "button",
        {
          type: "button",
          className: "kitchen-button dinner-upgrade-banner-cta",
          onClick: () => o(`/kitchen/upgrade?from=${encodeURIComponent(window.location.pathname)}`),
          children: "Upgrade License"
        }
      ),
      r ? /* @__PURE__ */ t.jsx(
        "button",
        {
          type: "button",
          className: "dinner-upgrade-banner-close",
          onClick: r,
          "aria-label": "Cerrar",
          children: /* @__PURE__ */ t.jsx("svg", { viewBox: "0 0 16 16", width: "14", height: "14", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ t.jsx("path", { d: "M3 3l10 10M13 3L3 13", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round" }) })
        }
      ) : null
    ] })
  ] });
}
function $t({ className: r = "" }) {
  return /* @__PURE__ */ t.jsx("span", { className: `pro-badge ${r}`.trim(), "aria-label": "Requiere plan Pro", children: "PRO" });
}
function cr({ children: r, className: n = "", title: o, onClick: i, ...u }) {
  const g = ze(), k = (p) => {
    p.stopPropagation(), i ? i(p) : g(`/kitchen/upgrade?from=${encodeURIComponent(window.location.pathname)}`);
  };
  return /* @__PURE__ */ t.jsxs(
    "button",
    {
      type: "button",
      className: `pro-gate-button ${n}`.trim(),
      onClick: k,
      title: o || "Esta función requiere un plan Pro",
      ...u,
      children: [
        r,
        /* @__PURE__ */ t.jsx($t, {})
      ]
    }
  );
}
function ur({
  options: r = [],
  value: n = "",
  onChange: o,
  emptyLabel: i = "Sin categoría",
  placeholder: u = "Buscar...",
  onCreate: g,
  disabled: k = !1
}) {
  const [p, f] = L(!1), [d, l] = L(""), h = H(null), N = H(null), C = r.find((v) => v.value === n) || null, D = d ? r.filter((v) => v.label.toLowerCase().includes(d.toLowerCase())) : r, M = g && d.trim() && !r.some((v) => v.label.toLowerCase() === d.toLowerCase());
  X(() => {
    if (!p) {
      l("");
      return;
    }
    setTimeout(() => {
      var v;
      return (v = N.current) == null ? void 0 : v.focus();
    }, 0);
  }, [p]), X(() => {
    if (!p) return;
    const v = (w) => {
      var Y;
      (Y = h.current) != null && Y.contains(w.target) || f(!1);
    };
    return document.addEventListener("mousedown", v), () => document.removeEventListener("mousedown", v);
  }, [p]);
  const I = (v) => {
    o == null || o(v), f(!1);
  };
  return /* @__PURE__ */ t.jsxs("div", { className: `ss-container${p ? " is-open" : ""}`, ref: h, children: [
    /* @__PURE__ */ t.jsxs(
      "button",
      {
        type: "button",
        className: "ss-trigger",
        onClick: () => !k && f((v) => !v),
        disabled: k,
        "aria-expanded": p,
        "aria-haspopup": "listbox",
        children: [
          C ? /* @__PURE__ */ t.jsxs("span", { className: "ss-trigger-content", children: [
            C.dotColor ? /* @__PURE__ */ t.jsx("span", { className: "ss-dot", style: { background: C.dotColor }, "aria-hidden": "true" }) : null,
            C.label
          ] }) : /* @__PURE__ */ t.jsx("span", { className: "ss-trigger-empty", children: i }),
          /* @__PURE__ */ t.jsx("svg", { className: "ss-chevron", viewBox: "0 0 16 16", width: "14", height: "14", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ t.jsx("path", { d: "M4 6l4 4 4-4", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round" }) })
        ]
      }
    ),
    p ? /* @__PURE__ */ t.jsxs("div", { className: "ss-panel", role: "listbox", children: [
      /* @__PURE__ */ t.jsxs("div", { className: "ss-search-wrapper", children: [
        /* @__PURE__ */ t.jsxs("svg", { viewBox: "0 0 16 16", width: "13", height: "13", fill: "none", "aria-hidden": "true", children: [
          /* @__PURE__ */ t.jsx("circle", { cx: "7", cy: "7", r: "4.5", stroke: "currentColor", strokeWidth: "1.4" }),
          /* @__PURE__ */ t.jsx("path", { d: "M11 11l2 2", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round" })
        ] }),
        /* @__PURE__ */ t.jsx(
          "input",
          {
            ref: N,
            className: "ss-search",
            placeholder: u,
            value: d,
            onChange: (v) => l(v.target.value)
          }
        )
      ] }),
      /* @__PURE__ */ t.jsxs("div", { className: "ss-list", children: [
        /* @__PURE__ */ t.jsx(
          "button",
          {
            type: "button",
            role: "option",
            "aria-selected": !n,
            className: `ss-option${n ? "" : " ss-option-selected"}`,
            onClick: () => I(""),
            children: i
          }
        ),
        D.map((v) => /* @__PURE__ */ t.jsxs(
          "button",
          {
            type: "button",
            role: "option",
            "aria-selected": n === v.value,
            className: `ss-option${n === v.value ? " ss-option-selected" : ""}`,
            onClick: () => I(v.value),
            children: [
              v.dotColor ? /* @__PURE__ */ t.jsx("span", { className: "ss-dot", style: { background: v.dotColor }, "aria-hidden": "true" }) : null,
              /* @__PURE__ */ t.jsx("span", { className: "ss-option-label", children: v.label }),
              n === v.value ? /* @__PURE__ */ t.jsx("svg", { className: "ss-check", viewBox: "0 0 16 16", width: "13", height: "13", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ t.jsx("path", { d: "M3 8l4 4 6-7", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round" }) }) : null
            ]
          },
          v.value
        )),
        D.length === 0 && !M ? /* @__PURE__ */ t.jsx("p", { className: "ss-empty", children: "Sin resultados" }) : null,
        M ? /* @__PURE__ */ t.jsxs(
          "button",
          {
            type: "button",
            className: "ss-option ss-option-create",
            onClick: () => {
              g(d.trim()), f(!1);
            },
            children: [
              /* @__PURE__ */ t.jsx("svg", { viewBox: "0 0 16 16", width: "13", height: "13", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ t.jsx("path", { d: "M8 3v10M3 8h10", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round" }) }),
              "Crear “",
              d,
              "”"
            ]
          }
        ) : null
      ] })
    ] }) : null
  ] });
}
function dr({ children: r }) {
  return /* @__PURE__ */ t.jsx(Rt, { children: r });
}
function fr({ label: r, colorBg: n, colorText: o, onRemove: i, status: u }) {
  return /* @__PURE__ */ t.jsxs(
    "span",
    {
      className: `kitchen-chip ${u ? `is-${u}` : ""}`,
      style: {
        background: n || "#E8F1FF",
        color: o || "#1D4ED8"
      },
      children: [
        /* @__PURE__ */ t.jsx("span", { className: "kitchen-chip-label", children: r }),
        i ? /* @__PURE__ */ t.jsx("button", { className: "kitchen-chip-remove", type: "button", onClick: i, "aria-label": `Eliminar ${r}`, children: "✕" }) : null
      ]
    }
  );
}
function hr({
  title: r,
  subtitle: n,
  leading: o,
  primaryAction: i,
  secondaryLeft: u,
  secondaryRight: g,
  footer: k,
  className: p = "",
  topRef: f,
  noCard: d = !1,
  children: l
}) {
  const h = u != null || g != null, N = d ? p || "" : `page-header${p ? ` ${p}` : ""}`;
  return /* @__PURE__ */ t.jsxs("div", { className: N, children: [
    /* @__PURE__ */ t.jsxs("div", { className: "page-header-top", ref: f, children: [
      o ? /* @__PURE__ */ t.jsx("div", { className: "page-header-leading", children: o }) : null,
      /* @__PURE__ */ t.jsxs("div", { className: "page-header-text", children: [
        /* @__PURE__ */ t.jsx("h1", { className: "page-header-title", children: r }),
        n ? /* @__PURE__ */ t.jsx("p", { className: "page-header-subtitle", children: n }) : null
      ] }),
      i ? /* @__PURE__ */ t.jsx("div", { className: "page-header-primary-action", children: i }) : null
    ] }),
    h ? /* @__PURE__ */ t.jsxs("div", { className: "page-header-controls", children: [
      u ? /* @__PURE__ */ t.jsx("div", { className: "page-header-controls-left", children: u }) : null,
      g ? /* @__PURE__ */ t.jsx("div", { className: "page-header-controls-right", children: g }) : null
    ] }) : null,
    k ? /* @__PURE__ */ t.jsx("div", { className: "page-header-footer", children: k }) : null,
    l
  ] });
}
const Ft = ["D", "L", "M", "X", "J", "V", "S"], Ut = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
function Ke(r) {
  const [n, o, i] = String(r || "").split("-").map(Number);
  if (!n || !o || !i) return null;
  const u = new Date(n, o - 1, i);
  return Number.isNaN(u.getTime()) ? null : u;
}
function Lt(r) {
  const n = Ke(r);
  return n ? Ft[n.getDay()] : "?";
}
function It(r) {
  const n = Ke(r);
  return n ? Ut[n.getDay()] : "";
}
function mr({
  days: r = [],
  selectedDay: n,
  onSelectDay: o,
  weekendChips: i = null
}) {
  const u = (i == null ? void 0 : i.hasSaturday) ?? !1, g = (i == null ? void 0 : i.hasSunday) ?? !1, k = (i == null ? void 0 : i.busy) ?? !1, p = !!i && (!u || !g), f = () => {
    var l, h;
    const d = [
      u ? null : "saturday",
      g ? null : "sunday"
    ].filter(Boolean);
    if (d.length === 2 && typeof (i == null ? void 0 : i.onAddWeekend) == "function") {
      i.onAddWeekend(d);
      return;
    }
    if (d.includes("saturday")) {
      (l = i == null ? void 0 : i.onAddSat) == null || l.call(i);
      return;
    }
    d.includes("sunday") && ((h = i == null ? void 0 : i.onAddSun) == null || h.call(i));
  };
  return /* @__PURE__ */ t.jsxs("div", { className: "kitchen-weekday-tabs", role: "tablist", "aria-label": "Dias de la semana", children: [
    r.map((d) => {
      var D;
      const l = (D = d == null ? void 0 : d.date) == null ? void 0 : D.slice(0, 10);
      if (!l) return null;
      const h = Lt(l), N = It(l), C = n === l;
      return /* @__PURE__ */ t.jsx(
        "button",
        {
          type: "button",
          role: "tab",
          "aria-selected": C,
          "aria-label": N,
          title: N,
          className: `kitchen-weekday-tab${C ? " is-active" : ""}`,
          onClick: () => o(l),
          children: h
        },
        l
      );
    }),
    p ? /* @__PURE__ */ t.jsx(
      "button",
      {
        type: "button",
        className: "kitchen-weekend-chip kitchen-weekend-chip-add",
        onClick: f,
        disabled: k,
        "aria-label": "Anadir fin de semana",
        title: "Anadir fin de semana",
        children: "+ Finde"
      }
    ) : null
  ] });
}
const Yt = {
  check: "✓",
  trophy: "🏆",
  bites: "🍪",
  flame: "🔥",
  spark: "✨"
};
function Bt(r, n) {
  return n && n !== "✓" ? n : Yt[r] ?? "✓";
}
const Wt = 2800;
function pr() {
  const [r, n] = L(null), [o, i] = L(!1), u = H(null), g = H(null), k = V(() => {
    var h;
    clearTimeout(g.current);
    const d = u.current;
    if (!d) {
      i(!1), n(null);
      return;
    }
    if ((h = window.matchMedia) == null ? void 0 : h.call(window, "(prefers-reduced-motion: reduce)").matches) {
      i(!1), n(null);
      return;
    }
    ue(d, {
      translateY: [0, 10],
      opacity: [1, 0],
      scale: [1, 0.95],
      duration: 260,
      ease: "inQuad",
      onComplete: () => {
        i(!1), n(null);
      }
    });
  }, []), p = V((d) => {
    clearTimeout(g.current), n(d), i(!0), requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        var N;
        const l = u.current;
        if (!l) return;
        ((N = window.matchMedia) == null ? void 0 : N.call(window, "(prefers-reduced-motion: reduce)").matches) ? ue(l, { opacity: [0, 1], duration: 180, ease: "linear" }) : ue(l, {
          translateY: [28, 0],
          opacity: [0, 1],
          scale: [0.94, 1],
          duration: 400,
          ease: "outBack"
        }), g.current = window.setTimeout(k, Wt);
      });
    });
  }, [k]);
  if (X(() => {
    const d = (l) => {
      const h = (l == null ? void 0 : l.detail) ?? {};
      p({
        title: h.title ?? "¡Completado!",
        subtitle: h.subtitle ?? "",
        icon: h.icon ?? "✓",
        variant: h.variant ?? "check"
      });
    };
    return window.addEventListener("lunchfy:milestone", d), () => {
      window.removeEventListener("lunchfy:milestone", d), clearTimeout(g.current);
    };
  }, [p]), !o || !r) return null;
  const f = Bt(r.variant, r.icon);
  return Ct(
    /* @__PURE__ */ t.jsx(
      "div",
      {
        className: "lf-milestone-overlay",
        role: "status",
        "aria-live": "polite",
        "aria-atomic": "true",
        children: /* @__PURE__ */ t.jsxs(
          "div",
          {
            ref: u,
            className: `lf-milestone-card lf-milestone-card--${r.variant ?? "check"}`,
            style: { opacity: 0 },
            children: [
              /* @__PURE__ */ t.jsx("div", { className: "lf-milestone-icon-wrap", "aria-hidden": "true", children: /* @__PURE__ */ t.jsx("span", { className: "lf-milestone-icon", children: f }) }),
              /* @__PURE__ */ t.jsxs("div", { className: "lf-milestone-body", children: [
                /* @__PURE__ */ t.jsx("p", { className: "lf-milestone-title", children: r.title }),
                r.subtitle ? /* @__PURE__ */ t.jsx("p", { className: "lf-milestone-subtitle", children: r.subtitle }) : null
              ] }),
              /* @__PURE__ */ t.jsx(
                "button",
                {
                  type: "button",
                  className: "lf-milestone-close",
                  onClick: k,
                  "aria-label": "Cerrar notificación",
                  children: "×"
                }
              )
            ]
          }
        )
      }
    ),
    document.body
  );
}
export {
  nr as AvatarStack,
  Xt as Badge,
  or as BottomNav,
  Gt as Button,
  Ht as Card,
  fr as CategoryChip,
  Qt as DatePickerField,
  lr as DinnerUpgradeBanner,
  rr as Fab,
  ar as Header,
  Zt as Input,
  dr as KitchenProvider,
  pr as MilestoneToast,
  ir as ModalSheet,
  hr as PageHeader,
  $t as ProBadge,
  cr as ProGateButton,
  ur as SearchableSelect,
  tr as Skeleton,
  er as WeekDatePicker,
  mr as WeekDayTabs,
  sr as WeekNavigator
};
