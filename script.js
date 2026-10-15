/* ==========================================================
   SavelyMoney — script.js
   Keranjang & checkout, QRIS (setelah checkout), dan 4 fitur
   interaktif dengan penyimpanan otomatis (localStorage).
   ========================================================== */

// Nomor WhatsApp tujuan checkout (format internasional, tanpa "+" dan tanpa 0 di depan)
const NOMOR_WA = "6289509631956";

/* ============================================================
   0. UTILITAS
   ============================================================ */

const $ = (id) => document.getElementById(id);

// Penyimpanan aman: kalau localStorage diblokir, aplikasi tetap jalan (tanpa simpan)
const store = {
  get(key, def) {
    try {
      const v = localStorage.getItem("savely:" + key);
      return v === null ? def : JSON.parse(v);
    } catch (e) { return def; }
  },
  set(key, val) {
    try { localStorage.setItem("savely:" + key, JSON.stringify(val)); } catch (e) { /* abaikan */ }
  }
};

// Cegah teks yang diketik pengguna dibaca sebagai HTML
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function formatRupiah(angka) {
  return "Rp " + Math.round(angka).toLocaleString("id-ID");
}

// Tampilkan pesan error kecil di bawah form (menggantikan alert)
function tampilPesan(el, teks) {
  if (!teks) { el.hidden = true; el.textContent = ""; return; }
  el.textContent = teks;
  el.hidden = false;
}

// Notifikasi kecil di bawah layar
let toastTimer = null;
function toast(teks) {
  const el = $("toast");
  el.textContent = teks;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

// Ledakan emoji kecil dari sebuah elemen (umpan balik yang menyenangkan)
const geraknyaBoleh = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
function burst(el, emojis) {
  if (!geraknyaBoleh || !el) return;
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  for (let i = 0; i < 9; i++) {
    const s = document.createElement("span");
    s.className = "burst";
    s.textContent = emojis[i % emojis.length];
    const sudut = (Math.PI * 2 * i) / 9 + Math.random() * 0.5;
    const jarak = 50 + Math.random() * 60;
    s.style.left = x + "px";
    s.style.top = y + "px";
    s.style.setProperty("--dx", Math.cos(sudut) * jarak + "px");
    s.style.setProperty("--dy", Math.sin(sudut) * jarak - 30 + "px");
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 950);
  }
}

/* ============================================================
   1. KERANJANG & CHECKOUT
   ============================================================ */

let keranjang = [];
let pesananTerakhir = null; // { id, nama, total }
let sudahCheckout = false;

const produkList        = $("produk-list");
const keranjangItemsEl  = $("keranjang-items");
const keranjangTotalEl  = $("keranjang-total-harga");
const formPesan         = $("form-pesan");
const formErrorEl       = $("form-error");
const checkoutTotalEl   = $("checkout-total");
const cartPill          = $("cart-pill");
const btnLanjut         = $("btn-lanjut");
const formWrap          = $("checkout-form-wrap");

const qrisTotalEl       = $("qris-total");
const qrisImg           = $("qris-img");
const qrisPlaceholderEl = $("qris-placeholder");
const qrisBerbayarEl    = $("qris-berbayar");
const qrisGratisEl      = $("qris-gratis");
const qrisSalinBtn      = $("qris-salin");
const qrisOrderIdEl     = $("qris-order-id");
const pesanSuksesEl     = $("pesan-sukses");
const btnBukaQris       = $("btn-buka-qris");
const qrisKirimBuktiBtn = $("qris-kirim-bukti");

function hitungTotal() {
  return keranjang.reduce((t, item) => t + item.harga * item.jumlah, 0);
}

function jumlahItem() {
  return keranjang.reduce((t, item) => t + item.jumlah, 0);
}

function tambahKeranjang(nama, harga) {
  const itemAda = keranjang.find((item) => item.nama === nama);
  if (itemAda) itemAda.jumlah += 1;
  else keranjang.push({ nama, harga, jumlah: 1 });
  renderKeranjang();
  toast("✓ " + nama + " masuk keranjang");
  cartPill.classList.remove("bump");
  void cartPill.offsetWidth;
  cartPill.classList.add("bump");
}

produkList.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-tambah");
  if (!btn) return;

  const card  = btn.closest(".produk-card");
  const nama  = card.dataset.nama;
  const harga = parseInt(card.dataset.harga, 10);

  tambahKeranjang(nama, harga);
  burst(btn, ["💙", "✨", "🫧"]);
});

keranjangItemsEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-aksi]");
  if (!btn) return;
  const index = parseInt(btn.dataset.index, 10);
  const item = keranjang[index];
  if (!item) return;

  if (btn.dataset.aksi === "plus") item.jumlah += 1;
  if (btn.dataset.aksi === "minus") item.jumlah -= 1;
  if (btn.dataset.aksi === "hapus" || item.jumlah <= 0) keranjang.splice(index, 1);

  renderKeranjang();
});

// Indikator alur: 1 Pilih paket -> 2 Isi data -> 3 Bayar
function updateAlur() {
  const tahap = formWrap.hidden ? 1 : (sudahCheckout ? 3 : 2);
  document.querySelectorAll("#alur li").forEach((li, i) => {
    li.classList.toggle("aktif", i + 1 === tahap);
    li.classList.toggle("selesai", i + 1 < tahap);
  });
}

function renderKeranjang() {
  sudahCheckout = false;
  keranjangItemsEl.innerHTML = "";

  if (keranjang.length === 0) {
    keranjangItemsEl.innerHTML = '<li class="keranjang-kosong">Keranjang masih kosong. Pilih paket di atas dulu, ya.</li>';
  } else {
    keranjang.forEach((item, index) => {
      const li = document.createElement("li");
      li.className = "cart-row";
      li.innerHTML = `
        <div class="cart-info">
          <strong>${esc(item.nama)}</strong>
          <span>${item.harga === 0 ? "Gratis" : formatRupiah(item.harga)}</span>
        </div>
        <div class="stepper">
          <button type="button" data-aksi="minus" data-index="${index}" aria-label="Kurangi">−</button>
          <span>${item.jumlah}</span>
          <button type="button" data-aksi="plus" data-index="${index}" aria-label="Tambah">+</button>
        </div>
        <span class="cart-sub">${item.harga === 0 ? "Gratis" : formatRupiah(item.harga * item.jumlah)}</span>
        <button type="button" class="item-hapus" data-aksi="hapus" data-index="${index}" aria-label="Hapus">✕</button>
      `;
      keranjangItemsEl.appendChild(li);
    });
  }

  const total = hitungTotal();
  keranjangTotalEl.textContent = formatRupiah(total);
  checkoutTotalEl.textContent  = keranjang.length ? "· " + formatRupiah(total) : "";

  // Tandai kartu paket yang sudah ada di keranjang
  document.querySelectorAll(".produk-card").forEach((card) => {
    const item = keranjang.find((i) => i.nama === card.dataset.nama);
    card.classList.toggle("in-cart", !!item);
    card.querySelector(".produk-qty").textContent = item ? "×" + item.jumlah : "";
    card.querySelector(".btn-tambah").textContent = item ? "+ Tambah lagi" : "+ Keranjang";
  });

  // Form data & checkout hanya muncul setelah ada isi keranjang DAN tombol "Lanjut" diklik
  if (keranjang.length === 0) formWrap.hidden = true;
  btnLanjut.hidden = keranjang.length === 0 || !formWrap.hidden;

  // Tombol keranjang melayang
  $("cart-pill-count").textContent = jumlahItem();
  $("cart-pill-total").textContent = formatRupiah(total);
  cartPill.dataset.ada = keranjang.length ? "1" : "0";
  updatePillVisibility();
  updateAlur();
}

// Sembunyikan tombol keranjang melayang saat area checkout sudah terlihat
let checkoutTerlihat = false;
function updatePillVisibility() {
  cartPill.hidden = !(cartPill.dataset.ada === "1" && !checkoutTerlihat);
}
if ("IntersectionObserver" in window) {
  new IntersectionObserver((entries) => {
    checkoutTerlihat = entries[0].isIntersecting;
    updatePillVisibility();
  }, { threshold: 0.15 }).observe($("checkout"));
}

// Nomor pesanan contoh: SM-131026-482 (tanggal + angka acak)
function buatNomorPesanan() {
  const d = new Date();
  const tgl = String(d.getDate()).padStart(2, "0")
            + String(d.getMonth() + 1).padStart(2, "0")
            + String(d.getFullYear()).slice(-2);
  return `SM-${tgl}-${Math.floor(100 + Math.random() * 900)}`;
}

// Tampilkan QRIS di tengah layar (hanya setelah checkout)
function tampilkanQris(pesanan) {
  qrisTotalEl.textContent   = formatRupiah(pesanan.total);
  qrisOrderIdEl.textContent = pesanan.id;
  $("qris-premium-note").hidden = !pesanan.punyaPremium;

  const gratis = pesanan.total <= 0;
  qrisBerbayarEl.hidden = gratis;
  qrisGratisEl.hidden   = !gratis;

  bukaModal("modal-qris");
}

// Kalau gambar QRIS gagal dimuat, tampilkan petunjuk
qrisImg.addEventListener("error", () => {
  qrisImg.hidden = true;
  qrisPlaceholderEl.hidden = false;
});

qrisSalinBtn.addEventListener("click", async () => {
  if (!pesananTerakhir) return;
  const angka = String(pesananTerakhir.total);

  try {
    await navigator.clipboard.writeText(angka);
  } catch (err) {
    // Cadangan untuk browser yang menolak clipboard (misalnya dibuka dari file lokal)
    const temp = document.createElement("textarea");
    temp.value = angka;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand("copy");
    document.body.removeChild(temp);
  }

  toast("Nominal tersalin ✓");
  qrisSalinBtn.textContent = "Tersalin ✓";
  setTimeout(() => { qrisSalinBtn.textContent = "Salin nominal"; }, 1500);
});

btnLanjut.addEventListener("click", () => {
  if (keranjang.length === 0) return;
  formWrap.hidden = false;
  btnLanjut.hidden = true;
  updateAlur();
  formWrap.scrollIntoView({ behavior: "smooth", block: "start" });
  setTimeout(() => $("nama").focus({ preventScroll: true }), 400);
});

// Hapus pesan error saat pengguna mulai mengetik lagi
formPesan.addEventListener("input", () => tampilPesan(formErrorEl, ""));

formPesan.addEventListener("submit", (e) => {
  e.preventDefault();

  if (keranjang.length === 0) {
    tampilPesan(formErrorEl, "Keranjang masih kosong. Tambahkan paket dulu, ya.");
    return;
  }

  const nama    = $("nama").value.trim();
  const wa      = $("wa").value.trim();
  const catatan = $("catatan").value.trim();

  if (!nama) {
    tampilPesan(formErrorEl, "Nama lengkap belum diisi.");
    $("nama").focus();
    return;
  }

  // Terima format 08xx, 628xx, atau +628xx
  const waBersih = wa.replace(/[\s-]/g, "");
  if (!/^(\+?62|0)8\d{8,12}$/.test(waBersih)) {
    tampilPesan(formErrorEl, "Nomor WhatsApp belum valid. Contoh: 081234567890.");
    $("wa").focus();
    return;
  }

  let total = 0;
  let daftarItem = "";
  keranjang.forEach((item) => {
    const subtotal = item.harga * item.jumlah;
    total += subtotal;
    daftarItem += `- ${item.nama} x${item.jumlah} (${formatRupiah(subtotal)})\n`;
  });

  const nomorPesanan = buatNomorPesanan();

  let pesan = "";
  pesan += "Halo SavelyMoney, saya ingin memesan:\n\n";
  pesan += `No. Pesanan: ${nomorPesanan}\n\n`;
  pesan += daftarItem;
  pesan += `\nTotal: ${formatRupiah(total)}\n\n`;
  pesan += `Nama: ${nama}\n`;
  pesan += `No. WhatsApp: ${wa}\n`;
  if (catatan) pesan += `Catatan: ${catatan}\n`;
  const punyaPremium = keranjang.some((i) => /^Paket Premium/.test(i.nama));
  if (punyaPremium) pesan += "\nSetelah pembayaran terkonfirmasi, mohon kirim kode aktivasi Premium.\n";

  window.open(`https://wa.me/${NOMOR_WA}?text=${encodeURIComponent(pesan)}`, "_blank");

  // Setelah checkout: QRIS muncul di tengah layar
  pesananTerakhir = { id: nomorPesanan, nama, total, punyaPremium };
  sudahCheckout = true;
  store.set("profil", { nama, wa });
  updateAlur();
  pesanSuksesEl.hidden = false;
  burst(formPesan.querySelector(".btn-checkout"), ["🎉", "💙", "✨"]);
  tampilkanQris(pesananTerakhir);
});

btnBukaQris.addEventListener("click", () => {
  if (pesananTerakhir) tampilkanQris(pesananTerakhir);
});

qrisKirimBuktiBtn.addEventListener("click", () => {
  if (!pesananTerakhir) return;

  let pesan = "";
  pesan += "Halo SavelyMoney, saya sudah melakukan pembayaran via QRIS.\n\n";
  pesan += `No. Pesanan: ${pesananTerakhir.id}\n`;
  pesan += `Nama: ${pesananTerakhir.nama}\n`;
  pesan += `Total: ${formatRupiah(pesananTerakhir.total)}\n\n`;
  pesan += "Bukti pembayaran saya lampirkan di chat ini.";

  window.open(`https://wa.me/${NOMOR_WA}?text=${encodeURIComponent(pesan)}`, "_blank");
});

/* ============================================================
   2. MODAL: buka & tutup
   ============================================================ */

const modalOverlay = $("modal-overlay");
const modalBoxes   = document.querySelectorAll(".modal-box");
const fiturCards   = document.querySelectorAll(".fitur-card");

function bukaModal(id) {
  modalBoxes.forEach((box) => box.classList.remove("active"));
  const target = $(id);
  if (!target) return;
  target.classList.add("active");
  target.scrollTop = 0;
  modalOverlay.classList.add("active");
  document.body.style.overflow = "hidden";
  refreshSemua();
  if (id === "modal-insight") jalankanInsight();
}

function tutupModal() {
  modalOverlay.classList.remove("active");
  document.body.style.overflow = "";
  resetJeda(); // hentikan timer jeda kalau modal ditutup di tengah jalan
}

fiturCards.forEach((card) => {
  card.addEventListener("click", () => bukaFitur(card.dataset.modal));
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      bukaFitur(card.dataset.modal);
    }
  });
});

document.querySelectorAll(".modal-close").forEach((btn) => {
  btn.addEventListener("click", tutupModal);
});

modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) tutupModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") tutupModal();
});

/* ============================================================
   3. DATA & ALUR BERURUTAN
   Satu barang melewati 4 langkah, tidak boleh loncat:
   1 Jeda -> 2 Butuh vs Keinginan -> 3 Pelacak Anggaran -> 4 Insight
   ============================================================ */

const KATEGORI = { Makan: "🍜", Transport: "🚌", Belanja: "🛍️", Tagihan: "🧾", Hiburan: "🎬", Lainnya: "📦" };

const LANGKAH = [
  { n: 1, id: "modal-jeda",     ikon: "⏳", nama: "Jeda" },
  { n: 2, id: "modal-butuh",    ikon: "⚖️", nama: "Butuh/Ingin" },
  { n: 3, id: "modal-anggaran", ikon: "📊", nama: "Anggaran" },
  { n: 4, id: "modal-insight",  ikon: "✨", nama: "Insight" }
];

let anggaranBulanan = store.get("anggaran", 0);
let pengeluaranList = store.get("pengeluaran", []); // { id, nama, jumlah, kategori, tipe, tgl }
let catatanButuh    = store.get("butuh", []);       // { id, nama, harga, tipe, pid, batal }
let jedaSaved       = store.get("saved", { total: 0, count: 0 });
let jedaTunda       = store.get("tunda", []);       // { id, nama, harga, sampai, ya }

// Barang yang sedang berjalan di alur (null = belum ada / sudah selesai)
// { tahap, nama, harga, keputusan: "beli"|"batal", ya, tipeSaran, tipe, kategori, catatanId }
let alur          = store.get("alur", null);
let selesaiPernah = store.get("selesaiPernah", false); // sudah pernah menyelesaikan 1 putaran penuh

/* ---------- Langganan Premium (membuka fitur Insight) ----------
   Alur: pelanggan membeli Paket Premium -> kamu cek pembayarannya -> kirim KODE AKTIVASI lewat WhatsApp
   -> pelanggan memasukkan kode di fitur Insight.
   Di bawah ini hanya HASH kode yang disimpan, bukan kodenya. Membuat kode baru:
   buka halaman, tekan Option+Cmd+C (Console) lalu ketik: hashKode("SAVELY-BLN-ABCD")
   dan tempel hasilnya ke daftar KODE_PREMIUM.
   Catatan: ini situs statis tanpa server, jadi pengecekan kode hanya sebatas penghalang di sisi browser. */
const KODE_PREMIUM = [
  { hash: "11lhad5ru8k", plan: "bulanan" },  // contoh: SAVELY-BLN-K7P2
  { hash: "2h9frgcvtz",  plan: "bulanan" },  // contoh: SAVELY-BLN-M3X8
  { hash: "agf0jggoqi",  plan: "tahunan" },  // contoh: SAVELY-THN-Q4X9
  { hash: "22sho8p8mr2", plan: "tahunan" }   // contoh: SAVELY-THN-R6D1
];

function hashKode(str) {
  str = String(str).trim().toUpperCase();
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

let premium = store.get("premium", null); // { plan, sampai }

function premiumAktif() {
  return !!premium && premium.sampai > Date.now();
}
function tanggalIndo(ts) {
  return new Date(ts).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}
function aktifkanPremium(kode) {
  const cocok = KODE_PREMIUM.find((k) => k.hash === hashKode(kode));
  if (!cocok) return false;
  premium = { plan: cocok.plan, sampai: Date.now() + (cocok.plan === "tahunan" ? 365 : 30) * 86400000 };
  simpanSemua();
  return true;
}

function kunciBulan(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
function tanggalHariIni() {
  const d = new Date();
  return kunciBulan(d) + "-" + String(d.getDate()).padStart(2, "0");
}
function pengeluaranBulanIni() {
  const kini = kunciBulan(new Date());
  return pengeluaranList.filter((p) => p.tgl.slice(0, 7) === kini);
}
function totalPengeluaran() {
  return pengeluaranBulanIni().reduce((t, p) => t + p.jumlah, 0);
}
function infoHari() {
  const d = new Date();
  const totalHari = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return { hari: d.getDate(), totalHari, sisaHari: totalHari - d.getDate() + 1 };
}
function sisaAnggaran() {
  return anggaranBulanan > 0 ? anggaranBulanan - totalPengeluaran() : null;
}
function batasHarian() {
  const sisa = sisaAnggaran();
  if (sisa === null) return null;
  return Math.max(sisa, 0) / infoHari().sisaHari;
}
function catatanAktif() {
  return catatanButuh.filter((c) => !c.batal);
}
function simpanSemua() {
  store.set("pengeluaran", pengeluaranList);
  store.set("butuh", catatanButuh);
  store.set("saved", jedaSaved);
  store.set("tunda", jedaTunda);
  store.set("anggaran", anggaranBulanan);
  store.set("alur", alur);
  store.set("selesaiPernah", selesaiPernah);
  store.set("premium", premium);
}

/* ---------- Aturan akses: tidak boleh loncat ---------- */
function nomorLangkah(modalId) {
  const l = LANGKAH.find((x) => x.id === modalId);
  return l ? l.n : 0;
}
function langkahSekarang() { return alur ? alur.tahap : 1; }

function bisaAkses(n) {
  if (n === 1) return true;
  if (n === 4 && !premiumAktif()) return false; // Insight = fitur Premium
  if (alur) return n <= alur.tahap;   // sedang berjalan: hanya sampai langkah sekarang
  return selesaiPernah;               // tidak ada yang berjalan: boleh lihat kalau sudah pernah selesai
}
function langkahSelesai(n) {
  return alur ? n < alur.tahap : selesaiPernah;
}

function bukaFitur(id) {
  // Insight tanpa langganan -> tampilkan halaman berlangganan
  if (id === "modal-insight" && !premiumAktif()) { bukaModal(id); return; }
  const n = nomorLangkah(id);
  if (!n || bisaAkses(n)) { bukaModal(id); return; }
  const s = langkahSekarang();
  toast(`🔒 Selesaikan langkah ${s} (${LANGKAH[s - 1].nama}) dulu`);
  bukaModal(LANGKAH[s - 1].id);
}

/* ---------- Awal alur: keputusan dari Jeda ---------- */
function mulaiAlur(nama, harga, keputusan, ya) {
  alur = { tahap: 2, nama, harga, keputusan, ya, tipeSaran: ya >= 2 ? "Butuh" : "Keinginan", tipe: null, kategori: "Belanja", catatanId: null };
  if (keputusan === "batal") {
    jedaSaved.total += harga;
    jedaSaved.count += 1;
  }
  simpanSemua();
  refreshSemua();
}

function hapusPengeluaranById(id) {
  pengeluaranList = pengeluaranList.filter((p) => String(p.id) !== String(id));
  catatanButuh = catatanButuh.filter((c) => String(c.pid) !== String(id));
  simpanSemua();
  refreshSemua();
}
function hapusCatatanById(id) {
  const c = catatanButuh.find((x) => String(x.id) === String(id));
  if (!c) return;
  if (c.pid) pengeluaranList = pengeluaranList.filter((p) => String(p.id) !== String(c.pid));
  catatanButuh = catatanButuh.filter((x) => String(x.id) !== String(id));
  simpanSemua();
  refreshSemua();
}

/* ---------- Tampilan bersama: strip, tab, kunci kartu ---------- */
function renderStrip() {
  const sisa = sisaAnggaran();
  const harian = batasHarian();
  const bagian = [];
  if (alur) bagian.push(`🧾 ${esc(alur.nama)} · langkah ${alur.tahap}/4`);
  bagian.push(sisa === null ? "💙 Anggaran belum diatur" : `💙 Sisa ${formatRupiah(Math.max(sisa, 0))}`);
  if (harian !== null) bagian.push(`📅 ${formatRupiah(harian)}/hari`);
  if (jedaSaved.count > 0) bagian.push(`💰 Terselamatkan ${formatRupiah(jedaSaved.total)}`);
  const aktif = catatanAktif();
  if (aktif.length) {
    const persen = Math.round((aktif.filter((c) => c.tipe === "Keinginan").length / aktif.length) * 100);
    bagian.push(`🛍️ ${persen}% keinginan`);
  }
  document.querySelectorAll(".link-strip").forEach((el) => {
    el.innerHTML = bagian.map((b) => `<span>${b}</span>`).join("");
  });
}

function renderTabs() {
  const sekarang = langkahSekarang();
  document.querySelectorAll(".fitur-tabs").forEach((wrap) => {
    const modalId = wrap.closest(".modal-box").id;
    wrap.innerHTML = LANGKAH.map((l) => {
      const kunci = !bisaAkses(l.n);
      const selesai = !kunci && langkahSelesai(l.n);
      const cls = [
        l.id === modalId ? "active" : "",
        kunci ? "locked" : "",
        selesai ? "done" : "",
        l.n === sekarang ? "now" : ""
      ].filter(Boolean).join(" ");
      const tanda = (l.n === 4 && !premiumAktif()) ? "👑" : kunci ? "🔒" : (selesai ? "✓" : l.n);
      return `<button type="button" class="${cls}" data-buka="${l.id}">${tanda} ${l.ikon} ${l.nama}</button>`;
    }).join("");
  });
}

function renderKunciCards() {
  const sekarang = langkahSekarang();
  document.querySelectorAll(".fitur-card").forEach((card) => {
    const n = nomorLangkah(card.dataset.modal);
    const lab = card.querySelector(".fitur-urut");
    const cta = card.querySelector(".fitur-cta");

    // Insight tanpa langganan: tampil sebagai fitur Premium yang bisa diklik
    if (n === 4 && !premiumAktif()) {
      card.classList.remove("terkunci");
      if (lab) { lab.textContent = "👑 Premium · Langkah 4"; lab.classList.remove("now"); lab.classList.add("premium"); }
      if (cta) cta.textContent = "Langganan untuk membuka →";
      return;
    }
    if (lab) lab.classList.remove("premium");

    const kunci = !bisaAkses(n);
    const selesai = !kunci && langkahSelesai(n);
    card.classList.toggle("terkunci", kunci);
    if (lab) {
      lab.textContent = kunci ? `🔒 Langkah ${n}` : selesai ? `✓ Langkah ${n}` : n === sekarang ? `▶ Langkah ${n} · giliranmu` : `Langkah ${n}`;
      lab.classList.toggle("now", !kunci && n === sekarang);
    }
    if (cta) cta.textContent = kunci ? "Terbuka setelah langkah sebelumnya selesai" : "Coba sekarang →";
  });
}

function refreshSemua() {
  // Premium habis saat barang ada di langkah 4: alur diselesaikan supaya Jeda tidak terkunci
  if (alur && alur.tahap === 4 && !premiumAktif()) {
    alur = null;
    selesaiPernah = true;
    simpanSemua();
  }
  renderAnggaran();
  renderButuh();
  renderSaved();
  renderTunda();
  renderStrip();
  renderTabs();
  renderKunciCards();
  renderJedaKunci();
  renderButuhAlur();
  renderAnggaranAlur();
  renderInsightAlur();
}

// Semua tombol/tab [data-buka] mengikuti aturan urutan
document.addEventListener("click", (e) => {
  const tab = e.target.closest("[data-buka]");
  if (tab) bukaFitur(tab.dataset.buka);
});

/* ============================================================
   4. LANGKAH 1 — Jeda Sebelum Belanja
   ============================================================ */

const jedaFormEl   = $("jeda-form");
const jedaHasilEl  = $("jeda-hasil");
const jedaMulaiBtn = $("jeda-mulai");
const jedaErrorEl  = $("jeda-error");
const jedaTundaEl  = $("jeda-tunda");

let jedaInterval = null;
let jedaDetik    = 10;
let jedaBarang   = null;

$("jeda-durasi").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  jedaDetik = parseInt(chip.dataset.detik, 10);
  $("jeda-durasi").querySelectorAll(".chip").forEach((c) => c.classList.toggle("selected", c === chip));
});

function renderSaved() {
  $("jeda-saved").textContent = formatRupiah(jedaSaved.total);
  $("jeda-saved-count").textContent = `${jedaSaved.count} barang dibatalkan`;
}

// Kalau ada barang yang sedang berjalan di alur, Jeda dikunci sampai alurnya selesai
function renderJedaKunci() {
  const b = $("jeda-banner");
  if (alur) {
    jedaFormEl.hidden = true;
    const sedangHasil = jedaHasilEl.innerHTML.trim() !== "";
    b.hidden = sedangHasil;
    b.innerHTML = `Barang <strong>${esc(alur.nama)}</strong> (${formatRupiah(alur.harga)}) sedang diproses di langkah ${alur.tahap} dari 4. Selesaikan dulu sebelum cek barang lain.
      <button type="button" class="btn btn-primary btn-small" data-buka="${LANGKAH[alur.tahap - 1].id}">Lanjutkan ke langkah ${alur.tahap} →</button>`;
  } else {
    b.hidden = true;
    if (jedaInterval === null && jedaHasilEl.innerHTML.trim() === "") jedaFormEl.hidden = false;
  }
}

function resetJeda() {
  clearInterval(jedaInterval);
  jedaInterval = null;
  jedaHasilEl.innerHTML = "";
  jedaBarang = null;
  tampilPesan(jedaErrorEl, "");
  jedaFormEl.hidden = !!alur;
  renderJedaKunci();
}

jedaMulaiBtn.addEventListener("click", () => {
  if (alur) return;
  const nama  = $("jeda-nama").value.trim();
  const harga = parseInt($("jeda-harga").value, 10);

  if (!nama || !harga || harga <= 0) {
    tampilPesan(jedaErrorEl, "Isi dulu nama barang dan harganya, ya.");
    return;
  }

  tampilPesan(jedaErrorEl, "");
  jedaBarang = { nama, harga };
  jedaFormEl.hidden = true;

  let sisa = jedaDetik;
  jedaHasilEl.innerHTML = `
    <div class="napas">
      <div class="napas-ring"></div>
      <span class="napas-angka" id="napas-angka">${sisa}</span>
    </div>
    <p class="jeda-countdown-label" id="napas-label">Tarik napas pelan-pelan...</p>
    <p class="small-note center">Barang: <strong>${esc(nama)}</strong> · ${formatRupiah(harga)}</p>
  `;
  const angkaEl = $("napas-angka");
  const labelEl = $("napas-label");

  jedaInterval = setInterval(() => {
    sisa -= 1;
    angkaEl.textContent = sisa;
    const fase = Math.floor((jedaDetik - sisa) / 3) % 2;
    labelEl.textContent = fase === 0 ? "Tarik napas pelan-pelan..." : "Hembuskan perlahan...";

    if (sisa <= 0) {
      clearInterval(jedaInterval);
      jedaInterval = null;
      tampilRefleksi();
    }
  }, 1000);
});

function tampilRefleksi() {
  const { nama, harga } = jedaBarang;

  const sisaAng = sisaAnggaran();
  const harian = batasHarian();
  const lewat = sisaAng !== null && harga > sisaAng;

  let info;
  if (sisaAng === null) {
    info = "💡 Anggaran belum diatur. Kamu akan mengaturnya di langkah 3.";
  } else if (lewat) {
    info = `⚠️ Harga ini melebihi sisa anggaranmu (${formatRupiah(Math.max(sisaAng, 0))}).`;
  } else {
    info = `💙 Sisa anggaranmu ${formatRupiah(sisaAng)}; setelah beli tinggal ${formatRupiah(sisaAng - harga)}.`;
    if (harian > 0) info += ` Harga ini setara ${(harga / harian).toFixed(1)}× batas pengeluaran harianmu.`;
  }

  jedaHasilEl.innerHTML = `
    <div class="jeda-pertanyaan">
      <p>Jeda selesai. Jawab jujur soal <strong>${esc(nama)}</strong> (${formatRupiah(harga)}):</p>
      <label class="cek"><input type="checkbox" class="jeda-cek"> Aku belum punya barang dengan fungsi yang sama</label>
      <label class="cek"><input type="checkbox" class="jeda-cek"> Aku akan memakainya rutin, bukan sekali dua kali</label>
      <label class="cek"><input type="checkbox" class="jeda-cek"> Aku masih bahagia dengan keputusan ini besok pagi</label>
      <p class="saran" id="jeda-info">${info}</p>
      <p class="saran saran--verdict" id="jeda-verdict">Centang pertanyaan yang jawabannya "ya".</p>
      <div class="jeda-aksi">
        <button class="btn btn-ghost" id="jeda-lanjut">Tetap Beli</button>
        <button class="btn btn-ghost" id="jeda-tunda-btn">Tunda 24 Jam</button>
        <button class="btn btn-primary" id="jeda-batal">Gak Jadi</button>
      </div>
      <p class="small-note center">Keputusanmu dibawa ke <strong>langkah 2</strong>. Jawaban "ya" jadi saran Butuh atau Keinginan.</p>
    </div>
  `;

  const cekEls = jedaHasilEl.querySelectorAll(".jeda-cek");
  const verdictEl = $("jeda-verdict");
  const hitungYa = () => [...cekEls].filter((c) => c.checked).length;

  const updateVerdict = () => {
    const ya = hitungYa();
    let teks;
    if (ya === 3) teks = "Terlihat masuk akal. Kalau masih yakin, silakan lanjut.";
    else if (ya === 2) teks = "Lumayan meyakinkan. Menunda 24 jam bisa jadi pengaman terakhir.";
    else if (ya === 1) teks = "Masih ragu. Sebaiknya tunda dulu supaya tidak menyesal.";
    else teks = "Belum ada alasan kuat. Kemungkinan besar ini lapar mata.";
    if (lewat) teks += " Dan harganya melewati sisa anggaranmu.";
    verdictEl.textContent = teks;
  };
  cekEls.forEach((c) => c.addEventListener("change", updateVerdict));

  const lanjutKe2 = (htmlPesan) => {
    jedaHasilEl.innerHTML = `
      <div class="jeda-pesan">${htmlPesan}</div>
      <div class="jeda-aksi">
        <button class="btn btn-primary" data-buka="modal-butuh">Lanjut ke Langkah 2: Butuh vs Keinginan →</button>
      </div>`;
    renderJedaKunci();
  };

  $("jeda-lanjut").addEventListener("click", () => {
    mulaiAlur(nama, harga, "beli", hitungYa());
    lanjutKe2(`Keputusanmu: <strong>tetap beli</strong> ${esc(nama)}.<br>Sekarang tandai barang ini sebagai Butuh atau Keinginan.`);
  });

  $("jeda-batal").addEventListener("click", () => {
    burst($("jeda-batal"), ["💰", "🎉", "✨"]);
    mulaiAlur(nama, harga, "batal", hitungYa());
    lanjutKe2(`Mantap! ${formatRupiah(harga)} berhasil kamu selamatkan 🎉<br>Lanjut tandai barang ini agar polanya tercatat.`);
  });

  // Tunda belum menyelesaikan keputusan, jadi alur belum dimulai
  $("jeda-tunda-btn").addEventListener("click", () => {
    jedaTunda.push({ id: Date.now() + Math.random(), nama, harga, sampai: Date.now() + 24 * 3600 * 1000, ya: hitungYa() });
    simpanSemua();
    refreshSemua();
    jedaHasilEl.innerHTML = `
      <div class="jeda-pesan">Disimpan di daftar "Ditunda 24 jam". Putuskan lagi besok, ya ⏰</div>
      <div class="jeda-aksi"><button class="btn btn-primary" id="jeda-ulang">Cek barang lain</button></div>`;
    $("jeda-ulang").addEventListener("click", jedaUlang);
    renderJedaKunci();
  });
}

function jedaUlang() {
  $("jeda-nama").value = "";
  $("jeda-harga").value = "";
  resetJeda();
}

function formatSisaWaktu(ms) {
  const jam = Math.floor(ms / 3600000);
  const menit = Math.floor((ms % 3600000) / 60000);
  return `${jam}j ${menit}m lagi`;
}

function renderTunda() {
  jedaTundaEl.innerHTML = "";
  if (jedaTunda.length === 0) {
    jedaTundaEl.innerHTML = '<li class="mini-kosong">Belum ada barang yang ditunda.</li>';
    return;
  }
  jedaTunda.forEach((t) => {
    const sisa = t.sampai - Date.now();
    const siap = sisa <= 0;
    const status = siap ? "✅ Siap diputuskan" : `⏳ ${formatSisaWaktu(sisa)}`;
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="mini-info"><strong>${esc(t.nama)}</strong><span>${formatRupiah(t.harga)} · ${status}</span></div>
      <div class="mini-aksi">
        <button type="button" data-aksi="beli" data-id="${t.id}" ${siap && !alur ? "" : "disabled"}>Jadi beli</button>
        <button type="button" data-aksi="batal" data-id="${t.id}" ${siap && !alur ? "" : "disabled"}>Gak jadi</button>
      </div>`;
    jedaTundaEl.appendChild(li);
  });
}

// Barang tunda yang sudah 24 jam diputuskan -> masuk alur langkah 2
jedaTundaEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-aksi]");
  if (!btn || btn.disabled) return;
  if (alur) { toast("Selesaikan barang yang sedang diproses dulu"); return; }
  const idx = jedaTunda.findIndex((t) => String(t.id) === btn.dataset.id);
  if (idx < 0) return;
  const item = jedaTunda[idx];
  jedaTunda.splice(idx, 1);
  mulaiAlur(item.nama, item.harga, btn.dataset.aksi === "batal" ? "batal" : "beli", item.ya || 0);
  bukaModal("modal-butuh");
});

setInterval(() => { if ($("modal-jeda").classList.contains("active")) renderTunda(); }, 30000);

/* ============================================================
   5. LANGKAH 2 — Butuh vs Keinginan
   ============================================================ */

const butuhListEl = $("butuh-list");
const butuhAlurEl = $("butuh-alur");

function renderButuhAlur() {
  if (!alur) {
    butuhAlurEl.innerHTML = `
      <div class="alur-banner">
        ${selesaiPernah ? "Ini tampilan riwayatmu. " : ""}Belum ada barang yang sedang diproses. Barang baru harus dimulai dari <strong>Jeda Sebelum Belanja</strong>.
        <button type="button" class="btn btn-primary btn-small" data-buka="modal-jeda">Mulai dari Jeda →</button>
      </div>`;
    return;
  }
  if (alur.tahap > 2) {
    butuhAlurEl.innerHTML = `<div class="alur-banner done">✓ <strong>${esc(alur.nama)}</strong> sudah ditandai sebagai <strong>${alur.tipe}</strong>.</div>`;
    return;
  }
  const batal = alur.keputusan === "batal";
  butuhAlurEl.innerHTML = `
    <div class="alur-item">
      <span class="alur-item-ikon">${batal ? "💰" : "🛍️"}</span>
      <div>
        <strong>${esc(alur.nama)}</strong>
        <span>${formatRupiah(alur.harga)} · ${batal ? "dibatalkan di Jeda" : "tetap dibeli"}</span>
      </div>
    </div>
    <p class="saran">Dari jawaban Jeda (${alur.ya} dari 3 "ya"), saran untukmu: <strong>${alur.tipeSaran}</strong>. Kamu tetap bebas memilih.</p>
    <div class="pilih-tipe">
      <button type="button" class="pilih ${alur.tipeSaran === "Butuh" ? "disarankan" : ""}" data-tipe="Butuh">
        <b>✅ Butuh</b><span>Dipakai rutin / tidak ada penggantinya</span>
      </button>
      <button type="button" class="pilih ${alur.tipeSaran === "Keinginan" ? "disarankan" : ""}" data-tipe="Keinginan">
        <b>🛍️ Keinginan</b><span>Bagus dimiliki, tapi bisa ditunda</span>
      </button>
    </div>`;
}

butuhAlurEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-tipe]");
  if (!btn || !alur || alur.tahap !== 2) return;

  const id = Date.now() + Math.random();
  catatanButuh.unshift({ id, nama: alur.nama, harga: alur.harga, tipe: btn.dataset.tipe, pid: null, batal: alur.keputusan === "batal" });
  alur.tipe = btn.dataset.tipe;
  alur.catatanId = id;
  alur.tahap = 3;
  simpanSemua();
  refreshSemua();
  toast(`✓ Ditandai ${alur.tipe}`);
  bukaModal("modal-anggaran");
});

function renderButuh() {
  const aktif = catatanAktif();
  const batal = catatanButuh.filter((c) => c.batal);
  const butuh = aktif.filter((c) => c.tipe === "Butuh");
  const ingin = aktif.filter((c) => c.tipe === "Keinginan");
  const rpButuh = butuh.reduce((t, c) => t + c.harga, 0);
  const rpIngin = ingin.reduce((t, c) => t + c.harga, 0);

  $("jumlah-butuh").textContent = butuh.length;
  $("jumlah-keinginan").textContent = ingin.length;

  const pakaiRupiah = rpButuh + rpIngin > 0;
  const a = pakaiRupiah ? rpButuh : butuh.length;
  const b = pakaiRupiah ? rpIngin : ingin.length;
  const tot = a + b;
  $("split-butuh").style.width = tot ? (a / tot) * 100 + "%" : "0%";
  $("split-keinginan").style.width = tot ? (b / tot) * 100 + "%" : "0%";

  let note;
  if (catatanButuh.length === 0) note = "Belum ada catatan.";
  else if (pakaiRupiah) {
    const persen = Math.round((rpIngin / (rpButuh + rpIngin)) * 100);
    note = `Butuh ${formatRupiah(rpButuh)} · Keinginan ${formatRupiah(rpIngin)} (${persen}% untuk keinginan).`;
  } else note = "Belum ada harga tercatat.";
  if (batal.length) note += ` Dibatalkan lewat Jeda: ${batal.length} barang (${formatRupiah(batal.reduce((t, c) => t + c.harga, 0))}).`;
  $("butuh-rupiah").textContent = note;

  butuhListEl.innerHTML = "";
  catatanButuh.forEach((c) => {
    const li = document.createElement("li");
    const tagClass = c.batal ? "tag-batal" : (c.tipe === "Butuh" ? "tag-butuh" : "tag-keinginan");
    const tagText = c.batal ? `Batal 💰 · ${c.tipe}` : c.tipe;
    li.innerHTML = `
      <span class="li-nama">${esc(c.nama)}<small>${c.harga ? formatRupiah(c.harga) : "tanpa harga"}${c.pid ? " · 💳 di anggaran" : ""}</small></span>
      <span class="${tagClass}">${tagText}</span>
      <button type="button" class="li-hapus" data-id="${c.id}" aria-label="Hapus">✕</button>`;
    butuhListEl.appendChild(li);
  });
  $("butuh-reset").hidden = catatanButuh.length === 0;
}

butuhListEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".li-hapus");
  if (btn) hapusCatatanById(btn.dataset.id);
});

$("butuh-reset").addEventListener("click", () => {
  if (!confirm("Hapus semua catatan Butuh vs Keinginan? Pengeluaran yang terhubung juga ikut dihapus.")) return;
  const pids = new Set(catatanButuh.filter((c) => c.pid).map((c) => String(c.pid)));
  pengeluaranList = pengeluaranList.filter((p) => !pids.has(String(p.id)));
  catatanButuh = [];
  if (alur && alur.tahap > 2) { alur = null; }
  simpanSemua();
  refreshSemua();
});

/* ============================================================
   6. LANGKAH 3 — Pelacak Anggaran
   ============================================================ */

const anggaranJumlahInput = $("anggaran-jumlah");
const anggaranProgressBar = $("anggaran-progress-bar");
const anggaranProgressEl  = $("anggaran-progress");
const anggaranStatusEl    = $("anggaran-status");
const anggaranErrorEl     = $("anggaran-error");
const pengeluaranListEl   = $("pengeluaran-list");
const anggaranAlurEl      = $("anggaran-alur");

$("anggaran-set-btn").addEventListener("click", () => {
  const nilai = parseInt(anggaranJumlahInput.value, 10);
  if (!nilai || nilai <= 0) {
    tampilPesan(anggaranErrorEl, "Masukkan jumlah anggaran yang valid, ya.");
    return;
  }
  tampilPesan(anggaranErrorEl, "");
  anggaranBulanan = nilai;
  anggaranJumlahInput.value = "";
  simpanSemua();
  refreshSemua();
  toast("✓ Anggaran diatur: " + formatRupiah(nilai));
});

function renderAnggaranAlur() {
  if (!alur) {
    anggaranAlurEl.innerHTML = `
      <div class="alur-banner">
        ${selesaiPernah ? "Ini tampilan riwayatmu. " : ""}Pengeluaran baru hanya bisa dicatat lewat alur, mulai dari <strong>Jeda Sebelum Belanja</strong>.
        <button type="button" class="btn btn-primary btn-small" data-buka="modal-jeda">Mulai dari Jeda →</button>
      </div>`;
    return;
  }
  if (alur.tahap > 3) {
    anggaranAlurEl.innerHTML = `<div class="alur-banner done">✓ ${alur.keputusan === "beli" ? `<strong>${esc(alur.nama)}</strong> sudah tercatat di pengeluaran bulan ini.` : `Barang dibatalkan, tidak ada pengeluaran yang dicatat.`}</div>`;
    return;
  }

  const beli = alur.keputusan === "beli";
  const sisa = sisaAnggaran();
  const siap = sisa !== null;
  let dampak = "";
  if (siap && beli) {
    const sesudah = sisa - alur.harga;
    dampak = sesudah < 0
      ? `<p class="form-error">⚠️ Pengeluaran ini membuat anggaranmu lewat ${formatRupiah(Math.abs(sesudah))}.</p>`
      : `<p class="saran">Sisa anggaranmu: ${formatRupiah(sisa)} → ${formatRupiah(sesudah)} setelah dicatat.</p>`;
  } else if (siap && !beli) {
    dampak = `<p class="saran">Karena dibatalkan, anggaranmu tetap aman. Sisa ${formatRupiah(sisa)} dan kamu menyelamatkan ${formatRupiah(alur.harga)} 💰</p>`;
  }

  anggaranAlurEl.innerHTML = `
    <div class="alur-item">
      <span class="alur-item-ikon">${beli ? "🛍️" : "💰"}</span>
      <div>
        <strong>${esc(alur.nama)}</strong>
        <span>${formatRupiah(alur.harga)} · ${alur.tipe === "Butuh" ? "✅ Butuh" : "🛍️ Keinginan"} · ${beli ? "dibeli" : "dibatalkan"}</span>
      </div>
    </div>
    ${siap ? "" : '<p class="form-error">Atur dulu anggaran bulan ini di kolom atas, supaya langkah ini bisa diselesaikan.</p>'}
    ${beli ? `
      <label for="alur-kategori">Kategori pengeluaran</label>
      <select id="alur-kategori">
        ${Object.keys(KATEGORI).map((k) => `<option value="${k}" ${alur.kategori === k ? "selected" : ""}>${KATEGORI[k]} ${k}</option>`).join("")}
      </select>` : ""}
    ${dampak}
    <button type="button" class="btn btn-primary btn-checkout" id="alur-catat" ${siap ? "" : "disabled"}>
      ${premiumAktif()
        ? (beli ? "Catat ke Anggaran & lanjut ke Insight →" : "Lanjut ke Insight →")
        : (beli ? "Catat ke Anggaran & selesai ✓" : "Selesai ✓")}
    </button>`;
}

anggaranAlurEl.addEventListener("change", (e) => {
  if (e.target.id === "alur-kategori" && alur) { alur.kategori = e.target.value; simpanSemua(); }
});

anggaranAlurEl.addEventListener("click", (e) => {
  if (!e.target.closest("#alur-catat") || !alur || alur.tahap !== 3 || sisaAnggaran() === null) return;

  if (alur.keputusan === "beli") {
    const pid = Date.now() + Math.random();
    pengeluaranList.push({ id: pid, nama: alur.nama, jumlah: alur.harga, kategori: alur.kategori || "Belanja", tipe: alur.tipe, tgl: tanggalHariIni() });
    const c = catatanButuh.find((x) => String(x.id) === String(alur.catatanId));
    if (c) c.pid = pid;
  }
  if (premiumAktif()) {
    alur.tahap = 4;
    simpanSemua();
    refreshSemua();
    bukaModal("modal-insight");
  } else {
    // Tanpa Premium, alur berakhir di langkah 3. Insight tersedia lewat langganan.
    alur = null;
    selesaiPernah = true;
    simpanSemua();
    refreshSemua();
    toast("✓ Tercatat. Insight tersedia untuk pelanggan Premium 👑");
  }
});

pengeluaranListEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".li-hapus");
  if (btn) hapusPengeluaranById(btn.dataset.id);
});

$("anggaran-reset").addEventListener("click", () => {
  if (!confirm("Hapus semua pengeluaran bulan ini?")) return;
  const kini = kunciBulan(new Date());
  const hapus = new Set(pengeluaranList.filter((p) => p.tgl.slice(0, 7) === kini).map((p) => String(p.id)));
  pengeluaranList = pengeluaranList.filter((p) => !hapus.has(String(p.id)));
  catatanButuh = catatanButuh.filter((c) => !hapus.has(String(c.pid)));
  simpanSemua();
  refreshSemua();
});

$("anggaran-ke-jeda").addEventListener("click", () => bukaFitur("modal-jeda"));

function renderAnggaran() {
  const items = pengeluaranBulanIni().slice().reverse();
  const total = totalPengeluaran();

  pengeluaranListEl.innerHTML = "";
  if (items.length === 0) {
    pengeluaranListEl.innerHTML = '<li class="mini-kosong">Belum ada pengeluaran bulan ini.</li>';
  }
  items.forEach((p) => {
    const li = document.createElement("li");
    const tipeTag = p.tipe ? ` · ${p.tipe === "Butuh" ? "✅" : "🛍️"} ${p.tipe}` : "";
    li.innerHTML = `
      <span class="li-nama">${KATEGORI[p.kategori] || "📦"} ${esc(p.nama)}<small>${p.tgl.slice(8)}/${p.tgl.slice(5, 7)} · ${p.kategori}${tipeTag}</small></span>
      <span>${formatRupiah(p.jumlah)}</span>
      <button type="button" class="li-hapus" data-id="${p.id}" aria-label="Hapus">✕</button>`;
    pengeluaranListEl.appendChild(li);
  });
  $("anggaran-reset").hidden = items.length === 0;

  const perKat = {};
  items.forEach((p) => { perKat[p.kategori] = (perKat[p.kategori] || 0) + p.jumlah; });
  const katUrut = Object.entries(perKat).sort((a, b) => b[1] - a[1]);
  $("kategori-bars").innerHTML = katUrut.length
    ? katUrut.map(([k, v]) => `
        <div class="kat-row">
          <span>${KATEGORI[k] || "📦"} ${k}</span>
          <div class="kat-bar"><i style="width:${(v / total) * 100}%"></i></div>
          <span>${formatRupiah(v)}</span>
        </div>`).join("")
    : '<p class="mini-kosong">Belum ada data kategori.</p>';

  const rpButuh = items.filter((p) => p.tipe === "Butuh").reduce((t, p) => t + p.jumlah, 0);
  const rpIngin = items.filter((p) => p.tipe === "Keinginan").reduce((t, p) => t + p.jumlah, 0);
  const rpTipe = rpButuh + rpIngin;
  $("ag-split-butuh").style.width = rpTipe ? (rpButuh / rpTipe) * 100 + "%" : "0%";
  $("ag-split-keinginan").style.width = rpTipe ? (rpIngin / rpTipe) * 100 + "%" : "0%";
  $("ag-split-note").textContent = rpTipe
    ? `Butuh ${formatRupiah(rpButuh)} · Keinginan ${formatRupiah(rpIngin)} (${Math.round((rpIngin / rpTipe) * 100)}% keinginan)`
    : "Porsi muncul setelah ada pengeluaran yang sudah ditandai di langkah 2.";

  $("stat-terpakai").textContent = formatRupiah(total);

  if (anggaranBulanan <= 0) {
    anggaranProgressEl.style.width = "0%";
    anggaranProgressBar.classList.remove("warning");
    $("stat-sisa").textContent = "-";
    $("stat-harian").textContent = "-";
    $("anggaran-ke-jeda").hidden = true;
    anggaranStatusEl.textContent = total
      ? `Total pengeluaran tercatat: ${formatRupiah(total)}. Atur anggaran bulanan supaya bisa dibandingkan.`
      : "Belum ada anggaran yang diatur.";
    return;
  }

  anggaranJumlahInput.placeholder = formatRupiah(anggaranBulanan);
  const persen = Math.min((total / anggaranBulanan) * 100, 100);
  anggaranProgressEl.style.width = persen + "%";
  const sisa = anggaranBulanan - total;

  $("stat-sisa").textContent = formatRupiah(Math.max(sisa, 0));
  $("stat-harian").textContent = formatRupiah(batasHarian());

  if (total > anggaranBulanan) {
    anggaranProgressBar.classList.add("warning");
    anggaranStatusEl.textContent = `Sudah lewat anggaran sebesar ${formatRupiah(Math.abs(sisa))}. Coba mulai rem pengeluaran ya.`;
  } else {
    anggaranProgressBar.classList.remove("warning");
    anggaranStatusEl.textContent = `Terpakai ${Math.round(persen)}% dari anggaran. Sisa ${formatRupiah(sisa)} untuk bulan ini.`;
  }

  // Anggaran menipis -> arahkan ke Jeda (hanya saat tidak ada barang yang sedang berjalan)
  $("anggaran-ke-jeda").hidden = !(total / anggaranBulanan >= 0.8) || !!alur;
}

/* ============================================================
   7. LANGKAH 4 — Insight Pengeluaran Pintar
   ============================================================ */

const insightHasilEl = $("insight-hasil");
const insightAlurEl  = $("insight-alur");
const insightBuatBtn = $("insight-buat");

function renderInsightAlur() {
  const aktif = premiumAktif();
  const urutOk = bisaAkses(4);

  $("insight-paywall").hidden = aktif;
  $("insight-urut").hidden = !(aktif && !urutOk);
  $("insight-isi").hidden = !(aktif && urutOk);

  if (aktif) {
    $("premium-status").textContent = `👑 Premium ${premium.plan} aktif sampai ${tanggalIndo(premium.sampai)}`;
  }
  if (aktif && !urutOk) {
    const s = langkahSekarang();
    $("insight-urut").innerHTML = `Premium kamu sudah aktif 👑. Selesaikan dulu langkah ${s} (${LANGKAH[s - 1].nama}) supaya Insight terbuka.
      <button type="button" class="btn btn-primary btn-small" data-buka="${LANGKAH[s - 1].id}">Lanjutkan →</button>`;
  }
  if (!aktif || !urutOk) return;

  if (alur && alur.tahap === 4) {
    const beli = alur.keputusan === "beli";
    const ang = anggaranBulanan;
    const persen = ang > 0 ? Math.round((alur.harga / ang) * 100) : 0;
    const sisaSekarang = sisaAnggaran();
    const dampak = beli
      ? `Barang ini memakai <strong>${persen}%</strong> anggaran bulananmu. Sisa anggaran: ${formatRupiah(sisaSekarang + alur.harga)} → <strong>${formatRupiah(sisaSekarang)}</strong>.`
      : `Dengan membatalkan ini, kamu menyelamatkan <strong>${formatRupiah(alur.harga)}</strong> (${persen}% anggaranmu). Sisa anggaran tetap ${formatRupiah(sisaSekarang)}.`;
    insightAlurEl.innerHTML = `
      <div class="alur-item">
        <span class="alur-item-ikon">${beli ? "🛍️" : "💰"}</span>
        <div>
          <strong>Dampak: ${esc(alur.nama)}</strong>
          <span>${formatRupiah(alur.harga)} · ${alur.tipe === "Butuh" ? "✅ Butuh" : "🛍️ Keinginan"} · ${beli ? "dibeli" : "dibatalkan"}</span>
        </div>
      </div>
      <p class="saran">${dampak}</p>`;
    $("insight-selesai").hidden = false;
  } else {
    insightAlurEl.innerHTML = `
      <div class="alur-banner">
        Ini tampilan insight terbaru. Untuk menambah data baru, mulai lagi dari <strong>Jeda Sebelum Belanja</strong>.
        <button type="button" class="btn btn-primary btn-small" data-buka="modal-jeda">Mulai dari Jeda →</button>
      </div>`;
    $("insight-selesai").hidden = true;
  }
}

// Berlangganan: masukkan paket Premium ke keranjang lalu arahkan ke checkout
$("insight-paywall").addEventListener("click", (e) => {
  const plan = e.target.closest(".plan");
  if (!plan) return;
  keranjang = keranjang.filter((i) => !/^Paket Premium/.test(i.nama));
  tambahKeranjang(plan.dataset.plan, parseInt(plan.dataset.harga, 10));
  tutupModal();
  setTimeout(() => $("checkout").scrollIntoView({ behavior: "smooth", block: "start" }), 200);
});

// Aktivasi dengan kode dari WhatsApp
function prosesKode() {
  const kode = $("kode-input").value.trim();
  const err = $("kode-error");
  if (!kode) { tampilPesan(err, "Masukkan kode aktivasi dulu, ya."); return; }
  if (!aktifkanPremium(kode)) {
    tampilPesan(err, "Kode tidak valid. Cek lagi penulisannya atau hubungi kami lewat WhatsApp.");
    return;
  }
  tampilPesan(err, "");
  $("kode-input").value = "";
  refreshSemua();
  burst($("kode-aktif"), ["👑", "✨", "💎"]);
  toast("👑 Premium aktif!");
  if (bisaAkses(4)) jalankanInsight();
}
$("kode-aktif").addEventListener("click", prosesKode);
$("kode-input").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); prosesKode(); } });

$("insight-selesai").addEventListener("click", () => {
  selesaiPernah = true;
  alur = null;
  simpanSemua();
  jedaUlang();
  refreshSemua();
  burst($("insight-selesai"), ["🎉", "💙", "✨"]);
  toast("🎉 Satu putaran selesai. Semua fitur sekarang terbuka untuk dilihat");
  bukaModal("modal-jeda");
});

function jalankanInsight() {
  if (!premiumAktif() || !bisaAkses(4)) return;
  const total = totalPengeluaran();
  const items = pengeluaranBulanIni();
  const { hari, totalHari, sisaHari } = infoHari();
  const aktif = catatanAktif();

  const chips = [];
  const baris = [];
  const saran = []; // { t, buka, label }
  const komponen = [];

  if (anggaranBulanan > 0) {
    const persen   = Math.round((total / anggaranBulanan) * 100);
    const rata     = total / hari;
    const proyeksi = rata * totalHari;
    const sisa     = anggaranBulanan - total;

    chips.push(["Terpakai", persen + "%"]);
    chips.push(["Proyeksi akhir bulan", formatRupiah(proyeksi)]);
    baris.push(["📈", `Rata-rata pengeluaranmu ${formatRupiah(rata)} per hari. Kalau pola ini berlanjut, total akhir bulan sekitar ${formatRupiah(proyeksi)} (${proyeksi > anggaranBulanan ? "melebihi" : "masih di dalam"} anggaran).`]);
    komponen.push({ dapat: proyeksi <= anggaranBulanan ? 50 : Math.max(0, 50 - (proyeksi / anggaranBulanan - 1) * 100), maks: 50 });

    if (sisa <= 0) saran.push({ t: "Anggaran bulan ini sudah habis. Tahan semua pembelian yang belum mendesak dengan Jeda." });
    else if (proyeksi > anggaranBulanan) saran.push({ t: `Supaya aman, batasi pengeluaran maksimal ${formatRupiah(sisa / sisaHari)} per hari sampai akhir bulan.` });
    else if (persen < 40 && hari > totalHari / 2) saran.push({ t: "Pengeluaranmu terkendali. Sisihkan selisihnya ke tabungan sebelum terpakai." });
  }

  if (total > 0) {
    const perKat = {};
    items.forEach((p) => { perKat[p.kategori] = (perKat[p.kategori] || 0) + p.jumlah; });
    const [kTop, vTop] = Object.entries(perKat).sort((a, b) => b[1] - a[1])[0];
    const persenTop = Math.round((vTop / total) * 100);
    chips.push(["Kategori terbesar", `${KATEGORI[kTop]} ${kTop}`]);
    baris.push([KATEGORI[kTop], `${kTop} menyedot ${persenTop}% pengeluaranmu (${formatRupiah(vTop)}).`]);
    if (persenTop >= 40) saran.push({ t: `Porsi ${kTop} paling besar. Pantau terus rinciannya di Pelacak Anggaran.` });
  }

  const bertanda = items.filter((p) => p.tipe);
  if (bertanda.length > 0) {
    const rpAll = bertanda.reduce((t, p) => t + p.jumlah, 0);
    const rpIngin = bertanda.filter((p) => p.tipe === "Keinginan").reduce((t, p) => t + p.jumlah, 0);
    const share = rpIngin / rpAll;
    chips.push(["Keinginan", Math.round(share * 100) + "%"]);
    baris.push(["⚖️", `${Math.round(share * 100)}% uang yang kamu keluarkan bulan ini untuk keinginan (${formatRupiah(rpIngin)} dari ${formatRupiah(rpAll)}).`]);
    komponen.push({ dapat: 30 * (1 - share), maks: 30 });
    if (share >= 0.4) saran.push({ t: "Hampir separuh pengeluaranmu untuk keinginan. Pakai Jeda lagi untuk pembelian berikutnya.", buka: "modal-jeda", label: "Buka Jeda" });
  } else if (aktif.length > 0) {
    const rasio = aktif.filter((c) => c.tipe === "Keinginan").length / aktif.length;
    chips.push(["Keinginan", Math.round(rasio * 100) + "%"]);
    baris.push(["⚖️", `Dari ${aktif.length} barang yang kamu catat, ${Math.round(rasio * 100)}% adalah keinginan.`]);
    komponen.push({ dapat: 30 * (1 - rasio), maks: 30 });
  }

  if (jedaSaved.count > 0 || jedaTunda.length > 0) {
    if (jedaSaved.count > 0) {
      baris.push(["⏳", `Fitur Jeda sudah menyelamatkan ${formatRupiah(jedaSaved.total)} dari ${jedaSaved.count} barang.`]);
      chips.push(["Terselamatkan", formatRupiah(jedaSaved.total)]);
    }
    if (jedaTunda.length > 0) baris.push(["⏰", `${jedaTunda.length} barang masih di daftar tunda 24 jam. Putuskan setelah waktunya habis.`]);
    komponen.push({ dapat: Math.min(20, 8 + jedaSaved.count * 4), maks: 20 });
  }

  if (komponen.length === 0 && baris.length === 0) {
    insightHasilEl.innerHTML = `<div class="insight-line"><p>Belum ada data untuk dianalisis.</p></div>`;
    return;
  }

  let skorHtml = "";
  if (komponen.length) {
    const dapat = komponen.reduce((t, k) => t + k.dapat, 0);
    const maks  = komponen.reduce((t, k) => t + k.maks, 0);
    const skor  = Math.round((dapat / maks) * 100);
    const label = skor >= 80 ? "Sehat 💙" : skor >= 60 ? "Cukup baik 🙂" : skor >= 40 ? "Perlu perhatian ⚠️" : "Waspada 🚨";
    skorHtml = `
      <div class="skor">
        <div class="skor-ring" style="--p:${skor}"><span>${skor}</span></div>
        <div><strong>Skor keuangan</strong><p>${label}</p></div>
      </div>`;
  }

  insightHasilEl.innerHTML = `
    ${skorHtml}
    <div class="chip-stat-row">${chips.map(([k, v]) => `<div><span>${k}</span><strong>${v}</strong></div>`).join("")}</div>
    ${baris.map(([ico, teks]) => `<div class="insight-line"><span>${ico}</span><p>${teks}</p></div>`).join("")}
    ${saran.length ? `<h4 class="sub-judul">Saran untukmu</h4>` + saran.map((s) => `
      <div class="insight-line insight-saran"><span>💡</span><p>${s.t}</p>${s.buka ? `<button type="button" class="btn btn-ghost btn-small" data-buka="${s.buka}">${s.label}</button>` : ""}</div>`).join("") : ""}
  `;
}

insightBuatBtn.addEventListener("click", jalankanInsight);

/* ============================================================
   8. KENYAMANAN: menu mobile, nav aktif, jalan pintas, Enter, reveal
   ============================================================ */

// Menu mobile
const navToggle = $("nav-toggle");
const navEl = document.querySelector(".nav");
navToggle.addEventListener("click", () => {
  const buka = navEl.classList.toggle("open");
  navToggle.classList.toggle("open", buka);
  navToggle.setAttribute("aria-expanded", String(buka));
});
navEl.addEventListener("click", (e) => {
  if (e.target.tagName === "A") {
    navEl.classList.remove("open");
    navToggle.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
  }
});

// Tandai menu sesuai bagian yang sedang dilihat
if ("IntersectionObserver" in window) {
  const links = [...document.querySelectorAll(".nav a")];
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + en.target.id));
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  ["tentang", "fitur", "testimoni", "pesan"].forEach((id) => { const s = $(id); if (s) obs.observe(s); });
}

// Jalan pintas fitur di hero
document.querySelectorAll(".qchip").forEach((btn) => {
  btn.addEventListener("click", () => bukaFitur(btn.dataset.modal));
});

// Tekan Enter di kolom isian = tombol utamanya
function enterKe(ids, tombol) {
  ids.forEach((id) => $(id).addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); $(tombol).click(); }
  }));
}
enterKe(["jeda-nama", "jeda-harga"], "jeda-mulai");
enterKe(["anggaran-jumlah"], "anggaran-set-btn");

// Ingat nama & nomor WhatsApp untuk pesanan berikutnya
const profil = store.get("profil", null);
if (profil) {
  $("nama").value = profil.nama || "";
  $("wa").value = profil.wa || "";
}

// Muncul halus saat di-scroll
const bolehAnimasi = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if ("IntersectionObserver" in window && bolehAnimasi) {
  const revealObs = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const el = en.target;
      el.classList.add("in");
      el.addEventListener("animationend", () => el.classList.remove("reveal", "in"), { once: true });
      revealObs.unobserve(el);
    });
  }, { threshold: 0.12 });
  document.querySelectorAll(".about-text, .about-art, .fitur-card, .produk-card, .keranjang-box")
    .forEach((el, i) => {
      el.classList.add("reveal");
      el.style.animationDelay = (i % 4) * 0.08 + "s";
      revealObs.observe(el);
    });
}

/* ============================================================
   9. INISIALISASI
   ============================================================ */

renderKeranjang();
refreshSemua();
