import { writeFileSync } from "node:fs";
const call = async a => { const r = await (await fetch("http://127.0.0.1:9444/", { method: "POST", body: JSON.stringify(a) })).json(); if (!r.ok) throw new Error(r.error); return r.out; };
const out = {};
for (const theme of ["light", "dark"]) {
  await call({ op: "viewport", w: 1280, h: 900 }); await call({ op: "goto", url: `http://127.0.0.1:5917/?role=tech&scene=capture&locale=en&theme=${theme}` }); await call({ op: "viewport", w: 1280, h: 900 });
  const r = await call({ op: "eval", expr: `(async()=>{const f=__fx; await f.S.captureErrorsBlurred(); const c=el=>el?f.contrastOf(el):null; const q=s=>document.querySelector(s); const form=q('form');
   const field=form.querySelector('textarea'); const border=el=>{const s=getComputedStyle(el);return s.borderTopColor};
   const sec=[...document.querySelectorAll('button')].find(b=>b.className.includes('border-text-secondary')&&!b.className.includes('bg-primary')&&!b.disabled);
   const legacy=[...document.querySelectorAll('button')].find(b=>b.className.includes('border-neutral-400'));
   return {
    body_h1: c(q('h1')), page_subtitle_neutral600: c(q('header p')),
    help_text_secondary: c(form.querySelector('span.text-text-secondary')), error_text: c(form.querySelector('span[id$=-error]')),
    field_text_continuity: c(field), secondary_button_continuity: c(sec), primary_button_enabled_lookalike: c(form.querySelector('button[type=submit]')),
    legacy_button_neutral400: c(legacy), legacy_border: border(legacy), continuity_border: border(field), border_token_text_secondary: getComputedStyle(field).borderTopColor,
    language_select: c(q('select')), language_border: border(q('select')),
    summary_link: c(form.querySelector('section a')),
    }})()` });
  out[theme] = r;
}
writeFileSync("/tmp/issue915-render/out/pairs.json", JSON.stringify(out, null, 1)); console.log(JSON.stringify(out));
