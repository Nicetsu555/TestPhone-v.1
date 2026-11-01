// Phone System - SillyTavern extension (v0.3)
// ปุ่มลอยรูปโทรศัพท์ -> เมนู -> เปิดหน้าจอโทรศัพท์ (รูปทรง iPhone)
// เพิ่มเมนู/แอปใหม่ด้วย registerAction({ id, label, icon, render(app, ctx) })

import { extension_settings, getContext } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';

const EXT = 'phone_system';
const FAB = 48; // ขนาดปุ่มลอย (px)

const defaults = {
    bank: {
        balance: 128450,
        currency: '฿',
        account: { name: 'บัญชีหลัก', no: '014-2-91234', type: 'ออมทรัพย์' },
        history: [],
    },
    ui: { x: null, y: null },
};

function fill(target, def) {
    for (const k of Object.keys(def)) {
        if (target[k] === undefined) target[k] = structuredClone(def[k]);
        else if (def[k] && typeof def[k] === 'object' && !Array.isArray(def[k])) fill(target[k], def[k]);
    }
    return target;
}

function getSettings() {
    if (!extension_settings[EXT]) extension_settings[EXT] = {};
    return fill(extension_settings[EXT], defaults);
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

/* ---------- Action registry ---------- */
const actions = [];
function registerAction(a) {
    actions.push(a);
}

/* ---------- แอป: ธนาคาร (RoseBank) ---------- */
let balanceHidden = false;

registerAction({
    id: 'bank',
    label: 'ธนาคาร',
    icon: 'fa-money-bill-transfer',
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
                <div class="ps-hero-bg">
                    <span class="ps-spark" style="left:46%;top:14%;font-size:1.1em">✦</span>
                    <span class="ps-spark" style="left:8%;top:44%;font-size:.7em">✦</span>
                    <span class="ps-spark" style="left:88%;top:6%;font-size:.8em">✦</span>
                    <span class="ps-spark" style="left:30%;top:72%;font-size:.6em">✦</span>
                    <span class="ps-petal" style="left:62%;top:20%;--r:30deg"></span>
                    <span class="ps-petal" style="left:78%;top:30%;--r:-20deg"></span>
                    <span class="ps-petal" style="left:52%;top:62%;--r:60deg"></span>
                    <span class="ps-petal" style="left:90%;top:52%;--r:10deg"></span>
                </div>

                <div class="ps-head">
                    <div class="ps-brand">
                        ${rose('ps-logo')}
                        <div>
                            <div class="ps-name"><b>R</b>OSE<b>B</b>ANK</div>
                            <div class="ps-tag">Banking for a better you ♡</div>
                        </div>
                    </div>
                    <div class="ps-head-right">
                        <button class="ps-bell" title="การแจ้งเตือน"><i class="fa-regular fa-bell"></i><span class="ps-dot"></span></button>
                        <div class="ps-avatar"><i class="fa-solid fa-user"></i></div>
                        <i class="fa-solid fa-chevron-down ps-chev"></i>
                    </div>
                </div>

                <div class="ps-hello">สวัสดี, ${esc(user)} ♡</div>
                <div class="ps-sub">ขอให้วันนี้เป็นวันที่ดีนะคะ</div>

                <div class="ps-acct">
                    <div class="ps-acct-rose">${rose()}</div>
                    <div class="ps-acct-top">${rose('ps-logo-s')}<span>${esc(s.account.name)}</span><i class="fa-solid fa-chevron-down"></i></div>
                    <div class="ps-bal-row">
                        <div class="ps-bal"></div>
                        <button class="ps-eye" title="ซ่อน/แสดงยอดเงิน"><i class="fa-regular fa-eye"></i></button>
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
            </div>`;

        // ยอดเงิน + ปุ่มซ่อน/แสดง
        const bal = app.querySelector('.ps-bal');
        const eye = app.querySelector('.ps-eye i');
        const paint = () => {
            bal.innerHTML = balanceHidden
                ? `<span class="ps-cur">${esc(s.currency)}</span><span>•••••••</span>`
                : `<span class="ps-cur">${esc(s.currency)}</span><span>${int}</span><small>.${dec}</small>`;
            eye.className = balanceHidden ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye';
        };
        paint();
        app.querySelector('.ps-eye').onclick = () => {
            balanceHidden = !balanceHidden;
            paint();
        };

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

/* ---------- หน้าจอ iPhone ---------- */
function closeModal() {
    document.getElementById('ps_overlay')?.remove();
}

function openModal(action) {
    try {
        closeModal();
        const overlay = document.createElement('div');
        overlay.id = 'ps_overlay';
        // ใส่สไตล์หลักแบบ inline เพื่อให้แสดงผลแน่ ๆ แม้เบราว์เซอร์จำ CSS เก่าไว้
        overlay.style.cssText =
            'position:fixed;top:0;left:0;right:0;bottom:0;width:100%;height:100%;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.65);';

        const now = new Date();
        const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        overlay.innerHTML = `
            <button class="ps-x" title="ปิด"><i class="fa-solid fa-xmark"></i></button>
            <div class="ps-phone">
                <div class="ps-screen">
                    <div class="ps-island"></div>
                    <div class="ps-status">
                        <span>${time}</span>
                        <span class="ps-status-icons"><i class="fa-solid fa-signal"></i><i class="fa-solid fa-wifi"></i><i class="fa-solid fa-battery-full"></i></span>
                    </div>
                    <div class="ps-app"></div>
                    <div class="ps-home-bar" title="ปิด"></div>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay || e.target.closest('.ps-x') || e.target.closest('.ps-home-bar')) closeModal();
        });

        const app = overlay.querySelector('.ps-app');
        try {
            action.render(app, { close: closeModal });
        } catch (err) {
            console.error('[Phone System]', err);
            app.innerHTML = `<div style="padding:3em 1em;color:#a00;font-size:14px">เกิดข้อผิดพลาด: ${esc(err.message)}</div>`;
            notify('error', err.message);
        }
    } catch (e) {
        console.error('[Phone System]', e);
        notify('error', 'เปิดหน้าต่างไม่สำเร็จ: ' + e.message);
    }
}

/* ---------- ปุ่มลอย ---------- */
function buildFab() {
    if (document.getElementById('ps_fab')) return;
    const ui = getSettings().ui;

    const wrap = document.createElement('div');
    wrap.id = 'ps_fab';
    wrap.innerHTML = `
        <div class="ps-menu" hidden></div>
        <button class="ps-fab-btn" title="โทรศัพท์"><i class="fa-solid fa-mobile-screen-button"></i></button>`;
    document.body.appendChild(wrap);

    const btn = wrap.querySelector('.ps-fab-btn');
    const menu = wrap.querySelector('.ps-menu');

    const clamp = (v, max) => Math.min(Math.max(v, 0), Math.max(max, 0));
    const place = (x, y) => {
        const px = clamp(x, window.innerWidth - FAB);
        const py = clamp(y, window.innerHeight - FAB);
        wrap.style.left = px + 'px';
        wrap.style.top = py + 'px';
        wrap.classList.toggle('ps-up', py > window.innerHeight / 2);
        wrap.classList.toggle('ps-down', py <= window.innerHeight / 2);
        wrap.classList.toggle('ps-right', px > window.innerWidth / 2);
        wrap.classList.toggle('ps-left', px <= window.innerWidth / 2);
    };

    place(ui.x ?? 10, ui.y ?? window.innerHeight - 170);
    window.addEventListener('resize', () => place(wrap.offsetLeft, wrap.offsetTop));

    const buildMenu = () => {
        menu.innerHTML = actions
            .map((a) => `<button class="ps-menu-item" data-id="${a.id}"><i class="fa-solid ${a.icon}"></i><span>${esc(a.label)}</span></button>`)
            .join('');
    };
    const closeMenu = () => (menu.hidden = true);
    const toggleMenu = () => {
        if (menu.hidden) buildMenu();
        menu.hidden = !menu.hidden;
    };

    menu.addEventListener('click', (e) => {
        const item = e.target.closest('.ps-menu-item');
        if (!item) return;
        closeMenu();
        const action = actions.find((a) => a.id === item.dataset.id);
        if (action) openModal(action);
    });

    // ลากย้ายปุ่มได้ / แตะเพื่อเปิดเมนู
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
        closeMenu();
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
            toggleMenu();
        }
    });
    btn.addEventListener('pointercancel', () => (drag = null));

    document.addEventListener('pointerdown', (e) => {
        if (!wrap.contains(e.target)) closeMenu();
    });
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
