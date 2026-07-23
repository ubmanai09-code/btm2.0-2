/**
 * Bowling Glossary Importer
 * Usage:  node scripts/import-glossary.cjs <path-to-your-file.docx>
 *
 * Reads a Word table where each row is:
 *   Column 1 – English term  (bold)
 *   Column 2 – Mongolian description
 *   Column 3 – Embedded image OR text notation symbol (e.g. |X|)
 *
 * Saves extracted images to  public/glossary/<slug>.png
 * Overwrites the GLOSSARY_TERMS array in src/data/glossary.ts while
 * keeping the GLOSSARY_AUTHOR block and file header intact.
 */

const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────
const TARGET_FILE  = path.resolve(__dirname, '../src/data/glossary.ts');
const IMAGE_DIR    = path.resolve(__dirname, '../public/glossary');
const IMAGE_PUBLIC = '/glossary';          // path prefix used in the app
// ─────────────────────────────────────────────────────────────────────────

/** Convert an English term to a safe filename slug */
function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Strip all HTML tags and return plain text */
function stripTags(html) {
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim();
}

/** Extract `src` attribute from the first <img> in an HTML snippet, or null */
function extractImgSrc(html) {
  const m = html.match(/<img[^>]+src="([^"]+)"/i);
  return m ? m[1] : null;
}

/** Save a data-URI image to disk; returns the public path or null */
function saveDataUri(dataUri, slug, counter) {
  const m = dataUri.match(/^data:image\/([a-z]+);base64,(.+)$/i);
  if (!m) return null;
  const ext  = m[1] === 'jpeg' ? 'jpg' : m[1];
  const buf  = Buffer.from(m[2], 'base64');
  const name = `${slug || 'term-' + counter}.${ext}`;
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
  fs.writeFileSync(path.join(IMAGE_DIR, name), buf);
  return `${IMAGE_PUBLIC}/${name}`;
}

async function main() {
  const inputArg = process.argv[2];
  if (!inputArg) {
    console.error('Usage: node scripts/import-glossary.cjs <file.docx>');
    process.exit(1);
  }

  const inputPath = path.resolve(process.cwd(), inputArg);
  if (!fs.existsSync(inputPath)) {
    console.error(`File not found: ${inputPath}`);
    process.exit(1);
  }

  console.log(`Reading: ${inputPath}`);

  // ── Convert .docx → HTML (images stay inline as base64 data URIs) ──────
  const result = await mammoth.convertToHtml({ path: inputPath });
  const html   = result.value;

  // ── Parse table rows ───────────────────────────────────────────────────
  // Split on <tr> boundaries; each chunk is one row
  const rowChunks = html.split(/<\/tr>/i).filter(s => s.includes('<tr'));

  const terms   = [];
  let skipped   = 0;
  let imgCount  = 0;

  for (const chunk of rowChunks) {
    // Split the row into <td> cells
    const cellChunks = chunk.split(/<\/td>/i).filter(s => s.includes('<td'));

    if (cellChunks.length < 2) { skipped++; continue; }

    const en = stripTags(cellChunks[0]);
    const mn = stripTags(cellChunks[1]);

    if (!en || !mn) { skipped++; continue; }

    // Skip header rows
    const lowerEn = en.toLowerCase();
    if (lowerEn === 'english' || lowerEn === 'term' || lowerEn === 'нэр томьёо') {
      skipped++; continue;
    }

    const entry = { en, mn };

    // Column 3: check for embedded image
    if (cellChunks[2]) {
      const src = extractImgSrc(cellChunks[2]);
      if (src && src.startsWith('data:')) {
        imgCount++;
        const slug      = slugify(en);
        const publicPath = saveDataUri(src, slug, imgCount);
        if (publicPath) {
          entry.image = publicPath;
          process.stdout.write(`  [img] ${en} → ${publicPath}\n`);
        }
      }
      // Text symbols like |X| are silently ignored
    }

    terms.push(entry);
  }

  if (terms.length === 0) {
    console.error('No terms could be parsed. Check that the Word file contains a table.');
    process.exit(1);
  }

  console.log(`\nParsed ${terms.length} terms (${imgCount} with images, ${skipped} rows skipped).`);

  // ── Build the new GLOSSARY_TERMS block ─────────────────────────────────
  const entriesTs = terms
    .map(t => {
      const enEsc = t.en.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const mnEsc = t.mn.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      if (t.image) {
        return `  { en: '${enEsc}', mn: '${mnEsc}', image: '${t.image}' },`;
      }
      return `  { en: '${enEsc}', mn: '${mnEsc}' },`;
    })
    .join('\n');

  const newTermsBlock =
    `export const GLOSSARY_TERMS: GlossaryTerm[] = [\n${entriesTs}\n];`;

  // ── Read existing glossary.ts and replace the terms array ──────────────
  const existing  = fs.readFileSync(TARGET_FILE, 'utf8');
  const updatedTs = existing.replace(
    /export const GLOSSARY_TERMS[\s\S]*?\];/,
    newTermsBlock
  );

  if (updatedTs === existing) {
    console.error('Could not locate GLOSSARY_TERMS array in glossary.ts. Nothing was changed.');
    process.exit(1);
  }

  fs.writeFileSync(TARGET_FILE, updatedTs, 'utf8');
  console.log(`\n✓ glossary.ts updated with ${terms.length} terms.`);
  console.log(`  File: ${TARGET_FILE}`);
  if (imgCount > 0) {
    console.log(`  Images saved to: ${IMAGE_DIR}`);
  }
  console.log('\nPreview (first 5 terms):');
  terms.slice(0, 5).forEach((t, i) => {
    const img = t.image ? ` [has image]` : '';
    console.log(`  ${i + 1}. ${t.en}${img} → ${t.mn.slice(0, 60)}${t.mn.length > 60 ? '…' : ''}`);
  });
  console.log('\nDone! Refresh the dev server to see changes.');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
