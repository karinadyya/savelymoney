/* ==========================================================
   SavelyMoney — script.js
   Logika: keranjang & checkout WhatsApp + 4 fitur interaktif
   ========================================================== */

// Nomor WhatsApp tujuan checkout (format internasional, tanpa "+" dan tanpa 0 di depan)
const NOMOR_WA = "6289509631956";

/* ============================================================
   1. KERANJANG & CHECKOUT
   ============================================================ */

let keranjang = [];

const produkList        = document.getElementById("produk-list");
const keranjangItemsEl  = document.getElementById("keranjang-items");
const keranjangTotalEl  = document.getElementById("keranjang-total-harga");
const formPesan         = document.getElementById("form-pesan");

function formatRupiah(angka) {
  return "Rp " + Math.round(angka).toLocaleString("id-ID");
}

produkList.addEventListener("click", function (e) {
  if (!e.target.classList.contains("btn-tambah")) return;

  const card  = e.target.closest(".produk-card");
  const nama  = card.dataset.nama;
  const harga = parseInt(card.dataset.harga, 10);

  const itemAda = keranjang.find((item) => item.nama === nama);
  if (itemAda) {
    itemAda.jumlah += 1;
  } else {
    keranjang.push({ nama, harga, jumlah: 1 });
  }

  renderKeranjang();
});

keranjangItemsEl.addEventListener("click", function (e) {
  if (!e.target.classList.contains("item-hapus")) return;
  const index = parseInt(e.target.dataset.index, 10);
  keranjang.splice(index, 1);
  renderKeranjang();
});

function renderKeranjang() {
  keranjangItemsEl.innerHTML = "";

  if (keranjang.length === 0) {
    keranjangItemsEl.innerHTML = '<li class="keranjang-kosong">Keranjang masih kosong</li>';
    keranjangTotalEl.textContent = formatRupiah(0);
    return;
  }

  let total = 0;

  keranjang.forEach((item, index) => {
    const subtotal = item.harga * item.jumlah;
    total += subtotal;

    const li = document.createElement("li");
    li.innerHTML = `
      <span>${item.nama} x${item.jumlah} — ${formatRupiah(subtotal)}</span>
      <button type="button" class="item-hapus" data-index="${index}">hapus</button>
    `;
    keranjangItemsEl.appendChild(li);
  });

  keranjangTotalEl.textContent = formatRupiah(total);
}

formPesan.addEventListener("submit", function (e) {
  e.preventDefault();

  if (keranjang.length === 0) {
    alert("Keranjang masih kosong. Tambahkan paket dulu, ya.");
    return;
  }

  const nama    = document.getElementById("nama").value.trim();
  const wa      = document.getElementById("wa").value.trim();
  const catatan = document.getElementById("catatan").value.trim();

  if (!nama || !wa) {
    alert("Mohon isi nama dan nomor WhatsApp terlebih dahulu.");
    return;
  }

  let total = 0;
  let daftarItem = "";
  keranjang.forEach((item) => {
    const subtotal = item.harga * item.jumlah;
    total += subtotal;
    daftarItem += `- ${item.nama} x${item.jumlah} (${formatRupiah(subtotal)})\n`;
  });

  let pesan = "";
  pesan += "Halo SavelyMoney, saya ingin memesan:\n\n";
  pesan += daftarItem;
  pesan += `\nTotal: ${formatRupiah(total)}\n\n`;
  pesan += `Nama: ${nama}\n`;
  pesan += `No. WhatsApp: ${wa}\n`;
  if (catatan) {
    pesan += `Catatan: ${catatan}\n`;
  }

  const pesanURL = encodeURIComponent(pesan);
  const linkWA = `https://wa.me/${NOMOR_WA}?text=${pesanURL}`;

  window.open(linkWA, "_blank");
});

renderKeranjang();

/* ============================================================
   2. MODAL: buka & tutup
   ============================================================ */

const modalOverlay = document.getElementById("modal-overlay");
const modalBoxes   = document.querySelectorAll(".modal-box");
const fiturCards    = document.querySelectorAll(".fitur-card");

function bukaModal(id) {
  modalBoxes.forEach((box) => box.classList.remove("active"));
  const target = document.getElementById(id);
  if (!target) return;
  target.classList.add("active");
  modalOverlay.classList.add("active");
  document.body.style.overflow = "hidden";
}

function tutupModal() {
  modalOverlay.classList.remove("active");
  document.body.style.overflow = "";
}

fiturCards.forEach((card) => {
  card.addEventListener("click", () => bukaModal(card.dataset.modal));
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      bukaModal(card.dataset.modal);
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
   3. FITUR: Jeda Sebelum Belanja
   ============================================================ */

const jedaMulaiBtn = document.getElementById("jeda-mulai");
const jedaHasilEl  = document.getElementById("jeda-hasil");

jedaMulaiBtn.addEventListener("click", () => {
  const nama  = document.getElementById("jeda-nama").value.trim();
  const harga = parseInt(document.getElementById("jeda-harga").value, 10);

  if (!nama || !harga || harga <= 0) {
    alert("Isi dulu nama barang dan harganya, ya.");
    return;
  }

  jedaMulaiBtn.disabled = true;
  let sisaDetik = 10;

  jedaHasilEl.innerHTML = `
    <p class="jeda-countdown">${sisaDetik}</p>
    <p class="jeda-countdown-label">Tarik napas, jangan checkout dulu...</p>
  `;
  const angkaEl = jedaHasilEl.querySelector(".jeda-countdown");

  const interval = setInterval(() => {
    sisaDetik -= 1;
    angkaEl.textContent = sisaDetik;

    if (sisaDetik <= 0) {
      clearInterval(interval);
      jedaMulaiBtn.disabled = false;
      jedaHasilEl.innerHTML = `
        <div class="jeda-pertanyaan">
          <p>Waktu jeda selesai. Masih mau beli <strong>${nama}</strong>
          seharga <strong>${formatRupiah(harga)}</strong>?</p>
          <div class="jeda-pertanyaan-aksi">
            <button class="btn btn-ghost" id="jeda-lanjut">Tetap Beli</button>
            <button class="btn btn-primary" id="jeda-batal">Gak Jadi</button>
          </div>
        </div>
      `;

      document.getElementById("jeda-lanjut").addEventListener("click", () => {
        jedaHasilEl.innerHTML = `<div class="jeda-pesan">Oke, keputusan di tanganmu. Semoga ${nama}-nya bermanfaat! 🙂</div>`;
      });

      document.getElementById("jeda-batal").addEventListener("click", () => {
        jedaHasilEl.innerHTML = `<div class="jeda-pesan">Mantap! ${formatRupiah(harga)} berhasil kamu selamatkan hari ini 🎉</div>`;
      });
    }
  }, 1000);
});

/* ============================================================
   4. FITUR: Butuh vs Keinginan
   ============================================================ */

let catatanButuh = []; // { nama, tipe: "Butuh" | "Keinginan" }

const butuhNamaInput   = document.getElementById("butuh-nama");
const btnButuh         = document.getElementById("btn-butuh");
const btnKeinginan     = document.getElementById("btn-keinginan");
const jumlahButuhEl    = document.getElementById("jumlah-butuh");
const jumlahKeinginanEl= document.getElementById("jumlah-keinginan");
const butuhListEl      = document.getElementById("butuh-list");

function tambahCatatanButuh(tipe) {
  const nama = butuhNamaInput.value.trim();
  if (!nama) {
    alert("Tulis dulu nama barangnya, ya.");
    return;
  }
  catatanButuh.unshift({ nama, tipe });
  butuhNamaInput.value = "";
  renderButuh();
}

btnButuh.addEventListener("click", () => tambahCatatanButuh("Butuh"));
btnKeinginan.addEventListener("click", () => tambahCatatanButuh("Keinginan"));

function renderButuh() {
  const totalButuh     = catatanButuh.filter((c) => c.tipe === "Butuh").length;
  const totalKeinginan = catatanButuh.filter((c) => c.tipe === "Keinginan").length;

  jumlahButuhEl.textContent = totalButuh;
  jumlahKeinginanEl.textContent = totalKeinginan;

  butuhListEl.innerHTML = "";
  catatanButuh.slice(0, 6).forEach((c) => {
    const li = document.createElement("li");
    const tagClass = c.tipe === "Butuh" ? "tag-butuh" : "tag-keinginan";
    li.innerHTML = `<span>${c.nama}</span><span class="${tagClass}">${c.tipe}</span>`;
    butuhListEl.appendChild(li);
  });
}

/* ============================================================
   5. FITUR: Pelacak Anggaran
   ============================================================ */

let anggaranBulanan = 0;
let pengeluaranList = []; // { nama, jumlah }

const anggaranJumlahInput = document.getElementById("anggaran-jumlah");
const anggaranSetBtn      = document.getElementById("anggaran-set-btn");
const anggaranProgressBar = document.getElementById("anggaran-progress-bar");
const anggaranProgressEl  = document.getElementById("anggaran-progress");
const anggaranStatusEl    = document.getElementById("anggaran-status");
const pengeluaranNamaInput   = document.getElementById("pengeluaran-nama");
const pengeluaranJumlahInput = document.getElementById("pengeluaran-jumlah");
const pengeluaranTambahBtn   = document.getElementById("pengeluaran-tambah");
const pengeluaranListEl      = document.getElementById("pengeluaran-list");

anggaranSetBtn.addEventListener("click", () => {
  const nilai = parseInt(anggaranJumlahInput.value, 10);
  if (!nilai || nilai <= 0) {
    alert("Masukkan jumlah anggaran yang valid, ya.");
    return;
  }
  anggaranBulanan = nilai;
  renderAnggaran();
});

pengeluaranTambahBtn.addEventListener("click", () => {
  const nama   = pengeluaranNamaInput.value.trim();
  const jumlah = parseInt(pengeluaranJumlahInput.value, 10);

  if (!nama || !jumlah || jumlah <= 0) {
    alert("Isi nama dan jumlah pengeluaran dengan benar, ya.");
    return;
  }

  pengeluaranList.push({ nama, jumlah });
  pengeluaranNamaInput.value = "";
  pengeluaranJumlahInput.value = "";
  renderAnggaran();
});

function totalPengeluaran() {
  return pengeluaranList.reduce((total, item) => total + item.jumlah, 0);
}

function renderAnggaran() {
  // Render daftar pengeluaran
  pengeluaranListEl.innerHTML = "";
  pengeluaranList.forEach((item) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${item.nama}</span><span>${formatRupiah(item.jumlah)}</span>`;
    pengeluaranListEl.appendChild(li);
  });

  const total = totalPengeluaran();

  if (anggaranBulanan <= 0) {
    anggaranProgressEl.style.width = "0%";
    anggaranProgressBar.classList.remove("warning");
    anggaranStatusEl.textContent = pengeluaranList.length
      ? `Total pengeluaran tercatat: ${formatRupiah(total)}. Atur anggaran bulanan supaya bisa dibandingkan.`
      : "Belum ada anggaran yang diatur.";
    return;
  }

  const persen = Math.min((total / anggaranBulanan) * 100, 100);
  anggaranProgressEl.style.width = persen + "%";

  const sisa = anggaranBulanan - total;

  if (total > anggaranBulanan) {
    anggaranProgressBar.classList.add("warning");
    anggaranStatusEl.textContent = `Sudah lewat anggaran sebesar ${formatRupiah(Math.abs(sisa))}. Coba mulai rem pengeluaran ya.`;
  } else {
    anggaranProgressBar.classList.remove("warning");
    anggaranStatusEl.textContent = `Terpakai ${Math.round(persen)}% dari anggaran. Sisa ${formatRupiah(sisa)} untuk bulan ini.`;
  }
}

/* ============================================================
   6. FITUR: Insight Pengeluaran Pintar (Premium)
   ============================================================ */

const insightBuatBtn = document.getElementById("insight-buat");
const insightHasilEl = document.getElementById("insight-hasil");

insightBuatBtn.addEventListener("click", () => {
  const baris = [];
  const totalBelanja = totalPengeluaran();

  // Insight dari data Pelacak Anggaran
  if (anggaranBulanan > 0) {
    const persen = Math.round((totalBelanja / anggaranBulanan) * 100);
    baris.push(`Kamu sudah memakai sekitar ${persen}% dari anggaran bulan ini.`);

    if (persen >= 100) {
      baris.push("Pengeluaranmu sudah melewati anggaran. Coba tunda dulu pembelian yang belum mendesak.");
    } else if (persen >= 80) {
      baris.push("Anggaranmu sudah menipis. Sebaiknya lebih hati-hati sampai akhir bulan.");
    } else if (persen < 40) {
      baris.push("Kabar baik, pengeluaranmu masih cukup terkendali bulan ini.");
    }
  }

  // Insight dari data Butuh vs Keinginan
  const totalButuh     = catatanButuh.filter((c) => c.tipe === "Butuh").length;
  const totalKeinginan = catatanButuh.filter((c) => c.tipe === "Keinginan").length;
  const totalCatatan   = totalButuh + totalKeinginan;

  if (totalCatatan > 0) {
    const persenKeinginan = Math.round((totalKeinginan / totalCatatan) * 100);
    baris.push(`Dari barang yang kamu catat, ${persenKeinginan}% ternyata cuma keinginan, bukan kebutuhan.`);

    if (persenKeinginan >= 50) {
      baris.push("Coba lebih sering pakai fitur Jeda Sebelum Belanja untuk barang-barang yang sifatnya keinginan.");
    }
  }

  if (baris.length === 0) {
    baris.push("Kamu belum punya data untuk dianalisis. Coba isi Pelacak Anggaran atau Butuh vs Keinginan dulu, ya!");
  }

  insightHasilEl.innerHTML = baris.map((teks) => `<div class="insight-line">${teks}</div>`).join("");
});
