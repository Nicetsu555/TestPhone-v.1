// Phone System - SillyTavern extension
// โครงสร้างแบบโมดูล: เพิ่มแอปใหม่ได้ด้วย registerApp({...})

import { extension_settings } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';

const EXT = 'phone_system';
const defaults = {
    bank: {
        balance: 10000,
        currency: '฿',
        history: [], // { t: timestamp, type: 'in'|'out', amount, note }
    },
};

function getSettings() {
    if (!extension_settings[EXT]) {
        extension_settings[EXT] = structuredClone(defaults);
    }
    const s = extension_settings[EXT];
    for (const k of Object.keys(defaults)) {
        if (!s[k]) s[k] = structuredClone(defaults[k]);
    }
    return s;
}

const save = () => saveSettingsDebounced();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ---------- App registry ---------- */
const apps = [];
function registerApp(app) {
    apps.push(app);
}

/* ---------- Bank app ---------- */
registerApp({
    id: 'bank',
    name: 'ธนาคาร',
    icon: 'fa-building-columns',
    render(root) {
        const s = getSettings().bank;
        const rows = s.history.length
            ? s.history
                  .slice()
                  .reverse()
                  .slice(0, 30)
                  .map(
                      (h) => `
                <div class="ps-row">
                    <div>
                        <div class="ps-row-note">${esc(h.note) || (h.type === 'in' ? 'รับเงิน' : 'จ่ายเงิน')}</div>
                        <div class="ps-row-time">${new Date(h.t).toLocaleString('th-TH')}</div>
                    </div>
                    <div class="ps-amt ${h.type}">${h.type === 'in' ? '+' : '-'}${fmt(h.amount)}</div>
                </div>`,
                  )
                  .join('')
            : '<div class="ps-empty">ยังไม่มีรายการ</div>';

        root.innerHTML = `
            <div class="ps-card">
                <div class="ps-card-label">ยอดเงินคงเหลือ</div>
                <div class="ps-card-balance">${esc(s.currency)}${fmt(s.balance)}</div>
            </div>
            <div class="ps-form">
                <input type="number" id="ps_bank_amount" class="text_pole" placeholder="จำนวนเงิน" min="0" step="0.01">
                <input type="text" id="ps_bank_note" class="text_pole" placeholder="บันทึก (ไม่บังคับ)">
                <div class="ps-btns">
                    <button class="menu_button" id="ps_bank_in"><i class="fa-solid fa-arrow-down"></i> ฝาก/รับ</button>
                    <button class="menu_button" id="ps_bank_out"><i class="fa-solid fa-arrow-up"></i> โอน/จ่าย</button>
                </div>
                <div class="ps-error" id="ps_bank_err"></div>
            </div>
            <div class="ps-section-title">รายการล่าสุด</div>
            <div class="ps-list">${rows}</div>
            <div class="ps-footer">
                <button class="menu_button" id="ps_bank_reset">รีเซ็ตบัญชี</button>
            </div>`;

        const err = root.querySelector('#ps_bank_err');
        const apply = (type) => {
            const amount = parseFloat(root.querySelector('#ps_bank_amount').value);
            const note = root.querySelector('#ps_bank_note').value.trim();
            if (!(amount > 0)) return (err.textContent = 'กรุณาใส่จำนวนเงินให้ถูกต้อง');
            if (type === 'out' && amount > s.balance) return (err.textContent = 'ยอดเงินไม่พอ');
            s.balance += type === 'in' ? amount : -amount;
            s.history.push({ t: Date.now(), type, amount, note });
            if (s.history.length > 200) s.history.shift();
            save();
            this.render(root);
        };
        root.querySelector('#ps_bank_in').onclick = () => apply('in');
        root.querySelector('#ps_bank_out').onclick = () => apply('out');
        root.querySelector('#ps_bank_reset').onclick = () => {
            if (!confirm('รีเซ็ตยอดเงินและประวัติทั้งหมด?')) return;
            extension_settings[EXT].bank = structuredClone(defaults.bank);
            save();
            this.render(root);
        };
    },
});

/* ---------- UI ---------- */
function buildBar() {
    if (document.getElementById('ps_bar')) return;
    const bar = document.createElement('div');
    bar.id = 'ps_bar';
    bar.innerHTML = '<button id="ps_phone_btn" title="โทรศัพท์"><i class="fa-solid fa-mobile-screen-button"></i></button>';
    const sendForm = document.getElementById('send_form');
    sendForm.parentNode.insertBefore(bar, sendForm);
    bar.querySelector('#ps_phone_btn').addEventListener('click', openPhone);
}

function openPhone() {
    closePopup();
    const overlay = document.createElement('div');
    overlay.id = 'ps_overlay';
    overlay.innerHTML = `
        <div class="ps-popup">
            <div class="ps-popup-head">
                <button class="ps-back" title="กลับหน้าหลัก" style="visibility:hidden"><i class="fa-solid fa-chevron-left"></i></button>
                <span class="ps-title"></span>
                <button class="ps-close" title="ปิด"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="ps-popup-body"></div>
        </div>`;
    document.body.appendChild(overlay);

    const body = overlay.querySelector('.ps-popup-body');
    const title = overlay.querySelector('.ps-title');
    const back = overlay.querySelector('.ps-back');

    const showHome = () => {
        title.innerHTML = '<i class="fa-solid fa-mobile-screen-button"></i> โทรศัพท์';
        back.style.visibility = 'hidden';
        body.innerHTML = '<div class="ps-grid">' + apps
            .map((a) => `<button class="ps-icon" data-app="${a.id}"><i class="fa-solid ${a.icon}"></i><span>${esc(a.name)}</span></button>`)
            .join('') + '</div>';
    };

    const showApp = (id) => {
        const app = apps.find((a) => a.id === id);
        if (!app) return;
        title.innerHTML = `<i class="fa-solid ${app.icon}"></i> ${esc(app.name)}`;
        back.style.visibility = 'visible';
        app.render(body);
    };

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.closest('.ps-close')) return closePopup();
        if (e.target.closest('.ps-back')) return showHome();
        const icon = e.target.closest('.ps-icon');
        if (icon) showApp(icon.dataset.app);
    });

    showHome();
}

function closePopup() {
    document.getElementById('ps_overlay')?.remove();
}

jQuery(() => {
    getSettings();
    buildBar();
});
