const STORAGE_KEY = 'bm_data';
const ROOT_FOLDER_NAME = 'Root';

const DEFAULT_DATA = {
  version: 3,
  folders: [],
  bookmarks: [],
  notes: [],
};

function uid() {
  return crypto.randomUUID();
}

async function load() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  let data = result[STORAGE_KEY];
  if (!data) {
    data = JSON.parse(JSON.stringify(DEFAULT_DATA));
    await save(data);
  }
  if (!data.notes) {
    data.notes = [];
    await save(data);
  }
  await ensureRoot(data);
  return data;
}

async function save(data) {
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
}

async function ensureRoot(data) {
  const root = data.folders.find(f => f.system === true);
  if (root) return root;
  const rootFolder = {
    id: uid(),
    name: ROOT_FOLDER_NAME,
    color: '',
    label: '',
    parentId: null,
    system: true,
    createdAt: Date.now(),
  };
  data.folders.unshift(rootFolder);
  await save(data);
  return rootFolder;
}

export async function getAll() {
  const data = await load();
  return data;
}

export async function getRootId() {
  const data = await load();
  const root = data.folders.find(f => f.system === true);
  return root ? root.id : null;
}

export async function getFolders() {
  const data = await load();
  return data.folders;
}

export async function addBookmark({ title, url, folderId, color, label, pinned }) {
  const data = await load();
  const bookmark = {
    id: uid(),
    title: title || '',
    url: url || '',
    folderId: folderId || null,
    color: color || '',
    label: label || '',
    pinned: !!pinned,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  data.bookmarks.push(bookmark);
  await save(data);
  return bookmark;
}

export async function updateBookmark(id, changes) {
  const data = await load();
  const idx = data.bookmarks.findIndex(b => b.id === id);
  if (idx === -1) throw new Error('Bookmark not found');
  data.bookmarks[idx] = { ...data.bookmarks[idx], ...changes, updatedAt: Date.now() };
  await save(data);
  return data.bookmarks[idx];
}

export async function deleteBookmark(id) {
  const data = await load();
  data.bookmarks = data.bookmarks.filter(b => b.id !== id);
  await save(data);
}

export async function togglePin(id) {
  const data = await load();
  const bm = data.bookmarks.find(b => b.id === id);
  if (!bm) throw new Error('Bookmark not found');
  bm.pinned = !bm.pinned;
  bm.updatedAt = Date.now();
  await save(data);
  return bm;
}

export async function addFolder({ name, color, label }) {
  const data = await load();
  const root = await ensureRoot(data);
  const folder = {
    id: uid(),
    name: name || 'New Folder',
    color: color || '',
    label: label || '',
    parentId: root.id,
    system: false,
    createdAt: Date.now(),
  };
  data.folders.push(folder);
  await save(data);
  return folder;
}

export async function updateFolder(id, changes) {
  const data = await load();
  const idx = data.folders.findIndex(f => f.id === id);
  if (idx === -1) throw new Error('Folder not found');
  if (data.folders[idx].system) throw new Error('Cannot edit system folder');
  data.folders[idx] = { ...data.folders[idx], ...changes };
  await save(data);
  return data.folders[idx];
}

export async function deleteFolder(id) {
  const data = await load();
  const folder = data.folders.find(f => f.id === id);
  if (!folder) throw new Error('Folder not found');
  if (folder.system) throw new Error('Cannot delete system folder');
  const children = data.bookmarks.filter(b => b.folderId === id);
  if (children.length > 0) {
    throw new Error(`Folder has ${children.length} bookmark(s). Move or delete them first.`);
  }
  data.folders = data.folders.filter(f => f.id !== id);
  await save(data);
}

export async function search(query) {
  const data = await load();
  const q = query.toLowerCase();
  return data.bookmarks.filter(b =>
    b.title.toLowerCase().includes(q) ||
    b.url.toLowerCase().includes(q) ||
    b.label.toLowerCase().includes(q)
  );
}

export function getRecent(data, limit = 5) {
  return [...data.bookmarks]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}

export function getPinned(data) {
  return data.bookmarks.filter(b => b.pinned);
}

export async function addNote({ content, color }) {
  const data = await load();
  if (!data.notes) data.notes = [];
  const note = {
    id: uid(),
    content: content || '',
    color: color || '#fff9c4',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  data.notes.push(note);
  await save(data);
  return note;
}

export async function updateNote(id, changes) {
  const data = await load();
  if (!data.notes) data.notes = [];
  const idx = data.notes.findIndex(n => n.id === id);
  if (idx === -1) throw new Error('Note not found');
  data.notes[idx] = { ...data.notes[idx], ...changes, updatedAt: Date.now() };
  await save(data);
  return data.notes[idx];
}

export async function deleteNote(id) {
  const data = await load();
  if (!data.notes) data.notes = [];
  data.notes = data.notes.filter(n => n.id !== id);
  await save(data);
}
