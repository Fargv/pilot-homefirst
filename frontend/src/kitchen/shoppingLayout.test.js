import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const css = fs.readFileSync(new URL("./kitchen.css", import.meta.url), "utf8");

test("shopping rows reserve a readable name column on desktop", () => {
  assert.match(css, /\.shopping-item-main\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\)\s+auto;/);
  assert.match(css, /@media \(min-width: 480px\)[\s\S]*?grid-template-columns:\s*auto\s+minmax\(10rem,\s*1fr\)\s+auto;/);
});

test("shopping controls move to a second row on narrow screens", () => {
  assert.match(css, /@media \(max-width: 479px\)[\s\S]*?\.shopping-item-controls\s*\{[\s\S]*?grid-column:\s*2;[\s\S]*?margin-left:\s*0;/);
});

test("ingredient names are not allowed to break at every character", () => {
  assert.doesNotMatch(css, /\.shopping-item-name-col[^{]*\{[^}]*overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(css, /\.shopping-item-flat \.shopping-item-text[^{]*\{[^}]*overflow-wrap:\s*anywhere/);
  assert.match(css, /\.shopping-item-flat \.shopping-item-text[\s\S]*?word-break:\s*normal;/);
});
