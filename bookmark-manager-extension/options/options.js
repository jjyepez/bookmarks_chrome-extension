import { getAll, addBookmark, addFolder } from '../shared/store.js';

const STORAGE_KEY = 'bm_data';

async function refreshStats() {
  const data = await getAll();
  document.getElementById('stat-bookmarks').textContent = data.bookmarks.length;
  document.getElementById('stat-folders').textContent = data.folders.length;
  document.getElementById('stat-pinned').textContent = data.bookmarks.filter(b => b.pinned).length;
}

function setStatus(msg, isError = false) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.style.color = isError ? '#e53935' : '#2e7d32';
  setTimeout(() => { el.textContent = ''; }, 6000);
}

async function importNode(node, parentFolderId, chromeIdMap) {
  if (node.url) {
    await addBookmark({
      title: node.title || node.url,
      url: node.url,
      folderId: parentFolderId,
      pinned: false,
    });
  }

  if (node.children) {
    for (const child of node.children) {
      if (child.children) {
        const created = await addFolder({
          name: child.title || 'Untitled',
          color: '',
          label: '',
          parentId: parentFolderId,
        });
        chromeIdMap.set(child.id, created.id);
        await importNode(child, created.id, chromeIdMap);
      } else if (child.url) {
        await addBookmark({
          title: child.title || child.url,
          url: child.url,
          folderId: parentFolderId,
          pinned: false,
        });
      }
    }
  }
}

async function doImport() {
  const btn = document.getElementById('import-chrome-btn');
  btn.disabled = true;
  btn.textContent = 'Importing...';

  try {
    const tree = await chrome.bookmarks.getTree();
    const root = tree[0];
    const topFolders = root?.children || [];

    let total = 0;

    for (const top of topFolders) {
      if (!top.children) continue;
      const chromeIdMap = new Map();
      const created = await addFolder({
        name: top.title || 'Imported',
        color: '',
        label: '',
        parentId: null,
      });
      chromeIdMap.set(top.id, created.id);
      await importNode(top, created.id, chromeIdMap);
      total += await countDescendantBookmarks(top);
    }

    await refreshStats();
    setStatus(`Imported ${total} bookmarks from Chrome with folder structure preserved.`);
  } catch (err) {
    setStatus(`Error: ${err.message}`, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Import from Chrome Bookmarks';
  }
}

async function countDescendantBookmarks(node) {
  let count = 0;
  if (node.url) count++;
  if (node.children) {
    for (const child of node.children) {
      count += await countDescendantBookmarks(child);
    }
  }
  return count;
}

document.getElementById('import-chrome-btn').addEventListener('click', doImport);

document.getElementById('export-btn').addEventListener('click', async () => {
  const data = await getAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bookmarks-backup-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus('Exported successfully.');
});

document.getElementById('import-json-btn').addEventListener('click', () => {
  document.getElementById('import-file').click();
});

document.getElementById('import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.bookmarks || !Array.isArray(data.bookmarks)) {
      throw new Error('Invalid format');
    }
    await chrome.storage.local.set({ [STORAGE_KEY]: data });
    await refreshStats();
    setStatus(`Imported ${data.bookmarks.length} bookmarks and ${data.folders.length} folders.`);
  } catch (err) {
    setStatus(`Error: ${err.message}`, true);
  }
  e.target.value = '';
});

document.getElementById('clear-btn').addEventListener('click', async () => {
  if (!confirm('Are you sure you want to delete ALL bookmarks and folders? This cannot be undone.')) return;
  if (!confirm('Really? All your data will be lost.')) return;
  await chrome.storage.local.remove(STORAGE_KEY);
  await refreshStats();
  setStatus('All data cleared.');
});

const THEME_KEY = 'bm_theme';
const SHOW_URL_KEY = 'bm_show_url';

async function loadDisplaySettings() {
  const result = await chrome.storage.local.get([THEME_KEY, SHOW_URL_KEY]);
  document.getElementById('theme-select').value = result[THEME_KEY] || 'system';
  document.getElementById('show-url-check').checked = result[SHOW_URL_KEY] === true;
}

document.getElementById('theme-select').addEventListener('change', async (e) => {
  await chrome.storage.local.set({ [THEME_KEY]: e.target.value });
  setStatus('Theme saved. Reopen the side panel to see changes.');
});

document.getElementById('show-url-check').addEventListener('change', async (e) => {
  await chrome.storage.local.set({ [SHOW_URL_KEY]: e.target.checked });
  setStatus('URL visibility saved.');
});

document.addEventListener('DOMContentLoaded', async () => {
  await refreshStats();
  await loadDisplaySettings();
});
