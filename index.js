// Phone System - SillyTavern extension (v0.2)
// ปุ่มลอยรูปโทรศัพท์ -> กดแล้วมีเมนู -> เลือกแล้วเปิดหน้าต่าง
// เพิ่มเมนูใหม่ได้ด้วย registerAction({ id, label, icon, render })

import { extension_settings } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';

const EXT = 'phone_system';
const FAB = 48; // ขนาดปุ่มลอย (px)

const defaults = {
    bank: { balance: 10000, currency: '฿', history: [] },
    ui: { x: null, y: null },
};

function getSettings() {
    if (!extension_settings[EXT]) extension_settings[EXT] = structuredClone(defaults);
    const s = extension_settings[EXT];
    for (const k of Object.keys(defaults)) if (!s[k]) s[k] = structuredClone(defaults[k]);
    return s;
}

const save = () => saveSettingsDebounced();
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const notify = (type, msg) => (window.toastr ? window.toastr[type](msg, 'Phone System') : console.log('[Phone System]', msg));

/* ---------- Action registry ---------- */
const actions = [];
function registerAction(a) {
    actions.push(a);
}

/* ---------- Action: โอนเงิน ---------- */
registerAction({
    id: 'bank_transfer',
    label: 'โอนเงิน',
    icon: 'fa-money-bill-transfer',
    render(root) {
        const s = getSettings().bank;
        const recent = s.history.filter((h) => h.type === 'out').slice(-8).reverse();
        const rows = recent.length
            ? recent
                  .map(
                      (h) => `
                <div class="ps-row">
                    <div>
                        <div>${esc(h.to) || 'ไม่ระบุผู้รับ'}${h.note ? ` · <span class="ps-dim">${esc(h.note)}</span>` : ''}</div>
                        <div class="ps-row-time">${new Date(h.t).toLocaleString('th-TH')}</div>
                    </div>
                    <div class="ps-amt">-${fmt(h.amount)}</div>
                </div>`,
                  )
                  .join('')
            : '<div class="ps-empty">ยังไม่มีรายการโอน</div>';

        root.innerHTML = `
            <div class="ps-card">
                <div class="ps-card-label">ยอดเงินคงเหลือ</div>
                <div class="ps-card-balance">${esc(s.currency)}${fmt(s.balance)}</div>
            </div>
            <div class="ps-form">
                <input type="text" id="ps_to" class="text_pole" placeholder="โอนให้ (ชื่อผู้รับ)">
                <input type="number" id="ps_amount" class="text_pole" placeholder="จำนวนเงิน" min="0" step="0.01" inputmode="decimal">
                <input type="text" id="ps_note" class="text_pole" placeholder="บันทึก (ไม่บังคับ)">
                <button class="menu_button ps-go" id="ps_send"><i class="fa-solid fa-paper-plane"></i> โอนเงิน</button>
                <div class="ps-error" id="ps_err"></div>
            </div>
            <div class="ps-section-title">รายการโอนล่าสุด</div>
            <div>${rows}</div>
            <div class="ps-footer"><button class="menu_button" id="ps_reset">รีเซ็ตบัญชี</button></div>`;

        const err = root.querySelector('#ps_err');
        root.querySelector('#ps_send').onclick = () => {
            const amount = parseFloat(root.querySelector('#ps_amount').value);
            const to = root.querySelector('#ps_to').value.trim();
            const note = root.querySelector('#ps_note').value.trim();
            if (!(amount > 0)) return (err.textContent = 'กรุณาใส่จำนวนเงินให้ถูกต้อง');
            if (amount > s.balance) return (err.textContent = 'ยอดเงินไม่พอ');
            s.balance -= amount;
            s.history.push({ t: Date.now(), type: 'out', amount, to, note });
            if (s.history.length > 200) s.history.shift();
            save();
            notify('success', `โอน ${fmt(amount)} ${to ? 'ให้ ' + to : ''} สำเร็จ`);
            this.render(root);
        };
        root.querySelector('#ps_reset').onclick = () => {
            if (!confirm('รีเซ็ตยอดเงินและประวัติทั้งหมด?')) return;
            extension_settings[EXT].bank = structuredClone(defaults.bank);
            save();
            this.render(root);
        };
    },
});

/* ---------- Modal ---------- */
function closeModal() {
    document.getElementById('ps_overlay')?.remove();
}

function openModal(action) {
    try {
        closeModal();
        const overlay = document.createElement('div');
        overlay.id = 'ps_overlay';
        overlay.innerHTML = `
            <div class="ps-popup">
                <div class="ps-popup-head">
                    <span><i class="fa-solid ${action.icon}"></i> ${esc(action.label)}</span>
                    <button class="ps-close" title="ปิด"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="ps-popup-body"></div>
            </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay || e.target.closest('.ps-close')) closeModal();
        });
        action.render(overlay.querySelector('.ps-popup-body'));
    } catch (e) {
        console.error('[Phone System]', e);
        notify('error', 'เปิดหน้าต่างไม่สำเร็จ: ' + e.message);
    }
}

/* ---------- Floating button ---------- */
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
        return [px, py];
    };

    // ตำแหน่งเริ่มต้น: ซ้ายล่าง เหนือช่องพิมพ์
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

    // แตะที่อื่นเพื่อปิดเมนู
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
