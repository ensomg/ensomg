// Profil README'nin tüm bölümlerini animasyonlu, dalgalı SVG kartlar olarak üretir: node gen-cards.js
// - Yazı tipleri Google Fonts'tan yalnızca kartta geçen harflerle indirilip SVG'ye gömülür
//   (GitHub SVG'yi <img> olarak gösterir; dış kaynak yükleyemez, gömülü olan çalışır).
// - İstatistikler GitHub GraphQL API'den çekilir: GITHUB_TOKEN ortam değişkeni, yoksa `gh auth token`.
// - Animasyonlar SVG içi CSS + SMIL; prefers-reduced-motion'da CSS animasyonları kapanır.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const LOGIN = 'ensomg';
const OUT = path.join(__dirname, 'cards');
const W = 840;
const FONTS = {
  title: { family: 'Exo 2', weight: 600 },
  mono: { family: 'JetBrains Mono', weight: 500 },
};

// ---------- yardımcılar ----------
const hex = (c) => c.match(/\w\w/g).map((x) => parseInt(x, 16));
const mix = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const n1 = (v) => +v.toFixed(1);
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124 Safari/537.36' };

const fontCache = new Map();
async function fontFace({ family, weight }, text) {
  const chars = [...new Set(text)].sort().join('') || 'a';
  const key = `${family}|${chars}`;
  if (!fontCache.has(key)) {
    const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(chars)}`;
    const css = await (await fetch(url, { headers: UA })).text();
    const src = css.match(/url\((https:[^)]+)\)/)?.[1];
    if (!src) throw new Error(`Font alınamadı: ${family}`);
    const b64 = Buffer.from(await (await fetch(src)).arrayBuffer()).toString('base64');
    fontCache.set(key, `@font-face{font-family:'${family}';font-weight:${weight};src:url(data:font/woff2;base64,${b64}) format('woff2');}`);
  }
  return fontCache.get(key);
}

async function iconPath(slug) {
  try {
    const svg = await (await fetch(`https://cdn.jsdelivr.net/npm/simple-icons/icons/${slug}.svg`)).text();
    return svg.match(/ d="([^"]+)"/)[1];
  } catch {
    return null;
  }
}

function token() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  for (const bin of [process.env.GH_PATH, 'gh'].filter(Boolean)) {
    try {
      return execFileSync(bin, ['auth', 'token'], { encoding: 'utf8' }).trim();
    } catch {}
  }
  throw new Error('GITHUB_TOKEN yok ve `gh auth token` çalışmadı');
}

async function githubStats() {
  const query = `query($login:String!){user(login:$login){
    followers{totalCount}
    repositories(privacy:PUBLIC,ownerAffiliations:OWNER){totalCount}
    contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{date contributionCount}}}}}}`;
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { login: LOGIN } }),
  });
  const { data, errors } = await res.json();
  if (errors) throw new Error(errors.map((e) => e.message).join('; '));
  const cal = data.user.contributionsCollection.contributionCalendar;
  const days = cal.weeks.flatMap((w) => w.contributionDays);
  // Bugün henüz commit yoksa seri dünden sayılır (GitHub'daki gibi).
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].contributionCount > 0) current++;
    else if (i === days.length - 1) continue;
    else break;
  }
  let longest = 0;
  let run = 0;
  for (const d of days) {
    run = d.contributionCount > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return {
    total: cal.totalContributions,
    current,
    longest,
    repos: data.user.repositories.totalCount,
    weeks: cal.weeks.map((w) => w.contributionDays.reduce((s, d) => s + d.contributionCount, 0)),
  };
}

// ---------- kart iskeleti ----------
// Sol alttan (mirror ise sağ alttan) yükselen 4 katmanlı dalga; her katman farklı hızda salınır.
function waves(w, h, bg, wave, { top = 0.36, span = Math.min(w, 460), mirror = false } = {}) {
  const layers = [];
  for (let k = 0; k < 4; k++) {
    const s = 1 - 0.19 * k;
    const y0 = h * (top + ((1 - top) * 0.75 * k) / 4);
    const bx = span * 0.3 * s;
    const xe = span * 0.8 * s;
    const d =
      `M-30 ${n1(y0 + 8)} L0 ${n1(y0)} ` +
      `C${n1(span * 0.08 * s)} ${n1(y0 - 34)} ${n1(span * 0.2 * s)} ${n1(y0 - 4)} ${n1(bx)} ${n1(y0 + 26)} ` +
      `S${n1(xe - span * 0.2 * s)} ${n1(h - 12)} ${n1(xe)} ${h} L${n1(xe)} ${h + 30} L-30 ${h + 30}Z`;
    const dx = 5 + k * 2;
    const dur = 7 + k * 1.7;
    layers.push(
      `<g><path d="${d}" fill="${mix(bg, wave, 0.28 + 0.24 * k)}"/>` +
        `<animateTransform attributeName="transform" type="translate" values="0 0;${dx} ${-3 - k};0 0" dur="${dur}s" repeatCount="indefinite" calcMode="spline" keyTimes="0;.5;1" keySplines=".45 0 .55 1;.45 0 .55 1"/></g>`
    );
  }
  const g = layers.join('');
  return mirror ? `<g transform="translate(${w} 0) scale(-1 1)">${g}</g>` : g;
}

const GITHUB_MARK =
  'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z';

function mark(w, h, size = 46, d = GITHUB_MARK, vb = 16) {
  return `<g transform="translate(${w - size - 18} ${h - size - 18})"><g class="float"><g transform="scale(${n1(size / vb * 100) / 100})"><path fill="#fff" d="${d}"/></g></g></g>`;
}

const t = (x, y, s, { cls = 'm', size = 14, delay = 0, fill, opacity, anchor } = {}) =>
  `<text class="${cls} in" x="${x}" y="${y}" font-size="${size}"${fill ? ` fill="${fill}"` : ''}${opacity ? ` opacity="${opacity}"` : ''}${anchor ? ` text-anchor="${anchor}"` : ''} style="animation-delay:${delay}s">${esc(s)}</text>`;

// GitHub logosu yalnızca repoya giden proje kartlarında (withMark).
async function frame({ w = W, h, bg, wave, waveOpts, body, label, withMark = false, title }) {
  const r = 22;
  const inner =
    `<g clip-path="url(#c)"><rect width="${w}" height="${h}" fill="${bg}"/>${waves(w, h, bg, wave, waveOpts)}</g>` +
    (title ? t(28, 26 + title.size * 0.9, title.text, { cls: 't', size: title.size }) : '') +
    body +
    (label ? t(18, h - 16, label, { size: 12, delay: 0.5, opacity: 0.92 }) : '') +
    (withMark ? mark(w, h) : '');
  // Font alt kümesi: kartta geçen tüm yazılar.
  const texts = [...inner.matchAll(/<text\b([^>]*)>([^<]*)/g)];
  const titleText = texts.filter((m) => /class="t\b/.test(m[1])).map((m) => unesc(m[2])).join('');
  const monoText = texts.filter((m) => !/class="t\b/.test(m[1])).map((m) => unesc(m[2])).join('');
  const css =
    (titleText ? await fontFace(FONTS.title, titleText) : '') +
    (monoText ? await fontFace(FONTS.mono, monoText) : '') +
    `.t{font-family:'${FONTS.title.family}',sans-serif;font-weight:${FONTS.title.weight};fill:#fff;letter-spacing:.5px}` +
    `.m{font-family:'${FONTS.mono.family}',monospace;font-weight:${FONTS.mono.weight};fill:#fff}` +
    `.in{animation:rise .9s cubic-bezier(.2,.7,.2,1) both}` +
    `@keyframes rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}` +
    `.float{animation:float 4.5s ease-in-out infinite}` +
    `@keyframes float{50%{transform:translateY(-5px)}}` +
    `.bar{transform-box:fill-box;transform-origin:50% 100%;animation:grow 1.1s cubic-bezier(.2,.7,.2,1) both}` +
    `@keyframes grow{from{transform:scaleY(0)}to{transform:scaleY(1)}}` +
    `.blink{animation:blink 1s steps(1) infinite}@keyframes blink{50%{opacity:0}}` +
    `@media (prefers-reduced-motion:reduce){*{animation:none!important}}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">
<style>${css}</style>
<clipPath id="c"><rect width="${w}" height="${h}" rx="${r}"/></clipPath>
${inner}
</svg>
`;
}

// ---------- kartlar ----------
function header() {
  const lines = ['full-stack developer', 'building at Lumina Labs', 'next.js · nestjs · typescript', 'open to freelance work'];
  // Gerçek daktilo: harf harf yazılır, bekler, harf harf silinir. Satırlar aynı yerde sırayla görünür;
  // tek bir clip genişliği ve imleç aynı (discrete) zaman çizelgesini paylaşır, böylece imleç hep yazının sonundadır.
  const x0 = 44;
  const cw = 12; // JetBrains Mono: 0.6em × 20px
  const TYPE = 0.075;
  const HOLD = 1.8;
  const ERASE = 0.03;
  const PAUSE = 0.35;
  const steps = []; // [zaman, genişlik]
  const spans = []; // her satırın [başlangıç, bitiş] zamanı
  let time = 0;
  for (const line of lines) {
    const start = time;
    for (let k = 0; k <= line.length; k++, time += TYPE) steps.push([time, k * cw]);
    time += HOLD;
    for (let k = line.length - 1; k >= 0; k--, time += ERASE) steps.push([time, k * cw]);
    spans.push([start, time]);
    time += PAUSE;
  }
  const total = time;
  const kt = (s) => (Math.round((s / total) * 1e4) / 1e4).toString();
  const discrete = (attr, values, times) =>
    `<animate attributeName="${attr}" dur="${n1(total * 100) / 100}s" repeatCount="indefinite" calcMode="discrete" values="${values.join(';')}" keyTimes="${times.map(kt).join(';')}"/>`;

  const clip =
    `<clipPath id="tl"><rect x="${x0}" y="140" height="34" width="0">` +
    discrete('width', steps.map(([, w]) => w), steps.map(([s]) => s)) +
    `</rect></clipPath>`;
  const typed = lines
    .map((line, i) => {
      const [a, b] = spans[i];
      const vis = a === 0 ? discrete('opacity', [1, 0], [0, b]) : discrete('opacity', [0, 1, 0], [0, a, b]);
      return `<text class="m" x="${x0}" y="165" font-size="20" fill="#cfe9f2" opacity="${i === 0 ? 1 : 0}">${esc(line)}${vis}</text>`;
    })
    .join('');
  const cursor =
    `<rect class="blink" x="${x0}" y="146" width="10" height="24" fill="#cfe9f2">` +
    discrete('x', steps.map(([, w]) => x0 + w + 2), steps.map(([s]) => s)) +
    `</rect>`;
  return frame({
    h: 260,
    bg: '#16243f',
    wave: '#5fa8c2',
    waveOpts: { top: 0.42, mirror: true, span: 520 },
    title: { text: 'Enes', size: 84 },
    body: clip + `<g clip-path="url(#tl)">${typed}</g>` + cursor,
    label: 'ensomg.com',
  });
}

async function linkCard({ name, bg, wave, icon, fallback }) {
  const d = (icon && (await iconPath(icon))) || fallback;
  const w = 200;
  const h = 76;
  const body =
    `<g transform="translate(18 24)"><g class="float"><g transform="scale(1.17)"><path fill="#fff" d="${d}"/></g></g></g>` +
    t(60, 46, name, { cls: 't', size: name.length > 11 ? 17 : 20, delay: 0.1 });
  return frame({ w, h, bg, wave, waveOpts: { top: 0.55, mirror: true, span: 150 }, body, withMark: false });
}

function about() {
  const rows = [
    ['name', 'Enes (ens)'],
    ['age', '18'],
    ['role', 'full-stack developer'],
    ['stack', 'Next.js · NestJS · React · Express · Redis'],
    ['langs', 'TypeScript · JavaScript'],
    ['status', 'building specialized apps · open to paid work'],
  ];
  // SVG boşlukları birleştirir; anahtar ve değer ayrı sütunlarda.
  const body = rows
    .map(
      ([k, v], i) =>
        t(40, 112 + i * 30, k, { size: 16, delay: 0.15 + i * 0.12, fill: '#d9c6ff', opacity: 0.8 }) +
        t(130, 112 + i * 30, v, { size: 16, delay: 0.2 + i * 0.12 })
    )
    .join('');
  return frame({
    h: 310,
    bg: '#2e2250',
    wave: '#b48cf0',
    waveOpts: { top: 0.5, mirror: true, span: 380 },
    title: { text: 'whoami', size: 38 },
    body,
  });
}

async function stack() {
  const ids = 'ts,js,nodejs,bun,react,nextjs,nestjs,express,tailwind,redis,mysql,mongodb,sqlite,graphql,docker,aws,electron,git,cs,swift,lua,postman';
  const svg = await (await fetch(`https://skillicons.dev/icons?i=${ids}&theme=dark&perline=11`)).text();
  const [, , vw, vh] = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
  const iw = 600;
  const ih = Math.round((iw * vh) / vw);
  const img = `<image class="in" style="animation-delay:.25s" x="40" y="96" width="${iw}" height="${ih}" href="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"/>`;
  return frame({
    h: 96 + ih + 40,
    bg: '#1c3a2a',
    wave: '#8fe08a',
    waveOpts: { top: 0.45, mirror: true, span: 300 },
    title: { text: 'stack', size: 38 },
    body: img,
  });
}

function project({ title, label, bg, wave }) {
  return frame({ w: 400, h: 220, bg, wave, title: { text: title, size: 44 }, label, body: '', withMark: true });
}

function stats(s) {
  const metrics = [
    [s.total.toLocaleString('en-US'), 'contributions · 1y'],
    [`${s.current}d`, 'current streak'],
    [`${s.longest}d`, 'longest streak'],
    [String(s.repos), 'public repos'],
  ];
  const body = metrics
    .map(([v, l], i) => t(40 + i * 190, 140, v, { cls: 't', size: 46, delay: 0.15 + i * 0.12 }) + t(42 + i * 190, 166, l, { size: 13, delay: 0.25 + i * 0.12, opacity: 0.85 }))
    .join('');
  // Son 1 yılın haftalık toplamları: tabandan büyüyen çubuklar.
  const max = Math.max(1, ...s.weeks);
  const bw = 10;
  const gap = 4.4;
  const base = 290;
  const bars = s.weeks
    .map((v, i) => {
      const bh = Math.max(2, (v / max) * 80);
      return `<rect class="bar" style="animation-delay:${n1(0.4 + i * 0.018)}s" x="${n1(40 + i * (bw + gap))}" y="${n1(base - bh)}" width="${bw}" height="${n1(bh)}" rx="2" fill="#fff" opacity="${n1(0.35 + 0.5 * (v / max))}"/>`;
    })
    .join('');
  const updated = new Date().toISOString().slice(0, 10);
  return frame({
    h: 330,
    bg: '#123844',
    wave: '#5fd0c2',
    waveOpts: { top: 0.5, mirror: true, span: 300 },
    title: { text: 'stats', size: 38 },
    body: body + bars,
    label: `updated ${updated}`,
  });
}

const DISCORD_INVITE = '4pm';

// Sunucu adı ve üye sayısı Discord'un herkese açık davet API'sinden; alınamazsa sabit ad.
async function discordInvite() {
  try {
    const r = await (await fetch(`https://discord.com/api/v10/invites/${DISCORD_INVITE}?with_counts=true`)).json();
    // Gömülü fontta emoji yok; adı harf/rakam/noktalama ile sınırla.
    const name = r.guild.name.replace(/[^\p{L}\p{N}\p{P}\s]/gu, '').trim();
    return { name, members: r.approximate_member_count };
  } catch {
    return { name: "Ens's Island", members: null };
  }
}

async function communities(discordPath) {
  const inv = await discordInvite();
  const h = 190;
  const sub = `discord.gg/${DISCORD_INVITE}` + (inv.members ? ` · ${inv.members} members` : '');
  const body =
    t(40, 120, inv.name, { cls: 't', size: 30, delay: 0.2 }) +
    t(42, 146, sub, { size: 14, delay: 0.3, opacity: 0.85 }) +
    mark(W, h, 46, discordPath, 24);
  return frame({
    h,
    bg: '#3a2f8f',
    wave: '#8fa0ff',
    waveOpts: { top: 0.4, mirror: true, span: 320 },
    title: { text: 'discord', size: 38 },
    body,
  });
}

// ---------- veri ----------
const PROJECTS = [
  { slug: 'cobalt', title: 'Cobalt', label: 'Windows app', bg: '#2b4c9b', wave: '#7fb0ff' },
  { slug: 'dpiguard', title: 'DPIGuard', label: 'Electron · GoodbyeDPI', bg: '#5b3a8a', wave: '#c08cf2' },
  { slug: 'listify', title: 'Listify', label: 'Spotify playlist tool', bg: '#3d6b3d', wave: '#a6f08a' },
  { slug: 'clawdai', title: 'Clawdai', label: 'AI chat', bg: '#ec8f84', wave: '#df4b33' },
  { slug: 'ensomg-sh', title: 'ensomg.sh', label: 'Personal site', bg: '#ec9466', wave: '#e06a2e' },
  { slug: 'anti-afk', title: 'Anti-AFK', label: 'Roblox · Python', bg: '#2f6670', wave: '#7fe0d0' },
];

const LINK_ICON =
  'M10.6 13.4a1 1 0 0 1 0-1.4l3.6-3.6a3 3 0 1 1 4.2 4.2l-2 2a1 1 0 1 1-1.4-1.4l2-2a1 1 0 1 0-1.4-1.4l-3.6 3.6a1 1 0 0 1-1.4 0zm2.8-2.8a1 1 0 0 1 0 1.4l-3.6 3.6a3 3 0 1 1-4.2-4.2l2-2a1 1 0 1 1 1.4 1.4l-2 2a1 1 0 1 0 1.4 1.4l3.6-3.6a1 1 0 0 1 1.4 0z';
const SPARKLE = 'M12 1l2.6 7.4L22 11l-7.4 2.6L12 21l-2.6-7.4L2 11l7.4-2.6z';

const LINKS = [
  { slug: 'link-site', name: 'ensomg.com', bg: '#1f4f63', wave: '#5fa8c2', icon: 'googlechrome', fallback: LINK_ICON },
  { slug: 'link-lumina', name: 'Lumina Labs', bg: '#16243f', wave: '#7fb0ff', fallback: SPARKLE },
  { slug: 'link-discord', name: 'Discord', bg: '#4752c4', wave: '#a3abff', icon: 'discord' },
  { slug: 'link-linkedin', name: 'LinkedIn', bg: '#0a5aa8', wave: '#6fb3ff', icon: 'linkedin', fallback: LINK_ICON },
  { slug: 'link-instagram', name: 'Instagram', bg: '#a8326e', wave: '#ffa36c', icon: 'instagram' },
  { slug: 'link-spotify', name: 'Spotify', bg: '#16733f', wave: '#7fe8a6', icon: 'spotify' },
  { slug: 'link-coffee', name: 'Buy me a coffee', bg: '#8a5a1f', wave: '#ffd36b', icon: 'buymeacoffee' },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const write = (slug, svg) => {
    fs.writeFileSync(path.join(OUT, `${slug}.svg`), svg);
    console.log(`${slug}.svg ${(Buffer.byteLength(svg) / 1024).toFixed(1)} KB`);
  };
  const s = await githubStats();
  console.log('stats', JSON.stringify({ ...s, weeks: s.weeks.length }));

  write('header', await header());
  for (const l of LINKS) write(l.slug, await linkCard(l));
  write('about', await about());
  write('stack', await stack());
  for (const p of PROJECTS) write(p.slug, await project(p));
  write('stats', await stats(s));
  write('communities', await communities(await iconPath('discord')));
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
