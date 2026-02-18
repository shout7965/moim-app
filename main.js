const apiKeyInput = document.getElementById('apiKeyInput');
const apiSaveBtn  = document.getElementById('apiSaveBtn');
const apiToggleBtn = document.getElementById('apiToggleBtn');
const apiSection  = document.getElementById('apiSection');

const searchInput = document.getElementById('searchInput');
const searchBtn   = document.getElementById('searchBtn');
const resultsEl   = document.getElementById('results');

let apiKey = localStorage.getItem('yt_api_key') || '';

if (apiKey) {
  apiKeyInput.value = apiKey;
}

apiToggleBtn.addEventListener('click', () => {
  apiSection.classList.toggle('hidden');
});

apiSaveBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key) { alert('API 키를 입력해주세요.'); return; }
  apiKey = key;
  localStorage.setItem('yt_api_key', key);
  apiSection.classList.add('hidden');
});

searchBtn.addEventListener('click', search);
searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });

async function search() {
  const query = searchInput.value.trim();
  if (!query) return;

  if (!apiKey) {
    resultsEl.innerHTML = '<div class="empty-state error">⚙ 버튼을 눌러 API 키를 먼저 설정해주세요.</div>';
    return;
  }

  resultsEl.innerHTML = '<div class="loading"><span class="spinner"></span> 검색 중...</div>';

  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=10&key=${apiKey}`;
    const res  = await fetch(url);
    const data = await res.json();

    if (data.error) {
      resultsEl.innerHTML = `<div class="empty-state error">오류: ${data.error.message}</div>`;
      return;
    }

    if (!data.items || data.items.length === 0) {
      resultsEl.innerHTML = '<div class="empty-state">검색 결과가 없습니다.</div>';
      return;
    }

    renderResults(data.items);
  } catch {
    resultsEl.innerHTML = '<div class="empty-state error">네트워크 오류가 발생했습니다.</div>';
  }
}

function renderResults(items) {
  resultsEl.innerHTML = `<div class="results-count">결과 ${items.length}개</div>`;

  items.forEach(item => {
    const videoId   = item.id.videoId;
    const title     = item.snippet.title;
    const channel   = item.snippet.channelTitle;
    const thumb     = item.snippet.thumbnails.medium.url;
    const ytUrl     = `https://www.youtube.com/watch?v=${videoId}`;

    const a = document.createElement('a');
    a.href   = ytUrl;
    a.target = '_blank';
    a.rel    = 'noopener noreferrer';
    a.className = 'result-item';
    a.innerHTML = `
      <img class="result-thumb" src="${thumb}" alt="" />
      <div class="result-info">
        <div class="result-title">${title}</div>
        <div class="result-channel">${channel}</div>
      </div>
      <span class="result-arrow">→</span>
    `;
    resultsEl.appendChild(a);
  });
}
