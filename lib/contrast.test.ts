// Contraste de texto (WCAG, mínimo 4,5:1) lendo os tokens direto do globals.css. Rode: npm test
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
function tokens(selector: string) {
  const body = css.match(new RegExp(`^${selector.replace(".", "\\.")} \\{([\\s\\S]*?)^\\}`, "m"))![1];
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2].toLowerCase()]));
}
const light = tokens(":root"), dark = { ...light, ...tokens(".dark") };
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c: number[]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
/** color-mix(in srgb, a p%, b) */
const mix = (a: string, p: number, b: string) => hex(rgb(a).map((v, i) => v * p + rgb(b)[i] * (1 - p)));
const lum = (h: string) => { const [r, g, b] = rgb(h).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const TAGS = ["neutro", "areia", "champanhe", "oliva", "floresta", "lago", "vinho", "grafite"];

for (const [name, t] of [["claro", light], ["escuro", dark]] as const) {
  test(`contraste ${name}`, () => {
    const bad: string[] = [];
    const check = (what: string, fg: string, bg: string, min = 4.5) => { const r = ratio(fg, bg); if (r < min) bad.push(`${what}: ${r.toFixed(2)}`); };
    for (const s of ["bg", "surface", "surface-2"]) {
      check(`texto em ${s}`, t.tx, t[s]); check(`secundário em ${s}`, t.tx2, t[s]); check(`apoio em ${s}`, t.tx3, t[s]);
      check(`alerta em ${s}`, t.alert, t[s]); check(`positivo em ${s}`, t.positive, t[s]);
    }
    check("botão primário", t["on-inv"], t.inv); check("nota interna", t["note-tx"], t["note-bg"]); check("contador cobre", t["on-alert"], t.alert);
    for (const g of TAGS) {
      const tg = t[`tag-${g}`];
      check(`tag ${g}`, name === "escuro" ? mix(tg, 0.75, "#f2f0ea") : mix(tg, 0.78, t.ink), mix(tg, name === "escuro" ? 0.16 : 0.13, t.surface));
      check(`avatar ${g}`, name === "escuro" ? mix(tg, 0.75, "#f2f0ea") : mix(tg, 0.68, t.ink), mix(tg, 0.22, t.surface));
    }
    assert.deepEqual(bad, []);
  });
}
test("tags escuras batem com a tabela", () => {
  const exp: Record<string, [string, string]> = { neutro: ["#33322e", "#b7b4ac"], areia: ["#39342b", "#d3be9c"], champanhe: ["#3b3527", "#dcc28a"], oliva: ["#343628", "#bbc690"], floresta: ["#2d372f", "#9acaaf"], lago: ["#2b3532", "#90c0be"], vinho: ["#3c2f2e", "#dea5ac"], grafite: ["#373632", "#cac6bd"] };
  const off = (a: string, b: string) => Math.max(...rgb(a).map((v, i) => Math.abs(v - rgb(b)[i])));
  for (const g of TAGS) { const tg = dark[`tag-${g}`]; assert.ok(off(mix(tg, 0.16, dark.surface), exp[g][0]) <= 2 && off(mix(tg, 0.75, "#f2f0ea"), exp[g][1]) <= 2, g); }
});
