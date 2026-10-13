// Builds the GitHub Pages site in docs/ from the templates in site/, once for
// each language in site/site.json. The first language is served at the root,
// every other one in a folder of its own (docs/he/).
//
//   node scripts/build-site.js
//
// The templates are the files to edit; a test (tests/site-build.test.js) fails
// while docs/ differs from what this would write.
//
// {{a.b}} in a template is replaced with that value from site/i18n/<lang>.json,
// as HTML. A few names are worked out here instead: see special() below. A
// name with no value stops the build, so a page never ships with a hole.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const site = path.join(root, 'site');
const PAGES = ['index.html', 'privacy.html', 'updates.html'];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function lookup(strings, name) {
  let value = strings;
  for (const part of name.split('.')) value = value == null ? undefined : value[part];
  return typeof value === 'string' ? value : undefined;
}

/** The folder a language lives in, relative to the site root: '' or 'he/'. */
function folder(config, lang) {
  return lang === config.languages[0] ? '' : `${lang}/`;
}

/** The address of `page` in `lang`, relative to a page in `from`. */
function link(config, from, lang, page) {
  const up = folder(config, from) ? '../' : '';
  const href = up + folder(config, lang) + (page === 'index.html' ? '' : page);
  return href || './';
}

function storeButton(config, strings, small) {
  const add = small ? strings.store.addShort : strings.store.add;
  const soon = small ? strings.store.soonShort : strings.store.soon;
  if (config.storeUrl) return `<a class="get" href="${config.storeUrl}">${add}</a>`;
  return `<span class="get soon">${soon}</span>`;
}

function head(config, all, lang, page) {
  const lines = [];
  const absolute = l => config.base + folder(config, l) + (page === 'index.html' ? '' : page);
  lines.push(`<link rel="canonical" href="${absolute(lang)}">`);
  for (const l of config.languages) {
    lines.push(`<link rel="alternate" hreflang="${all[l].lang}" href="${absolute(l)}">`);
  }
  lines.push(`<link rel="alternate" hreflang="x-default" href="${absolute(config.languages[0])}">`);

  // A script the default fonts draw badly gets a face of its own.
  const fonts = config.fonts && config.fonts[lang];
  if (fonts) {
    lines.push('<link rel="preconnect" href="https://fonts.googleapis.com">');
    lines.push('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>');
    lines.push(`<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fonts}&display=swap">`);
  }

  // The root page sends a browser set to another of the site's languages to
  // that language's page, until the reader picks one with the switch.
  if (page === 'index.html' && lang === config.languages[0]) {
    const others = config.languages.slice(1).map(l => [l, folder(config, l)]);
    lines.push(`<script>
    (function () {
      var pages = ${JSON.stringify(Object.fromEntries(others))};
      try {
        if (localStorage.getItem('tui-lang')) return;
        var wanted = String((navigator.languages && navigator.languages[0]) || navigator.language || '');
        var lang = wanted.toLowerCase().split('-')[0];
        // Codes older browsers still report: Hebrew, Indonesian.
        lang = { iw: 'he', 'in': 'id' }[lang] || lang;
        if (pages[lang]) location.replace(pages[lang]);
      } catch (e) { /* storage off: stay on this page */ }
    })();
  </script>`);
  }
  return lines.join('\n  ');
}

/** The language menu: the current language, opening onto every other. */
function languages(config, all, lang, page) {
  const items = config.languages.map(l => {
    const current = l === lang ? ' aria-current="page"' : '';
    const dir = all[l].dir === 'rtl' ? ' dir="rtl"' : '';
    return `<li><a href="${link(config, lang, l, page)}" hreflang="${all[l].lang}" lang="${all[l].lang}"${dir} data-lang="${l}"${current}>${all[l].name}</a></li>`;
  }).join('');
  return `<details class="langs"><summary aria-label="${all[lang].bar.languages}">${all[lang].name}</summary><ul>${items}</ul></details>`;
}

function special(name, config, all, lang, page) {
  const strings = all[lang];
  switch (name) {
    case 'root': return folder(config, lang) ? '../' : '';
    case 'head': return head(config, all, lang, page);
    case 'languages': return languages(config, all, lang, page);
    case 'store': return storeButton(config, strings, false);
    case 'storeSmall': return storeButton(config, strings, true);
    // The figure keeps its own English; other languages hand it theirs.
    case 'figureStrings': {
      const words = strings.figure && strings.figure.strings;
      return JSON.stringify(words || null).replace(/</g, '\\u003c');
    }
    default: return undefined;
  }
}

/** Every page in every language, as { 'docs/he/index.html': '<!DOCTYPE…' }. */
function build() {
  const config = readJson(path.join(site, 'site.json'));
  const all = {};
  for (const lang of config.languages) all[lang] = readJson(path.join(site, 'i18n', `${lang}.json`));

  const out = {};
  for (const page of PAGES) {
    const template = fs.readFileSync(path.join(site, page), 'utf8').replace(/\r\n/g, '\n');
    for (const lang of config.languages) {
      const html = template.replace(/\{\{([\w.]+)\}\}/g, (match, name) => {
        const value = special(name, config, all, lang, page) ?? lookup(all[lang], name);
        if (value === undefined) throw new Error(`site/${page}: no "${name}" in site/i18n/${lang}.json`);
        return value;
      });
      out[`docs/${folder(config, lang)}${page}`] = html;
    }
  }
  return out;
}

module.exports = { build };

if (require.main === module) {
  for (const [file, html] of Object.entries(build())) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), html);
    console.log(`-> ${file}`);
  }
}
