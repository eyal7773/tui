/**
 * Unpacks a .mhtml page capture into the resources it was made of.
 *
 * Opening an .mhtml file directly is not faithful: Chrome treats every form
 * control in an archive as disabled, so buttons and inputs cannot take focus
 * and the extension walks a different page from the one the user had. Instead
 * the harness replays the parts over the network at their original URLs.
 */

const fs = require('fs');

/** Chrome refers to saved frames as cid: URLs; they are served from here instead. */
const CID_ORIGIN = 'https://mhtml-cid.invalid/';

function parseHeaders(text) {
    const headers = {};
    // Folded header lines continue with leading whitespace.
    for (const line of text.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
        const i = line.indexOf(':');
        if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
    return headers;
}

function decodeQuotedPrintable(latin1) {
    const soft = latin1.replace(/=\r?\n/g, '');
    const bytes = [];
    for (let i = 0; i < soft.length; i++) {
        if (soft[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(soft.substr(i + 1, 2))) {
            bytes.push(parseInt(soft.substr(i + 1, 2), 16));
            i += 2;
        } else {
            bytes.push(soft.charCodeAt(i) & 0xff);
        }
    }
    return Buffer.from(bytes);
}

/**
 * @returns {{ url: string, parts: Map<string, { type: string, body: Buffer }> }}
 *   url is the page that was captured; parts is keyed by URL without fragment.
 */
function unpack(file) {
    // latin1 keeps every byte as one char, so binary parts survive the split.
    const raw = fs.readFileSync(file).toString('latin1');
    const headEnd = raw.search(/\r?\n\r?\n/);
    const top = parseHeaders(raw.slice(0, headEnd));
    const boundary = /boundary="?([^";]+)"?/i.exec(top['content-type'] || '')?.[1];
    if (!boundary) throw new Error(`${file} is not a multipart .mhtml`);

    const parts = new Map();
    let first = null;
    for (const chunk of raw.slice(headEnd).split(`--${boundary}`).slice(1)) {
        if (chunk.startsWith('--')) break;
        const body = chunk.replace(/^\r?\n/, '');
        const split = body.search(/\r?\n\r?\n/);
        if (split < 0) continue;
        const headers = parseHeaders(body.slice(0, split));
        let content = body.slice(split).replace(/^\r?\n\r?\n/, '').replace(/\r?\n$/, '');

        const encoding = (headers['content-transfer-encoding'] || '').toLowerCase();
        let bytes;
        if (encoding === 'base64') bytes = Buffer.from(content.replace(/\s+/g, ''), 'base64');
        else if (encoding === 'quoted-printable') bytes = decodeQuotedPrintable(content);
        else bytes = Buffer.from(content, 'latin1');

        const type = (headers['content-type'] || 'application/octet-stream').split(';')[0].trim();
        if (/^text\/html/.test(type)) {
            bytes = Buffer.from(bytes.toString('utf8').replace(/cid:([^"'\s)>]+)/g,
                (_, id) => CID_ORIGIN + encodeURIComponent(id)), 'utf8');
        }
        const part = { type, body: bytes };
        // Inline <style> blocks are saved as parts located at cid:css-...
        const location = (headers['content-location'] || '').replace(/^cid:(.*)$/,
            (_, id) => CID_ORIGIN + encodeURIComponent(id));
        if (location) parts.set(location.split('#')[0], part);
        if (headers['content-id']) parts.set(CID_ORIGIN + encodeURIComponent(headers['content-id'].replace(/^<|>$/g, '')), part);
        if (!first) first = headers['content-location'];
    }

    const url = top['snapshot-content-location'] || first;
    if (!url) throw new Error(`${file} does not say which page it captured`);
    return { url, parts };
}

module.exports = { unpack };
