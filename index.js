// Phone System - SillyTavern extension (v0.5)
// ปุ่มลอยรูปโทรศัพท์ -> หน้าโฮมของโทรศัพท์ (รูปทรง iPhone) -> แอปต่าง ๆ
// เพิ่มแอปใหม่ด้วย registerApp({ id, label, iconHtml | icon, render(app, ctx) })

import { extension_settings, getContext } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';

const EXT = 'phone_system';
const FAB = 48; // ขนาดปุ่มลอย (px)

const defaults = {
    bank: {
        balance: 0,
        currency: '฿',
        account: { name: 'บัญชีหลัก', no: '014-2-91234', type: 'ออมทรัพย์' },
        history: [],
        favorites: [],
        notifications: [],
        cards: [],
        cardsInit: false,
        slips: [], // คลังสลิป (ข้อมูลเบื้องหลัง) ให้แอปสลิปใช้
        slipsInit: false,
        start: { set: false, src: '', amount: 0 }, // ยอดเงินเริ่มต้นตั้งไปแล้วหรือยัง (model = จากเนื้อเรื่อง / random = สุ่มล้วน)
    },
    ui: { x: null, y: null, wallpaper: '', frame: 'black' },
    contacts: { list: [], chars: {}, hideChar: false, scan: { done: false, skipped: false, at: 0, ignored: [] } },
    spaces: {}, // ข้อมูลแยกตามบอท (การ์ด/กรุ๊ป) คีย์ = c:<ไฟล์การ์ด> หรือ g:<กรุ๊ป>
};

function fill(target, def) {
    for (const k of Object.keys(def)) {
        if (target[k] === undefined) target[k] = structuredClone(def[k]);
        else if (def[k] && typeof def[k] === 'object' && !Array.isArray(def[k])) fill(target[k], def[k]);
    }
    return target;
}

const DATA_VERSION = 2; // v2: ตั้งยอดเงินเริ่มต้นเป็น 0.00

function getSettings() {
    if (!extension_settings[EXT]) extension_settings[EXT] = {};
    const s = extension_settings[EXT];
    // ย้ายข้อมูลจากรุ่นเก่า: รีเซ็ตยอดเงินเป็น 0 หนึ่งครั้ง
    if ((s.version ?? 0) < DATA_VERSION) {
        if (s.bank) {
            s.bank.balance = 0;
            s.bank.history = [];
        }
        s.version = DATA_VERSION;
        saveSettingsDebounced();
    }
    return fill(s, defaults);
}

/* ---------- แยกข้อมูลตามบอท: ยอดเงิน บัตร ประวัติ สมุดรายชื่อ ---------- */
function curChatId() {
    try {
        const c = getContext();
        return String(c.chatId ?? c.getCurrentChatId?.() ?? '');
    } catch (e) {
        return '';
    }
}
// คีย์ = การ์ด/กรุ๊ป + ไฟล์แชท -> ความจำโทรศัพท์แยกตามแชท (ถ้าไม่มี chatId จะถอยไปใช้คีย์ระดับการ์ดแบบเดิม)
function spaceKey() {
    try {
        const c = getContext();
        const cid = curChatId();
        const tail = cid ? '|' + cid : '';
        if (c.groupId) return 'g:' + c.groupId + tail;
        const ch = c.characters?.[c.characterId];
        if (ch?.avatar) return 'c:' + ch.avatar + tail;
    } catch (e) {
        /* ไม่มีแชทเปิดอยู่ */
    }
    return 'default';
}
const cardOf = (key) => String(key).split('|')[0];
function space() {
    const s = getSettings();
    const k = spaceKey();
    if (!s.spaces[k]) {
        // ข้อมูลเดิมก่อนมีระบบแยกบอท: ยกให้บอทแรกที่เปิดโทรศัพท์หลังอัปเดต (หนึ่งครั้ง)
        if (!s.legacyClaimed && k !== 'default') {
            s.spaces[k] = { bank: s.bank, contacts: s.contacts };
            s.legacyClaimed = true;
        } else {
            s.spaces[k] = { bank: structuredClone(defaults.bank), contacts: structuredClone(defaults.contacts) };
        }
        saveSettingsDebounced();
    }
    return fill(s.spaces[k], { bank: defaults.bank, contacts: defaults.contacts });
}

const save = () => saveSettingsDebounced();
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const notify = (type, msg) => (window.toastr ? window.toastr[type](msg, 'Phone System') : console.log('[Phone System]', msg));

/* ---------- โลโก้กุหลาบ (SVG วาดจากโค้ด) ---------- */
function rose(cls = '') {
    const turns = 5;
    const pts = [];
    for (let i = 0; i <= 90; i++) {
        const t = (i / 90) * Math.PI * turns;
        const r = 2 + (t / (Math.PI * turns)) * 25;
        pts.push(`${i ? 'L' : 'M'}${(50 + r * Math.cos(t)).toFixed(1)} ${(50 + r * Math.sin(t)).toFixed(1)}`);
    }
    const petals = [0, 1, 2, 3, 4]
        .map((k) => {
            const a = (k * 2 * Math.PI) / 5 - Math.PI / 2;
            return `<circle cx="${(50 + 25 * Math.cos(a)).toFixed(1)}" cy="${(50 + 25 * Math.sin(a)).toFixed(1)}" r="17"/>`;
        })
        .join('');
    return `<svg class="${cls}" viewBox="0 0 100 100" fill="currentColor" fill-opacity="0.1" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${petals}<path fill="none" d="${pts.join(' ')}"/></svg>`;
}

/* ---------- โลโก้ NEONBANK (ตัว N ฟอนต์ Poppins Bold Italic แปลงเป็นเส้นพาธ) ---------- */
const neon = (cls = '') =>
    `<svg class="${cls}" viewBox="0 0 100 100" fill="currentColor"><path d="M76.8 87.3H58.6L36.4 41.3L28.2 87.3H10L23.2 12.7H41.4L63.6 58.9L71.8 12.7H90Z"/></svg>`;

/* ---------- ไอคอนสมุดบัญชี (SVG) ---------- */
const passbook = (cls = '') =>
    `<svg class="${cls}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="10" width="42" height="28" rx="4.5" fill="currentColor" fill-opacity="0.18"/><path d="M14 10v28"/><path d="M22 19h15M22 25h9"/><circle cx="35" cy="30" r="3.2"/></svg>`;

/* ---------- วอลเปเปอร์ ---------- */
const safeUrl = (u) => {
    u = String(u || '').trim();
    if (!/^(https?:\/\/|data:image\/)/i.test(u)) return '';
    return u.replace(/["'()\s\\]/g, (c) => encodeURIComponent(c));
};
function applyWallpaper(screen) {
    const u = safeUrl(getSettings().ui.wallpaper);
    screen.style.background = u
        ? `linear-gradient(rgba(40,5,25,.18),rgba(40,5,25,.18)), url("${u}") center / cover no-repeat`
        : '';
}

/* ---------- ข้อมูลธนาคาร (ใช้ร่วมกับสมุดรายชื่อ) ---------- */
const BANKS = [
    { id: 'kbank', name: 'กสิกรไทย', ab: 'K', c: '#138f2d' },
    { id: 'scb', name: 'ไทยพาณิชย์', ab: 'SCB', c: '#4e2a84' },
    { id: 'bbl', name: 'กรุงเทพ', ab: 'BBL', c: '#1e4598' },
    { id: 'ktb', name: 'กรุงไทย', ab: 'KTB', c: '#1ba5e0' },
    { id: 'bay', name: 'กรุงศรี', ab: 'BAY', c: '#fec43b', fg: '#000' },
    { id: 'ttb', name: 'ทีเอ็มบีธนชาต', ab: 'ttb', c: '#ff6a13' },
    { id: 'gsb', name: 'ออมสิน', ab: 'GSB', c: '#eb198d' },
    { id: 'uob', name: 'ยูโอบี', ab: 'UOB', c: '#0b3a82' },
    { id: 'neon', name: 'NEONBANK', ab: 'N', c: '#c6ff00', fg: '#000' },
];
const bankOf = (id) => BANKS.find((b) => b.id === id);
const bankDot = (b, cls = '') => `<span class="ps-bdot ${cls}" style="background:${b.c};color:${b.fg || '#fff'}">${esc(b.ab)}</span>`;
const fmtDT = (ts) => new Date(ts).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtAcc = (no, mode) => {
    const d = String(no).replace(/\D/g, '');
    if (mode === 'promptpay') return d.length === 10 ? d.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3') : d;
    return d.length === 10 ? d.replace(/(\d{3})(\d)(\d{5})(\d)/, '$1-$2-$3-$4') : d;
};
const modeName = (m) => (m === 'promptpay' ? 'พร้อมเพย์' : 'เลขบัญชี');


/* ---------- สมุดรายชื่อ: ข้อมูลกลาง (ใช้ร่วมกับแอปธนาคาร) ---------- */
const CON_CATS = [
    ['friend', 'เพื่อน'],
    ['food', 'ร้านอาหาร'],
    ['shop', 'ร้านค้า'],
    ['work', 'ที่ทำงาน'],
    ['other', 'อื่นๆ'],
];
const catName = (k) => (CON_CATS.find(([x]) => x === k) || [0, 'อื่นๆ'])[1];
const AV_COLORS = ['#ff7a59', '#4f8cff', '#9b6bff', '#2fbf71', '#f2a900', '#ec4899'];
const avColor = (n) => AV_COLORS[[...String(n)].reduce((a, c) => a + c.charCodeAt(0), 0) % AV_COLORS.length];
const cssUrl = (u) => String(u || '').replace(/["'()\s\\]/g, (c) => encodeURIComponent(c));
const digitsOf = (v) => String(v ?? '').replace(/\D/g, '');
const fmtPhone = (n) => {
    const d = digitsOf(n);
    return d.length === 10 ? d.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3') : d;
};
// รุ่นเก่ามีหมวด "ตัวละครหลัก" (main) -> ย้ายไปเป็นหมวด "เพื่อน" แบบเงียบ ๆ ไม่ให้ข้อมูลหาย
const conStore = () => {
    const c = space().contacts;
    let dirty = false;
    for (const x of c.list) {
        if (x.kind === 'main') { x.kind = 'npc'; dirty = true; }
        if (x.cat === 'main') { x.cat = 'friend'; dirty = true; }
    }
    if (dirty) save();
    return c;
};

// ตัวละครที่กำลังเล่นอยู่ (ชื่อ/รูปดึงจาก SillyTavern จริง ไม่สุ่ม)
function currentChar() {
    try {
        const c = getContext();
        const ch = c.characters?.[c.characterId];
        if (!ch || !ch.avatar) return null;
        return { key: ch.avatar, name: ch.name || c.name2 || 'ตัวละคร', photo: '/characters/' + encodeURIComponent(ch.avatar) };
    } catch (e) {
        return null;
    }
}
function charContact() {
    const ch = currentChar();
    if (!ch || conStore().hideChar) return null;
    const saved = conStore().chars[ch.key];
    const st = saved || seededContact(ch.name, 'friend'); // ยังไม่เคยแก้ -> ใช้เบอร์/บัญชีที่คงที่ตามชื่อ
    return { id: 'char', kind: 'char', cat: 'char', fav: true, name: ch.name, photo: ch.photo, phone: st.phone || '', note: st.note || '', banks: st.banks || [] };
}
const allContacts = () => {
    const ch = charContact();
    return (ch ? [ch] : []).concat(conStore().list);
};

/* ---------- สุ่ม NPC ---------- */
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rdig = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
// สุ่มเลขให้บัญชีที่ผู้เล่นเว้นว่างไว้ (พร้อมเพย์ = เบอร์มือถือ 10 หลัก, บัญชี = 10 หลัก / ออมสิน 12 หลัก)
const randBankNo = (b, phone) => {
    const ph = digitsOf(phone);
    if (b.mode === 'promptpay') return ph.length === 10 ? ph : '0' + ['6', '8', '9'][Math.floor(Math.random() * 3)] + rdig(8);
    return rdig(b.bank === 'gsb' ? 12 : 10);
};
const NPC_FIRST = ['น้ำฝน', 'มายด์', 'ฟ้า', 'ต้นกล้า', 'เบนซ์', 'พลอย', 'แทน', 'ปอนด์', 'ใบเตย', 'ไอซ์', 'กัน', 'มิ้นท์', 'ภูมิ', 'นุ่น', 'เอ', 'โบว์'];
const NPC_LAST = ['ใจดี', 'รักษา', 'สุขเจริญ', 'วงศ์ทอง', 'พึ่งพา', 'ศรีสมบัติ', 'แก้วมณี', 'ทองดี', 'บุญมา', 'เพชรรัตน์'];
const NPC_FOOD = ['ส้มตำ', 'ก๋วยเตี๋ยว', 'ข้าวมันไก่', 'หมูกระทะ', 'ชาบู', 'กาแฟ', 'ข้าวแกง', 'ปิ้งย่าง', 'ต้มยำ', 'โจ๊ก'];
const NPC_OWNER = ['ป้าแดง', 'ลุงหมู', 'เจ๊หน่อย', 'พี่แจ๋ว', 'เฮียตี๋', 'น้าต๋อย', 'ป้าส้ม', 'ลุงชัย'];
const NPC_SHOP = ['ร้านขายยา', 'ร้านซักรีด', 'ร้านดอกไม้', 'ร้านเสื้อผ้า', 'ร้านมือถือ', 'ร้านสะดวกซื้อ', 'ร้านหนังสือ', 'ร้านตัดผม'];
const NPC_WORK = ['บริษัท', 'ออฟฟิศ', 'สตูดิโอ', 'คลินิก'];
const NPC_WORK2 = ['สยามพัฒนา', 'บลูสกาย', 'นิวเจน', 'โกลเด้นท์', 'เมโทร', 'ดีไซน์ลิงค์'];
function genNpc(cat) {
    if (cat === 'any') cat = pick(['friend', 'friend', 'food', 'shop', 'work']);
    const name =
        cat === 'friend' ? pick(NPC_FIRST) + ' ' + pick(NPC_LAST)
        : cat === 'food' ? 'ร้าน' + pick(NPC_FOOD) + pick(NPC_OWNER)
        : cat === 'shop' ? pick(NPC_SHOP) + pick(NPC_OWNER)
        : pick(NPC_WORK) + pick(NPC_WORK2);
    const phone = '0' + pick(['6', '8', '9']) + rdig(8);
    const bank = pick(BANKS.filter((b) => b.id !== 'neon')).id;
    const pp = cat === 'friend' || Math.random() < 0.5;
    return {
        id: 'n' + Date.now() + rdig(3),
        kind: 'npc',
        name,
        cat,
        phone,
        note: '',
        photo: '',
        fav: false,
        banks: [{ bank, mode: pp ? 'promptpay' : 'account', no: pp ? phone : rdig(10) }],
    };
}

/* ---------- สุ่มแบบคงที่ตามชื่อ: เบอร์/บัญชีของคนเดิมไม่เปลี่ยนทุกครั้งที่เปิด ---------- */
const normName = (n) => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');
function seeded(name) {
    let h = 2166136261;
    for (const ch of String(name)) {
        h ^= ch.codePointAt(0);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return () => {
        h = (h + 0x6d2b79f5) >>> 0;
        let t = h;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function seededContact(name, cat) {
    const r = seeded(normName(name));
    const rp = (a) => a[Math.floor(r() * a.length)];
    const rd = (n) => Array.from({ length: n }, () => Math.floor(r() * 10)).join('');
    const phone = '0' + rp(['6', '8', '9']) + rd(8);
    const bank = rp(BANKS.filter((b) => b.id !== 'neon')).id;
    const pp = cat === 'friend' || r() < 0.5;
    return { phone, banks: [{ bank, mode: pp ? 'promptpay' : 'account', no: pp ? phone : rd(10) }] };
}

/* ---------- สแกนข้อมูลแชท (Description + ลอร์บุ๊ค) ด้วยโมเดลของผู้เล่น ---------- */
const SCAN_ENTRY_CHARS = 700; // ตัดเนื้อหาแต่ละ entry ให้สั้น เพื่อประหยัดโทเคน
const SCAN_CARD_CHARS = 2500;
const SCAN_BATCH_CHARS = 9000; // เกินนี้แบ่งส่งทีละชุด
const SCAN_CATS = ['friend', 'food', 'shop', 'work', 'other'];
const clip = (t, n) => (String(t).length > n ? String(t).slice(0, n) + '…' : String(t));
let scanJob = null; // { key, promise } งานสแกนที่กำลังทำอยู่ (ปิดโทรศัพท์แล้วงานไม่หาย)

async function gatherScanSources() {
    const ctx = getContext();
    const cards = [];
    if (ctx.groupId) {
        const g = (ctx.groups || []).find((x) => String(x.id) === String(ctx.groupId));
        for (const av of g?.members || []) {
            const c = (ctx.characters || []).find((x) => x.avatar === av);
            if (c) cards.push(c);
        }
    } else if (ctx.characters?.[ctx.characterId]) {
        cards.push(ctx.characters[ctx.characterId]);
    }

    const items = [];
    const worlds = new Set();
    const addEntry = (e) => {
        if (!e || e.enabled === false || e.disable === true) return; // ข้าม entry ที่ปิดอยู่
        const content = String(e.content || '').trim();
        if (!content) return;
        const keys = (Array.isArray(e.keys) ? e.keys : Array.isArray(e.key) ? e.key : []).slice(0, 4).join(', ');
        const title = e.comment || e.name || keys || 'entry';
        items.push(`## ${title}${keys && keys !== title ? ' [' + keys + ']' : ''}\n${clip(content, SCAN_ENTRY_CHARS)}`);
    };

    for (const c of cards) {
        const d = c.data || {};
        const text = [c.description ?? d.description, c.personality ?? d.personality, c.scenario ?? d.scenario].filter(Boolean).join('\n');
        if (text.trim()) items.push(`### ${c.name} (character card)\n${clip(text, SCAN_CARD_CHARS)}`);
        const book = d.character_book?.entries;
        (Array.isArray(book) ? book : Object.values(book || {})).forEach(addEntry); // ลอร์บุ๊คฝังในการ์ด
        if (d.extensions?.world) worlds.add(d.extensions.world); // ลอร์บุ๊คที่ผูกกับการ์ด
    }
    const chatWorld = ctx.chatMetadata?.world_info; // ลอร์บุ๊คที่ผูกกับแชท
    if (chatWorld) worlds.add(chatWorld);
    if (worlds.size) {
        try {
            const wi = await import('../../../world-info.js');
            for (const w of worlds) {
                const data = await wi.loadWorldInfo(w);
                Object.values(data?.entries || {}).forEach(addEntry);
            }
        } catch (e) {
            console.warn('[Phone System] อ่านลอร์บุ๊คไม่สำเร็จ', e);
        }
    }

    // Persona ที่เลือกใช้ขณะนี้ ใช้ประเมินฐานะของผู้เล่นร่วมกับเนื้อเรื่องของ Char
    const persona = String(ctx.powerUserSettings?.persona_description || '').trim();
    if (persona) items.unshift(`### ${ctx.name1 || 'user'} (user persona)\n${clip(persona, 1500)}`);

    const batches = [];
    let cur = '';
    for (const it of items) {
        if (cur && cur.length + it.length > SCAN_BATCH_CHARS) {
            batches.push(cur);
            cur = '';
        }
        cur += (cur ? '\n\n' : '') + it;
    }
    if (cur) batches.push(cur);
    return { batches, user: ctx.name1 || '', groupMode: !!ctx.groupId };
}

const SCAN_SYSTEM = 'You extract phone-book contacts and the user\'s wealth level from a roleplay setting. Reply with a JSON object only.';
const scanPrompt = (batch, user, skipChar) =>
    `Read the roleplay setting below and list every named person and every named business or place that characters could phone or pay (shops, restaurants, workplaces, clinics and so on).
Rules:
- Only specific named individuals or named businesses. Skip world rules, items, magic, species, events, regions and generic groups.
- Skip "${user || 'the user'}"${skipChar ? ` and "${skipChar}"` : ''}.
- Keep each name exactly as written in the setting.
- "cat" must be one of: friend, food, shop, work, other. Use friend for any person.
- "note" is a short note (max 60 characters) in the same language as the setting, such as the person's role or relation.
- No duplicates. If there is nobody, use an empty contacts list.
- "wealth" is the financial status of "${user || 'the user'}" (the user's persona), judged from the persona section and the character cards/scenario if present. Use "poor", "middle" or "rich" only when the text clearly implies it. Otherwise use "unknown".
Reply with the JSON object only, no explanation. Format: {"wealth":"unknown","contacts":[{"name":"","cat":"friend","note":""}]}

=== SETTING ===
${batch}`;

// เรียกโมเดลของผู้เล่นผ่าน generateRaw (รุ่นใหม่รับ object / รุ่นเก่ารับพารามิเตอร์เรียงตัว)
async function askModel(prompt, attempt) {
    const ctx = getContext();
    let gen = ctx.generateRaw;
    if (typeof gen !== 'function') gen = (await import('../../../../script.js')).generateRaw;
    if (typeof gen !== 'function') throw new Error('ไม่พบฟังก์ชันเรียกโมเดลของ SillyTavern');
    const out = attempt === 0
        ? await gen({ prompt, systemPrompt: SCAN_SYSTEM, responseLength: 1500 })
        : await gen(prompt, null, false, false, SCAN_SYSTEM, 1500);
    return String(out ?? '');
}

function parseScan(text) {
    const t = String(text).replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '');
    const o = t.indexOf('{');
    const a = t.indexOf('[');
    if (o >= 0 && (a < 0 || o < a)) {
        const obj = JSON.parse(t.slice(o, t.lastIndexOf('}') + 1));
        if (!Array.isArray(obj.contacts)) throw new Error('โมเดลไม่ได้ตอบรายชื่อ');
        return { contacts: obj.contacts, wealth: String(obj.wealth || 'unknown').toLowerCase() };
    }
    const b = t.lastIndexOf(']');
    if (a < 0 || b <= a) throw new Error('โมเดลไม่ได้ตอบเป็น JSON');
    const arr = JSON.parse(t.slice(a, b + 1));
    if (!Array.isArray(arr)) throw new Error('โมเดลไม่ได้ตอบเป็นรายการ');
    return { contacts: arr, wealth: 'unknown' };
}

/* ---------- ยอดเงินเริ่มต้น: ตามฐานะจากเนื้อเรื่อง/Persona ถ้าไม่ระบุให้สุ่มเอง ---------- */
const WEALTH = { poor: [300, 4000, 10], middle: [8000, 90000, 100], rich: [300000, 3000000, 1000] }; // [ต่ำสุด, สูงสุด, ปัดเศษ]
function rollStartBalance(tier) {
    if (!WEALTH[tier]) {
        const r = Math.random(); // ไม่ระบุ: สุ่มฐานะ (จน 25% / กลาง 55% / รวย 20%)
        tier = r < 0.25 ? 'poor' : r < 0.8 ? 'middle' : 'rich';
    }
    const [lo, hi, step] = WEALTH[tier];
    const v = Math.exp(Math.log(lo) + Math.random() * (Math.log(hi) - Math.log(lo))); // สุ่มแบบ log เพื่อให้ยอดต่ำพบบ่อยกว่ายอดสูง
    let amount = Math.round(v / step) * step;
    if (tier !== 'rich') amount += Math.floor(Math.random() * 100) / 100;
    return { tier, amount };
}
// ตั้งครั้งเดียวต่อแชท และไม่แตะบัญชีที่ผู้เล่นเริ่มใช้เงินไปแล้ว
function applyStartBalance(bank, wealth) {
    const st = bank.start;
    const known = !!WEALTH[wealth];
    const untouched = bank.history.length === 0 && Math.abs(bank.balance - st.amount) < 0.005;
    if (st.set) {
        // เคยสุ่มล้วนไว้ (กด "ไว้ทีหลัง") แล้วสแกนรู้ฐานะทีหลัง และผู้เล่นยังไม่ได้ใช้เงิน -> ตั้งใหม่ให้ตรงเนื้อเรื่อง
        if (!(st.src === 'random' && known && untouched)) return null;
    } else if (bank.balance !== 0 || bank.history.length) {
        st.set = true; // บัญชีเดิมที่มีเงิน/ประวัติอยู่แล้ว ไม่แตะต้อง
        st.src = 'existing';
        return null;
    }
    const r = rollStartBalance(wealth);
    bank.balance = r.amount;
    st.set = true;
    st.src = known ? 'model' : 'random';
    st.amount = r.amount;
    save();
    return r;
}

async function runScan() {
    const st = conStore(); // จับที่เก็บของแชทนี้ไว้ก่อน เผื่อผู้เล่นเปลี่ยนแชทระหว่างสแกน
    const bank = space().bank;
    const cur = currentChar();
    const src = await gatherScanSources();
    const found = [];
    let wealth = 'unknown';
    for (const [bi, batch] of src.batches.entries()) {
        let list = null;
        let lastErr = null;
        for (let attempt = 0; attempt < 2 && !list; attempt++) {
            try {
                list = parseScan(await askModel(scanPrompt(batch, src.user, src.groupMode ? '' : cur?.name), attempt));
            } catch (e) {
                lastErr = e;
            }
        }
        if (!list) throw lastErr || new Error('สแกนไม่สำเร็จ');
        if (bi === 0) wealth = list.wealth; // ชุดแรกมี Persona + การ์ดอยู่เสมอ
        found.push(...list.contacts);
    }

    const skip = new Set((st.scan.ignored || []).concat([src.user, src.groupMode ? '' : cur?.name]).map(normName));
    const known = new Set(st.list.map((c) => normName(c.name)));
    let added = 0;
    for (const f of found) {
        const name = String(f?.name ?? '').trim().slice(0, 60);
        const key = normName(name);
        if (!name || known.has(key) || skip.has(key)) continue;
        const cat = SCAN_CATS.includes(f.cat) ? f.cat : 'other';
        const sc = seededContact(name, cat);
        st.list.push({ id: 'l' + Date.now() + rdig(3), kind: 'lore', name, cat, photo: '', phone: sc.phone, note: String(f.note ?? '').trim().slice(0, 80), banks: sc.banks, fav: false });
        known.add(key);
        added++;
    }
    st.scan.done = true;
    st.scan.at = Date.now();
    save();
    const start = applyStartBalance(bank, wealth);
    return { added, start };
}

const needsScanPopup = () => {
    const key = spaceKey();
    if (key === 'default') return false;
    if (scanJob?.key === key) return true;
    const sc = conStore().scan;
    return !sc.done && !sc.skipped;
};

// ของลอย ๆ อยู่ในกล่องข้อความเท่านั้น (card มี overflow: hidden)
function sprinkle(card) {
    const cols = ['#4f8cff', '#6d54d8', '#c0457f', '#8b5cf6'];
    for (let i = 0; i < 22; i++) {
        const plus = Math.random() < 0.45;
        const size = plus ? 0.5 + Math.random() * 0.4 : 0.3 + Math.random() * 0.25;
        const e = document.createElement('span');
        e.className = 'ps-scan-p ' + (plus ? 'pl' : 'sq');
        e.style.cssText = `left:${(Math.random() * 94).toFixed(1)}%;top:${(Math.random() * 92).toFixed(1)}%;width:${size.toFixed(2)}em;height:${size.toFixed(2)}em;color:${cols[i % cols.length]};--d:${(6 + Math.random() * 7).toFixed(1)}s;--l:-${(Math.random() * 9).toFixed(1)}s;--x:${((Math.random() - 0.5) * 2).toFixed(2)}em;--y:${(-0.6 - Math.random() * 1.8).toFixed(2)}em;--r:${((Math.random() - 0.5) * 90).toFixed(0)}deg`;
        card.insertBefore(e, card.firstChild);
    }
}

// ป๊อปอัพสวัสดี + ปุ่มสแกน (ซ้อนบนหน้าจอโทรศัพท์)
function showScanDialog(screen, { onDone } = {}) {
    if (!screen || screen.querySelector('.ps-scan')) return;
    const st = conStore();
    const wrap = document.createElement('div');
    wrap.className = 'ps-scan';
    wrap.innerHTML = `<div class="ps-scan-card"><div class="ps-scan-in">
        <div class="ps-scan-view" data-v="main">
            <div class="ps-scan-ttl">สวัสดีผู้เล่น!</div>
            <p class="ps-scan-bd">ส่วนเสริมของเราต้องขอสแกนข้อมูลเพื่ออรรถรสที่กลมกล่อม ได้โปรดให้พวกเราสแกนข้อมูลของท่าน</p>
            <p class="ps-scan-nt"><b>หมายเหตุ :</b> ความละเอียดขึ้นอยู่กับโมเดลที่ผู้เล่นใช้ โมเดลบางตัวอาจตกหล่นหรือจัดหมวดผิด สามารถแก้ทีหลังหรือสแกนใหม่ได้</p>
            <div class="ps-scan-row"><button class="ps-scan-btn go" data-a="go">สแกนเนื้อหา</button><button class="ps-scan-btn later" data-a="later">ไว้ทีหลัง</button></div>
        </div>
        <div class="ps-scan-view" data-v="load" hidden><div class="ps-scan-spin" role="status" aria-label="กำลังสแกน"></div><p class="ps-scan-lt">กำลังสแกน...<br>โปรดรอสักครู่</p></div>
        <div class="ps-scan-view" data-v="err" hidden>
            <div class="ps-scan-ttl">สแกนไม่สำเร็จ</div>
            <p class="ps-scan-bd" data-role="msg"></p>
            <div class="ps-scan-row"><button class="ps-scan-btn go" data-a="go">ลองใหม่</button><button class="ps-scan-btn later" data-a="close">ปิด</button></div>
        </div>
    </div></div>`;
    screen.appendChild(wrap);

    const card = wrap.querySelector('.ps-scan-card');
    sprinkle(card);

    const view = (v) => wrap.querySelectorAll('.ps-scan-view').forEach((x) => (x.hidden = x.dataset.v !== v));
    const start = () => {
        view('load');
        const key = spaceKey();
        if (!scanJob || scanJob.key !== key) {
            const promise = runScan().finally(() => {
                if (scanJob?.promise === promise) scanJob = null;
            });
            scanJob = { key, promise };
        }
        scanJob.promise.then(
            ({ added, start }) => {
                wrap.remove();
                const money = start ? ` · ยอดเงินเริ่มต้น ${space().bank.currency}${start.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
                notify('success', (added ? `พบ ${added} รายชื่อใหม่` : 'ไม่พบรายชื่อเพิ่มเติม') + money);
                if (screen.isConnected) onDone?.(added);
            },
            (err) => {
                console.error('[Phone System] scan failed', err);
                if (!wrap.isConnected) return;
                wrap.querySelector('[data-role="msg"]').textContent = 'โมเดลตอบกลับในรูปแบบที่อ่านไม่ได้ หรือเชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้งได้ (' + (err?.message || 'unknown') + ')';
                view('err');
            },
        );
    };
    wrap.addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]')?.dataset.a;
        if (a === 'go') start();
        else if (a === 'later') {
            st.scan.skipped = true;
            applyStartBalance(space().bank, 'unknown'); // ยังไม่สแกน -> สุ่มยอดเงินเริ่มต้นให้ก่อน
            save();
            wrap.remove();
        } else if (a === 'close') wrap.remove();
    });
    if (scanJob?.key === spaceKey()) start(); // กำลังสแกนอยู่แล้ว (เปิดโทรศัพท์ซ้ำ) -> ต่อที่หน้าโหลดเลย
}

/* ---------- ความจำโทรศัพท์แยกตามแชท: ถามก่อนสร้างแชทใหม่ ---------- */
let lastKey = null; // แชทที่เปิดอยู่ก่อนหน้านี้
let pendingNew = null; // คำตอบที่ผู้เล่นเลือกไว้ก่อนกดสร้างแชทใหม่ { card, from, mode, at }
let gateBypass = false;

const touchSpace = (key) => {
    const sp = getSettings().spaces[key];
    if (sp) sp.at = Date.now();
};
// สร้างความจำของแชทใหม่: fromKey = คัดลอกจากแชทเดิม / null = เริ่มใหม่ทั้งหมด
function createSpaceFrom(key, fromKey) {
    const s = getSettings();
    const src = fromKey && s.spaces[fromKey];
    s.spaces[key] = src
        ? structuredClone(src)
        : { bank: structuredClone(defaults.bank), contacts: structuredClone(defaults.contacts) };
    s.spaces[key].at = Date.now();
    saveSettingsDebounced();
}
// หาความจำเดิมของการ์ดเดียวกัน: แชทก่อนหน้า > อันที่ใช้ล่าสุด (รวมข้อมูลระดับการ์ดของรุ่นเก่า)
function memorySource(key, prev) {
    const s = getSettings();
    const card = cardOf(key);
    const cands = Object.keys(s.spaces).filter((k) => k !== key && cardOf(k) === card);
    if (!cands.length) return null;
    if (prev && cands.includes(prev)) return prev;
    return cands.sort((a, b) => (s.spaces[b].at || 0) - (s.spaces[a].at || 0))[0];
}

// กล่องถาม (อยู่บนหน้า SillyTavern เอง ไม่ใช่ในจอโทรศัพท์) -> 'fresh' | 'keep' | null (ยกเลิก)
function showGate({ title, body, cancellable, deleteOld }) {
    return new Promise((resolve) => {
        const wrap = document.createElement('div');
        wrap.className = 'ps-gate';
        wrap.innerHTML = `<div class="ps-scan-card"><div class="ps-scan-in">
            <div class="ps-scan-ttl">${esc(title)}</div>
            <p class="ps-scan-bd">${esc(body)}</p>
            <p class="ps-scan-nt"><b>เริ่มใหม่ทั้งหมด :</b> ยอดเงิน ประวัติโอน บัตร และสมุดรายชื่อเริ่มจากศูนย์ แล้วสแกนข้อมูลของแชทใหม่ให้${deleteOld ? ' <u>ข้อมูลโทรศัพท์ของแชทเดิมจะถูกลบทิ้ง</u>' : ''}<br><b>ใช้ความจำเดิม :</b> นำข้อมูลโทรศัพท์จากแชทเดิมมาใช้ต่อในแชทใหม่ (ไม่มีการลบอะไร)</p>
            <div class="ps-scan-row"><button class="ps-scan-btn go" data-a="fresh">เริ่มใหม่ทั้งหมด</button><button class="ps-scan-btn later" data-a="keep">ใช้ความจำเดิม</button></div>
            ${cancellable ? '<button class="ps-gate-cancel" data-a="cancel">ยกเลิก ไม่สร้างแชทใหม่</button>' : ''}
        </div></div>`;
        (document.documentElement || document.body).appendChild(wrap); // ต่อกับ <html> กัน body ที่มี transform/filter ทำให้ fixed เพี้ยน
        sprinkle(wrap.querySelector('.ps-scan-card'));
        wrap.addEventListener('click', (e) => {
            const a = e.target.closest('[data-a]')?.dataset.a;
            if (!a) return;
            wrap.remove();
            resolve(a === 'cancel' ? null : a);
        });
    });
}

// ดักปุ่ม "Start new chat" ก่อนระบบสร้างแชทจริง
function installNewChatGate() {
    document.addEventListener(
        'click',
        (e) => {
            const el = e.target.closest?.('#option_start_new_chat');
            if (!el || gateBypass) return;
            const key = spaceKey();
            if (key === 'default') return; // ยังไม่มีแชทที่เปิดอยู่
            e.preventDefault();
            e.stopImmediatePropagation();
            showGate({
                title: 'สร้างแชทใหม่',
                body: 'โทรศัพท์ในแชทใหม่จะเริ่มต้นแบบไหน? เลือกก่อนสร้างแชท',
                cancellable: true,
                deleteOld: true,
            }).then((mode) => {
                if (!mode) return;
                pendingNew = { card: cardOf(key), from: key, mode, at: Date.now() };
                gateBypass = true;
                try {
                    el.click(); // ปล่อยให้ SillyTavern สร้างแชทต่อตามปกติ
                } finally {
                    gateBypass = false;
                }
            });
        },
        true,
    );
}

function onChatChanged() {
    try {
        const key = spaceKey();
        const prev = lastKey;
        lastKey = key;
        const intent = pendingNew && Date.now() - pendingNew.at < 5 * 60 * 1000 ? pendingNew : null;
        pendingNew = null;
        if (key === 'default' || key === prev) return;
        const s = getSettings();
        if (s.spaces[key]) return touchSpace(key); // แชทที่เคยมีความจำแล้ว
        if (intent && intent.card === cardOf(key)) {
            // ผู้เล่นเลือกไว้แล้วตอนกดสร้างแชทใหม่
            createSpaceFrom(key, intent.mode === 'keep' ? intent.from : null);
            if (intent.mode === 'fresh' && intent.from !== key) {
                delete s.spaces[intent.from]; // เริ่มใหม่ทั้งหมด -> ลบข้อมูลโทรศัพท์ของแชทเดิมทิ้ง
                saveSettingsDebounced();
            }
            return;
        }
        const from = memorySource(key, prev);
        if (!from) return; // ไม่มีความจำเดิมให้ถือไป -> เริ่มใหม่แบบเงียบ ๆ
        // แชทใหม่ที่ถูกสร้างจากทางอื่น (เช่น /newchat, จัดการไฟล์แชท) หรือแชทเก่าที่เพิ่งเปิดครั้งแรก
        showGate({
            title: 'แชทนี้ยังไม่มีข้อมูลโทรศัพท์',
            body: 'ต้องการเริ่มใหม่ทั้งหมด หรือใช้ความจำเดิมของการ์ดนี้?',
            cancellable: false,
        }).then((mode) => {
            if (spaceKey() !== key) return; // ผู้เล่นสลับแชทไปแล้ว
            createSpaceFrom(key, mode === 'keep' ? from : null);
        });
    } catch (e) {
        console.error('[Phone System] chat change handler failed', e);
    }
}

let pendingTransfer = null; // ข้อมูลผู้รับจากสมุดรายชื่อ ให้แอปธนาคารเปิดหน้าโอนพร้อมกรอกให้
/* ---------- App registry ---------- */
let pendingFocus = null; // id บัตรที่เพิ่งเพิ่ม ให้เลื่อนไปหาหลังกลับหน้าหลัก
const apps = [];
function registerApp(a) {
    apps.push(a);
}

/* ---------- แอป: ธนาคาร (RoseBank) ---------- */
registerApp({
    id: 'bank',
    label: 'NEONBANK',
    fontClass: 'ps-bank',
    iconHtml: neon('ps-app-rose'),
    render(app, ctx) {
        const s = space().bank;
        let user = 'ฟิวส์';
        try {
            user = getContext()?.name1 || user;
        } catch (e) {
            /* ใช้ค่าเริ่มต้น */
        }
        const [int, dec] = Number(s.balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split('.');
        const maskedNo = 'xxx-x-x' + String(s.account.no).replace(/\D/g, '').slice(-4);

        const tiles = [
            { icon: 'fa-right-left', label: 'โอนเงิน' },
            { icon: 'fa-download', label: 'รับเงิน' },
            { icon: 'fa-arrow-right-arrow-left', label: 'โอนระหว่างบัญชี' },
            { icon: 'fa-plus', label: 'เพิ่มบัญชี' },
        ];

        app.innerHTML = `
            <div class="ps-hero">
                <div class="ps-hero-bg"></div>

                <div class="ps-head">
                    <div class="ps-brand">
                        ${neon('ps-logo')}
                        <div class="ps-name">NEONBANK</div>
                    </div>
                    <div class="ps-head-right">
                        <button class="ps-bell" title="การแจ้งเตือน"><i class="fa-regular fa-bell"></i>${s.notifications.some((n) => !n.read) ? '<span class="ps-dot"></span>' : ''}</button>
                    </div>
                </div>

                <div class="ps-hello">Welcome, ${esc(user)}</div>

                <div class="ps-acct">
                    <div class="ps-acct-top">${passbook('ps-acct-ico')}<span>${esc(s.account.name)}</span></div>
                    <div class="ps-bal-row">
                        <div class="ps-bal"><span class="ps-cur">${esc(s.currency)}</span><span>${int}</span><small>.${dec}</small></div>
                    </div>
                    <div class="ps-line"></div>
                    <div class="ps-acct-bottom">
                        <div>
                            <div class="ps-no">${esc(maskedNo)}</div>
                            <div class="ps-type">${esc(s.account.type)}</div>
                        </div>
                        <button class="ps-copy"><i class="fa-regular fa-copy"></i> คัดลอกเลขบัญชี</button>
                    </div>
                </div>
            </div>

            <div class="ps-tiles">
                ${tiles
                    .map((t, i) => `<button class="ps-tile${i === 0 ? ' on' : ''}"><i class="fa-solid ${t.icon}"></i><span>${esc(t.label)}</span></button>`)
                    .join('')}
            </div>

            <section class="ps-cards">
                <div class="ps-sec-title"><span class="ps-sec-ico"><i class="fa-solid fa-credit-card"></i></span><span>บัตรของฉัน</span><button class="ps-manage">จัดการบัตร</button></div>
                <div class="ps-track"></div>
                <div class="ps-cardbar">
                    <div class="ps-dots"></div>
                </div>
            </section>`;

        // ---------- บัตร: ปัดซ้ายขวา / พลิกหน้า-หลัง / เอฟเฟกต์เลื่อม / เพิ่ม-ลบบัตร ----------
        const COLORS = ['lime', 'black', 'white', 'violet', 'coral'];
        const COLOR_NAMES = { lime: 'มะนาว', black: 'ดำ', white: 'ขาว', violet: 'ม่วง', coral: 'ส้มชมพู' };
        const TYPES = [
            { id: 'visa', label: 'Visa' },
            { id: 'mastercard', label: 'Mastercard' },
            { id: 'credit', label: 'บัตรเครดิต' },
            { id: 'debit', label: 'บัตรเดบิต' },
        ];
        const MAX_CARDS = 6;
        const rnd = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
        // สุ่มเลขบัตร 16 หลักที่ผ่านการตรวจ Luhn
        const cardNo = (prefix) => {
            const d = prefix + rnd(15 - prefix.length);
            let sum = 0;
            for (let i = 0; i < 15; i++) {
                let n = Number(d[14 - i]);
                if (i % 2 === 0) {
                    n *= 2;
                    if (n > 9) n -= 9;
                }
                sum += n;
            }
            return d + ((10 - (sum % 10)) % 10);
        };
        const newCard = (o = {}) => {
            const type = o.type || 'visa';
            const number = cardNo(type === 'mastercard' ? '5' : '4');
            const yy = String((new Date().getFullYear() + 4) % 100).padStart(2, '0');
            return {
                id: Date.now() + '_' + rnd(4),
                color: o.color || 'lime',
                type,
                name: o.name || user,
                number,
                last4: number.slice(-4),
                expiry: String(1 + Math.floor(Math.random() * 12)).padStart(2, '0') + '/' + yy,
                cvv: rnd(3),
            };
        };
        if (!s.cardsInit) {
            if (!s.cards.length) s.cards.push(newCard({ color: 'lime', name: user }));
            s.cardsInit = true;
            save();
        }

        const track = app.querySelector('.ps-track');
        const dotsEl = app.querySelector('.ps-dots');
        let cur = 0;

        const money = (v) => esc(s.currency) + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const brand = (t) =>
            t === 'mastercard'
                ? '<span class="ps-mc"><i></i><i></i></span>'
                : t === 'credit'
                  ? '<span class="ps-ctype">CREDIT</span>'
                  : t === 'debit'
                    ? '<span class="ps-ctype">DEBIT</span>'
                    : '<span class="ps-visa">VISA</span>';
        const fmtNo = (n) => String(n).replace(/(\d{4})(?=\d)/g, '$1 ');

        // หน้า-หลังของบัตร (ใช้ทั้งในรายการบัตรและตัวอย่างตอนเพิ่มบัตร)
        const cardFaces = (c, main, bal) => `
            <div class="ps-face ps-front ps-c-${c.color}">
                <div class="ps-wm">NEON</div>
                <div class="ps-c-top"><span class="ps-c-name">${esc(c.name || user)}</span>${brand(c.type)}</div>
                <div class="ps-c-bot">
                    <span class="ps-c-no">•••• ${esc(c.last4)}</span>
                    ${main ? '<span class="ps-main"><i class="fa-solid fa-circle-check"></i> บัตรหลัก</span>' : ''}
                </div>
                <div class="ps-sheen"></div>
            </div>
            <div class="ps-face ps-back ps-c-${c.color}">
                <div class="ps-stripe"></div>
                <div class="ps-sign"><span>CVV</span><b>${esc(c.cvv)}</b></div>
                <div class="ps-b-info">
                    <span>${c.number ? esc(fmtNo(c.number)) : '•••• •••• •••• ' + esc(c.last4)}</span>
                    <span>หมดอายุ ${esc(c.expiry)}</span>
                </div>
                <div class="ps-b-brand">NEONBANK</div>
                <div class="ps-sheen"></div>
            </div>`;

        const cardHtml = (c, i) => `
            <div class="ps-slide" data-i="${i}">
                <div class="ps-tilt"><div class="ps-flipper">${cardFaces(c, i === 0, money(i === 0 ? s.balance : 0))}</div></div>
            </div>`;

        const addHtml = `
            <div class="ps-slide ps-slide-add">
                <div class="ps-tilt"><button class="ps-addcard"><i class="fa-solid fa-plus"></i><span>เพิ่มบัตร</span></button></div>
            </div>`;

        const slides = () => [...track.querySelectorAll('.ps-slide')];

        const updateTilt = () => {
            const r = track.getBoundingClientRect();
            const cx = r.left + r.width / 2;
            let best = 0;
            let bestD = Infinity;
            slides().forEach((sl, i) => {
                const b = sl.getBoundingClientRect();
                const off = (b.left + b.width / 2 - cx) / (b.width || 1);
                sl.style.setProperty('--ry', (-off * 16).toFixed(1) + 'deg');
                sl.style.setProperty('--sx', (47 - off * 70).toFixed(1) + '%');
                if (Math.abs(off) < bestD) {
                    bestD = Math.abs(off);
                    best = i;
                }
            });
            if (best !== cur) {
                cur = best;
                paintDots();
            }
        };

        const paintDots = () => {
            const n = slides().length;
            dotsEl.innerHTML = Array.from({ length: n }, (_, i) => `<i class="${i === cur ? 'on' : ''}"></i>`).join('');
        };

        const renderCards = () => {
            track.innerHTML = s.cards.map(cardHtml).join('') + (s.cards.length < MAX_CARDS ? addHtml : '');
            paintDots();
            updateTilt();
        };

        const scrollToSlide = (i, smooth = true) => {
            const sl = slides()[i];
            if (!sl) return;
            track.scrollTo({ left: sl.offsetLeft - (track.clientWidth - sl.offsetWidth) / 2, behavior: smooth ? 'smooth' : 'auto' });
        };

        let raf = 0;
        track.addEventListener('scroll', () => {
            if (raf) return;
            raf = requestAnimationFrame(() => {
                raf = 0;
                updateTilt();
            });
        });

        /* ----- หน้ากรอกข้อมูลเพิ่มบัตร ----- */
        const showForm = (editing = null, from = 'bank') => {
            if (!editing && s.cards.length >= MAX_CARDS) return;
            const draft = editing ? { ...editing } : newCard({ color: COLORS[s.cards.length % COLORS.length], name: user });
            const leave = () => (from === 'manage' ? showManage() : ctx.open('bank'));
            app.scrollTop = 0;
            app.innerHTML = `
                <div class="ps-form">
                    <div class="ps-form-head">
                        <button class="ps-fback" title="กลับ"><i class="fa-solid fa-chevron-left"></i></button>
                        <span>${editing ? 'แก้ไขบัตร' : 'เพิ่มบัตร'}</span>
                    </div>
                    <div class="ps-pv"><div class="ps-flipper"></div></div>
                    <div class="ps-pvhint">แตะบัตรเพื่อดูด้านหลัง</div>
                    <div class="ps-fcard">
                        <label class="ps-flbl" for="ps_cn">ชื่อบัตร</label>
                        <input id="ps_cn" class="ps-finput" maxlength="24" value="${esc(draft.name)}" autocomplete="off">
                        <div class="ps-flbl">ประเภทบัตร</div>
                        <div class="ps-chips">${TYPES.map((t) => `<button class="ps-chip${t.id === draft.type ? ' on' : ''}" data-t="${t.id}">${t.label}</button>`).join('')}</div>
                        <div class="ps-flbl">สีบัตร</div>
                        <div class="ps-swatches">${COLORS.map((k) => `<button class="ps-sw ps-sw-${k}${k === draft.color ? ' on' : ''}" data-c="${k}" title="${COLOR_NAMES[k]}"></button>`).join('')}</div>
                        <div class="ps-fnote"><i class="fa-solid fa-dice"></i> ${editing ? 'เลขบัตร เลขหลังบัตร และวันหมดอายุ คงเดิม' : 'เลขบัตร เลขหลังบัตร และวันหมดอายุ จะสุ่มให้อัตโนมัติ'}</div>
                    </div>
                    <button class="ps-fsave"><i class="fa-solid fa-floppy-disk"></i> บันทึก</button>
                </div>`;
            const pv = app.querySelector('.ps-pv');
            const flip = pv.querySelector('.ps-flipper');
            const paintPv = () => (flip.innerHTML = cardFaces(draft, false, money(0)));
            paintPv();
            pv.onclick = () => pv.classList.toggle('flipped');
            app.querySelector('.ps-fback').onclick = leave;
            app.querySelector('#ps_cn').addEventListener('input', (e) => {
                draft.name = e.target.value.trim() || user;
                paintPv();
            });
            app.querySelector('.ps-chips').addEventListener('click', (e) => {
                const b = e.target.closest('.ps-chip');
                if (!b) return;
                draft.type = b.dataset.t;
                if (!editing) {
                    draft.number = cardNo(draft.type === 'mastercard' ? '5' : '4');
                    draft.last4 = draft.number.slice(-4);
                }
                app.querySelectorAll('.ps-chip').forEach((x) => x.classList.toggle('on', x === b));
                paintPv();
            });
            app.querySelector('.ps-swatches').addEventListener('click', (e) => {
                const b = e.target.closest('.ps-sw');
                if (!b) return;
                draft.color = b.dataset.c;
                app.querySelectorAll('.ps-sw').forEach((x) => x.classList.toggle('on', x === b));
                paintPv();
            });
            app.querySelector('.ps-fsave').onclick = () => {
                if (editing) {
                    Object.assign(editing, draft);
                    save();
                    notify('success', 'บันทึกการแก้ไขแล้ว');
                } else {
                    s.cards.push(draft);
                    save();
                    pendingFocus = draft.id;
                    notify('success', 'เพิ่มบัตรใหม่แล้ว');
                }
                leave();
            };
        };

        /* ----- ลบบัตร (มีหน้าต่างยืนยัน) ----- */
        const askDelete = (idx, done) => {
            const c = s.cards[idx];
            if (!c) return;
            const scr = app.closest('.ps-screen');
            const d = document.createElement('div');
            d.className = 'ps-dlg';
            d.innerHTML = `
                <div class="ps-dlg-box">
                    <div class="ps-dlg-ic"><i class="fa-regular fa-trash-can"></i></div>
                    <div class="ps-dlg-t">ลบบัตรนี้?</div>
                    <div class="ps-dlg-s">${esc(c.name || user)} •••• ${esc(c.last4)}<br>จะถูกลบออกถาวร</div>
                    <div class="ps-dlg-b"><button data-a="no">ยกเลิก</button><button data-a="yes" class="del">ลบบัตร</button></div>
                </div>`;
            scr.appendChild(d);
            d.addEventListener('click', (e) => {
                const a = e.target.closest('button')?.dataset.a;
                if (e.target === d || a === 'no') return d.remove();
                if (a !== 'yes') return;
                s.cards.splice(idx, 1);
                save();
                d.remove();
                notify('success', 'ลบบัตรแล้ว');
                done();
            });
        };

        /* ----- หน้าจัดการบัตร: บัตรเรียงลงมา มีปุ่มแก้ไข/ลบด้านขวา ----- */
        const showManage = () => {
            app.scrollTop = 0;
            app.innerHTML = `
                <div class="ps-form">
                    <div class="ps-form-head">
                        <button class="ps-fback" title="กลับ"><i class="fa-solid fa-chevron-left"></i></button>
                        <span>จัดการบัตร</span>
                    </div>
                    <div class="ps-mlist">
                        ${
                            s.cards.length
                                ? s.cards
                                      .map(
                                          (c, i) => `
                            <div class="ps-mrow" data-i="${i}">
                                <div class="ps-mcard"><div class="ps-flipper">${cardFaces(c, i === 0, money(i === 0 ? s.balance : 0))}</div></div>
                                <div class="ps-mact">
                                    <button class="ps-ibtn ps-ibtn-edit" data-a="edit" title="แก้ไข"><i class="fa-solid fa-pencil"></i></button>
                                    <button class="ps-ibtn ps-ibtn-del" data-a="del" title="ลบ"><i class="fa-regular fa-trash-can"></i></button>
                                </div>
                            </div>`,
                                      )
                                      .join('')
                                : '<div class="ps-mempty">ยังไม่มีบัตร</div>'
                        }
                    </div>
                    ${s.cards.length < MAX_CARDS ? '<button class="ps-fsave ps-madd"><i class="fa-solid fa-plus"></i> เพิ่มบัตร</button>' : ''}
                </div>`;
            app.querySelector('.ps-fback').onclick = () => ctx.open('bank');
            app.querySelector('.ps-madd')?.addEventListener('click', () => showForm(null, 'manage'));
            app.querySelector('.ps-mlist').addEventListener('click', (e) => {
                const row = e.target.closest('.ps-mrow');
                if (!row) return;
                const i = Number(row.dataset.i);
                const act = e.target.closest('.ps-ibtn')?.dataset.a;
                if (act === 'edit') return showForm(s.cards[i], 'manage');
                if (act === 'del') return askDelete(i, showManage);
                if (e.target.closest('.ps-mcard')) row.querySelector('.ps-mcard').classList.toggle('flipped');
            });
        };

        // แตะบัตร = พลิกหน้า/หลัง, แตะบัตรเปล่า = ไปหน้าเพิ่มบัตร
        track.addEventListener('click', (e) => {
            if (e.target.closest('.ps-addcard')) return showForm();
            const sl = e.target.closest('.ps-slide:not(.ps-slide-add)');
            if (sl) sl.classList.toggle('flipped');
        });
        app.querySelector('.ps-manage').onclick = showManage;

        // เอียงบัตรตามนิ้ว/เมาส์เล็กน้อย + เอฟเฟกต์เลื่อมขยับตาม
        track.addEventListener('pointermove', (e) => {
            const sl = e.target.closest('.ps-slide');
            if (!sl) return;
            const b = sl.getBoundingClientRect();
            const x = Math.max(-1, Math.min(1, ((e.clientX - b.left) / b.width) * 2 - 1));
            const y = Math.max(-1, Math.min(1, ((e.clientY - b.top) / b.height) * 2 - 1));
            sl.style.setProperty('--pry', (x * 8).toFixed(1) + 'deg');
            sl.style.setProperty('--prx', (-y * 6).toFixed(1) + 'deg');
            sl.style.setProperty('--sxp', (-x * 25).toFixed(1) + '%');
        });
        const calm = (e) => {
            const sl = e.target.closest?.('.ps-slide');
            (sl ? [sl] : slides()).forEach((x) => ['--pry', '--prx', '--sxp'].forEach((k) => x.style.removeProperty(k)));
        };
        track.addEventListener('pointerleave', calm);
        track.addEventListener('pointerup', calm);
        track.addEventListener('pointercancel', calm);

        renderCards();
        const focusIdx = pendingFocus ? s.cards.findIndex((c) => c.id === pendingFocus) : -1;
        pendingFocus = null;
        requestAnimationFrame(() => {
            scrollToSlide(0, false);
            if (focusIdx > 0) setTimeout(() => scrollToSlide(focusIdx, true), 150);
        });

        // คัดลอกเลขบัญชี
        app.querySelector('.ps-copy').onclick = async () => {
            try {
                await navigator.clipboard.writeText(String(s.account.no));
                notify('success', 'คัดลอกเลขบัญชีแล้ว');
            } catch (e) {
                notify('info', 'เลขบัญชี: ' + s.account.no);
            }
        };

        /* ================= โอนเงิน ================= */

        // ร่างรายการที่กำลังกรอก (ค้างไว้ตอนย้อนกลับจากหน้ายืนยัน)
        let draft = { name: '', bank: '', mode: 'promptpay', no: '', amount: '', note: '' };

        // ชื่อผู้รับจริง: ถ้าเลขบัญชี/พร้อมเพย์ตรงกับสมุดรายชื่อ ใช้ชื่อในสมุดรายชื่อ ไม่งั้นใช้ชื่อที่กรอก
        const lookupRecipient = (d) => {
            const no = digitsOf(d.no);
            const hit =
                no &&
                allContacts().find(
                    (c) =>
                        c.banks.some((b) => b.bank === d.bank && digitsOf(b.no) === no) ||
                        (d.mode === 'promptpay' && c.phone && digitsOf(c.phone) === no),
                );
            return hit ? hit.name : d.name.trim();
        };

        // เลือกผู้รับจากสมุดรายชื่อ
        const openPicker = () => {
            const scr = app.closest('.ps-screen');
            const rows = [];
            allContacts().forEach((c) => c.banks.forEach((b) => rows.push({ c, b })));
            const d = document.createElement('div');
            d.className = 'ps-dlg';
            d.innerHTML = `
                <div class="ps-dlg-box ps-pick">
                    <div class="ps-dlg-t">เลือกจากสมุดรายชื่อ</div>
                    ${
                        rows.length
                            ? `<div class="ps-pick-list">${rows
                                  .map(
                                      (r, i) => `<button class="ps-pick-row" data-i="${i}">${bankDot(bankOf(r.b.bank) || BANKS[0])}
                                        <span class="ps-pick-tx"><b>${esc(r.c.name)}</b><small>${esc((bankOf(r.b.bank) || BANKS[0]).name)} · ${esc(modeName(r.b.mode))} ${esc(fmtAcc(r.b.no, r.b.mode))}</small></span></button>`,
                                  )
                                  .join('')}</div>`
                            : '<div class="ps-dlg-s">ยังไม่มีรายชื่อที่มีบัญชีธนาคาร<br>เพิ่มได้ในแอปสมุดรายชื่อ</div>'
                    }
                    <div class="ps-dlg-b one"><button data-a="no">ปิด</button></div>
                </div>`;
            scr.appendChild(d);
            d.addEventListener('click', (e) => {
                if (e.target === d || e.target.closest('[data-a="no"]')) return d.remove();
                const row = e.target.closest('.ps-pick-row');
                if (!row) return;
                const r = rows[Number(row.dataset.i)];
                draft = { name: r.c.name, bank: r.b.bank, mode: r.b.mode, no: r.b.no, amount: draft.amount, note: draft.note };
                d.remove();
                showTransfer('send');
            });
        };

        const head = (title, backFn) => `
            <div class="ps-form-head">
                <button class="ps-fback" title="กลับ"><i class="fa-solid fa-chevron-left"></i></button>
                <span>${esc(title)}</span>
            </div>`;
        const bindBack = (fn) => (app.querySelector('.ps-fback').onclick = fn);

        const pushNotif = (n) => {
            s.notifications.unshift({ id: Date.now() + '_' + rnd(3), ts: Date.now(), read: false, ...n });
            if (s.notifications.length > 50) s.notifications.length = 50;
            save();
        };
        // แบนเนอร์แจ้งเตือนเด้งจากด้านบนจอ
        const banner = (n) => {
            const scr = app.closest('.ps-screen');
            if (!scr) return;
            scr.querySelector('.ps-banner')?.remove();
            const b = document.createElement('div');
            b.className = 'ps-banner';
            b.innerHTML = `${neon('ps-banner-ic')}<div class="ps-banner-tx"><b>${esc(n.title)}</b><span>${esc(n.body)}</span></div><em>ตอนนี้</em>`;
            scr.appendChild(b);
            requestAnimationFrame(() => b.classList.add('in'));
            b.onclick = () => {
                b.remove();
                const t = s.history.find((x) => x.id === n.txId);
                if (t) showSlip(t, 'bank');
            };
            setTimeout(() => {
                b.classList.remove('in');
                setTimeout(() => b.remove(), 400);
            }, 4200);
        };

        /* ----- หน้าโอนเงิน (3 แท็บ) ----- */
        const showTransfer = (tab = 'send') => {
            const keep = app.scrollTop;
            const bank = bankOf(draft.bank);
            const tabs = [
                ['send', 'โอนเงิน'],
                ['fav', 'รายการโปรด'],
                ['hist', 'ประวัติการโอน'],
            ];
            let body = '';
            if (tab === 'send') {
                body = `
                <div class="ps-fcard">
                    <button class="ps-pickbtn"><i class="fa-regular fa-address-book"></i> เลือกจากสมุดรายชื่อ</button>
                    <label class="ps-flbl">ผู้รับ</label>
                    <input class="ps-finput" data-k="name" placeholder="ชื่อผู้รับ (ถ้ามีในสมุดรายชื่อจะขึ้นเอง)" value="${esc(draft.name)}" autocomplete="off">

                    <label class="ps-flbl">ธนาคาร</label>
                    <div class="ps-bgrid">
                        ${BANKS.map((b) => `<button class="ps-bk${b.id === draft.bank ? ' on' : ''}" data-bank="${b.id}">${bankDot(b)}<span>${esc(b.name)}</span></button>`).join('')}
                    </div>

                    ${
                        bank
                            ? `
                    <label class="ps-flbl">โอนด้วย</label>
                    <div class="ps-seg">
                        <button class="${draft.mode === 'promptpay' ? 'on' : ''}" data-mode="promptpay">พร้อมเพย์</button>
                        <button class="${draft.mode === 'account' ? 'on' : ''}" data-mode="account">เลขบัญชี</button>
                    </div>
                    <label class="ps-flbl">${draft.mode === 'promptpay' ? 'เบอร์โทรศัพท์ / เลขบัตรประชาชน' : 'เลขบัญชี'}</label>
                    <input class="ps-finput" data-k="no" inputmode="numeric" maxlength="20" placeholder="${draft.mode === 'promptpay' ? '0xx-xxx-xxxx' : 'xxx-x-xxxxx-x'}" value="${esc(draft.no)}" autocomplete="off">`
                            : '<div class="ps-fnote"><i class="fa-solid fa-circle-info"></i> เลือกธนาคารก่อน แล้วเลือกโอนด้วยพร้อมเพย์หรือเลขบัญชี</div>'
                    }

                    <label class="ps-flbl">จำนวนเงิน <span class="ps-avail">คงเหลือ ${money(s.balance)}</span></label>
                    <div class="ps-amtbox"><span>${esc(s.currency)}</span><input class="ps-amt" data-k="amount" inputmode="decimal" placeholder="0.00" value="${esc(draft.amount)}" autocomplete="off"></div>
                    <div class="ps-chips ps-quick">
                        ${[100, 500, 1000, 5000].map((v) => `<button class="ps-chip" data-q="${v}">${v.toLocaleString('en-US')}</button>`).join('')}
                    </div>

                    <label class="ps-flbl">บันทึกช่วยจำ (ไม่บังคับ)</label>
                    <input class="ps-finput" data-k="note" maxlength="40" placeholder="เช่น ค่าข้าว" value="${esc(draft.note)}" autocomplete="off">
                </div>
                <button class="ps-fsave ps-go"><i class="fa-solid fa-paper-plane"></i> โอนเงิน</button>`;
            } else if (tab === 'fav') {
                body = s.favorites.length
                    ? `<div class="ps-list">${s.favorites
                          .map((f, i) => {
                              const b = bankOf(f.bank) || BANKS[0];
                              return `<div class="ps-trow" data-i="${i}">${bankDot(b, 'lg')}
                                <div class="ps-tmain"><b>${esc(f.name)}</b><span>${esc(b.name)} · ${esc(modeName(f.mode))} ${esc(fmtAcc(f.no, f.mode))}</span></div>
                                <button class="ps-ibtn ps-ibtn-del" data-del="${i}" title="ลบ"><i class="fa-regular fa-trash-can"></i></button></div>`;
                          })
                          .join('')}</div>`
                    : '<div class="ps-mempty">ยังไม่มีรายการโปรด<br>กด “เพิ่มรายการโปรด” ที่สลิปหลังโอนได้</div>';
            } else {
                body = s.history.length
                    ? `<div class="ps-list">${s.history
                          .map((t, i) => {
                              const b = bankOf(t.bank) || BANKS[0];
                              return `<div class="ps-trow" data-h="${i}">${bankDot(b, 'lg')}
                                <div class="ps-tmain"><b>${esc(t.name)}</b><span>${esc(fmtDT(t.ts))}${t.note ? ' · ' + esc(t.note) : ''}</span></div>
                                <div class="ps-tamt">-${money(t.amount)}</div></div>`;
                          })
                          .join('')}</div>`
                    : '<div class="ps-mempty">ยังไม่มีประวัติการโอน</div>';
            }

            app.innerHTML = `
                <div class="ps-form">
                    ${head('โอนเงิน')}
                    <div class="ps-ttabs">${tabs.map(([k, l]) => `<button class="${k === tab ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
                    ${body}
                </div>`;
            app.scrollTop = keep;
            bindBack(() => ctx.open('bank'));
            app.querySelector('.ps-ttabs').onclick = (e) => {
                const t = e.target.closest('[data-tab]');
                if (t) {
                    app.scrollTop = 0;
                    showTransfer(t.dataset.tab);
                }
            };

            if (tab === 'send') {
                app.querySelectorAll('.ps-finput, .ps-amt').forEach((inp) =>
                    inp.addEventListener('input', () => {
                        const k = inp.dataset.k;
                        if (k === 'amount') {
                            let v = inp.value.replace(/[^\d.]/g, '');
                            const [a, ...rest] = v.split('.');
                            v = rest.length ? a + '.' + rest.join('').slice(0, 2) : a;
                            inp.value = v;
                        } else if (k === 'no') {
                            inp.value = inp.value.replace(/[^\d-]/g, '');
                        }
                        draft[k] = inp.value;
                    }),
                );
                app.querySelector('.ps-pickbtn').onclick = openPicker;
                app.querySelector('.ps-bgrid').onclick = (e) => {
                    const b = e.target.closest('[data-bank]');
                    if (!b) return;
                    draft.bank = b.dataset.bank;
                    showTransfer('send');
                };
                app.querySelector('.ps-seg')?.addEventListener('click', (e) => {
                    const m = e.target.closest('[data-mode]');
                    if (!m) return;
                    draft.mode = m.dataset.mode;
                    draft.no = '';
                    showTransfer('send');
                });
                app.querySelector('.ps-quick').onclick = (e) => {
                    const q = e.target.closest('[data-q]');
                    if (!q) return;
                    draft.amount = q.dataset.q;
                    showTransfer('send');
                };
                app.querySelector('.ps-go').onclick = () => {
                    const amt = Number(draft.amount);
                    const digits = draft.no.replace(/\D/g, '');
                    if (!lookupRecipient(draft)) return notify('error', 'กรุณากรอกชื่อผู้รับ');
                    if (!draft.bank) return notify('error', 'กรุณาเลือกธนาคาร');
                    if (draft.mode === 'promptpay' ? ![10, 13].includes(digits.length) : digits.length < 10 || digits.length > 15)
                        return notify('error', draft.mode === 'promptpay' ? 'พร้อมเพย์ต้องเป็นเบอร์ 10 หลัก หรือเลขบัตร 13 หลัก' : 'เลขบัญชีไม่ถูกต้อง');
                    if (!(amt > 0)) return notify('error', 'กรุณาใส่จำนวนเงิน');
                    if (amt > s.balance) return notify('error', 'ยอดเงินไม่เพียงพอ');
                    showConfirm();
                };
            } else if (tab === 'fav') {
                app.querySelector('.ps-list')?.addEventListener('click', (e) => {
                    const del = e.target.closest('[data-del]');
                    if (del) {
                        s.favorites.splice(Number(del.dataset.del), 1);
                        save();
                        return showTransfer('fav');
                    }
                    const row = e.target.closest('.ps-trow');
                    if (!row) return;
                    const f = s.favorites[Number(row.dataset.i)];
                    draft = { name: f.name, bank: f.bank, mode: f.mode, no: f.no, amount: '', note: '' };
                    app.scrollTop = 0;
                    showTransfer('send');
                });
            } else {
                app.querySelector('.ps-list')?.addEventListener('click', (e) => {
                    const row = e.target.closest('.ps-trow');
                    if (row) showSlip(s.history[Number(row.dataset.h)], 'hist');
                });
            }
        };

        /* ----- หน้ายืนยัน (แสดงชื่อผู้รับเหมือนแอปธนาคารจริง) ----- */
        const showConfirm = () => {
            const b = bankOf(draft.bank);
            const amt = Number(draft.amount);
            app.scrollTop = 0;
            app.innerHTML = `
                <div class="ps-form">
                    ${head('ตรวจสอบรายการ')}
                    <div class="ps-fcard ps-conf">
                        <div class="ps-conf-to">
                            ${bankDot(b, 'xl')}
                            <div class="ps-conf-name">${esc(lookupRecipient(draft))}</div>
                            <div class="ps-conf-sub">${esc(b.name)} · ${esc(modeName(draft.mode))}<br>${esc(fmtAcc(draft.no, draft.mode))}</div>
                        </div>
                        <div class="ps-conf-amt">${money(amt)}</div>
                        <div class="ps-kv"><span>จากบัญชี</span><b>${esc(s.account.name)}<br><small>${esc(maskedNo)}</small></b></div>
                        <div class="ps-kv"><span>ค่าธรรมเนียม</span><b>${money(0)}</b></div>
                        ${draft.note ? `<div class="ps-kv"><span>บันทึกช่วยจำ</span><b>${esc(draft.note)}</b></div>` : ''}
                    </div>
                    <button class="ps-fsave ps-ok"><i class="fa-solid fa-check"></i> ยืนยันการโอน</button>
                    <button class="ps-flink">แก้ไข</button>
                </div>`;
            bindBack(() => showTransfer('send'));
            app.querySelector('.ps-flink').onclick = () => showTransfer('send');
            app.querySelector('.ps-ok').onclick = () => {
                if (amt > s.balance) return notify('error', 'ยอดเงินไม่เพียงพอ');
                const d = new Date();
                const t = {
                    id: Date.now() + '_' + rnd(3),
                    ref: 'NB' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + pad(d.getHours()) + pad(d.getMinutes()) + rnd(6),
                    ts: d.getTime(),
                    name: lookupRecipient(draft),
                    bank: draft.bank,
                    mode: draft.mode,
                    no: draft.no,
                    amount: amt,
                    note: draft.note.trim(),
                    from: { name: user, account: s.account.name, no: s.account.no },
                };
                s.balance = Math.round((s.balance - amt) * 100) / 100;
                s.history.unshift(t);
                saveSlip(t); // เก็บสลิปไว้เบื้องหลังให้แอปสลิป
                const n = {
                    title: 'โอนเงินสำเร็จ',
                    body: `คุณโอนเงิน ${money(amt)} ไปยัง ${t.name} (${b.name}) เรียบร้อยแล้ว`,
                    txId: t.id,
                };
                pushNotif(n);
                draft = { name: '', bank: '', mode: 'promptpay', no: '', amount: '', note: '' };
                showSlip(t, 'bank', true);
                banner(n);
            };
        };

        /* ----- สลิปโอนเงิน ----- */
        const showSlip = (t, back = 'bank', fresh = false) => {
            const b = bankOf(t.bank) || BANKS[0];
            const isFav = s.favorites.some((f) => f.bank === t.bank && f.no === t.no && f.mode === t.mode);
            app.scrollTop = 0;
            app.innerHTML = `
                <div class="ps-form">
                    <div class="ps-slip-top">
                        <button class="ps-fback" title="ปิด"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                    <div class="ps-slip">
                        <div class="ps-slip-ok"><i class="fa-solid fa-check"></i></div>
                        <div class="ps-slip-t">${fresh ? 'โอนเงินสำเร็จ' : 'รายการโอนเงิน'}</div>
                        <div class="ps-slip-d">${esc(fmtDT(t.ts))}</div>
                        <div class="ps-slip-amt">${money(t.amount)}</div>
                        <div class="ps-slip-line"></div>
                        <div class="ps-slip-p"><span>จาก</span><div><b>${esc(t.from?.name || user)}</b><small>${esc(t.from?.account || s.account.name)} ${esc('xxx-x-x' + String(t.from?.no || s.account.no).replace(/\D/g, '').slice(-4))}</small></div></div>
                        <div class="ps-slip-p"><span>ไปยัง</span><div><b>${esc(t.name)}</b><small>${esc(b.name)} · ${esc(modeName(t.mode))} ${esc(fmtAcc(t.no, t.mode))}</small></div></div>
                        <div class="ps-slip-line"></div>
                        <div class="ps-kv"><span>ค่าธรรมเนียม</span><b>${money(0)}</b></div>
                        ${t.note ? `<div class="ps-kv"><span>บันทึกช่วยจำ</span><b>${esc(t.note)}</b></div>` : ''}
                        <div class="ps-kv"><span>เลขที่อ้างอิง</span><b>${esc(t.ref)}</b></div>
                        <div class="ps-slip-brand">${neon('ps-slip-n')} NEONBANK</div>
                    </div>
                    <div class="ps-slip-act">
                        <button class="ps-sact" data-a="copy"><i class="fa-regular fa-copy"></i> คัดลอกเลขอ้างอิง</button>
                        <button class="ps-sact${isFav ? ' dis' : ''}" data-a="fav"><i class="fa-${isFav ? 'solid' : 'regular'} fa-star"></i> ${isFav ? 'อยู่ในรายการโปรดแล้ว' : 'เพิ่มรายการโปรด'}</button>
                    </div>
                    <button class="ps-fsave ps-done">เสร็จสิ้น</button>
                </div>`;
            const leave = () => (back === 'hist' ? showTransfer('hist') : ctx.open('bank'));
            bindBack(leave);
            app.querySelector('.ps-done').onclick = leave;
            app.querySelector('.ps-slip-act').onclick = async (e) => {
                const a = e.target.closest('[data-a]')?.dataset.a;
                if (a === 'copy') {
                    try {
                        await navigator.clipboard.writeText(t.ref);
                        notify('success', 'คัดลอกเลขอ้างอิงแล้ว');
                    } catch (_) {
                        notify('info', 'เลขอ้างอิง: ' + t.ref);
                    }
                } else if (a === 'fav' && !isFav) {
                    s.favorites.unshift({ name: t.name, bank: t.bank, mode: t.mode, no: t.no });
                    save();
                    notify('success', 'เพิ่มในรายการโปรดแล้ว');
                    showSlip(t, back, fresh);
                }
            };
        };

        /* ----- หน้าแจ้งเตือน (กดกระดิ่ง) ----- */
        const showNotifs = () => {
            s.notifications.forEach((n) => (n.read = true));
            save();
            app.scrollTop = 0;
            app.innerHTML = `
                <div class="ps-form">
                    ${head('การแจ้งเตือน')}
                    ${
                        s.notifications.length
                            ? `<div class="ps-list">${s.notifications
                                  .map(
                                      (n, i) => `<div class="ps-trow ps-nrow" data-n="${i}">
                                        <span class="ps-nic">${neon('ps-nic-n')}</span>
                                        <div class="ps-tmain"><b>${esc(n.title)}</b><span class="wrap">${esc(n.body)}</span><small>${esc(fmtDT(n.ts))}</small></div></div>`,
                                  )
                                  .join('')}</div>`
                            : '<div class="ps-mempty">ยังไม่มีการแจ้งเตือน</div>'
                    }
                </div>`;
            bindBack(() => ctx.open('bank'));
            app.querySelector('.ps-list')?.addEventListener('click', (e) => {
                const row = e.target.closest('[data-n]');
                const n = row && s.notifications[Number(row.dataset.n)];
                const t = n && s.history.find((x) => x.id === n.txId);
                if (t) showSlip(t, 'bank');
            });
        };

        // ปุ่มเมนู 4 ปุ่ม (ตอนนี้ยังเป็นแค่ดีไซน์ เลือกไฮไลต์ได้อย่างเดียว)
        app.querySelector('.ps-tiles').addEventListener('click', (e) => {
            const tile = e.target.closest('.ps-tile');
            if (!tile) return;
            app.querySelectorAll('.ps-tile').forEach((t) => t.classList.toggle('on', t === tile));
            if (tile === app.querySelector('.ps-tile')) showTransfer('send');
        });
        app.querySelector('.ps-bell').onclick = () => showNotifs();

        // เปิดมาจากสมุดรายชื่อ: ไปหน้าโอนเงินพร้อมกรอกผู้รับให้
        if (pendingTransfer) {
            draft = { name: pendingTransfer.name, bank: pendingTransfer.bank, mode: pendingTransfer.mode, no: pendingTransfer.no, amount: '', note: '' };
            pendingTransfer = null;
            showTransfer('send');
        }
    },
});

/* ---------- สลิป: เก็บเป็นข้อมูลเบื้องหลัง (แยกจากประวัติ ลบประวัติแล้วสลิปยังอยู่) ---------- */
const slipMoney = (cur, v) => esc(cur) + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const slipSnap = (t) => ({
    id: 's_' + (t.id || Date.now() + '_' + rdig(3)),
    txId: t.id,
    ref: t.ref,
    ts: t.ts,
    name: t.name,
    bank: t.bank,
    mode: t.mode,
    no: t.no,
    amount: t.amount,
    note: t.note || '',
    from: t.from ? { ...t.from } : null,
    sentAt: 0,
});
// คืนค่า bank ของแชทนี้ พร้อมย้ายประวัติโอนเงินเดิมเข้าคลังสลิปครั้งแรก
function slipBank() {
    const b = space().bank;
    if (!Array.isArray(b.slips)) b.slips = [];
    if (!b.slipsInit) {
        const have = new Set(b.slips.map((x) => x.txId));
        (b.history || []).forEach((t) => t && !have.has(t.id) && b.slips.push(slipSnap(t)));
        b.slips.sort((a, c) => c.ts - a.ts);
        b.slipsInit = true;
        save();
    }
    return b;
}
function saveSlip(t) {
    const b = slipBank();
    if (b.slips.some((x) => x.txId === t.id)) return;
    b.slips.unshift(slipSnap(t));
    save();
}
const slipUser = () => {
    try {
        return getContext()?.name1 || 'ฉัน';
    } catch (_) {
        return 'ฉัน';
    }
};
// การ์ดสลิป (ใช้ทั้งรูปย่อและรูปเต็ม — ขนาดเป็น em ย่อด้วย font-size ได้)
function slipCard(sl, bank) {
    const b = bankOf(sl.bank) || BANKS[0];
    const fromNo = 'xxx-x-x' + digitsOf(sl.from?.no || bank.account.no).slice(-4);
    return `<div class="ps-slip">
        <div class="ps-slip-ok"><i class="fa-solid fa-check"></i></div>
        <div class="ps-slip-t">โอนเงินสำเร็จ</div>
        <div class="ps-slip-d">${esc(fmtDT(sl.ts))}</div>
        <div class="ps-slip-amt">${slipMoney(bank.currency, sl.amount)}</div>
        <div class="ps-slip-line"></div>
        <div class="ps-slip-p"><span>จาก</span><div><b>${esc(sl.from?.name || slipUser())}</b><small>${esc(sl.from?.account || bank.account.name)} ${esc(fromNo)}</small></div></div>
        <div class="ps-slip-p"><span>ไปยัง</span><div><b>${esc(sl.name)}</b><small>${esc(b.name)} · ${esc(modeName(sl.mode))} ${esc(fmtAcc(sl.no, sl.mode))}</small></div></div>
        <div class="ps-slip-line"></div>
        <div class="ps-kv"><span>ค่าธรรมเนียม</span><b>${slipMoney(bank.currency, 0)}</b></div>
        ${sl.note ? `<div class="ps-kv"><span>บันทึกช่วยจำ</span><b>${esc(sl.note)}</b></div>` : ''}
        <div class="ps-kv"><span>เลขที่อ้างอิง</span><b>${esc(sl.ref)}</b></div>
        <div class="ps-slip-brand">${neon('ps-slip-n')} NEONBANK</div>
    </div>`;
}
// ข้อความสลิปที่ส่งเข้าแชท ให้บอทอ่านรู้เรื่อง
function slipText(sl, bank) {
    const b = bankOf(sl.bank) || BANKS[0];
    return [
        `[สลิปโอนเงิน NEONBANK — โอนเงินสำเร็จ]`,
        `จำนวนเงิน: ${slipMoney(bank.currency, sl.amount)}`,
        `วันที่: ${fmtDT(sl.ts)}`,
        `จาก: ${sl.from?.name || slipUser()} (${sl.from?.account || bank.account.name} xxx-x-x${digitsOf(sl.from?.no || bank.account.no).slice(-4)})`,
        `ไปยัง: ${sl.name} (${b.name} · ${modeName(sl.mode)} ${fmtAcc(sl.no, sl.mode)})`,
        sl.note ? `บันทึกช่วยจำ: ${sl.note}` : '',
        `เลขที่อ้างอิง: ${sl.ref}`,
    ]
        .filter(Boolean)
        .join('\n');
}
// ส่งข้อความเข้าช่องแชทของ SillyTavern (ถ้ากำลังตอบอยู่ จะวางไว้ในช่องพิมพ์ให้กดส่งเอง)
function sendToChat(text) {
    const ta = document.getElementById('send_textarea');
    if (!ta) return 'none';
    const old = String(ta.value || '').trim();
    ta.value = old ? old + '\n\n' + text : text;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    const btn = document.getElementById('send_but');
    if (btn && btn.offsetParent !== null && !btn.classList.contains('displayNone')) {
        btn.click();
        return 'sent';
    }
    return 'draft';
}

/* ---------- แอป: สลิป ---------- */
registerApp({
    id: 'slips',
    label: 'สลิป',
    iconHtml: '<i class="fa-solid fa-receipt"></i>',
    iconClass: 'ps-ico-slip',
    fontClass: 'ps-slipapp',
    render(app, ctx) {
        const bank = slipBank();
        const groups = () => {
            const m = new Map();
            bank.slips.forEach((sl) => {
                const k = normName(sl.name) || '-';
                if (!m.has(k)) m.set(k, { key: k, name: sl.name || 'ไม่ระบุชื่อ', items: [] });
                m.get(k).items.push(sl);
            });
            return [...m.values()]
                .map((g) => ({ ...g, items: g.items.sort((a, c) => c.ts - a.ts) }))
                .sort((a, c) => c.items[0].ts - a.items[0].ts);
        };

        const doSend = (list) => {
            if (!list.length) return notify('warning', 'ยังไม่ได้เลือกสลิป');
            const head = list.length > 1 ? `*ส่งสลิปโอนเงิน ${list.length} รายการ*\n\n` : '*ส่งสลิปโอนเงิน*\n\n';
            const r = sendToChat(head + list.map((sl) => slipText(sl, bank)).join('\n\n'));
            if (r === 'none') return notify('error', 'ไม่พบช่องแชท เปิดแชทก่อนแล้วลองใหม่');
            const now = Date.now();
            list.forEach((sl) => (sl.sentAt = now));
            save();
            notify('success', r === 'sent' ? `ส่งสลิป ${list.length} รายการแล้ว` : 'วางสลิปไว้ในช่องพิมพ์แล้ว กดส่งได้เลย');
            closeModal();
        };

        /* ----- หน้ารวม: โฟลเดอร์ตามชื่อผู้รับ ----- */
        const showFolders = () => {
            app.scrollTop = 0;
            const gs = groups();
            app.innerHTML = `
                <div class="ps-sl">
                    <div class="ps-set-title">สลิป</div>
                    ${
                        gs.length
                            ? `<div class="ps-sl-list">${gs
                                  .map((g, i) => {
                                      return `<button class="ps-sl-row" data-g="${i}">
                                        <span class="ps-sl-folder"><svg viewBox="0 0 48 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="nsfg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1f2a24"/><stop offset="1" stop-color="#050807"/></linearGradient></defs><path d="M4 8a4 4 0 0 1 4-4h10l5 5h17a4 4 0 0 1 4 4v21a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" fill="url(#nsfg)" stroke="#00ff88" stroke-width="2" stroke-linejoin="round"/><path d="M4 16h40" stroke="#00ff88" stroke-width="1.5" opacity=".5"/><path d="M25 19l-6 9h5l-2 7 8-10h-5z" fill="#00ff88"/></svg></span>
                                        <span class="ps-sl-main"><b>NEONSLIP</b></span>
                                        <i class="fa-solid fa-chevron-right ps-set-arrow"></i>
                                    </button>`;
                                  })
                                  .join('')}</div>`
                            : '<div class="ps-mempty"><i class="fa-solid fa-receipt ps-sl-emptyic"></i><br>ยังไม่มีสลิป<br>โอนเงินในแอป NEONBANK แล้วสลิปจะถูกเก็บไว้ที่นี่อัตโนมัติ</div>'
                    }
                </div>`;
            app.querySelector('.ps-sl-list')?.addEventListener('click', (e) => {
                const row = e.target.closest('[data-g]');
                if (row) showFolder(gs[Number(row.dataset.g)].key);
            });
        };

        /* ----- ในโฟลเดอร์: รูปสลิป + ติ๊กเลือก + ปุ่มส่ง ----- */
        const showFolder = (key, picked = new Set()) => {
            const g = groups().find((x) => x.key === key);
            if (!g) return showFolders();
            app.scrollTop = 0;
            app.innerHTML = `
                <div class="ps-sl ps-sl-in">
                    <button class="ps-set-back"><i class="fa-solid fa-chevron-left"></i> สลิป</button>
                    <div class="ps-sl-ttl">
                        <div class="ps-set-title">${esc(g.name)}</div>
                        <button class="ps-sl-all"></button>
                    </div>
                    <div class="ps-sl-hint">แตะวงกลมเพื่อเลือกสลิปที่จะส่ง · แตะรูปเพื่อดูเต็ม</div>
                    <div class="ps-sl-grid">
                        ${g.items
                            .map(
                                (sl) => `<div class="ps-sl-item" data-id="${esc(sl.id)}">
                                    <div class="ps-sl-thumb">${slipCard(sl, bank)}</div>
                                    <button class="ps-sl-chk" title="เลือก"><i class="fa-solid fa-check"></i></button>
                                    ${sl.sentAt ? '<span class="ps-sl-sent"><i class="fa-solid fa-paper-plane"></i> ส่งแล้ว</span>' : ''}
                                    <div class="ps-sl-cap"><b>${slipMoney(bank.currency, sl.amount)}</b><small>${esc(fmtDT(sl.ts))}</small></div>
                                </div>`,
                            )
                            .join('')}
                    </div>
                    <div class="ps-sl-bar"><button class="ps-sl-send"></button></div>
                </div>`;
            const sync = () => {
                app.querySelectorAll('.ps-sl-item').forEach((el) => el.classList.toggle('on', picked.has(el.dataset.id)));
                const n = picked.size;
                const send = app.querySelector('.ps-sl-send');
                send.innerHTML = `<i class="fa-solid fa-paper-plane"></i> ${n ? `ส่งสลิป (${n})` : 'เลือกสลิปที่จะส่ง'}`;
                send.classList.toggle('dis', !n);
                app.querySelector('.ps-sl-all').textContent = n === g.items.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด';
            };
            sync();
            app.querySelector('.ps-set-back').onclick = showFolders;
            app.querySelector('.ps-sl-all').onclick = () => {
                if (picked.size === g.items.length) picked.clear();
                else g.items.forEach((sl) => picked.add(sl.id));
                sync();
            };
            app.querySelector('.ps-sl-grid').addEventListener('click', (e) => {
                const item = e.target.closest('.ps-sl-item');
                if (!item) return;
                const id = item.dataset.id;
                if (e.target.closest('.ps-sl-chk')) {
                    picked.has(id) ? picked.delete(id) : picked.add(id);
                    return sync();
                }
                showOne(id, key, picked);
            });
            app.querySelector('.ps-sl-send').onclick = () => doSend(g.items.filter((sl) => picked.has(sl.id)).reverse());
        };

        /* ----- ดูสลิปเต็ม ----- */
        const showOne = (id, key, picked) => {
            const sl = bank.slips.find((x) => x.id === id);
            if (!sl) return showFolder(key, picked);
            app.scrollTop = 0;
            app.innerHTML = `
                <div class="ps-sl ps-sl-one">
                    <button class="ps-set-back"><i class="fa-solid fa-chevron-left"></i> ${esc(sl.name)}</button>
                    <div class="ps-sl-full">${slipCard(sl, bank)}</div>
                    ${sl.sentAt ? `<div class="ps-sl-hint">ส่งเข้าแชทแล้วเมื่อ ${esc(fmtDT(sl.sentAt))}</div>` : ''}
                    <div class="ps-sl-acts">
                        <button class="ps-sl-btn" data-a="pick"><i class="fa-${picked.has(id) ? 'solid fa-circle-check' : 'regular fa-circle'}"></i> ${picked.has(id) ? 'เลือกแล้ว' : 'เลือกสลิปนี้'}</button>
                        <button class="ps-sl-btn del" data-a="del"><i class="fa-regular fa-trash-can"></i> ลบสลิป</button>
                    </div>
                    <button class="ps-sl-send" data-a="send"><i class="fa-solid fa-paper-plane"></i> ส่งสลิปนี้</button>
                </div>`;
            app.querySelector('.ps-set-back').onclick = () => showFolder(key, picked);
            app.querySelector('.ps-sl-one').addEventListener('click', (e) => {
                const a = e.target.closest('[data-a]')?.dataset.a;
                if (a === 'send') doSend([sl]);
                else if (a === 'pick') {
                    picked.has(id) ? picked.delete(id) : picked.add(id);
                    showOne(id, key, picked);
                } else if (a === 'del' && confirm('ลบสลิปนี้? (ประวัติในแอปธนาคารยังอยู่)')) {
                    bank.slips = bank.slips.filter((x) => x.id !== id);
                    picked.delete(id);
                    save();
                    notify('success', 'ลบสลิปแล้ว');
                    showFolder(key, picked);
                }
            });
        };

        showFolders();
    },
});

/* ---------- แอป: สมุดรายชื่อ ---------- */
registerApp({
    id: 'contacts',
    label: 'สมุดรายชื่อ',
    iconHtml: '<i class="fa-solid fa-address-book"></i>',
    iconClass: 'ps-ico-con',
    render(app, ctx) {
        const st = conStore();
        let filter = 'all';
        let query = '';

        const avatar = (c, cls = '') => {
            const u = c.kind === 'char' ? cssUrl(c.photo) : safeUrl(c.photo);
            const bg = u ? `${avColor(c.name)} url(${u}) center / cover no-repeat` : avColor(c.name);
            return `<span class="ps-cav ${cls}${u ? ' ph' : ''}" style="background:${bg}"><b>${esc([...c.name.trim()][0] || '?')}</b></span>`;
        };
        const copy = async (v, msg) => {
            try {
                await navigator.clipboard.writeText(v);
                notify('success', msg);
            } catch (e) {
                notify('info', v);
            }
        };

        const rank = (c) => (c.kind === 'char' ? 0 : c.kind === 'lore' ? 1 : 2);
        const filtered = () => {
            const q = query.trim().toLowerCase();
            return allContacts()
                .filter((c) => (filter === 'all' || (filter === 'fav' ? c.fav : c.cat === filter)) && (!q || c.name.toLowerCase().includes(q) || digitsOf(c.phone).includes(digitsOf(q) || '#')))
                .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'th'));
        };

        /* ----- รายการ ----- */
        const showList = () => {
            app.scrollTop = 0;
            const FIL = [['all', 'ทั้งหมด'], ['fav', '★']].concat(CON_CATS);
            const RND = [['friend', 'เพื่อน'], ['food', 'ร้านอาหาร'], ['shop', 'ร้านค้า'], ['work', 'ที่ทำงาน'], ['any', 'สุ่มเลย']];
            app.innerHTML = `
                <div class="ps-con">
                    <div class="ps-ctop">
                        <div class="ps-set-title">สมุดรายชื่อ</div>
                        <div class="ps-cbtns">
                            <button class="ps-cic" data-a="scan" title="สแกนข้อมูลแชทนี้"><i class="fa-solid fa-wand-magic-sparkles"></i></button>
                            <button class="ps-cic" data-a="rnd" title="สุ่ม NPC"><i class="fa-solid fa-dice"></i></button>
                            <button class="ps-cic" data-a="add" title="เพิ่มรายชื่อ"><i class="fa-solid fa-plus"></i></button>
                        </div>
                    </div>
                    <div class="ps-rnd" hidden><span>สุ่ม NPC:</span>${RND.map(([k, l]) => `<button class="ps-chip" data-r="${k}">${l}</button>`).join('')}</div>
                    <input class="ps-csearch" placeholder="ค้นหาชื่อ / เบอร์" value="${esc(query)}" autocomplete="off">
                    <div class="ps-chips ps-cfil">${FIL.map(([k, l]) => `<button class="ps-chip${k === filter ? ' on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
                    ${!currentChar() ? '<div class="ps-fhint">เปิดแชทก่อน การ์ดที่เล่นอยู่ถึงจะขึ้นในรายชื่อ</div>' : st.hideChar ? `<button class="ps-flink" data-a="showchar">แสดงการ์ด “${esc(currentChar().name)}” ในรายชื่อ</button>` : ''}
                    ${spaceKey() !== 'default' && !st.scan.done && !scanJob ? '<button class="ps-flink" data-a="scan">ยังไม่ได้สแกนข้อมูลของแชทนี้ · สแกนเลย</button>' : ''}
                    <div class="ps-clist"></div>
                </div>`;
            const listEl = app.querySelector('.ps-clist');
            const draw = () => {
                const rows = filtered();
                listEl.innerHTML = rows.length
                    ? rows
                          .map(
                              (c) => `<div class="ps-trow ps-crow" data-id="${esc(c.id)}">${avatar(c)}
                                <div class="ps-tmain"><b>${esc(c.name)}</b><span>${c.kind === 'char' ? 'การ์ดที่เล่นอยู่' : esc(catName(c.cat))}${c.phone ? ' · ' + esc(fmtPhone(c.phone)) : ''}</span></div>
                                ${c.kind === 'char' ? '<span class="ps-ctag">CARD</span>' : c.kind === 'lore' ? '<span class="ps-ctag lore">LORE</span>' : c.fav ? '<i class="fa-solid fa-star ps-cstar"></i>' : ''}</div>`,
                          )
                          .join('')
                    : '<div class="ps-mempty">ไม่พบรายชื่อ</div>';
            };
            draw();
            app.querySelector('.ps-csearch').addEventListener('input', (e) => {
                query = e.target.value;
                draw();
            });
            listEl.onclick = (e) => {
                const r = e.target.closest('.ps-crow');
                if (r) showDetail(r.dataset.id);
            };
            app.querySelector('.ps-cfil').onclick = (e) => {
                const b = e.target.closest('[data-f]');
                if (!b) return;
                filter = b.dataset.f;
                app.querySelectorAll('.ps-cfil .ps-chip').forEach((x) => x.classList.toggle('on', x === b));
                draw();
            };
            app.querySelector('[data-a="add"]').onclick = () => showForm(null);
            app.querySelectorAll('[data-a="scan"]').forEach((b) => {
                b.onclick = () => {
                    if (spaceKey() === 'default') return notify('info', 'เปิดแชทก่อนจึงจะสแกนได้');
                    showScanDialog(app.closest('.ps-screen'), { onDone: () => showList() });
                };
            });
            app.querySelector('[data-a="showchar"]')?.addEventListener('click', () => {
                st.hideChar = false;
                save();
                showList();
            });
            const rndBox = app.querySelector('.ps-rnd');
            app.querySelector('[data-a="rnd"]').onclick = () => (rndBox.hidden = !rndBox.hidden);
            rndBox.onclick = (e) => {
                const b = e.target.closest('[data-r]');
                if (!b) return;
                const n = genNpc(b.dataset.r);
                st.list.push(n);
                save();
                notify('success', 'สุ่มได้ ' + n.name);
                showDetail(n.id);
            };
        };

        /* ----- รายละเอียด ----- */
        const showDetail = (id) => {
            const c = allContacts().find((x) => x.id === id);
            if (!c) return showList();
            const isChar = c.kind === 'char';
            app.scrollTop = 0;
            app.innerHTML = `
                <div class="ps-con">
                    <button class="ps-set-back"><i class="fa-solid fa-chevron-left"></i> สมุดรายชื่อ</button>
                    <div class="ps-cdet">
                        ${avatar(c, 'xl')}
                        <div class="ps-cname">${esc(c.name)}</div>
                        <div class="ps-ccat">${isChar ? 'การ์ดที่เล่นอยู่' : esc(catName(c.cat)) + (c.kind === 'lore' ? ' · จากการสแกน' : '')}</div>
                    </div>
                    <div class="ps-ccard">
                        <div class="ps-cline"><span>เบอร์โทร</span><b>${c.phone ? esc(fmtPhone(c.phone)) : '—'}</b>${c.phone ? '<button class="ps-cmini" data-copy="phone"><i class="fa-regular fa-copy"></i></button>' : ''}</div>
                        ${c.note ? `<div class="ps-cline"><span>บันทึก</span><b>${esc(c.note)}</b></div>` : ''}
                    </div>
                    <div class="ps-ccard">
                        <div class="ps-ccap">บัญชีธนาคาร</div>
                        ${
                            c.banks.length
                                ? c.banks
                                      .map((b, i) => {
                                          const bk = bankOf(b.bank) || BANKS[0];
                                          return `<div class="ps-cbank">${bankDot(bk, 'lg')}<div class="ps-tmain"><b>${esc(bk.name)}</b><span>${esc(modeName(b.mode))} ${esc(fmtAcc(b.no, b.mode))}</span></div>
                                            <button class="ps-cmini" data-copy="${i}"><i class="fa-regular fa-copy"></i></button>
                                            <button class="ps-cgo" data-xfer="${i}">โอน</button></div>`;
                                      })
                                      .join('')
                                : '<div class="ps-fhint">ยังไม่มีบัญชีธนาคาร กด “แก้ไข” เพื่อเพิ่ม</div>'
                        }
                    </div>
                    <div class="ps-cacts">
                        <button class="ps-cbtn" data-a="edit"><i class="fa-solid fa-pencil"></i> แก้ไข</button>
                        ${isChar ? '<button class="ps-cbtn" data-a="hide"><i class="fa-regular fa-eye-slash"></i> ซ่อนจากรายชื่อ</button>' : `<button class="ps-cbtn" data-a="fav"><i class="fa-${c.fav ? 'solid' : 'regular'} fa-star"></i> ${c.fav ? 'เอาออกจากโปรด' : 'โปรด'}</button><button class="ps-cbtn del" data-a="del"><i class="fa-regular fa-trash-can"></i> ลบ</button>`}
                    </div>
                </div>`;
            app.querySelector('.ps-set-back').onclick = showList;
            app.querySelector('.ps-con').onclick = (e) => {
                const cp = e.target.closest('[data-copy]');
                if (cp) {
                    return cp.dataset.copy === 'phone' ? copy(digitsOf(c.phone), 'คัดลอกเบอร์แล้ว') : copy(digitsOf(c.banks[Number(cp.dataset.copy)].no), 'คัดลอกเลขแล้ว');
                }
                const x = e.target.closest('[data-xfer]');
                if (x) {
                    const b = c.banks[Number(x.dataset.xfer)];
                    pendingTransfer = { name: c.name, bank: b.bank, mode: b.mode, no: b.no };
                    return ctx.open('bank');
                }
                const a = e.target.closest('[data-a]')?.dataset.a;
                if (a === 'edit') showForm(c);
                else if (a === 'hide') {
                    st.hideChar = true;
                    save();
                    notify('info', 'ซ่อนแล้ว กลับมาแสดงได้จากหน้ารายชื่อ');
                    showList();
                } else if (a === 'fav') {
                    const n = st.list.find((y) => y.id === c.id);
                    if (n) n.fav = !n.fav;
                    save();
                    showDetail(id);
                } else if (a === 'del') askDelete(c);
            };
        };

        const askDelete = (c) => {
            const scr = app.closest('.ps-screen');
            const d = document.createElement('div');
            d.className = 'ps-dlg';
            d.innerHTML = `<div class="ps-dlg-box"><div class="ps-dlg-ic"><i class="fa-regular fa-trash-can"></i></div><div class="ps-dlg-t">ลบรายชื่อนี้?</div><div class="ps-dlg-s">${esc(c.name)}<br>จะถูกลบออกถาวร</div><div class="ps-dlg-b"><button data-a="no">ยกเลิก</button><button data-a="yes" class="del">ลบ</button></div></div>`;
            scr.appendChild(d);
            d.addEventListener('click', (e) => {
                const a = e.target.closest('button')?.dataset.a;
                if (e.target === d || a === 'no') return d.remove();
                if (a !== 'yes') return;
                st.list = st.list.filter((y) => y.id !== c.id);
                if (c.kind === 'lore') st.scan.ignored.push(normName(c.name)); // ลบแล้วสแกนใหม่ไม่เด้งกลับมา
                save();
                d.remove();
                notify('success', 'ลบรายชื่อแล้ว');
                showList();
            });
        };

        /* ----- ฟอร์มเพิ่ม/แก้ไข ----- */
        const showForm = (c) => {
            const isChar = c?.kind === 'char';
            const d = {
                name: c?.name || '',
                cat: c?.cat && !isChar ? c.cat : 'friend',
                photo: c?.photo && !isChar ? c.photo : '',
                phone: c?.phone || '',
                note: c?.note || '',
                banks: (c?.banks || []).map((b) => ({ ...b })),
            };
            app.scrollTop = 0;
            app.innerHTML = `
                <div class="ps-con">
                    <button class="ps-set-back"><i class="fa-solid fa-chevron-left"></i> ยกเลิก</button>
                    <div class="ps-set-title">${c ? 'แก้ไขรายชื่อ' : 'เพิ่มรายชื่อ'}</div>
                    <div class="ps-ccard">
                        <label class="ps-flbl">ชื่อ</label>
                        <input class="ps-finput" data-k="name" value="${esc(d.name)}" ${isChar ? 'disabled' : ''} placeholder="ชื่อ" autocomplete="off">
                        ${isChar ? '<div class="ps-fhint">ชื่อและรูปดึงจากการ์ดที่เล่นอยู่ แก้ตรงนี้ไม่ได้</div>' : ''}
                        ${
                            isChar
                                ? ''
                                : `<label class="ps-flbl">ประเภท</label>
                        <div class="ps-chips ps-fcat">${CON_CATS.map(([k, l]) => `<button class="ps-chip${k === d.cat ? ' on' : ''}" data-cat="${k}">${l}</button>`).join('')}</div>
                        <label class="ps-flbl">รูป (ลิงก์ ไม่บังคับ)</label>
                        <input class="ps-finput" data-k="photo" value="${esc(d.photo)}" placeholder="https://..." autocomplete="off">`
                        }
                        <label class="ps-flbl">เบอร์โทร</label>
                        <input class="ps-finput" data-k="phone" inputmode="numeric" maxlength="12" value="${esc(d.phone)}" placeholder="0xx-xxx-xxxx" autocomplete="off">
                        <label class="ps-flbl">บันทึก</label>
                        <input class="ps-finput" data-k="note" maxlength="60" value="${esc(d.note)}" placeholder="ไม่บังคับ" autocomplete="off">
                        <label class="ps-flbl">บัญชีธนาคาร</label>
                        <div class="ps-bkrows"></div>
                        <button class="ps-cadd"><i class="fa-solid fa-plus"></i> เพิ่มบัญชี</button>
                    </div>
                    <button class="ps-set-save"><i class="fa-solid fa-floppy-disk"></i> บันทึก</button>
                </div>`;
            const rowsEl = app.querySelector('.ps-bkrows');
            const drawBanks = () => {
                rowsEl.innerHTML = d.banks
                    .map(
                        (b, i) => `<div class="ps-bkrow" data-i="${i}">
                            <select class="ps-finput" data-f="bank">${BANKS.map((x) => `<option value="${x.id}"${x.id === b.bank ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
                            <select class="ps-finput" data-f="mode"><option value="promptpay"${b.mode === 'promptpay' ? ' selected' : ''}>พร้อมเพย์</option><option value="account"${b.mode === 'account' ? ' selected' : ''}>เลขบัญชี</option></select>
                            <button class="ps-ibtn ps-ibtn-del" data-rm="${i}" title="ลบ"><i class="fa-regular fa-trash-can"></i></button>
                            <input class="ps-finput" data-f="no" inputmode="numeric" maxlength="20" value="${esc(b.no)}" placeholder="เลขพร้อมเพย์ / เลขบัญชี (เว้นว่าง = สุ่มให้)" autocomplete="off">
                        </div>`,
                    )
                    .join('');
            };
            drawBanks();
            rowsEl.addEventListener('input', (e) => {
                const row = e.target.closest('.ps-bkrow');
                const f = e.target.dataset.f;
                if (!row || !f) return;
                if (f === 'no') e.target.value = e.target.value.replace(/[^\d-]/g, '');
                d.banks[Number(row.dataset.i)][f] = e.target.value;
            });
            rowsEl.addEventListener('click', (e) => {
                const rm = e.target.closest('[data-rm]');
                if (!rm) return;
                d.banks.splice(Number(rm.dataset.rm), 1);
                drawBanks();
            });
            app.querySelector('.ps-cadd').onclick = () => {
                d.banks.push({ bank: 'kbank', mode: 'promptpay', no: '' });
                drawBanks();
            };
            app.querySelectorAll('.ps-finput[data-k]').forEach((inp) =>
                inp.addEventListener('input', () => {
                    if (inp.dataset.k === 'phone') inp.value = inp.value.replace(/[^\d-]/g, '');
                    d[inp.dataset.k] = inp.value;
                }),
            );
            app.querySelector('.ps-fcat')?.addEventListener('click', (e) => {
                const b = e.target.closest('[data-cat]');
                if (!b) return;
                d.cat = b.dataset.cat;
                app.querySelectorAll('.ps-fcat .ps-chip').forEach((x) => x.classList.toggle('on', x === b));
            });
            app.querySelector('.ps-set-back').onclick = () => (c ? showDetail(c.id) : showList());
            app.querySelector('.ps-set-save').onclick = () => {
                const banks = d.banks.map((b) => ({ bank: b.bank, mode: b.mode, no: digitsOf(b.no) || randBankNo(b, d.phone) }));
                if (isChar) {
                    const ch = currentChar();
                    if (!ch) return notify('error', 'ไม่พบตัวละครที่เล่นอยู่');
                    st.chars[ch.key] = { phone: digitsOf(d.phone), note: d.note.trim(), banks };
                    save();
                    notify('success', 'บันทึกแล้ว');
                    return showDetail('char');
                }
                if (!d.name.trim()) return notify('error', 'กรุณาใส่ชื่อ');
                if (d.photo.trim() && !safeUrl(d.photo)) return notify('error', 'ลิงก์รูปต้องขึ้นต้นด้วย http:// หรือ https://');
                const rec = { kind: c?.kind === 'lore' ? 'lore' : 'npc', name: d.name.trim(), cat: d.cat, photo: d.photo.trim(), phone: digitsOf(d.phone), note: d.note.trim(), banks };
                let id;
                if (c) {
                    Object.assign(st.list.find((y) => y.id === c.id) || {}, rec);
                    id = c.id;
                } else {
                    id = 'n' + Date.now() + rdig(3);
                    st.list.push({ id, fav: false, ...rec });
                }
                save();
                notify('success', 'บันทึกแล้ว');
                showDetail(id);
            };
        };

        showList();
    },
});

/* ---------- แอป: ตั้งค่า ---------- */
registerApp({
    id: 'settings',
    label: 'ตั้งค่า',
    iconHtml: '<i class="fa-solid fa-gear"></i>',
    iconClass: 'ps-ico-set',
    render(app, ctx) {
        const ui = getSettings().ui;
        app.innerHTML = `
            <div class="ps-set">
                <div class="ps-set-title">ตั้งค่า</div>
                <button class="ps-set-row" data-go="wall">
                    <span class="ps-set-ico"><i class="fa-solid fa-image"></i></span>
                    <span class="ps-set-lbl">วอลเปเปอร์</span>
                    <i class="fa-solid fa-chevron-right ps-set-arrow"></i>
                </button>
                <button class="ps-set-row ps-set-gap" data-go="frame">
                    <span class="ps-set-ico ps-set-ico-g"><i class="fa-solid fa-mobile-screen"></i></span>
                    <span class="ps-set-lbl">สีกรอบมือถือ</span>
                    <i class="fa-solid fa-chevron-right ps-set-arrow"></i>
                </button>
            </div>`;

        const showWall = () => {
            app.innerHTML = `
                <div class="ps-set">
                    <button class="ps-set-back"><i class="fa-solid fa-chevron-left"></i> ตั้งค่า</button>
                    <div class="ps-set-title">วอลเปเปอร์</div>
                    <div class="ps-set-card">
                        <label class="ps-set-cap" for="ps_wall_url">วางลิงก์รูปภาพ</label>
                        <input id="ps_wall_url" class="ps-set-input" type="url" placeholder="https://..." value="${esc(ui.wallpaper)}" autocomplete="off">
                        <div class="ps-set-prev" id="ps_wall_prev"></div>
                    </div>
                    <button class="ps-set-save"><i class="fa-solid fa-floppy-disk"></i> บันทึก</button>
                    <button class="ps-set-reset">ใช้ภาพเริ่มต้น</button>
                </div>`;
            const input = app.querySelector('#ps_wall_url');
            const prev = app.querySelector('#ps_wall_prev');
            const updatePrev = () => {
                const u = safeUrl(input.value);
                prev.style.backgroundImage = u ? `url("${u}")` : '';
                prev.textContent = u ? '' : 'ตัวอย่างภาพ';
            };
            updatePrev();
            input.addEventListener('input', updatePrev);
            app.querySelector('.ps-set-back').onclick = () => ctx.open('settings');
            app.querySelector('.ps-set-save').onclick = () => {
                const raw = input.value.trim();
                if (raw && !safeUrl(raw)) return notify('error', 'ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://');
                ui.wallpaper = raw;
                save();
                notify('success', 'บันทึกวอลเปเปอร์แล้ว');
            };
            app.querySelector('.ps-set-reset').onclick = () => {
                input.value = '';
                ui.wallpaper = '';
                save();
                updatePrev();
                notify('success', 'กลับเป็นภาพเริ่มต้นแล้ว');
            };
        };
        const FRAMES = [
            ['black', 'ดำ'],
            ['silver', 'เงิน'],
            ['purple', 'ม่วง'],
            ['gold', 'ทอง'],
        ];
        const showFrame = () => {
            const phone = app.closest('.ps-phone');
            app.innerHTML = `
                <div class="ps-set">
                    <button class="ps-set-back"><i class="fa-solid fa-chevron-left"></i> ตั้งค่า</button>
                    <div class="ps-set-title">สีกรอบมือถือ</div>
                    <div class="ps-set-card">
                        <div class="ps-frames">
                            ${FRAMES.map(([k, n]) => `<button class="ps-fr${ui.frame === k ? ' on' : ''}" data-f="${k}"><span class="ps-frsw ps-frsw-${k}"></span><span>${n}</span></button>`).join('')}
                        </div>
                    </div>
                </div>`;
            app.querySelector('.ps-set-back').onclick = () => ctx.open('settings');
            app.querySelector('.ps-frames').onclick = (e) => {
                const b = e.target.closest('[data-f]');
                if (!b) return;
                ui.frame = b.dataset.f;
                if (phone) phone.dataset.frame = ui.frame;
                save();
                app.querySelectorAll('.ps-fr').forEach((x) => x.classList.toggle('on', x === b));
            };
        };
        app.querySelector('[data-go="frame"]').onclick = showFrame;
        app.querySelector('[data-go="wall"]').onclick = showWall;
    },
});

/* ---------- หน้าจอ iPhone ---------- */
let onResize = null;
let clockTimer = null;

function closeModal() {
    document.getElementById('ps_overlay')?.remove();
    if (onResize) {
        window.removeEventListener('resize', onResize);
        onResize = null;
    }
    if (clockTimer) {
        clearInterval(clockTimer);
        clockTimer = null;
    }
}

const pad = (n) => String(n).padStart(2, '0');
const hhmm = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function openPhone() {
    try {
        closeModal();
        const overlay = document.createElement('div');
        overlay.id = 'ps_overlay';
        // ไม่ใช้ bottom:0 / height:100% เพราะใน SillyTavern ความสูงจะกลายเป็น 0 -> ใช้ขนาดหน้าจอจริงแทน
        overlay.style.cssText =
            'position:fixed;top:0;left:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.65);';

        overlay.innerHTML = `
            <button class="ps-x" title="ปิด"><i class="fa-solid fa-xmark"></i></button>
            <div class="ps-phone">
                <div class="ps-screen home">
                    <div class="ps-island"></div>
                    <div class="ps-status">
                        <span class="ps-clock-s">${hhmm()}</span>
                        <span class="ps-status-icons"><i class="fa-solid fa-signal"></i><i class="fa-solid fa-wifi"></i><i class="fa-solid fa-battery-full"></i></span>
                    </div>
                    <div class="ps-app"></div>
                    <div class="ps-home-bar" title="หน้าหลัก"></div>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('.ps-phone').dataset.frame = getSettings().ui.frame || 'black';
        // เก็บฟอนต์เดิมของ SillyTavern ไว้ให้แอป NEONBANK ใช้
        overlay.style.setProperty('--ps-orig-font', getComputedStyle(document.body).fontFamily);

        // ปรับขนาดกรอบให้พอดีหน้าจอ (มือถือ/PC) และปรับใหม่ตอนหมุนจอหรือย่อขยายหน้าต่าง
        const fit = () => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            overlay.style.width = w + 'px';
            overlay.style.height = h + 'px';
            const pw = Math.max(240, Math.min(380, w - 24, (h - 24) / 2.08));
            overlay.querySelector('.ps-phone')?.style.setProperty('--pw', pw + 'px');
        };
        fit();
        onResize = fit;
        window.addEventListener('resize', onResize);

        const screen = overlay.querySelector('.ps-screen');
        const app = overlay.querySelector('.ps-app');
        let current = null; // แอปที่เปิดอยู่ (null = หน้าโฮม)

        const showHome = () => {
            current = null;
            app.className = 'ps-app';
            screen.classList.add('home');
            applyWallpaper(screen);
            app.scrollTop = 0;
            const d = new Date();
            const date = d.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' });
            app.innerHTML = `
                <div class="ps-home">
                    <div class="ps-home-time">${hhmm(d)}</div>
                    <div class="ps-home-date">${esc(date)}</div>
                    <div class="ps-grid">
                        ${apps
                            .map(
                                (a) => `<button class="ps-appicon" data-id="${a.id}">
                                    <span class="ps-ico ${a.iconClass || ''}">${a.iconHtml || `<i class="fa-solid ${a.icon}"></i>`}</span>
                                    <span>${esc(a.label)}</span>
                                </button>`,
                            )
                            .join('')}
                    </div>
                </div>`;
        };

        const showApp = (id) => {
            const a = apps.find((x) => x.id === id);
            if (!a) return;
            current = id;
            app.className = 'ps-app' + (a.fontClass ? ' ' + a.fontClass : '');
            screen.classList.remove('home');
            screen.style.background = '';
            app.scrollTop = 0;
            app.innerHTML = '';
            try {
                a.render(app, { home: showHome, open: showApp });
            } catch (err) {
                console.error('[Phone System]', err);
                app.innerHTML = `<div style="padding:4em 1em;color:#a00;font-size:14px">เกิดข้อผิดพลาด: ${esc(err.message)}</div>`;
                notify('error', err.message);
            }
        };

        // ปัดขึ้นจากขีดล่างเพื่อกลับหน้าโฮม (เหมือน iPhone)
        let swiped = false;
        const bar = overlay.querySelector('.ps-home-bar');
        let drag = null;
        const resetApp = () => {
            app.style.transition = '';
            app.style.transform = '';
            app.style.opacity = '';
        };
        bar.addEventListener('pointerdown', (e) => {
            drag = { y: e.clientY, t: performance.now() };
            swiped = false;
            try { bar.setPointerCapture(e.pointerId); } catch (_) {}
            app.style.transition = 'none';
        });
        bar.addEventListener('pointermove', (e) => {
            if (!drag) return;
            const dy = Math.max(0, drag.y - e.clientY);
            if (dy > 6) swiped = true;
            const p = Math.min(dy / (screen.clientHeight * 0.5), 1);
            app.style.transform = `translateY(${-dy * 0.5}px) scale(${1 - p * 0.14})`;
            app.style.opacity = String(1 - p * 0.6);
        });
        const endDrag = (e) => {
            if (!drag) return;
            const dy = drag.y - e.clientY;
            const v = dy / Math.max(performance.now() - drag.t, 1);
            drag = null;
            if (dy > screen.clientHeight * 0.12 || (dy > 24 && v > 0.5)) {
                app.style.transition = 'transform .18s ease, opacity .18s ease';
                app.style.transform = 'translateY(-6%) scale(.82)';
                app.style.opacity = '0';
                setTimeout(() => {
                    resetApp();
                    current ? showHome() : closeModal();
                }, 170);
            } else {
                app.style.transition = 'transform .2s ease, opacity .2s ease';
                app.style.transform = '';
                app.style.opacity = '';
                setTimeout(resetApp, 220);
            }
        };
        bar.addEventListener('pointerup', endDrag);
        bar.addEventListener('pointercancel', endDrag);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay || e.target.closest('.ps-x')) return closeModal();
            // ขีดล่าง: อยู่ในแอป -> กลับโฮม / อยู่โฮมอยู่แล้ว -> ปิดโทรศัพท์
            if (e.target.closest('.ps-home-bar')) {
                if (swiped) { swiped = false; return; } // เพิ่งปัดเสร็จ ไม่นับเป็นการแตะ
                return current ? showHome() : closeModal();
            }
            const icon = e.target.closest('.ps-appicon');
            if (icon) showApp(icon.dataset.id);
        });

        // นาฬิกาเดิน
        clockTimer = setInterval(() => {
            const t = hhmm();
            overlay.querySelector('.ps-clock-s').textContent = t;
            const big = overlay.querySelector('.ps-home-time');
            if (big) big.textContent = t;
        }, 5000);

        showHome();
        if (needsScanPopup()) showScanDialog(screen, { onDone: () => (current ? showApp(current) : showHome()) });
    } catch (e) {
        console.error('[Phone System]', e);
        notify('error', 'เปิดโทรศัพท์ไม่สำเร็จ: ' + e.message);
    }
}

/* ---------- ปุ่มลอย ---------- */
function buildFab() {
    if (document.getElementById('ps_fab')) return;
    const ui = getSettings().ui;

    const wrap = document.createElement('div');
    wrap.id = 'ps_fab';
    wrap.innerHTML = '<button class="ps-fab-btn" title="โทรศัพท์"><i class="fa-solid fa-mobile-screen-button"></i></button>';
    document.body.appendChild(wrap);
    const btn = wrap.querySelector('.ps-fab-btn');

    const clamp = (v, max) => Math.min(Math.max(v, 0), Math.max(max, 0));
    const place = (x, y) => {
        wrap.style.left = clamp(x, window.innerWidth - FAB) + 'px';
        wrap.style.top = clamp(y, window.innerHeight - FAB) + 'px';
    };
    place(ui.x ?? 10, ui.y ?? window.innerHeight - 170);
    window.addEventListener('resize', () => place(wrap.offsetLeft, wrap.offsetTop));

    // ลากย้ายปุ่มได้ / แตะเพื่อเปิดโทรศัพท์
    let drag = null;
    btn.addEventListener('pointerdown', (e) => {
        drag = { sx: e.clientX, sy: e.clientY, ox: wrap.offsetLeft, oy: wrap.offsetTop, moved: false };
        btn.setPointerCapture(e.pointerId);
    });
    btn.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const dx = e.clientX - drag.sx;
        const dy = e.clientY - drag.sy;
        if (!drag.moved && Math.hypot(dx, dy) < 8) return;
        drag.moved = true;
        place(drag.ox + dx, drag.oy + dy);
    });
    btn.addEventListener('pointerup', () => {
        if (!drag) return;
        const moved = drag.moved;
        drag = null;
        if (moved) {
            ui.x = wrap.offsetLeft;
            ui.y = wrap.offsetTop;
            save();
        } else {
            openPhone();
        }
    });
    btn.addEventListener('pointercancel', () => (drag = null));
}

jQuery(() => {
    try {
        getSettings();
        buildFab();
        installNewChatGate();
        lastKey = spaceKey();
        const ctx = getContext();
        ctx.eventSource?.on((ctx.eventTypes ?? ctx.event_types)?.CHAT_CHANGED ?? 'chat_id_changed', onChatChanged);
    } catch (e) {
        console.error('[Phone System] init failed', e);
        notify('error', 'เริ่มต้นไม่สำเร็จ: ' + e.message);
    }
});
