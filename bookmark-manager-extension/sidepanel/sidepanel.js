import {
  getAll, getFolders, addBookmark, updateBookmark, deleteBookmark, togglePin,
  addFolder, updateFolder, deleteFolder, addNote, updateNote, deleteNote,
} from '../shared/store.js';

const THEME_KEY = 'bm_theme';
const SHOW_URL_KEY = 'bm_show_url';
const SIDEBAR_TITLE_KEY = 'bm_sidebar_title';
const ACTIVE_VIEW_KEY = 'bm_active_view';

let showUrl = false;
let activeView = 'bookmarks';

async function applyTheme() {
  const result = await chrome.storage.local.get([THEME_KEY, SHOW_URL_KEY, SIDEBAR_TITLE_KEY, ACTIVE_VIEW_KEY]);
  const theme = result[THEME_KEY] || 'system';
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  showUrl = result[SHOW_URL_KEY] === true;
  const titleEl = document.getElementById('sidebar-title');
  if (titleEl && result[SIDEBAR_TITLE_KEY]) {
    titleEl.textContent = result[SIDEBAR_TITLE_KEY];
  }
  activeView = result[ACTIVE_VIEW_KEY] || 'bookmarks';
}

let state = { bookmarks: [], folders: [], notes: [] };
let searchQuery = '';
let collapsedSections = ['pinned', 'recent', 'folders'];

const SECTIONS_KEY = 'bm_collapsed_sections';
const SEARCH_VISIBLE_KEY = 'bm_search_visible';

async function applySearchVisibility() {
  const result = await chrome.storage.local.get(SEARCH_VISIBLE_KEY);
  const visible = result[SEARCH_VISIBLE_KEY] === true;
  document.querySelector('.header').classList.toggle('search-hidden', !visible);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.bm_data) {
      refresh();
    }
    if (changes.bm_theme || changes[SHOW_URL_KEY] || changes[SIDEBAR_TITLE_KEY] || changes[ACTIVE_VIEW_KEY]) {
      applyTheme().then(() => {
        updateViewToggle();
        render();
      });
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
  return `
    <div class="bookmark-item" data-id="${bm.id}" data-type="bookmark">
      <img class="bookmark-item__favicon" src="${favicon}" alt="" loading="lazy" onerror="this.style.display='none'" />
      <div class="bookmark-item__info">
        <div class="bookmark-item__title">${escHtml(bm.title || 'Untitled')}</div>
        <div class="bookmark-item__url${showUrl ? '' : ' hidden'}">${escHtml(bm.url || '')}</div>
      </div>
      ${bm.label ? `<span class="bookmark-item__label">${escHtml(bm.label)}</span>` : ''}
    </div>
  `;
}

function makeFolderHTML(folder, bookmarks) {
  const nested = folder.children ? folder.children.reduce((s, c) => s + 1 + (c.bookmarkCount || 0), 0) : 0;
  const count = bookmarks.length + nested;
  let childrenHTML = '';

  if (folder.children && folder.children.length) {
    childrenHTML += folder.children.map(f =>
      makeFolderHTML(f, state.bookmarks.filter(b => b.folderId === f.id))
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
      <div class="folder-children"${isSystem ? '' : ' style="display:none"'}>
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

  document.getElementById('section-pinned').style.display = q ? 'none' : '';
  document.getElementById('section-recent').style.display = q ? 'none' : '';
  document.getElementById('section-folders').style.display = q ? 'none' : '';
  document.getElementById('section-search-results').style.display = q ? '' : 'none';

  const pinned = filtered.filter(b => b.pinned);
  const recent = [...filtered].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);
  const root = state.folders.find(f => f.system === true);
  const userFolders = state.folders.filter(f => !f.system);

  if (q) {
    document.getElementById('search-results-list').innerHTML = filtered.length
      ? filtered.map(makeBookmarkHTML).join('')
      : '<div class="empty-state">No bookmarks match your search</div>';
  } else {
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
      document.getElementById('folders-list').innerHTML = makeFolderHTML(rootWithChildren, rootBms);
      const total = rootBms.length + userFolders.length;
      document.getElementById('folders-count').textContent = total > 0 ? `(${total})` : '';
    } else {
      document.getElementById('folders-list').innerHTML = '<div class="empty-state">No folders yet</div>';
      document.getElementById('folders-count').textContent = '';
    }
  }

  document.getElementById('count-label').textContent = activeView === 'notes' ? (state.notes || []).filter(n => !n.deleted).length : state.bookmarks.length;
  renderNotes();
}

function updateViewToggle() {
  document.querySelectorAll('.view-toggle__btn').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.view === activeView);
  });
  document.getElementById('bookmarks-view').style.display = activeView === 'bookmarks' ? '' : 'none';
  document.getElementById('notes-view').style.display = activeView === 'notes' ? '' : 'none';
  document.getElementById('search-input').placeholder = activeView === 'notes' ? 'Search notes...' : 'Search bookmarks...';
}

function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function noteTextColor(bg) {
  const h = bg.replace('#', '');
  const r = parseInt(h.slice(0,2), 16), g = parseInt(h.slice(2,4), 16), b = parseInt(h.slice(4,6), 16);
  const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return l > 0.55 ? '#1a1a2e' : '#ffffff';
}

function renderNotes() {
  const q = searchQuery.toLowerCase().trim();
  let notes = state.notes || [];
  if (q) {
    notes = notes.filter(n => (n.title || '').toLowerCase().includes(q) || (n.tag || '').toLowerCase().includes(q) || n.content.toLowerCase().includes(q));
  } else {
    notes = notes.filter(n => !n.deleted);
  }
  notes = [...notes].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.createdAt - a.createdAt);
  const board = document.getElementById('notes-board');
  if (!notes.length) {
    board.innerHTML = '<div class="empty-state">' + (q ? 'No notes match your search' : 'No notes yet') + '</div>';
    return;
  }
  board.innerHTML = notes.map(n => {
    const tc = noteTextColor(n.color);
    const created = fmtDate(n.createdAt);
    const due = n.dueDate ? new Date(n.dueDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    const len = n.content.length;
    const mh = len > 300 ? '10rem' : len > 100 ? '8rem' : len > 20 ? '6rem' : '4rem';
    const overdue = n.dueDate && new Date(n.dueDate + 'T23:59:59') < new Date();
    return `
    <div class="note-card${n.deleted ? ' note-card--deleted' : ''}" data-id="${n.id}" style="background:${n.color};max-height:${mh}${overdue ? ';border:4px solid #e53935' : ''}">
      <button class="note-card__delete" data-action="delete-note" style="color:${tc}"><span class="material-symbols-outlined" style="font-size:14px">close</span></button>
      <div class="note-card__top">
        ${created || n.pinned ? `<div class="note-card__meta" style="color:${tc}">${n.pinned ? '<span class="note-card__pin"><span class="material-symbols-outlined" style="font-size:12px">push_pin</span></span>' : ''}${created}</div>` : ''}
        ${n.title ? `<div class="note-card__header" style="color:${tc}">${escHtml(n.title)}</div>` : ''}
      </div>
      <div class="note-card__scroll">
        <div class="note-card__text" data-action="note-text" contenteditable="true" spellcheck="false" style="color:${tc}">${escHtml(n.content)}</div>
      </div>
      <div class="note-card__bottom">
        ${n.tag ? `<div class="note-card__footer" style="color:${tc}">${escHtml(n.tag)}</div>` : ''}
        ${due ? `<div class="note-card__due" style="color:${tc}">${due}</div>` : ''}
      </div>
    </div>
  `}).join('');
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
  sel.innerHTML = '<option value="">None (root level)</option>' +
    folders.filter(f => !f.system).map(f => `<option value="${f.id}" ${f.id === bm.folderId ? 'selected' : ''}>${escHtml(f.name)}</option>`).join('');

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

function openNoteModal(note = {}) {
  const overlay = document.getElementById('note-modal-overlay');
  const form = document.getElementById('note-modal-form');
  form.elements.id.value = note.id || '';
  form.elements.title.value = note.title || '';
  form.elements.tag.value = note.tag || '';
  form.elements.dueDate.value = note.dueDate || '';
  form.elements.color.value = note.color || '#fff9c4';
  overlay.classList.add('is-open');
  form.elements.title.focus();
}

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

document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  applySearchVisibility();
  loadCollapsedSections();
  refresh();
  updateViewToggle();

  document.getElementById('view-toggle').addEventListener('click', async (e) => {
    const btn = e.target.closest('.view-toggle__btn');
    if (!btn) return;
    activeView = btn.dataset.view;
    await chrome.storage.local.set({ [ACTIVE_VIEW_KEY]: activeView });
    updateViewToggle();
    render();
  });

  document.getElementById('add-note-btn').addEventListener('click', async () => {
    await addNote({ content: '', color: '#fff9c4', pinned: false });
    toast('Note added');
    await refresh();
  });

  document.getElementById('notes-board').addEventListener('blur', async (e) => {
    const el = e.target.closest('.note-card__text');
    if (!el) return;
    const card = el.closest('.note-card');
    if (!card) return;
    const content = el.textContent || '';
    if (content !== (state.notes || []).find(n => n.id === card.dataset.id)?.content) {
      await updateNote(card.dataset.id, { content });
    }
  }, true);

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

  document.getElementById('note-modal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const id = form.elements.id.value;
    const data = {
      title: form.elements.title.value.trim(),
      tag: form.elements.tag.value.trim(),
      dueDate: form.elements.dueDate.value || '',
      color: form.elements.color.value,
    };
    await updateNote(id, data);
    document.getElementById('note-modal-overlay').classList.remove('is-open');
    toast('Note updated');
    await refresh();
  });

  document.querySelectorAll('[data-close-note-modal]').forEach(el => {
    el.addEventListener('click', () => {
      document.getElementById('note-modal-overlay').classList.remove('is-open');
    });
  });

  document.getElementById('note-modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('is-open');
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
      const children = folderGroup.querySelector('.folder-children');
      if (children) {
        const isOpen = children.style.display !== 'none';
        children.style.display = isOpen ? 'none' : '';
        folderGroup.classList.toggle('open');
      }
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
    } else if (action === 'delete-note') {
      await updateNote(id, { deleted: true });
      toast('Note deleted');
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
      document.getElementById('note-modal-overlay').classList.remove('is-open');
    }
  });

  const ctxMenu = document.getElementById('context-menu');
  let ctxTargetId = null;
  let ctxSection = null;

  function closeContextMenu() {
    ctxMenu.classList.remove('is-open');
    ctxMenu.style.display = 'none';
    ctxTargetId = null;
    ctxSection = null;
  }

  function showCtxMenu(e) {
    ctxMenu.style.left = e.clientX + 'px';
    ctxMenu.style.top = e.clientY + 'px';
    ctxMenu.style.display = 'block';
    requestAnimationFrame(() => ctxMenu.classList.add('is-open'));
  }

  const NOTE_COLORS = ['#fff9c4', '#ffccbc', '#c8e6c9', '#bbdefb', '#e1bee7', '#ffe0b2', '#b2dfdb', '#f8bbd0', '#ffffff', '#e0e0e0'];

  function buildNoteColorSubmenu(selectedColor) {
    document.getElementById('ctx-note-colors').innerHTML = NOTE_COLORS.map(c =>
      `<span class="color-swatch${c === selectedColor ? ' is-selected' : ''}" style="background:${c}" data-color="${c}"></span>`
    ).join('');
  }

  function showNoteContext(e, noteId, color, pinned) {
    e.preventDefault();
    ctxTargetId = noteId;
    document.getElementById('ctx-note-items').hidden = false;
    document.getElementById('ctx-section-items').hidden = true;
    document.getElementById('ctx-item-items').hidden = true;
    document.getElementById('ctx-note-pin').innerHTML = '<span class="material-symbols-outlined ctx-icon">push_pin</span> ' + (pinned ? 'Unpin' : 'Pin');
    buildNoteColorSubmenu(color);
    showCtxMenu(e);
  }

  function showBookmarkSectionContext(e, sectionName) {
    e.preventDefault();
    ctxSection = sectionName;
    ctxTargetId = null;

    const showAll = sectionName === 'folders';
    document.getElementById('ctx-section-items').hidden = false;
    document.getElementById('ctx-item-items').hidden = true;
    document.getElementById('ctx-note-items').hidden = true;

    document.querySelector('#ctx-section-items [data-action="add-folder-section"]').hidden = !showAll;
    document.querySelector('#ctx-section-items [data-action="add-bookmark-section"]').hidden = !showAll;

    const tabLabel = sectionName === 'pinned' ? 'Add current tab (pinned)' : 'Add current tab';
    document.querySelector('#ctx-section-items [data-action="add-tab-section"]').innerHTML = '<span class="material-symbols-outlined ctx-icon">tab</span> ' + tabLabel;

    showCtxMenu(e);
  }

  function showBookmarkItemContext(e, item) {
    e.preventDefault();
    ctxTargetId = item.dataset.id;
    const isFolder = item.dataset.type === 'folder';
    const isSystem = item.dataset.system === 'true';
    document.getElementById('ctx-note-items').hidden = true;

    if (isSystem) {
      document.getElementById('ctx-section-items').hidden = false;
      document.getElementById('ctx-item-items').hidden = true;
      document.querySelector('#ctx-section-items [data-action="add-folder-section"]').hidden = false;
      document.querySelector('#ctx-section-items [data-action="add-bookmark-section"]').hidden = false;
      document.querySelector('#ctx-section-items [data-action="add-tab-section"]').innerHTML = '<span class="material-symbols-outlined ctx-icon">tab</span> Add current tab';
      showCtxMenu(e);
      return;
    }

    document.getElementById('ctx-section-items').hidden = false;
    document.getElementById('ctx-item-items').hidden = false;

    document.getElementById('ctx-open').style.display = isFolder ? 'none' : '';
    document.getElementById('ctx-pin').style.display = isFolder ? 'none' : '';
    document.getElementById('context-move-folder').style.display = isFolder ? 'none' : '';
    document.getElementById('context-folder-list').style.display = 'none';

    if (isFolder) {
      document.querySelector('#ctx-section-items [data-action="add-folder-section"]').hidden = true;
      document.querySelector('#ctx-section-items [data-action="add-bookmark-section"]').hidden = false;
      document.querySelector('#ctx-section-items [data-action="add-tab-section"]').innerHTML = '<span class="material-symbols-outlined ctx-icon">tab</span> Add current tab';
      document.getElementById('ctx-edit').innerHTML = '<span class="material-symbols-outlined ctx-icon">edit</span> Edit Folder';
    } else {
      document.querySelector('#ctx-section-items [data-action="add-folder-section"]').hidden = true;
      document.querySelector('#ctx-section-items [data-action="add-bookmark-section"]').hidden = true;
      document.querySelector('#ctx-section-items [data-action="add-tab-section"]').hidden = true;
      document.getElementById('ctx-edit').innerHTML = '<span class="material-symbols-outlined ctx-icon">edit</span> Edit';
      const bm = state.bookmarks.find(b => b.id === ctxTargetId);
      document.getElementById('ctx-pin').innerHTML = '<span class="material-symbols-outlined ctx-icon">push_pin</span> ' + (bm?.pinned ? 'Unpin' : 'Pin');
    }
    document.getElementById('ctx-divider').hidden = false;
    document.getElementById('ctx-edit').style.display = '';
    document.getElementById('ctx-delete').style.display = '';
    showCtxMenu(e);
  }

  document.getElementById('content').addEventListener('contextmenu', (e) => {
    if (activeView === 'notes') {
      const noteCard = e.target.closest('.note-card');
      if (!noteCard) return;
      const note = (state.notes || []).find(n => n.id === noteCard.dataset.id);
      if (!note) return;
      showNoteContext(e, note.id, note.color, !!note.pinned);
      return;
    }

    const sectionTitle = e.target.closest('.section__title--toggle');
    if (sectionTitle) {
      showBookmarkSectionContext(e, sectionTitle.dataset.section);
      return;
    }

    const item = e.target.closest('[data-id]');
    if (!item) return;
    showBookmarkItemContext(e, item);
  });

  ctxMenu.addEventListener('click', async (e) => {
    const swatch = e.target.closest('.color-swatch');
    if (swatch) {
      const color = swatch.dataset.color;
      const id = ctxTargetId;
      closeContextMenu();
      if (id) {
        await updateNote(id, { color });
        toast('Note color updated');
        await refresh();
      }
      return;
    }

    const actionItem = e.target.closest('[data-action]');
    if (!actionItem) return;
    const action = actionItem.dataset.action;
    const targetId = ctxTargetId;
    const targetSection = ctxSection;

    if (action === 'edit-note') {
      closeContextMenu();
      const note = (state.notes || []).find(n => n.id === targetId);
      if (note) openNoteModal(note);
      return;
    }
    if (action === 'pin-note') {
      closeContextMenu();
      if (targetId) {
        const note = (state.notes || []).find(n => n.id === targetId);
        if (note) {
          await updateNote(targetId, { pinned: !note.pinned });
          toast(note.pinned ? 'Note unpinned' : 'Note pinned');
          await refresh();
        }
      }
      return;
    }
    if (action === 'delete-note') {
      closeContextMenu();
      if (targetId) {
        await updateNote(targetId, { deleted: true });
        toast('Note deleted');
        await refresh();
      }
      return;
    }

    closeContextMenu();

    if (action === 'open') {
      const bm = state.bookmarks.find(b => b.id === targetId);
      if (bm?.url) await chrome.tabs.create({ url: bm.url });
    } else if (action === 'edit') {
      const folder = state.folders.find(f => f.id === targetId);
      if (folder) openFolderModal(folder);
      else {
        const bm = state.bookmarks.find(b => b.id === targetId);
        if (bm) openBookmarkModal(bm);
      }
    } else if (action === 'toggle-pin') {
      if (targetId) { await togglePin(targetId); await refresh(); }
    } else if (action === 'move-to') {
      const folderId = actionItem.dataset.folder || null;
      if (targetId) {
        await updateBookmark(targetId, { folderId });
        toast('Bookmark moved');
        await refresh();
      }
    } else if (action === 'add-tab-section') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      const folderId = targetId && state.folders.some(f => f.id === targetId) ? targetId : null;
      const pinned = targetSection === 'pinned';
      await addBookmark({ title: tab.title, url: tab.url, folderId, pinned });
      toast('Bookmark added' + (pinned ? ' (pinned)' : ''));
      await refresh();
    } else if (action === 'add-bookmark-section') {
      const folderId = targetId && state.folders.some(f => f.id === targetId) ? targetId : null;
      openBookmarkModal({ folderId });
    } else if (action === 'add-folder-section') {
      openFolderModal();
    } else if (action === 'delete') {
      if (targetId) {
        if (confirm('Delete this bookmark?')) {
          await deleteBookmark(targetId);
          toast('Bookmark deleted');
          await refresh();
        }
      }
    }
  });

  document.getElementById('context-move-folder').addEventListener('click', async (e) => {
    const moveTo = e.target.closest('[data-action="move-to"]');
    if (moveTo) {
      const id = ctxTargetId;
      const folderId = moveTo.dataset.folder;
      closeContextMenu();
      if (id) {
        await updateBookmark(id, { folderId });
        toast('Bookmark moved');
        await refresh();
      }
      return;
    }
    e.stopPropagation();
    const folderList = document.getElementById('context-folder-list');
    if (folderList.style.display === 'block') {
      folderList.style.display = 'none';
      return;
    }
    const currentBm = state.bookmarks.find(b => b.id === ctxTargetId);
    folderList.innerHTML = '<div class="context-menu__item" data-action="move-to" data-folder="">None (root level)</div>' +
      state.folders.filter(f => !f.system).map(f =>
        `<div class="context-menu__item" data-action="move-to" data-folder="${f.id}" ${f.id === currentBm?.folderId ? 'style="font-weight:600;background:var(--surface)"' : ''}>${escHtml(f.name)}</div>`
      ).join('');
    folderList.style.display = 'block';
  });

  document.addEventListener('click', (e) => {
    if (!ctxMenu.contains(e.target)) closeContextMenu();
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
