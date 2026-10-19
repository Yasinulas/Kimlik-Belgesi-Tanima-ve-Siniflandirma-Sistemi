const API_BASE = "http://localhost:3000/api";
const API = `${API_BASE}/analyze`;
const HISTORY_API = `${API_BASE}/history?limit=5`;

const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const analyzeBtn = document.getElementById("analyzeBtn");
const clearBtn = document.getElementById("clearBtn");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const resLabel = document.getElementById("resLabel");
const resValid = document.getElementById("resValid");
const resConfidence = document.getElementById("resConfidence");
const resBar = document.getElementById("resBar");
const historyList = document.getElementById("historyList");

let selectedFile = null;


function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);  
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function analyze(file) {
  const image = await toBase64(file);
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" }, 
    body: JSON.stringify({ image }),
  });
  const data = await res.json();
  if (data.status === "error") throw new Error(data.message);
  return data;
}

function showStatus(text, type) {
  statusEl.textContent = text;
  statusEl.className = `status ${type}`;
  statusEl.hidden = false;
}

function hideStatus() {
  statusEl.hidden = true;
}

function renderResults(data) {
  resultsEl.hidden = false;

  if (data.topPrediction) {
    resLabel.textContent = data.topPrediction.label;
    resConfidence.textContent = data.topPrediction.confidence.toFixed(2);
    resBar.style.width = `${data.topPrediction.confidence}%`;
  } else {
    resLabel.textContent = "Tespit yok";
    resConfidence.textContent = "0";
    resBar.style.width = "0%";
  }
  resValid.textContent = data.isValidDocument ? "Evet" : "Hayır";
}


async function loadHistory() {
  try {
    const res = await fetch(HISTORY_API);
    const items = await res.json();

    historyList.innerHTML = "";
    if (!items.length) {
      historyList.innerHTML = '<li class="history-empty">Henüz analiz yok.</li>';
      return;
    }

    items.forEach((item) => {
      const li = document.createElement("li");
      const label = item.topPrediction ? item.topPrediction.label : "Tespit yok";
      const confidence = item.topPrediction ? item.topPrediction.confidence.toFixed(2) : "0.00";
      const date = new Date(item.createdAt).toLocaleString("tr-TR");
      li.textContent = `${label} — %${confidence} (${date})`;
      historyList.appendChild(li);
    });
  } catch (err) {
    historyList.innerHTML = '<li class="history-empty">Geçmiş yüklenemedi.</li>';
  }
}

function clearAll() {
  selectedFile = null;
  fileInput.value = "";
  preview.src = "";
  preview.hidden = true;
  analyzeBtn.disabled = true;
  clearBtn.disabled = true;
  resultsEl.hidden = true;
  hideStatus();
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;
  selectedFile = file;
  preview.src = URL.createObjectURL(file);
  preview.hidden = false;
  analyzeBtn.disabled = false;
  clearBtn.disabled = false;
  resultsEl.hidden = true;
  hideStatus();
});

clearBtn.addEventListener("click", clearAll);

analyzeBtn.addEventListener("click", async () => { //çift tıklama engellemek için
  if (!selectedFile) return;
  analyzeBtn.disabled = true;
  resultsEl.hidden = true;
  showStatus("Analiz ediliyor...", "loading");

  try {
    const data = await analyze(selectedFile);
    hideStatus();
    renderResults(data);
    loadHistory();   // yeni analiz veritabanına düştü, son 5 listesini tazele
  } catch (err) {
    showStatus(err.message || "Beklenmeyen bir hata oluştu.", "error");
  } finally {
    analyzeBtn.disabled = false;
  }
});

loadHistory();   // sayfa ilk açıldığında son 5 analizi göster
