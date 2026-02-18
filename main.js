// ===== Toast Notifications =====
const toastContainer = (() => {
  const el = document.createElement('div');
  el.className = 'toast-container';
  document.body.appendChild(el);
  return el;
})();

export function showToast(message, type = 'info', duration = 3000) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { info: 'ℹ️', success: '✅', error: '❌' };
  toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ===== Auth Guard =====
// Pages that require login should call requireAuth() on load.
export async function requireAuth() {
  const { auth, db } = await import('./js/firebase-config.js');
  const { onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
  const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');

  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsub();
      if (!user) {
        window.location.href = '/index.html';
        reject(new Error('Not authenticated'));
        return;
      }
      // Ensure user doc exists
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (!snap.exists()) {
        window.location.href = '/index.html';
        reject(new Error('No user doc'));
        return;
      }
      resolve({ user, profile: snap.data() });
    });
  });
}

// ===== Navigation Helper =====
export function navigateTo(path) {
  window.location.href = path;
}

// ===== Format Helpers =====
export function formatDate(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' });
}

export function formatTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(ts) {
  return `${formatDate(ts)} ${formatTime(ts)}`;
}

// ===== Loading Screen =====
export function showLoading(msg = '로딩 중...') {
  const existing = document.getElementById('loading-screen');
  if (existing) return;
  const el = document.createElement('div');
  el.id = 'loading-screen';
  el.className = 'loading-screen';
  el.innerHTML = `<div class="spinner"></div><span style="color:var(--text2);font-size:0.85rem">${msg}</span>`;
  document.body.appendChild(el);
}

export function hideLoading() {
  document.getElementById('loading-screen')?.remove();
}

// ===== Copy to Clipboard =====
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    return true;
  }
}

// ===== Get URL Params =====
export function getParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}
