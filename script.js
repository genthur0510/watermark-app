// Listener UI Slider Real-time
document.getElementById('opacity').addEventListener('input', (e) => {
  document.getElementById('opacity-val').innerText = Math.round(e.target.value * 100) + '%';
});
document.getElementById('size').addEventListener('input', (e) => {
  document.getElementById('size-val').innerText = Math.round(e.target.value * 100) + '%';
});

// Otomatis munculkan preview PDF asli ketika pertama kali di-upload
document.getElementById('pdf-file').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (file) {
    document.getElementById('pdf-preview').src = URL.createObjectURL(file);
    document.getElementById('split-btn').style.display = "none";
    document.getElementById('download-zone').style.display = "none";
    
    // Sembunyikan badge halaman saat ganti file baru
    if (document.getElementById('page-count-info')) {
      document.getElementById('page-count-info').style.display = "none";
    }
  }
});

// State Global Memori Aplikasi
let processedBlobs = { full: null, cover: null, fulltext: null, lampiran: null };
let watermarkedPdfBytes = null; 

// PARSER RANGE HALAMAN: Kuat, kebal spasi & variasi dash panjang (– atau —)
function parseRange(rangeStr, totalPages) {
  const result = [];
  if (!rangeStr) return result;
  
  let normalizedStr = rangeStr.replace(/[–—]/g, '-');
  const parts = normalizedStr.split(',');
  
  for (let part of parts) {
    part = part.trim().toLowerCase();
    
    if (part.includes('-')) {
      let [startStr, endStr] = part.split('-');
      let start = parseInt(startStr.trim());
      let end = endStr.trim() === 'end' ? totalPages : parseInt(endStr.trim());
      
      for (let i = start; i <= end; i++) {
        if (i >= 1 && i <= totalPages) result.push(i - 1);
      }
    } else {
      const num = parseInt(part.trim());
      if (!isNaN(num) && num >= 1 && num <= totalPages) {
        result.push(num - 1);
      }
    }
  }
  return result;
}

// EKSTRAKTOR SISI CLIENT: Memotong halaman dan melahirkan struktur Blob PDF Baru
async function extractPages(srcDoc, pageIndices) {
  if (pageIndices.length === 0) return null;
  const { PDFDocument } = PDFLib;
  const subDoc = await PDFDocument.create();
  const copiedPages = await subDoc.copyPages(srcDoc, pageIndices);
  copiedPages.forEach((page) => subDoc.addPage(page));
  const bytes = await subDoc.save();
  return new Blob([bytes], { type: 'application/pdf' });
}

// --- TAHAP 1: EKSEKUSI HAPUS HALAMAN KOSONG & ADAPTIVE WATERMARK ---
document.getElementById('preview-btn').addEventListener('click', async function() {
  const pdfInput = document.getElementById('pdf-file').files[0];
  const imageInput = document.getElementById('watermark-image').files[0];
  const statusMsg = document.getElementById('status-msg');

  if (!pdfInput || !imageInput) {
    alert('Harap unggah file PDF dan gambar watermark terlebih dahulu!');
    return;
  }

  try {
    statusMsg.innerText = "Sedang memproses dokumen...";
    statusMsg.style.color = "#3b82f6";
    
    document.getElementById('download-zone').style.display = "none";
    document.getElementById('split-btn').style.display = "none";

    const pdfBytes = await pdfInput.arrayBuffer();
    const imageBytes = await imageInput.arrayBuffer();

    const { PDFDocument } = PDFLib;
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // [A] PROSES UTAMA: HAPUS HALAMAN KOSONG (Descending Safe Order)
    const totalPagesAsli = pdfDoc.getPageCount();
    const deleteInput = document.getElementById('pages-to-delete');
    
    if (deleteInput && deleteInput.value.trim() !== '') {
      const pagesToDelete = parseRange(deleteInput.value, totalPagesAsli);
      const uniquePagesToDelete = [...new Set(pagesToDelete)].sort((a, b) => b - a);
      
      for (const pageIndex of uniquePagesToDelete) {
        if (pageIndex >= 0 && pageIndex < pdfDoc.getPageCount()) {
          pdfDoc.removePage(pageIndex);
        }
      }
    }

    // [B] EMBED WATERMARK IMAGE
    let watermarkImage;
    if (imageInput.type === 'image/png') {
      watermarkImage = await pdfDoc.embedPng(imageBytes);
    } else if (imageInput.type === 'image/jpeg' || imageInput.type === 'image/jpg') {
      watermarkImage = await pdfDoc.embedJpg(imageBytes);
    } else {
      alert('Format gambar wajib PNG atau JPG!');
      return;
    }

    const opacityVal = parseFloat(document.getElementById('opacity').value);
    const sizeVal = parseFloat(document.getElementById('size').value);
    const positionVal = document.getElementById('position').value;

    const imgHeightOriginal = watermarkImage.height;
    const pages = pdfDoc.getPages();

    // [C] LOOPING TERAPKAN WATERMARK DENGAN ADAPTIVE SCALING
    for (const page of pages) {
      const { width: pageWidth, height: pageHeight } = page.getSize();
      const baseScale = pageHeight / imgHeightOriginal;
      const finalScale = baseScale * sizeVal;
      const scaledDims = watermarkImage.scale(finalScale);

      let xPos = 0;
      if (positionVal === 'center') xPos = (pageWidth / 2) - (scaledDims.width / 2);
      else if (positionVal === 'right') xPos = pageWidth - scaledDims.width;

      let yPos = (pageHeight / 2) - (scaledDims.height / 2);

      page.drawImage(watermarkImage, {
        x: xPos, y: yPos, width: scaledDims.width, height: scaledDims.height, opacity: opacityVal
      });
    }

    // Simpan bytes hasil olahan Tahap 1 ke Memori Global
    watermarkedPdfBytes = await pdfDoc.save();
    processedBlobs.full = new Blob([watermarkedPdfBytes], { type: 'application/pdf' });

    // --- MENGHITUNG DAN MENAMPILKAN TOTAL HALAMAN SISA ---
    const pageCountInfo = document.getElementById('page-count-info');
    if (pageCountInfo) {
      pageCountInfo.innerText = `Total Hal: ${pdfDoc.getPageCount()}`;
      pageCountInfo.style.display = "inline-block";
    }

    // Perbarui Tampilan Iframe Preview
    document.getElementById('pdf-preview').src = URL.createObjectURL(processedBlobs.full);

    statusMsg.innerText = "✅ Preview siap! Klik 'Potong Dokumen' untuk memecah file.";
    statusMsg.style.color = "#10b981";
    document.getElementById('split-btn').style.display = "block";

  } catch (error) {
    console.error(error);
    statusMsg.innerText = "❌ Gagal memproses dokumen.";
    statusMsg.style.color = "#ef4444";
  }
});

// --- TAHAP 2: PROSES POTONG / PEMISAHAN BERKAS ---
document.getElementById('split-btn').addEventListener('click', async function() {
  const statusMsg = document.getElementById('status-msg');
  if (!watermarkedPdfBytes) return;

  try {
    statusMsg.innerText = "Sedang memotong dokumen...";
    statusMsg.style.color = "#3b82f6";

    const { PDFDocument } = PDFLib;
    const watermarkedDoc = await PDFDocument.load(watermarkedPdfBytes);
    const totalPages = watermarkedDoc.getPages().length;

    const coverIndices = parseRange(document.getElementById('range-cover').value, totalPages);
    const fullIndices = parseRange(document.getElementById('range-full').value, totalPages);
    const lampiranIndices = parseRange(document.getElementById('range-lampiran').value, totalPages);

    processedBlobs.cover = await extractPages(watermarkedDoc, coverIndices);
    processedBlobs.fulltext = await extractPages(watermarkedDoc, fullIndices);
    processedBlobs.lampiran = await extractPages(watermarkedDoc, lampiranIndices);

    // Buka Akses Tombol Unduhan
    document.getElementById('download-zone').style.display = "block";
    document.getElementById('dl-cover').style.display = processedBlobs.cover ? "block" : "none";
    document.getElementById('dl-fulltext').style.display = processedBlobs.fulltext ? "block" : "none";
    document.getElementById('dl-lampiran').style.display = processedBlobs.lampiran ? "block" : "none";

    statusMsg.innerText = "✅ Pemotongan selesai! Silakan unduh file di bawah.";
    statusMsg.style.color = "#10b981";

  } catch (error) {
    console.error(error);
    statusMsg.innerText = "❌ Gagal memotong dokumen.";
    statusMsg.style.color = "#ef4444";
  }
});

// --- ENGINE DOWNLOAD DAN PENGATURAN NAMA FILE ---
function triggerDownload(blob, inputId, defaultName) {
  if (!blob) return;
  let fileName = document.getElementById(inputId) ? document.getElementById(inputId).value.trim() : defaultName;
  if (!fileName) fileName = defaultName;
  
  if (!fileName.toLowerCase().endsWith('.pdf')) {
    fileName += '.pdf';
  }
  
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Listener Tombol Download
document.getElementById('dl-full-doc').addEventListener('click', () => {
  const fileInput = document.getElementById('pdf-file').files[0];
  let finalName = 'Dokumen_Utuh_Watermarked.pdf';
  
  if (fileInput && fileInput.name) {
    const baseName = fileInput.name.replace(/\.pdf$/i, '');
    finalName = `${baseName}_Watermarked.pdf`;
  }
  triggerDownload(processedBlobs.full, null, finalName);
});

document.getElementById('dl-cover').addEventListener('click', () => triggerDownload(processedBlobs.cover, 'name-cover', 'cover.pdf'));
document.getElementById('dl-fulltext').addEventListener('click', () => triggerDownload(processedBlobs.fulltext, 'name-fulltext', 'fulltext.pdf'));
document.getElementById('dl-lampiran').addEventListener('click', () => triggerDownload(processedBlobs.lampiran, 'name-lampiran', 'lampiran.pdf'));

// --- FITUR RESET UNTUK ORDER BARU ---
document.getElementById('reset-btn').addEventListener('click', () => {
  // 1. Bersihkan Input File
  document.getElementById('pdf-file').value = '';
  document.getElementById('watermark-image').value = '';

  // 2. Kembalikan Slider ke Default
  document.getElementById('opacity').value = 0.5;
  document.getElementById('opacity-val').innerText = '50%';
  document.getElementById('size').value = 1;
  document.getElementById('size-val').innerText = '100%';
  document.getElementById('position').value = 'left';

  // 3. Bersihkan Input Teks (Hapus Halaman & Nama File)
  document.getElementById('pages-to-delete').value = '';
  document.getElementById('range-cover').value = '1';
  document.getElementById('name-cover').value = 'cover_nim_nama';
  document.getElementById('range-full').value = '2-10';
  document.getElementById('name-fulltext').value = 'fulltext_nim_nama';
  document.getElementById('range-lampiran').value = '11-end';
  document.getElementById('name-lampiran').value = 'lampiran_nim_nama';

  // 4. Sembunyikan Area Hasil
  document.getElementById('download-zone').style.display = 'none';
  document.getElementById('split-btn').style.display = 'none';
  
  // 5. Reset Status dan Badge
  document.getElementById('status-msg').innerText = '';
  const pageCountInfo = document.getElementById('page-count-info');
  if (pageCountInfo) pageCountInfo.style.display = 'none';

  // 6. Bersihkan Layar Preview
  document.getElementById('pdf-preview').src = '';

  // 7. Kosongkan Memori Global agar RAM tidak bocor
  processedBlobs = { full: null, cover: null, fulltext: null, lampiran: null };
  watermarkedPdfBytes = null;
  
  // Beri notifikasi kecil
  const statusMsg = document.getElementById('status-msg');
  statusMsg.innerText = "✨ Workspace bersih! Siap untuk order berikutnya.";
  statusMsg.style.color = "#34d399";
});