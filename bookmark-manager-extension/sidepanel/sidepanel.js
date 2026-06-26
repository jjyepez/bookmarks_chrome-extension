import {
  getAll, getFolders, addBookmark, updateBookmark, deleteBookmark, togglePin,
  addFolder, updateFolder, deleteFolder
} from '../shared/store.js';

const THEME_KEY = 'bm_theme';
const SHOW_URL_KEY = 'bm_show_url';

let showUrl = false;

async function applyTheme() {
  const result = await chrome.storage.local.get(THEME_KEY);
  const theme = result[THEME_KEY] || 'system';
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  showUrl = (await chrome.storage.local.get(SHOW_URL_KEY))[SHOW_URL_KEY] === true;
}

let state = { bookmarks: [], folders: [] };
let searchQuery = '';
let collapsedSections = [];

const SECTIONS_KEY = 'bm_collapsed_sections';
const SEARCH_VISIBLE_KEY = 'bm_search_visible';

async function applySearchVisibility() {
  const result = await chrome.storage.local.get(SEARCH_VISIBLE_KEY);
  const visible = result[SEARCH_VISIBLE_KEY] !== false;
  document.querySelector('.header').classList.toggle('search-hidden', !visible);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.bm_data) {
      refresh();
    }
    if (changes.bm_theme || changes[SHOW_URL_KEY]) {
      applyTheme().then(() => render());
    }
    if (changes.bm_search_visible) {
      applySearchVisibility();
    }
  }
});

async function loadCollapsedSections() {
  const result = await chrome.storage.local.get(SECTIONS_KEY);
  collapsedSections = result[SECTIONS_KEY] || [];
  document.querySelectorAll('.section').forEach(s => {
    const name = s.dataset.section;
    if (collapsedSections.includes(name)) {
      s.classList.add('collapsed');
    }
  });
}

async function toggleSection(name) {
  const idx = collapsedSections.indexOf(name);
  if (idx >= 0) {
    collapsedSections.splice(idx, 1);
  } else {
    collapsedSections.push(name);
  }
  await chrome.storage.local.set({ [SECTIONS_KEY]: collapsedSections });
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 2500);
}

async function refresh() {
  const data = await getAll();
  state = data;
  render();
}

function makeBookmarkHTML(bm) {
  const domain = bm.url ? new URL(bm.url).hostname : '';
  const favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
  const iconColor = bm.color ? `style="color:${bm.color}"` : '';
  return `
    <div class="bookmark-item" data-id="${bm.id}" data-type="bookmark">
      <span class="material-symbols-outlined bookmark-item__icon" ${iconColor}>bookmark</span>
      <img class="bookmark-item__favicon" src="${favicon}" alt="" loading="lazy" onerror="this.style.display='none'" />
      <div class="bookmark-item__info">
        <div class="bookmark-item__title">${escHtml(bm.title || 'Untitled')}</div>
        <div class="bookmark-item__url${showUrl ? '' : ' hidden'}">${escHtml(bm.url || '')}</div>
      </div>
      ${bm.label ? `<span class="bookmark-item__label">${escHtml(bm.label)}</span>` : ''}
    </div>
  `;
}

function makeFolderHTML(folder, bookmarks, hideActions) {
  const count = bookmarks.length + folder.childrenCount;
  let childrenHTML = '';

  if (folder.children && folder.children.length) {
    childrenHTML += folder.children.map(f =>
      makeFolderHTML(f, state.bookmarks.filter(b => b.folderId === f.id), false)
    ).join('');
  }

  const nestedHTML = bookmarks.length
    ? bookmarks.map(makeBookmarkHTML).join('')
    : '';

  const iconColor = folder.color ? `style="color:${folder.color}"` : '';
  const iconName = folder.system ? 'folder_open' : 'folder';
  const isSystem = !!folder.system;

  return `
    <div class="folder-group${isSystem ? ' open' : ''}" data-folder-id="${folder.id}">
      <div class="folder-item" data-id="${folder.id}" data-type="folder" data-system="${isSystem ? 'true' : ''}">
        ${isSystem ? '' : '<span class="material-symbols-outlined folder-item__chevron">chevron_right</span>'}
        <span class="material-symbols-outlined folder-item__icon" ${iconColor}>${iconName}</span>
        <span class="folder-item__name">${escHtml(folder.name)}</span>
        <span class="folder-item__count">${count}</span>
        ${folder.label && !folder.system ? `<span class="folder-item__label">${escHtml(folder.label)}</span>` : ''}
      </div>
      <div class="folder-children">
        ${nestedHTML}
        ${childrenHTML}
        ${!nestedHTML && !childrenHTML ? '<div class="empty-state folder-empty">Empty</div>' : ''}
      </div>
    </div>
  `;
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function render() {
  const q = searchQuery.toLowerCase().trim();
  const filtered = q
    ? state.bookmarks.filter(b =>
        b.title.toLowerCase().includes(q) ||
        b.url.toLowerCase().includes(q) ||
        b.label.toLowerCase().includes(q)
      )
    : state.bookmarks;

  const pinned = filtered.filter(b => b.pinned);
  const recent = [...filtered].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);
  const root = state.folders.find(f => f.system === true);
  const userFolders = state.folders.filter(f => !f.system);

  document.getElementById('pinned-list').innerHTML = pinned.length
    ? pinned.map(makeBookmarkHTML).join('')
    : '<div class="empty-state">No pinned bookmarks</div>';
  document.getElementById('pinned-count').textContent = pinned.length > 0 ? `(${pinned.length})` : '';

  document.getElementById('recent-list').innerHTML = recent.length
    ? recent.map(makeBookmarkHTML).join('')
    : '<div class="empty-state">No recent bookmarks</div>';
  document.getElementById('recent-count').textContent = recent.length > 0 ? `(${recent.length})` : '';

  if (root) {
    const rootBms = filtered.filter(b => !b.folderId);
    const rootWithChildren = {
      ...root,
      children: userFolders.map(f => ({ ...f, children: [] })),
    };
    document.getElementById('folders-list').innerHTML = makeFolderHTML(rootWithChildren, rootBms, true);
    const total = rootBms.length + userFolders.length;
    document.getElementById('folders-count').textContent = total > 0 ? `(${total})` : '';
  } else {
    document.getElementById('folders-list').innerHTML = '<div class="empty-state">No folders yet</div>';
    document.getElementById('folders-count').textContent = '';
  }

  document.getElementById('count-label').textContent = state.bookmarks.length;
}

async function openBookmarkModal(bm = {}) {
  const overlay = document.getElementById('modal-overlay');
  const form = document.getElementById('modal-form');

  const isEdit = !!bm.id;
  document.getElementById('modal-title').textContent = isEdit ? 'Edit Bookmark' : 'Add Bookmark';

  form.elements.id.value = bm.id || '';
  form.elements.title.value = bm.title || '';
  form.elements.url.value = bm.url || '';
  form.elements.color.value = bm.color || '#1f93ff';
  form.elements.label.value = bm.label || '';
  form.elements.pinned.checked = !!bm.pinned;

  const folders = await getFolders();
  const sel = form.elements.folderId;
  sel.innerHTML = '<option value="">None</option>' +
    folders.map(f => `<option value="${f.id}" ${f.id === bm.folderId ? 'selected' : ''}>${escHtml(f.name)}</option>`).join('');

  overlay.classList.add('is-open');
  form.elements.title.focus();
}

function openFolderModal(folder = {}) {
  const overlay = document.getElementById('folder-modal-overlay');
  const form = document.getElementById('folder-modal-form');

  const isEdit = !!folder.id;
  document.getElementById('folder-modal-title').textContent = isEdit ? 'Edit Folder' : 'Add Folder';

  form.elements.id.value = folder.id || '';
  form.elements.name.value = folder.name || '';
  form.elements.color.value = folder.color || '#e8f5e9';
  form.elements.label.value = folder.label || '';

  overlay.classList.add('is-open');
  form.elements.name.focus();
}

document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  applySearchVisibility();
  loadCollapsedSections();
  refresh();

  document.getElementById('search-input').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    document.getElementById('search-clear').hidden = !searchQuery;
    render();
  });

  document.getElementById('search-clear').addEventListener('click', () => {
    document.getElementById('search-input').value = '';
    searchQuery = '';
    document.getElementById('search-clear').hidden = true;
    render();
  });

  document.getElementById('open-options').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('toggle-search').addEventListener('click', async (e) => {
    e.preventDefault();
    const header = document.querySelector('.header');
    const nowHidden = header.classList.toggle('search-hidden');
    await chrome.storage.local.set({ [SEARCH_VISIBLE_KEY]: !nowHidden });
    if (!nowHidden) document.getElementById('search-input').focus();
  });

  function onDragOver(e) { e.preventDefault(); }

  async function onDrop(e, folderId, pinned) {
    e.preventDefault();
    const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || '';
    if (!url || !url.startsWith('http')) return;
    const title = e.dataTransfer.getData('text/plain') || url;
    await addBookmark({ title: title.slice(0, 200), url, folderId, pinned });
    toast('Bookmark added' + (pinned ? ' (pinned)' : ''));
    await refresh();
  }

  document.getElementById('section-pinned').addEventListener('dragover', onDragOver);
  document.getElementById('section-pinned').addEventListener('drop', (e) => onDrop(e, null, true));
  document.getElementById('section-recent').addEventListener('dragover', onDragOver);
  document.getElementById('section-recent').addEventListener('drop', (e) => onDrop(e, null, false));

  document.getElementById('content').addEventListener('dragover', (e) => {
    const folderGroup = e.target.closest('.folder-group');
    const rootDrop = e.target.closest('#root-drop');
    if (folderGroup || rootDrop) e.preventDefault();
  });

  document.getElementById('content').addEventListener('drop', async (e) => {
    const folderGroup = e.target.closest('.folder-group');
    if (folderGroup) {
      e.preventDefault();
      const folderId = folderGroup.dataset.folderId;
      await onDrop(e, folderId, false);
      return;
    }
    const rootDrop = e.target.closest('#root-drop');
    if (rootDrop) {
      e.preventDefault();
      await onDrop(e, null, false);
    }
  });

  document.getElementById('modal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const id = form.elements.id.value;
    const data = {
      title: form.elements.title.value.trim(),
      url: form.elements.url.value.trim(),
      folderId: form.elements.folderId.value || null,
      color: form.elements.color.value,
      label: form.elements.label.value.trim(),
      pinned: form.elements.pinned.checked,
    };
    try {
      if (id) {
        await updateBookmark(id, data);
        toast('Bookmark updated');
      } else {
        await addBookmark(data);
        toast('Bookmark added');
      }
      document.getElementById('modal-overlay').classList.remove('is-open');
      await refresh();
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById('folder-modal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const id = form.elements.id.value;
    const data = {
      name: form.elements.name.value.trim(),
      color: form.elements.color.value,
      label: form.elements.label.value.trim(),
    };
    try {
      if (id) {
        await updateFolder(id, data);
        toast('Folder updated');
      } else {
        await addFolder(data);
        toast('Folder added');
      }
      document.getElementById('folder-modal-overlay').classList.remove('is-open');
      await refresh();
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById('content').addEventListener('click', async (e) => {
    const bookmarkItem = e.target.closest('.bookmark-item');
    const folderGroup = e.target.closest('.folder-group');
    const folderItem = e.target.closest('.folder-item');

    if (bookmarkItem && !e.target.closest('[data-action]')) {
      const bm = state.bookmarks.find(b => b.id === bookmarkItem.dataset.id);
      if (bm?.url) {
        await chrome.tabs.create({ url: bm.url });
        return;
      }
    }

    if (folderItem && !e.target.closest('[data-action]') && folderItem.dataset.system !== 'true') {
      folderGroup.classList.toggle('open');
      return;
    }

    const actionBtn = e.target.closest('[data-action]');
    if (!actionBtn) return;
    const item = actionBtn.closest('[data-id]');
    if (!item) return;
    const id = item.dataset.id;
    const action = actionBtn.dataset.action;

    if (action === 'open') {
      const bm = state.bookmarks.find(b => b.id === id);
      if (bm?.url) {
        await chrome.tabs.create({ url: bm.url });
      }
    } else if (action === 'edit') {
      const bm = state.bookmarks.find(b => b.id === id);
      if (bm) openBookmarkModal(bm);
    } else if (action === 'toggle-pin') {
      await togglePin(id);
      await refresh();
    } else if (action === 'delete') {
      if (confirm('Delete this bookmark?')) {
        await deleteBookmark(id);
        toast('Bookmark deleted');
        await refresh();
      }
    } else if (action === 'edit-folder') {
      const folder = state.folders.find(f => f.id === id);
      if (folder) openFolderModal(folder);
    } else if (action === 'delete-folder') {
      try {
        await deleteFolder(id);
        toast('Folder deleted');
        await refresh();
      } catch (err) {
        alert(err.message);
      }
    }
  });

  document.querySelectorAll('[data-close-modal]').forEach(el => {
    el.addEventListener('click', () => {
      document.getElementById('modal-overlay').classList.remove('is-open');
    });
  });

  document.querySelectorAll('[data-close-folder-modal]').forEach(el => {
    el.addEventListener('click', () => {
      document.getElementById('folder-modal-overlay').classList.remove('is-open');
    });
  });

  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('is-open');
  });

  document.getElementById('folder-modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('is-open');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.getElementById('modal-overlay').classList.remove('is-open');
      document.getElementById('folder-modal-overlay').classList.remove('is-open');
    }
  });

  const ctxMenu = document.getElementById('context-menu');
  let ctxTargetId = null;
  let ctxType = null;
  let ctxSection = null;

  function closeContextMenu() {
    ctxMenu.classList.remove('is-open');
    ctxMenu.style.display = 'none';
    ctxTargetId = null;
    ctxType = null;
    ctxSection = null;
  }

  document.getElementById('content').addEventListener('contextmenu', (e) => {
    const sectionTitle = e.target.closest('.section__title--toggle');
    if (sectionTitle) {
      e.preventDefault();
      ctxSection = sectionTitle.dataset.section;
      ctxTargetId = null;
      ctxType = 'section';

      const showAll = ctxSection === 'folders';
      document.getElementById('ctx-section-items').hidden = false;
      document.getElementById('ctx-item-items').hidden = true;

      document.querySelector('#ctx-section-items [data-action="add-folder-section"]').hidden = !showAll;
      document.querySelector('#ctx-section-items [data-action="add-bookmark-section"]').hidden = !showAll;

      const tabLabel = ctxSection === 'pinned' ? 'Add current tab (pinned)' : 'Add current tab';
      document.querySelector('#ctx-section-items [data-action="add-tab-section"]').textContent = tabLabel;

      ctxMenu.style.left = e.clientX + 'px';
      ctxMenu.style.top = e.clientY + 'px';
      ctxMenu.style.display = 'block';
      requestAnimationFrame(() => ctxMenu.classList.add('is-open'));
      return;
    }

    const item = e.target.closest('[data-id]');
    if (!item) return;
    e.preventDefault();

    ctxTargetId = item.dataset.id;
    ctxType = item.dataset.type;

    const isFolder = ctxType === 'folder';
    const isSystem = item.dataset.system === 'true';

    if (isSystem) {
      document.getElementById('ctx-section-items').hidden = false;
      document.getElementById('ctx-item-items').hidden = true;
      document.querySelector('#ctx-section-items [data-action="add-folder-section"]').hidden = false;
      document.querySelector('#ctx-section-items [data-action="add-bookmark-section"]').hidden = false;
      document.querySelector('#ctx-section-items [data-action="add-tab-section"]').textContent = 'Add current tab';
      ctxMenu.style.left = e.clientX + 'px';
      ctxMenu.style.top = e.clientY + 'px';
      ctxMenu.style.display = 'block';
      requestAnimationFrame(() => ctxMenu.classList.add('is-open'));
      return;
    }

    document.getElementById('ctx-section-items').hidden = true;
    document.getElementById('ctx-item-items').hidden = false;
    document.getElementById('ctx-open').style.display = isFolder ? 'none' : '';
    document.getElementById('ctx-edit').style.display = '';
    document.getElementById('ctx-edit').textContent = isFolder ? 'Edit Folder' : 'Edit';
    document.getElementById('ctx-pin').style.display = isFolder ? 'none' : '';
    document.getElementById('context-move-folder').style.display = isFolder ? 'none' : '';
    document.getElementById('ctx-delete').style.display = '';
    document.getElementById('context-folder-list').style.display = 'none';
    document.getElementById('ctx-divider').hidden = false;
    if (!isFolder) {
      const bm = state.bookmarks.find(b => b.id === ctxTargetId);
      document.getElementById('ctx-pin').textContent = bm?.pinned ? 'Unpin' : 'Pin';
    }

    ctxMenu.style.left = e.clientX + 'px';
    ctxMenu.style.top = e.clientY + 'px';
    ctxMenu.style.display = 'block';
    requestAnimationFrame(() => ctxMenu.classList.add('is-open'));
  });

  ctxMenu.addEventListener('click', async (e) => {
    const actionItem = e.target.closest('[data-action]');
    if (!actionItem) return;
    const action = actionItem.dataset.action;
    const targetId = ctxTargetId;
    const targetType = ctxType;
    const targetSection = ctxSection;
    const folderId = actionItem.dataset.folder || null;
    closeContextMenu();

    if (action === 'open') {
      const bm = state.bookmarks.find(b => b.id === targetId);
      if (bm?.url) {
        await chrome.tabs.create({ url: bm.url });
      }
    } else if (action === 'edit') {
      if (targetType === 'folder') {
        const folder = state.folders.find(f => f.id === targetId);
        if (folder) openFolderModal(folder);
      } else {
        const bm = state.bookmarks.find(b => b.id === targetId);
        if (bm) openBookmarkModal(bm);
      }
    } else if (action === 'toggle-pin') {
      if (targetId) {
        await togglePin(targetId);
        await refresh();
      }
    } else if (action === 'move-to') {
      if (targetId) {
        await updateBookmark(targetId, { folderId });
        toast('Bookmark moved');
        await refresh();
      }
    } else if (action === 'add-tab-section') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      const pinned = targetSection === 'pinned';
      await addBookmark({ title: tab.title, url: tab.url, pinned });
      toast('Bookmark added' + (pinned ? ' (pinned)' : ''));
      await refresh();
    } else if (action === 'add-bookmark-section') {
      openBookmarkModal();
    } else if (action === 'add-folder-section') {
      openFolderModal();
    } else if (action === 'delete') {
      if (targetType === 'folder') {
        try {
          await deleteFolder(targetId);
          toast('Folder deleted');
          await refresh();
        } catch (err) {
          alert(err.message);
        }
      } else {
        if (confirm('Delete this bookmark?')) {
          await deleteBookmark(targetId);
          toast('Bookmark deleted');
          await refresh();
        }
      }
    }
  });

  document.getElementById('context-move-folder').addEventListener('click', async (e) => {
    e.stopPropagation();
    const folderList = document.getElementById('context-folder-list');
    const isVisible = folderList.style.display === 'block';
    if (isVisible) {
      folderList.style.display = 'none';
      return;
    }
    const currentBm = state.bookmarks.find(b => b.id === ctxTargetId);
    folderList.innerHTML = '<div class="context-menu__item" data-action="move-to" data-folder="">None</div>' +
      state.folders.map(f =>
        `<div class="context-menu__item" data-action="move-to" data-folder="${f.id}" ${f.id === currentBm?.folderId ? 'style="font-weight:600;background:var(--surface)"' : ''}>${escHtml(f.name)}</div>`
      ).join('');
    folderList.style.display = 'block';
  });

  document.addEventListener('click', (e) => {
    if (!ctxMenu.contains(e.target)) {
      closeContextMenu();
    }
  });

  document.addEventListener('wheel', () => closeContextMenu(), { passive: true });

  document.querySelectorAll('.section__title--toggle').forEach(title => {
    title.addEventListener('click', () => {
      const name = title.dataset.section;
      const section = document.querySelector(`.section[data-section="${name}"]`);
      if (section) {
        section.classList.toggle('collapsed');
        toggleSection(name);
      }
    });
  });
});
