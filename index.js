// Phone System - SillyTavern extension (v0.4)
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
        cards: [],
    },
    ui: { x: null, y: null, wallpaper: '' },
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
    `<svg class="${cls}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="6" width="30" height="36" rx="4" fill="currentColor" fill-opacity="0.18"/><path d="M15 6v36"/><path d="M22 16h11M22 22h11"/><circle cx="27.5" cy="32" r="4"/></svg>`;

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

/* ---------- App registry ---------- */
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
    render(app) {
        const s = getSettings().bank;
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
                        <button class="ps-bell" title="การแจ้งเตือน"><i class="fa-regular fa-bell"></i><span class="ps-dot"></span></button>
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
                <div class="ps-sec-title"><span class="ps-sec-ico"><i class="fa-solid fa-credit-card"></i></span>บัตรของฉัน</div>
                <div class="ps-track"></div>
                <div class="ps-cardbar">
                    <div class="ps-dots"></div>
                    <button class="ps-flipbtn"><i class="fa-solid fa-rotate"></i> พลิกบัตร</button>
                </div>
            </section>`;

        // ---------- บัตร: ปัดซ้ายขวา / พลิกหน้า-หลัง / เอฟเฟกต์เลื่อม ----------
        const COLORS = ['lime', 'black', 'white'];
        const MAX_CARDS = 6;
        const rnd = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
        const makeCard = (i) => {
            const yy = String((new Date().getFullYear() + 4) % 100).padStart(2, '0');
            return {
                id: Date.now() + '_' + i,
                color: COLORS[i % COLORS.length],
                last4: i === 0 ? '2451' : rnd(4),
                expiry: String(1 + Math.floor(Math.random() * 12)).padStart(2, '0') + '/' + yy,
                cvv: rnd(3),
            };
        };
        if (!s.cards.length) {
            s.cards.push(makeCard(0));
            save();
        }

        const track = app.querySelector('.ps-track');
        const dotsEl = app.querySelector('.ps-dots');
        let cur = 0;

        const fmtBal = (i) => {
            const v = i === 0 ? Number(s.balance) : 0;
            return esc(s.currency) + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        };

        const cardHtml = (c, i) => `
            <div class="ps-slide" data-i="${i}">
                <div class="ps-tilt"><div class="ps-flipper">
                    <div class="ps-face ps-front ps-c-${c.color}">
                        <div class="ps-wm">NEON</div>
                        <div class="ps-c-top"><span class="ps-c-name">${esc(user)}</span><span class="ps-visa">VISA</span></div>
                        <div class="ps-c-bal">${fmtBal(i)}</div>
                        <div class="ps-c-bot">
                            <span class="ps-c-no">•••• ${esc(c.last4)}</span>
                            ${i === 0 ? '<span class="ps-main"><i class="fa-solid fa-circle-check"></i> บัตรหลัก</span>' : ''}
                        </div>
                        <div class="ps-sheen"></div>
                    </div>
                    <div class="ps-face ps-back ps-c-${c.color}">
                        <div class="ps-stripe"></div>
                        <div class="ps-sign"><span>CVV</span><b>${esc(c.cvv)}</b></div>
                        <div class="ps-b-info">
                            <span>•••• •••• •••• ${esc(c.last4)}</span>
                            <span>หมดอายุ ${esc(c.expiry)}</span>
                        </div>
                        <div class="ps-b-brand">NEONBANK</div>
                        <div class="ps-sheen"></div>
                    </div>
                </div></div>
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
            dotsEl.innerHTML = Array.from({ length: n }, (_, i) => `<i class="${i === cur ? 'on' : ''}${i === s.cards.length ? ' plus' : ''}"></i>`).join('');
            app.querySelector('.ps-flipbtn').style.visibility = cur < s.cards.length ? 'visible' : 'hidden';
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

        // แตะบัตร = พลิกหน้า/หลัง, แตะบัตรเปล่า = เพิ่มบัตรใหม่
        track.addEventListener('click', (e) => {
            if (e.target.closest('.ps-addcard')) {
                if (s.cards.length >= MAX_CARDS) return;
                s.cards.push(makeCard(s.cards.length));
                save();
                renderCards();
                const idx = s.cards.length - 1;
                requestAnimationFrame(() => scrollToSlide(idx));
                notify('success', 'เพิ่มบัตรใหม่แล้ว');
                return;
            }
            const sl = e.target.closest('.ps-slide:not(.ps-slide-add)');
            if (sl) sl.classList.toggle('flipped');
        });
        app.querySelector('.ps-flipbtn').onclick = () => slides()[cur]?.classList.toggle('flipped');

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
        requestAnimationFrame(() => scrollToSlide(0, false));

        // คัดลอกเลขบัญชี
        app.querySelector('.ps-copy').onclick = async () => {
            try {
                await navigator.clipboard.writeText(String(s.account.no));
                notify('success', 'คัดลอกเลขบัญชีแล้ว');
            } catch (e) {
                notify('info', 'เลขบัญชี: ' + s.account.no);
            }
        };

        // ปุ่มเมนู 4 ปุ่ม (ตอนนี้ยังเป็นแค่ดีไซน์ เลือกไฮไลต์ได้อย่างเดียว)
        app.querySelector('.ps-tiles').addEventListener('click', (e) => {
            const tile = e.target.closest('.ps-tile');
            if (!tile) return;
            app.querySelectorAll('.ps-tile').forEach((t) => t.classList.toggle('on', t === tile));
        });
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

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay || e.target.closest('.ps-x')) return closeModal();
            // ขีดล่าง: อยู่ในแอป -> กลับโฮม / อยู่โฮมอยู่แล้ว -> ปิดโทรศัพท์
            if (e.target.closest('.ps-home-bar')) return current ? showHome() : closeModal();
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
    } catch (e) {
        console.error('[Phone System] init failed', e);
        notify('error', 'เริ่มต้นไม่สำเร็จ: ' + e.message);
    }
});
