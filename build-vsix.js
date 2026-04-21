// build-vsix.js — produces fusion-sql-<version>.vsix without vsce.
// Usage: node build-vsix.js

const fs   = require("fs");
const path = require("path");
const zlib = require("zlib");

const pkg      = JSON.parse(fs.readFileSync("package.json", "utf8"));
const outName  = `${pkg.name}-${pkg.version}.vsix`;
const root     = __dirname;

// What goes into the .vsix. Everything else is excluded.
const include = [
  "package.json",
  "README.md",
  "out",           // compiled JS
  "resources",     // icons
  "node_modules/fast-xml-parser",
  "node_modules/strnum",        // dep of fast-xml-parser
];

/* ---------- file walk ---------- */
function walk(p, files = []) {
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    for (const name of fs.readdirSync(p)) walk(path.join(p, name), files);
  } else {
    files.push(p);
  }
  return files;
}

/* ---------- XML manifests that VS Code requires inside the .vsix ---------- */
function makeManifest() {
  const pub = pkg.publisher;
  const name = pkg.name;
  const version = pkg.version;
  const displayName = pkg.displayName || name;
  const description = pkg.description || "";
  const engineVsc = (pkg.engines && pkg.engines.vscode) || "^1.84.0";
  return `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Language="en-US" Id="${name}" Version="${version}" Publisher="${pub}"/>
    <DisplayName>${escapeXml(displayName)}</DisplayName>
    <Description xml:space="preserve">${escapeXml(description)}</Description>
    <Tags></Tags>
    <Categories>Other</Categories>
    <GalleryFlags>Public</GalleryFlags>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="${engineVsc}"/>
      <Property Id="Microsoft.VisualStudio.Services.Links.Source" Value=""/>
    </Properties>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code"/>
  </Installation>
  <Dependencies/>
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/>
  </Assets>
</PackageManifest>
`;
}

function makeContentTypes() {
  return `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json"/>
  <Default Extension="js"   ContentType="application/javascript"/>
  <Default Extension="md"   ContentType="text/markdown"/>
  <Default Extension="svg"  ContentType="image/svg+xml"/>
  <Default Extension="png"  ContentType="image/png"/>
  <Default Extension="xml"  ContentType="text/xml"/>
  <Default Extension="vsixmanifest" ContentType="text/xml"/>
</Types>
`;
}

function escapeXml(s) {
  return (s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/* ---------- gather files ---------- */
const files = []; // [{ zipPath, fsPath }]
for (const inc of include) {
  const full = path.join(root, inc);
  if (!fs.existsSync(full)) continue;
  if (fs.statSync(full).isDirectory()) {
    for (const f of walk(full)) {
      const rel = path.relative(root, f).replace(/\\/g, "/");
      files.push({ zipPath: `extension/${rel}`, fsPath: f });
    }
  } else {
    files.push({ zipPath: `extension/${inc.replace(/\\/g, "/")}`, fsPath: full });
  }
}

// The two mandatory top-level entries.
files.unshift(
  { zipPath: "extension.vsixmanifest", data: Buffer.from(makeManifest(), "utf8") },
  { zipPath: "[Content_Types].xml",    data: Buffer.from(makeContentTypes(), "utf8") },
);

/* ---------- minimal ZIP writer (store + deflate, 32-bit) ---------- */
function crc32(buf) {
  if (!crc32.table) {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    crc32.table = t;
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crc32.table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n, 0); return b; }
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0, 0); return b; }

const chunks = [];
const central = [];
let offset = 0;

for (const f of files) {
  const raw = f.data || fs.readFileSync(f.fsPath);
  const crc = crc32(raw);
  const deflated = zlib.deflateRawSync(raw);
  const useDeflate = deflated.length < raw.length;
  const stored = useDeflate ? deflated : raw;
  const method = useDeflate ? 8 : 0;
  const nameBuf = Buffer.from(f.zipPath, "utf8");

  const localHeader = Buffer.concat([
    u32(0x04034b50), u16(20), u16(0), u16(method),
    u16(0), u16(0),
    u32(crc), u32(stored.length), u32(raw.length),
    u16(nameBuf.length), u16(0),
    nameBuf,
  ]);
  chunks.push(localHeader, stored);

  central.push({
    name: nameBuf,
    crc, comp: stored.length, un: raw.length, method, offset,
  });
  offset += localHeader.length + stored.length;
}

const centralStart = offset;
const centralChunks = [];
for (const c of central) {
  centralChunks.push(Buffer.concat([
    u32(0x02014b50), u16(20), u16(20), u16(0), u16(c.method),
    u16(0), u16(0),
    u32(c.crc), u32(c.comp), u32(c.un),
    u16(c.name.length), u16(0), u16(0),
    u16(0), u16(0),
    u32(0), u32(c.offset),
    c.name,
  ]));
}
const centralBuf = Buffer.concat(centralChunks);
const eocd = Buffer.concat([
  u32(0x06054b50), u16(0), u16(0),
  u16(central.length), u16(central.length),
  u32(centralBuf.length), u32(centralStart), u16(0),
]);

fs.writeFileSync(outName, Buffer.concat([...chunks, centralBuf, eocd]));
console.log(`wrote ${outName} (${fs.statSync(outName).size} bytes, ${files.length} entries)`);
